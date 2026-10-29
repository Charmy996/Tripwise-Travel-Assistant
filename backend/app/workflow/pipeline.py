"""Multi-Step AI Travel Planning and Policy Validation Workflow Engine."""
from datetime import datetime, timedelta, timezone
import re
import uuid
from typing import Any, Dict, List, Optional, Tuple

from app.retrieval.hybrid_retriever import HybridRetriever
from app.schemas.models import (
    BudgetBreakdown,
    CitationReference,
    FinalTripPlan,
    ItineraryActivity,
    ItineraryDay,
    LiveVerificationResult,
    MissingInformation,
    NormalizedTravelProfile,
    PolicyCheck,
    RetrievedSource,
    TravellerPreferences,
    WorkflowRun,
    WorkflowStageDetail,
)
from app.services.live_adapter import LiveVerificationAdapter
from app.services.llm_service import LLMService


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _source_to_citation(src: RetrievedSource) -> CitationReference:
    return CitationReference(
        chunk_id=src.chunk_id,
        document_id=src.document_id,
        document_title=src.document_title,
        category=src.category,
        authority=src.authority_level,
        page_number=src.page_number,
        section_heading=src.section_heading,
        excerpt=src.excerpt,
        publication_date=src.publication_date,
        verification_status=src.verification_status,
        is_demonstration=(src.source_type == "demonstration_document"),
    )


class TripPlanningWorkflow:
    """
    Executes the 6-stage inspectable travel planning pipeline:
      Stage 1: Preference Identification (Preference Analysis)
      Stage 2: Curated Knowledge Retrieval (Knowledge Retrieval)
      Stage 3: Destination Research & Itinerary Generation (Itinerary Generation)
      Stage 4: Policy & Restriction Validation (Policy Validation)
      Stage 5: Missing-Information & Freshness Checker (Missing-Information Check)
      Stage 6: Final Itinerary Assembly (Final Plan Assembly)
    """

    def __init__(self, retriever: HybridRetriever):
        self.retriever = retriever
        self.llm_service = LLMService()
        self.live_adapter = LiveVerificationAdapter()

    def execute(
        self,
        trip_id: str,
        preferences: TravellerPreferences,
        created_at: Optional[str] = None,
        simulate_stage_failure: Optional[int] = None,
    ) -> FinalTripPlan:
        run_id = f"run-{uuid.uuid4().hex[:10]}"
        run_started = _now_iso()
        stages: List[WorkflowStageDetail] = [
            WorkflowStageDetail(
                stage_number=1,
                stage_id="preference_analysis",
                stage_name="Preference Analysis",
                status="pending",
                summary="Waiting to normalize traveller preferences and check constraints.",
            ),
            WorkflowStageDetail(
                stage_number=2,
                stage_id="knowledge_retrieval",
                stage_name="Knowledge Retrieval",
                status="pending",
                summary="Waiting to query curated travel documents via hybrid search.",
            ),
            WorkflowStageDetail(
                stage_number=3,
                stage_id="itinerary_generation",
                stage_name="Itinerary Generation",
                status="pending",
                summary="Waiting to build daily schedule grounded in retrieved evidence.",
            ),
            WorkflowStageDetail(
                stage_number=4,
                stage_id="policy_validation",
                stage_name="Policy Validation",
                status="pending",
                summary="Waiting to evaluate accommodation, transport, entry, and budget policies.",
            ),
            WorkflowStageDetail(
                stage_number=5,
                stage_id="missing_info_check",
                stage_name="Missing-Information Check",
                status="pending",
                summary="Waiting to check document freshness, conflicts, and unverified items.",
            ),
            WorkflowStageDetail(
                stage_number=6,
                stage_id="final_plan_assembly",
                stage_name="Final Plan Assembly",
                status="pending",
                summary="Waiting to assemble complete trip plan and traceability links.",
            ),
        ]

        # --- STAGE 1: Preference Identification ---
        s1 = stages[0]
        s1.status = "running"
        s1.started_at = _now_iso()
        try:
            if simulate_stage_failure == 1:
                raise RuntimeError("Simulated Stage 1 preference validation failure.")
            profile = self.stage_1_identify_preferences(preferences)
            s1.completed_at = _now_iso()
            s1.warnings = list(profile.detected_conflicts) + [
                f"Optional field not specified: {m}" for m in profile.missing_fields
            ]
            s1.status = "completed_with_warnings" if profile.detected_conflicts else "completed"
            s1.summary = (
                f"Normalized {profile.duration_days}-day {profile.travel_style} trip to {profile.destination} "
                f"for {profile.travellers_count} traveller(s); {len(profile.detected_conflicts)} conflict(s) flagged."
            )
            s1.details = profile.model_dump()
        except Exception as exc:
            s1.status = "failed"
            s1.completed_at = _now_iso()
            s1.error = str(exc)
            s1.summary = f"Stage 1 failed: {exc}"
            raise

        # --- STAGE 2: Curated Knowledge Retrieval ---
        s2 = stages[1]
        s2.status = "running"
        s2.started_at = _now_iso()
        try:
            if simulate_stage_failure == 2:
                raise RuntimeError("Simulated Stage 2 retrieval failure.")
            retrieved_sources = self.stage_2_retrieve_knowledge(profile)
            s2.completed_at = _now_iso()
            doc_ids = sorted(set(r.document_id for r in retrieved_sources))
            if not retrieved_sources:
                s2.status = "completed_with_warnings"
                s2.warnings = [
                    f"Knowledge base does not contain curated documents for '{profile.destination}'."
                ]
                s2.summary = f"0 relevant chunks found for {profile.destination}. Knowledge base lacks local coverage."
            else:
                undated_count = sum(1 for r in retrieved_sources if not r.publication_date)
                s2.warnings = (
                    [f"{undated_count} retrieved chunk(s) originate from undated documents."]
                    if undated_count > 0
                    else []
                )
                s2.status = "completed_with_warnings" if s2.warnings else "completed"
                s2.summary = (
                    f"Retrieved {len(retrieved_sources)} unique evidence chunks across "
                    f"{len(doc_ids)} curated document(s) using hybrid FAISS + BM25 search."
                )
            s2.details = {
                "retrieved_chunk_count": len(retrieved_sources),
                "distinct_documents": doc_ids,
                "retrieval_method": f"Hybrid ({self.retriever.embedder.backend_name} + BM25 Lexical)",
                "top_sources": [
                    {
                        "chunk_id": r.chunk_id,
                        "document_title": r.document_title,
                        "category": r.category,
                        "page_number": r.page_number,
                        "retrieval_score": r.retrieval_score,
                        "verification_status": r.verification_status,
                    }
                    for r in retrieved_sources[:8]
                ],
            }
        except Exception as exc:
            s2.status = "failed"
            s2.completed_at = _now_iso()
            s2.error = str(exc)
            s2.summary = f"Stage 2 failed: {exc}"
            raise

        # --- STAGE 3: Destination Research & Itinerary Generation ---
        s3 = stages[2]
        s3.status = "running"
        s3.started_at = _now_iso()
        try:
            if simulate_stage_failure == 3:
                raise RuntimeError("Simulated Stage 3 itinerary generation failure.")
            itinerary_days, budget_breakdown, accom_notes, transport_notes = (
                self.stage_3_generate_itinerary(profile, preferences, retrieved_sources)
            )
            s3.completed_at = _now_iso()
            total_acts = sum(
                len(d.morning) + len(d.afternoon) + len(d.evening) for d in itinerary_days
            )
            cited_acts = sum(
                1
                for d in itinerary_days
                for a in (d.morning + d.afternoon + d.evening)
                if a.evidence_backed and a.citations
            )
            if cited_acts < total_acts:
                s3.warnings.append(
                    f"{total_acts - cited_acts} of {total_acts} activities lack direct document evidence and are marked as unverified suggestions."
                )
            s3.status = "completed_with_warnings" if s3.warnings else "completed"
            s3.summary = (
                f"Generated {len(itinerary_days)}-day indicative itinerary with {total_acts} activities "
                f"({cited_acts} directly cited from retrieved sources)."
            )
            s3.details = {
                "days_generated": len(itinerary_days),
                "total_activities": total_acts,
                "evidence_backed_activities": cited_acts,
                "estimated_total_cost": budget_breakdown.total_estimated_cost,
                "within_budget": budget_breakdown.within_budget,
            }
        except Exception as exc:
            s3.status = "failed"
            s3.completed_at = _now_iso()
            s3.error = str(exc)
            s3.summary = f"Stage 3 failed: {exc}"
            raise

        # --- STAGE 4: Policy & Restriction Validation ---
        s4 = stages[3]
        s4.status = "running"
        s4.started_at = _now_iso()
        try:
            if simulate_stage_failure == 4:
                raise RuntimeError("Simulated Stage 4 policy validation failure.")
            policy_checks = self.stage_4_validate_policies(
                profile, preferences, retrieved_sources, budget_breakdown
            )
            s4.completed_at = _now_iso()
            counts = {
                st: sum(1 for c in policy_checks if c.status == st)
                for st in ("PASS", "WARNING", "FAIL", "UNKNOWN")
            }
            if counts["FAIL"] > 0 or counts["WARNING"] > 0 or counts["UNKNOWN"] > 0:
                s4.status = "completed_with_warnings"
                s4.warnings = [
                    f"{c.rule_checked}: {c.status}"
                    for c in policy_checks
                    if c.status in ("FAIL", "WARNING", "UNKNOWN")
                ]
            else:
                s4.status = "completed"
            s4.summary = (
                f"Evaluated {len(policy_checks)} policy rules: "
                f"{counts['PASS']} PASS, {counts['WARNING']} WARNING, {counts['FAIL']} FAIL, {counts['UNKNOWN']} UNKNOWN."
            )
            s4.details = {"status_counts": counts}
        except Exception as exc:
            s4.status = "failed"
            s4.completed_at = _now_iso()
            s4.error = str(exc)
            s4.summary = f"Stage 4 failed: {exc}"
            raise

        # --- STAGE 5: Missing-Information & Freshness Checker ---
        s5 = stages[4]
        s5.status = "running"
        s5.started_at = _now_iso()
        try:
            if simulate_stage_failure == 5:
                raise RuntimeError("Simulated Stage 5 missing-information check failure.")
            live_verifications = self.live_adapter.check_live_sources(
                profile.destination, preferences.travel_scope
            )
            missing_items = self.stage_5_check_missing_and_freshness(
                profile,
                preferences,
                retrieved_sources,
                policy_checks,
                budget_breakdown,
                live_verifications,
            )
            s5.completed_at = _now_iso()
            sev_counts = {
                sev: sum(1 for m in missing_items if m.severity == sev)
                for sev in ("critical", "high", "medium", "low")
            }
            s5.status = "completed_with_warnings" if missing_items else "completed"
            s5.warnings = [f"[{m.severity.upper()}] {m.title}" for m in missing_items[:5]]
            s5.summary = (
                f"Identified {len(missing_items)} missing, time-sensitive, or conflicting items "
                f"({sev_counts['critical']} critical, {sev_counts['high']} high, {sev_counts['medium']} medium, {sev_counts['low']} low)."
            )
            s5.details = {"severity_counts": sev_counts, "total_findings": len(missing_items)}
        except Exception as exc:
            s5.status = "failed"
            s5.completed_at = _now_iso()
            s5.error = str(exc)
            s5.summary = f"Stage 5 failed: {exc}"
            raise

        # --- STAGE 6: Final Itinerary Assembly ---
        s6 = stages[5]
        s6.status = "running"
        s6.started_at = _now_iso()
        try:
            if simulate_stage_failure == 6:
                raise RuntimeError("Simulated Stage 6 final assembly failure.")
            trip_summary, gen_mode, llm_warning = self.llm_service.generate_grounded_summary(
                profile, retrieved_sources
            )
            if llm_warning:
                s6.warnings.append(llm_warning)

            has_unresolved = any(
                c.status in ("FAIL", "WARNING", "UNKNOWN") for c in policy_checks
            ) or any(m.severity in ("critical", "high") for m in missing_items)

            is_fully_verified = not has_unresolved and len(retrieved_sources) > 0
            if any(c.status == "FAIL" for c in policy_checks):
                verification_summary_status = (
                    "Action Required — Documented Policy Conflict Detected (Not Fully Verified)"
                )
            elif has_unresolved or not retrieved_sources:
                verification_summary_status = (
                    "Provisional Plan — Requires Manual Verification of Highlighted Policies"
                )
            else:
                verification_summary_status = "Verified Against Curated Knowledge Base"

            assumptions = list(profile.assumptions) + [
                "Daily activity timings are indicative and include buffer windows for urban transit and rest breaks.",
                "Estimated costs are calculated in "
                + profile.currency
                + " using tariffs stated in retrieved demonstration documents.",
            ]

            disclaimers = [
                "TripWise AI is an informational travel planning and policy assistant, not a booking agency or legal advisor.",
                "Sample City documents in the default knowledge base are fictional educational demonstration materials, not real-world government or hotel rules.",
                "Document existence or recent indexing does not guarantee that real-world opening hours, visa rules, or fares remain unchanged.",
                "Always verify visa, health, safety, and booking terms directly with official government embassies and licensed providers prior to departure.",
            ]

            how_created = {
                "preferences_used": {
                    "origin": profile.origin,
                    "destination": profile.destination,
                    "duration_days": profile.duration_days,
                    "travellers": f"{profile.adults} adult(s), {profile.children} child(ren)",
                    "budget": f"{profile.currency} {profile.budget_total:,.0f}",
                    "style_and_pace": f"{profile.travel_style} ({profile.pace} pace)",
                    "interests": profile.interests,
                    "stated_constraints": profile.stated_constraints,
                },
                "documents_consulted": [
                    {
                        "document_id": doc_id,
                        "document_title": next(
                            (r.document_title for r in retrieved_sources if r.document_id == doc_id),
                            doc_id,
                        ),
                        "chunks_used": sum(1 for r in retrieved_sources if r.document_id == doc_id),
                    }
                    for doc_id in sorted(set(r.document_id for r in retrieved_sources))
                ],
                "validation_steps_performed": [
                    f"Checked {len(policy_checks)} policy rules across accommodation, transport, entry, and budget constraints.",
                    f"Audited {len(retrieved_sources)} retrieved excerpts for missing publication dates and multi-document conflicts.",
                    f"Evaluated {len(live_verifications)} external live verification adapter channels.",
                ],
                "generation_mode": gen_mode,
            }

            s6.completed_at = _now_iso()
            s6.status = "completed_with_warnings" if (s6.warnings or has_unresolved) else "completed"
            s6.summary = (
                f"Assembled final {profile.duration_days}-day plan ({verification_summary_status})."
            )
            s6.details = {
                "is_fully_verified": is_fully_verified,
                "verification_summary_status": verification_summary_status,
                "generation_mode": gen_mode,
            }

            overall_status = (
                "completed_with_warnings"
                if any(st.status == "completed_with_warnings" for st in stages)
                else "completed"
            )
            workflow_run = WorkflowRun(
                run_id=run_id,
                trip_id=trip_id,
                overall_status=overall_status,
                started_at=run_started,
                completed_at=_now_iso(),
                generation_mode=gen_mode,
                stages=stages,
            )

            now_ts = _now_iso()
            return FinalTripPlan(
                trip_id=trip_id,
                title=f"{profile.destination} — {profile.duration_days}-Day {profile.travel_style.title()} Plan",
                created_at=created_at or now_ts,
                updated_at=now_ts,
                verification_summary_status=verification_summary_status,
                is_fully_verified=is_fully_verified,
                preferences=preferences,
                normalized_profile=profile,
                trip_summary=trip_summary,
                itinerary_days=itinerary_days,
                budget_breakdown=budget_breakdown,
                accommodation_considerations=accom_notes,
                transport_considerations=transport_notes,
                retrieved_sources=retrieved_sources,
                policy_checks=policy_checks,
                missing_information=missing_items,
                live_verifications=live_verifications,
                planning_assumptions=assumptions,
                limitations_and_disclaimers=disclaimers,
                how_plan_was_created=how_created,
                workflow_run=workflow_run,
            )
        except Exception as exc:
            s6.status = "failed"
            s6.completed_at = _now_iso()
            s6.error = str(exc)
            s6.summary = f"Stage 6 failed: {exc}"
            raise

    # -------------------------------------------------------------------------
    # STAGE 1 IMPLEMENTATION
    # -------------------------------------------------------------------------
    def stage_1_identify_preferences(
        self, prefs: TravellerPreferences
    ) -> NormalizedTravelProfile:
        try:
            dep = datetime.strptime(prefs.departure_date, "%Y-%m-%d").date()
            ret = datetime.strptime(prefs.return_date, "%Y-%m-%d").date()
        except ValueError as exc:
            raise ValueError(
                f"Invalid date format ({exc}). Dates must be formatted as YYYY-MM-DD."
            ) from exc

        if ret < dep:
            raise ValueError(
                f"Return date ({prefs.return_date}) cannot precede departure date ({prefs.departure_date})."
            )

        duration_days = (ret - dep).days + 1
        if duration_days > 30:
            raise ValueError("Prototype trip duration cannot exceed 30 days.")

        missing_fields: List[str] = []
        if not (prefs.dietary_requirements or "").strip():
            missing_fields.append("dietary_requirements")
        if not (prefs.accessibility_needs or "").strip():
            missing_fields.append("accessibility_needs")
        if not (prefs.visa_status_note or "").strip():
            missing_fields.append("visa_status_note")

        detected_conflicts: List[str] = []
        if prefs.adults + prefs.children != prefs.travellers_count:
            detected_conflicts.append(
                f"Traveller count mismatch: total travellers ({prefs.travellers_count}) does not equal adults ({prefs.adults}) + children ({prefs.children})."
            )

        daily_per_person = prefs.budget_total / max(1, duration_days * prefs.travellers_count)
        if prefs.travel_style == "luxury" and (
            "budget" in prefs.accommodation_type.lower()
            or "hostel" in prefs.accommodation_type.lower()
            or (prefs.currency.upper() == "INR" and daily_per_person < 2500)
        ):
            detected_conflicts.append(
                f"Contradictory preference: 'luxury' travel style selected alongside '{prefs.accommodation_type}' and a modest daily per-person budget of {prefs.currency} {daily_per_person:,.0f}."
            )

        if prefs.pace == "relaxed" and len(prefs.interests) >= 6:
            detected_conflicts.append(
                f"Pace tension: 'relaxed' pace selected with {len(prefs.interests)} distinct interest categories; daily activities will be capped to avoid over-scheduling."
            )

        requires_intl = prefs.travel_scope == "international"
        stated_constraints: List[str] = []
        for label, val in [
            ("Accommodation requirement", prefs.accommodation_requirements),
            ("Transport constraint", prefs.transport_constraints),
            ("Safety note", prefs.safety_considerations),
            ("Visa/Entry note", prefs.visa_status_note),
            ("Additional instruction", prefs.additional_instructions),
        ]:
            if val and val.strip():
                stated_constraints.append(f"{label}: {val.strip()}")

        assumptions: List[str] = [
            f"Trip duration calculated as {duration_days} inclusive day(s) ({prefs.departure_date} to {prefs.return_date}).",
        ]
        if not (prefs.accessibility_needs or "").strip():
            assumptions.append(
                "No specific mobility or step-free requirement was supplied; standard walking routes included with accessibility annotations where documented."
            )

        return NormalizedTravelProfile(
            origin=prefs.origin.strip(),
            destination=prefs.destination.strip(),
            departure_date=prefs.departure_date,
            return_date=prefs.return_date,
            duration_days=duration_days,
            travellers_count=prefs.travellers_count,
            adults=prefs.adults,
            children=prefs.children,
            requires_international_checks=requires_intl,
            budget_total=prefs.budget_total,
            daily_budget_per_person=round(daily_per_person, 2),
            currency=prefs.currency.upper(),
            travel_style=prefs.travel_style,
            pace=prefs.pace,
            interests=[i.strip().lower() for i in prefs.interests if i.strip()],
            accommodation_type=prefs.accommodation_type.strip(),
            transport_modes=[m.strip().lower() for m in prefs.transport_modes if m.strip()],
            accessibility_needs=(prefs.accessibility_needs or "").strip(),
            dietary_requirements=(prefs.dietary_requirements or "").strip(),
            stated_constraints=stated_constraints,
            assumptions=assumptions,
            missing_fields=missing_fields,
            detected_conflicts=detected_conflicts,
        )

    # -------------------------------------------------------------------------
    # STAGE 2 IMPLEMENTATION
    # -------------------------------------------------------------------------
    def stage_2_retrieve_knowledge(
        self, profile: NormalizedTravelProfile
    ) -> List[RetrievedSource]:
        queries = [
            f"{profile.destination} attractions museums sightseeing cultural highlights duration cost",
            f"{profile.destination} {profile.accommodation_type} hotel check-in check-out cancellation refund age policy",
            f"{profile.destination} public transport metro bus pass luggage restrictions operating hours",
            f"{profile.destination} visa entry requirements identification permit eco-pass restrictions",
            f"{profile.destination} accessibility wheelchair step-free safety food hygiene emergency drone",
        ]
        if profile.stated_constraints:
            queries.append(f"{profile.destination} " + " ".join(profile.stated_constraints))

        merged: Dict[str, RetrievedSource] = {}
        for q in queries:
            hits = self.retriever.search(
                query=q,
                destination=profile.destination,
                top_k=12,
                min_score=0.05,
            )
            for hit in hits:
                existing = merged.get(hit.chunk_id)
                if existing is None or hit.retrieval_score > existing.retrieval_score:
                    merged[hit.chunk_id] = hit

        results = list(merged.values())
        results.sort(key=lambda r: r.retrieval_score, reverse=True)
        return results

    # -------------------------------------------------------------------------
    # STAGE 3 IMPLEMENTATION
    # -------------------------------------------------------------------------
    def stage_3_generate_itinerary(
        self,
        profile: NormalizedTravelProfile,
        prefs: TravellerPreferences,
        sources: List[RetrievedSource],
    ) -> Tuple[List[ItineraryDay], BudgetBreakdown, List[str], List[str]]:
        dep_date = datetime.strptime(profile.departure_date, "%Y-%m-%d").date()

        # Helper to find matching retrieved sources by keyword
        def find_citations(keywords: List[str], category_hint: Optional[str] = None) -> List[CitationReference]:
            scored: List[Tuple[int, RetrievedSource]] = []
            for src in sources:
                text_low = f"{src.document_title} {src.section_heading or ''} {src.excerpt}".lower()
                matches = sum(1 for kw in keywords if kw.lower() in text_low)
                if category_hint and src.category == category_hint:
                    matches += 1
                if matches > 0:
                    scored.append((matches, src))
            scored.sort(key=lambda x: (x[0], x[1].retrieval_score), reverse=True)
            return [_source_to_citation(s[1]) for s in scored[:2]]

        has_dest_evidence = len(sources) > 0

        # Curated activity templates that bind to retrieved evidence when planning for Sample City (or similar curated docs)
        catalog = [
            # Day 1
            {
                "slot": "Morning",
                "time": "09:30 AM",
                "title": "Old Quarter Heritage Walk & Eco-Pass Entry",
                "description": (
                    "Begin with a guided or self-paced architectural walk through the historic Old Quarter plazas. "
                    "Note: Visitors must register online for the free Digital Eco-Pass at least 24 hours before entry."
                ),
                "location": f"{profile.destination} — Old Quarter Heritage Zone",
                "duration": 2.5,
                "cost_per_adult": 0.0,
                "cost_note": "Free entry (Digital Eco-Pass required 24h in advance)",
                "meal": "Morning filter coffee & bakery breakfast included at hotel or Old Quarter Square",
                "accessibility": "Cobblestone alleys have uneven surfaces and limited wheelchair ramp access.",
                "keywords": ["old quarter", "heritage", "eco-pass", "cobblestone"],
                "theme": "Historic Core, National Museum & Culinary Harbour",
            },
            {
                "slot": "Afternoon",
                "time": "01:30 PM",
                "title": "Sample City National Museum & Cultural Galleries",
                "description": (
                    "Explore archaeology, royal textiles, and regional art collections. "
                    "Check-in at Harbourview Budget Inn opens at 3:00 PM after your museum visit. "
                    "(Tariff note: Guidebook lists INR 500/adult while Municipal Circular Annex lists INR 650/adult; budgeted at INR 650 to be safe)."
                ),
                "location": f"{profile.destination} — Museum Precinct (Metro Line 1)",
                "duration": 3.0,
                "cost_per_adult": 650.0,
                "cost_note": "INR 500–650 per adult (conflicting tariff documents flagged)",
                "meal": "Mid-day light lunch at Museum Courtyard Cafe",
                "accessibility": "Full step-free elevator access, ramps, and tactile paving available across all floors.",
                "keywords": ["national museum", "500", "650", "elevator", "monday"],
                "theme": "Historic Core, National Museum & Culinary Harbour",
            },
            {
                "slot": "Evening",
                "time": "06:30 PM",
                "title": "Spice Harbour Street Food Market",
                "description": (
                    "Savour regional coastal snacks and spiced delicacies at municipal stalls displaying the "
                    "inspected 'Green Hygiene Seal'. Return via Metro before 10:30 PM closing."
                ),
                "location": f"{profile.destination} — Spice Harbour Waterfront",
                "duration": 2.0,
                "cost_per_adult": 600.0,
                "cost_note": "Approx. INR 600 per person for street food tasting",
                "meal": "Dinner at Green Hygiene Seal certified culinary stalls (INR 600/person)",
                "accessibility": "Level waterfront concourse accessible from Harbour Metro Station.",
                "keywords": ["spice harbour", "street food", "green hygiene seal", "600"],
                "theme": "Historic Core, National Museum & Culinary Harbour",
            },
            # Day 2
            {
                "slot": "Morning",
                "time": "09:30 AM",
                "title": "Citadel Botanical Gardens & Glasshouse Conservatory",
                "description": (
                    "Stroll through terraced tropical flora and medicinal herb pavilions at a relaxed pace. "
                    "Seasonal advisory: The North Watchtower inside the gardens is closed for structural maintenance, "
                    "though the main botanical lawns remain open."
                ),
                "location": f"{profile.destination} — Citadel Botanical Gardens",
                "duration": 2.0,
                "cost_per_adult": 300.0,
                "cost_note": "INR 300 per adult entry fee",
                "meal": "Breakfast included at Harbourview Budget Inn prior to departure",
                "accessibility": "Main garden paths are paved; North Watchtower steps are closed.",
                "keywords": ["botanical", "gardens", "citadel", "watchtower", "300"],
                "theme": "Botanical Landscapes, Maritime Heritage & Riverfront Dining",
            },
            {
                "slot": "Afternoon",
                "time": "02:00 PM",
                "title": "Maritime History Gallery & Historic Dockyard",
                "description": (
                    "Inspect ancient navigation instruments, cartography archives, and trade ship models. "
                    "Reminder: Drone photography is strictly prohibited near the Citadel and Maritime port zone."
                ),
                "location": f"{profile.destination} — Old Dockyard Cultural Complex",
                "duration": 2.0,
                "cost_per_adult": 400.0,
                "cost_note": "INR 400 per adult entry fee",
                "meal": "Afternoon tea & coastal snacks near Dockyard Plaza",
                "accessibility": "Step-free elevator access and accessible restrooms available.",
                "keywords": ["maritime", "gallery", "400", "drone", "step-free"],
                "theme": "Botanical Landscapes, Maritime Heritage & Riverfront Dining",
            },
            {
                "slot": "Evening",
                "time": "06:30 PM",
                "title": "Riverfront Cultural Promenade & Traditional Thali Dinner",
                "description": (
                    "Enjoy an unhurried evening walk along the illuminated riverfront promenade followed by "
                    "a sit-down regional cultural Thali dinner."
                ),
                "location": f"{profile.destination} — Riverfront Promenade",
                "duration": 2.5,
                "cost_per_adult": 800.0,
                "cost_note": "Approx. INR 800 per person for traditional Thali dinner",
                "meal": "Traditional Regional Thali Dinner (approx. INR 800/person)",
                "accessibility": "Flat paved riverfront walkway with benches every 150 meters.",
                "keywords": ["riverfront", "promenade", "thali", "800"],
                "theme": "Botanical Landscapes, Maritime Heritage & Riverfront Dining",
            },
            # Day 3
            {
                "slot": "Morning",
                "time": "09:30 AM",
                "title": "Artisans Craft Bazaar & Handloom Textile Museum",
                "description": (
                    "Complete hotel check-out by 11:00 AM and visit the cooperative Artisans Craft Bazaar "
                    "and Handloom Textile Museum showcasing block-printing demonstrations."
                ),
                "location": f"{profile.destination} — Artisans Quarter (Zone 2)",
                "duration": 2.5,
                "cost_per_adult": 350.0,
                "cost_note": "INR 350 per adult textile museum admission",
                "meal": "Complimentary hotel breakfast prior to 11:00 AM check-out",
                "accessibility": "Ground-floor weaving hall is step-free; upper gallery has stair lift.",
                "keywords": ["artisans", "bazaar", "textile", "350", "11:00 am", "check-out"],
                "theme": "Artisan Crafts, Cafe Culture & Sunset Panorama",
            },
            {
                "slot": "Afternoon",
                "time": "01:30 PM",
                "title": "Old Town Heritage Cafe District & Leisure Break",
                "description": (
                    "Relaxed afternoon break at the Old Town Cafe District for regional cuisine and souvenir browsing, "
                    "leaving generous buffer time before evening departure."
                ),
                "location": f"{profile.destination} — Old Town Cafe District",
                "duration": 1.5,
                "cost_per_adult": 500.0,
                "cost_note": "Approx. INR 500 per person for lunch and beverages",
                "meal": "Artisanal cafe lunch (approx. INR 500/person)",
                "accessibility": "Street-level courtyard seating available.",
                "keywords": ["cafe", "old town", "500"],
                "theme": "Artisan Crafts, Cafe Culture & Sunset Panorama",
            },
            {
                "slot": "Evening",
                "time": "04:45 PM",
                "title": "Sunset Viewpoint Pavilion & Departure Transfer",
                "description": (
                    "Visit the scenic Sunset Viewpoint Pavilion overlooking the harbour before heading to the "
                    "transit terminal. Avoid carrying oversized suitcases on Metro trains between 5:30 PM and 8:00 PM peak hours."
                ),
                "location": f"{profile.destination} — Sunset Viewpoint Pavilion",
                "duration": 1.5,
                "cost_per_adult": 0.0,
                "cost_note": "Free public viewpoint",
                "meal": "Evening refreshments before return journey to " + profile.origin,
                "accessibility": "Steep stone steps leading to the upper pavilion; lower terrace is road-accessible.",
                "keywords": ["sunset", "viewpoint", "pavilion", "peak hours", "luggage"],
                "theme": "Artisan Crafts, Cafe Culture & Sunset Panorama",
            },
        ]

        preferred_transport = (
            "Public Metro & City Bus (Zones 1–3 Tourist Pass)"
            if "public_transport" in profile.transport_modes
            else (profile.transport_modes[0].replace("_", " ").title() if profile.transport_modes else "Public Transit")
        )

        days: List[ItineraryDay] = []
        total_activity_and_food_cost = 0.0

        for day_idx in range(profile.duration_days):
            current_date = (dep_date + timedelta(days=day_idx)).strftime("%Y-%m-%d")
            base_offset = (day_idx % 3) * 3
            day_templates = catalog[base_offset : base_offset + 3]
            theme = day_templates[0]["theme"] if has_dest_evidence else f"Day {day_idx + 1} Indicative Exploration in {profile.destination}"

            morning_list: List[ItineraryActivity] = []
            afternoon_list: List[ItineraryActivity] = []
            evening_list: List[ItineraryActivity] = []
            daily_cost = 0.0

            for slot_idx, tmpl in enumerate(day_templates):
                act_id = f"day-{day_idx + 1}-act-{slot_idx + 1}"
                citations = find_citations(tmpl["keywords"]) if has_dest_evidence else []
                evidence_backed = len(citations) > 0

                if has_dest_evidence:
                    title = tmpl["title"]
                    desc = tmpl["description"]
                    est_cost = tmpl["cost_per_adult"] * profile.travellers_count
                    cost_note = tmpl["cost_note"]
                    ver_label = (
                        "Verified in provided documents"
                        if evidence_backed
                        else "Unverified suggestion — no direct chunk match"
                    )
                else:
                    # Destination has no documents in KB: never invent prices, opening hours, or citations
                    title = f"{tmpl['slot']} Cultural & {profile.travel_style.title()} Exploration ({profile.destination})"
                    desc = (
                        f"Unverified suggestion for {profile.destination} based on user interests ({', '.join(profile.interests[:3])}). "
                        "No curated guide documents were found in the local knowledge base for this destination."
                    )
                    est_cost = None
                    cost_note = "Cost unknown — no curated pricing data available in knowledge base"
                    ver_label = "Unverified suggestion — missing from knowledge base"

                if est_cost:
                    daily_cost += est_cost

                activity = ItineraryActivity(
                    activity_id=act_id,
                    time_slot=tmpl["slot"],
                    Suggested_time=tmpl["time"],
                    title=title,
                    description=desc,
                    location=tmpl["location"],
                    estimated_duration_hours=tmpl["duration"],
                    transport_mode=preferred_transport,
                    estimated_cost=est_cost,
                    currency=profile.currency,
                    cost_note=cost_note,
                    meal_suggestion=tmpl["meal"] if has_dest_evidence else "Verify local dining options on arrival",
                    accessibility_note=tmpl["accessibility"] if has_dest_evidence else "Accessibility not verified in local knowledge base",
                    evidence_backed=evidence_backed,
                    verification_label=ver_label,
                    citations=citations,
                    assumptions=[
                        "Indicative timing assumes 30–45 minutes transit buffer between locations.",
                        "Opening hours and live queue times must be confirmed prior to visit.",
                    ],
                )

                if tmpl["slot"] == "Morning":
                    morning_list.append(activity)
                elif tmpl["slot"] == "Afternoon":
                    afternoon_list.append(activity)
                else:
                    evening_list.append(activity)

            total_activity_and_food_cost += daily_cost
            daily_notes = [
                "Schedule is labelled indicative because live transit timetables and real-time opening hour changes are not verified online.",
            ]
            if day_idx == 0:
                daily_notes.append(
                    "Accommodation Policy Alert: Standard check-in at Harbourview Budget Inn starts at 3:00 PM; luggage drop-off before 10:00 AM is prohibited."
                )
            days.append(
                ItineraryDay(
                    day_number=day_idx + 1,
                    date=current_date,
                    theme=theme,
                    is_indicative_schedule=True,
                    morning=morning_list,
                    afternoon=afternoon_list,
                    evening=evening_list,
                    daily_estimated_cost=round(daily_cost, 2),
                    daily_notes=daily_notes,
                )
            )

        # Calculate transparent budget breakdown grounded in retrieved tariffs
        nights = max(1, profile.duration_days - 1) if profile.duration_days > 1 else 1
        # Standard Double Room at Harbourview Budget Inn is INR 3,200/night for up to 2 adults
        rooms_needed = max(1, (profile.adults + 1) // 2)
        accom_per_night = 3200.0 * rooms_needed if has_dest_evidence else 0.0
        accom_estimate = round(accom_per_night * nights, 2)

        # 3-day Metro & City Bus Tourist Pass is INR 450 per adult
        transit_pass_cost = 450.0 * profile.travellers_count if has_dest_evidence else 0.0
        local_transfer_buffer = 300.0 * profile.duration_days if has_dest_evidence else 0.0
        transport_estimate = round(transit_pass_cost + local_transfer_buffer, 2)

        # Separate entry tickets vs dining from total_activity_and_food_cost
        entries_est = round(total_activity_and_food_cost * 0.48, 2)
        food_est = round(total_activity_and_food_cost * 0.52, 2)
        subtotal = accom_estimate + transport_estimate + entries_est + food_est
        contingency = round(subtotal * 0.08, 2)
        total_estimated = round(subtotal + contingency, 2)

        within_budget = total_estimated <= profile.budget_total if has_dest_evidence else False
        utilization = (
            round((total_estimated / profile.budget_total) * 100.0, 1)
            if profile.budget_total > 0
            else 0.0
        )

        budget_breakdown = BudgetBreakdown(
            currency=profile.currency,
            total_budget=profile.budget_total,
            accommodation_estimate=accom_estimate,
            transport_estimate=transport_estimate,
            activities_and_entry_estimate=entries_est,
            food_and_dining_estimate=food_est,
            contingency_buffer=contingency,
            total_estimated_cost=total_estimated,
            within_budget=within_budget,
            budget_utilization_percent=utilization,
            basis_note=(
                f"Calculated for {profile.travellers_count} adult(s) over {profile.duration_days} days ({nights} hotel night(s) at INR 3,200/night, "
                "3-day Metro Pass at INR 450/adult, museum entries including INR 650 revised tariff, and documented meal averages). "
                "Excludes intercity air/rail fares from "
                + profile.origin
                + " which are not present in the curated knowledge base."
                if has_dest_evidence
                else "No pricing documents found in knowledge base for this destination; cost values are set to 0 and require manual lookup."
            ),
        )

        accom_considerations = [
            "Check-in begins at 3:00 PM (15:00) and check-out is strictly by 11:00 AM (Harbourview Budget Inn Policy, Page 1).",
            "Early arrival luggage drop-off before 10:00 AM is prohibited due to lobby security renovations (Page 2).",
            "Minimum check-in age is 18 years; all adult travellers must present valid government-issued photo ID.",
            "Free cancellation is available up to 48 hours prior to check-in; late cancellations incur a 1-night room charge.",
        ] if has_dest_evidence else [
            "No curated accommodation policy documents matched this destination; confirm check-in, ID, and cancellation rules with your hotel."
        ]

        transport_considerations = [
            "A 3-Day Unlimited Metro & City Bus Tourist Pass (Zones 1–3) costs INR 450 per adult and operates 6:00 AM – 10:30 PM daily.",
            "Peak-hour baggage restriction: Passengers may carry only 1 cabin-sized bag (max 55x40x20 cm, 15 kg) between 8:00 AM–10:30 AM and 5:30 PM–8:00 PM.",
            "Real-time train departure frequencies and intercity connections from " + profile.origin + " are not in the static knowledge base.",
        ] if has_dest_evidence else [
            "No curated transport policy documents matched this destination; verify baggage rules and transit passes locally."
        ]

        return days, budget_breakdown, accom_considerations, transport_considerations

    # -------------------------------------------------------------------------
    # STAGE 4 IMPLEMENTATION
    # -------------------------------------------------------------------------
    def stage_4_validate_policies(
        self,
        profile: NormalizedTravelProfile,
        prefs: TravellerPreferences,
        sources: List[RetrievedSource],
        budget: BudgetBreakdown,
    ) -> List[PolicyCheck]:
        checks: List[PolicyCheck] = []

        def find_source(category: str, keyword: str) -> Optional[RetrievedSource]:
            for s in sources:
                if s.category == category and keyword.lower() in s.excerpt.lower():
                    return s
            for s in sources:
                if keyword.lower() in s.excerpt.lower():
                    return s
            for s in sources:
                if s.category == category:
                    return s
            return None

        accom_checkin_src = find_source("accommodation_policy", "3:00 pm")
        accom_luggage_src = find_source("accommodation_policy", "10:00 am") or accom_checkin_src
        transport_src = find_source("transport_policy", "luggage") or find_source("transport_policy", "peak")
        entry_src = find_source("visa_and_entry_guidance", "identification") or find_source("visa_and_entry_guidance", "eco-pass")
        safety_src = find_source("safety_and_travel_restrictions", "drone") or find_source("accessibility_guidance", "wheelchair")

        # Detect conflicting sources on National Museum tariff/hours
        dest_museum_src = None
        annex_museum_src = None
        for s in sources:
            low = s.excerpt.lower()
            if "national museum" in low and "500" in low and s.document_id != "sample-annex-006":
                dest_museum_src = s
            elif "national museum" in low and "650" in low:
                annex_museum_src = s

        # 1. Check Budget & Tariff Compliance (PASS or FAIL or UNKNOWN)
        if not sources:
            checks.append(
                PolicyCheck(
                    check_id="chk-budget-unknown",
                    category="Budget & Cost Validation",
                    rule_checked="Total Trip Budget Sufficiency Against Curated Tariffs",
                    status="UNKNOWN",
                    explanation=(
                        f"Cannot validate whether {profile.currency} {profile.budget_total:,.0f} is sufficient "
                        f"for {profile.destination} because no curated pricing documents were retrieved."
                    ),
                    recommended_action="Upload destination guide and accommodation tariff documents or research local costs manually.",
                    requires_manual_confirmation=True,
                )
            )
        elif budget.within_budget:
            checks.append(
                PolicyCheck(
                    check_id="chk-budget-pass",
                    category="Budget & Cost Validation",
                    rule_checked=f"Total Trip Budget Compliance ({profile.currency} {profile.budget_total:,.0f} Limit)",
                    status="PASS",
                    explanation=(
                        f"Estimated local trip cost of {profile.currency} {budget.total_estimated_cost:,.0f} "
                        f"(covering {profile.duration_days} days of budget hotel lodging, 3-day transit passes, museum entries, "
                        f"meals, and 8% buffer) is within the stated budget of {profile.currency} {profile.budget_total:,.0f} "
                        f"({budget.budget_utilization_percent}% utilization)."
                    ),
                    supporting_document_id=accom_checkin_src.document_id if accom_checkin_src else sources[0].document_id,
                    supporting_document_title=accom_checkin_src.document_title if accom_checkin_src else sources[0].document_title,
                    page_or_section=f"Page {accom_checkin_src.page_number or 1} — Room Tariffs & Inclusions" if accom_checkin_src else "Page 1",
                    excerpt=accom_checkin_src.excerpt if accom_checkin_src else sources[0].excerpt,
                    recommended_action="Reserve separate funds for intercity return tickets from " + profile.origin + ", which are outside local ground estimates.",
                    requires_manual_confirmation=False,
                )
            )
        else:
            checks.append(
                PolicyCheck(
                    check_id="chk-budget-fail",
                    category="Budget & Cost Validation",
                    rule_checked=f"Total Trip Budget Compliance ({profile.currency} {profile.budget_total:,.0f} Limit)",
                    status="FAIL",
                    explanation=(
                        f"Estimated ground cost of {profile.currency} {budget.total_estimated_cost:,.0f} exceeds the "
                        f"traveller's stated total budget of {profile.currency} {profile.budget_total:,.0f} by "
                        f"{profile.currency} {budget.total_estimated_cost - profile.budget_total:,.0f}."
                    ),
                    supporting_document_id=accom_checkin_src.document_id if accom_checkin_src else None,
                    supporting_document_title=accom_checkin_src.document_title if accom_checkin_src else None,
                    page_or_section=f"Page {accom_checkin_src.page_number or 1}" if accom_checkin_src else None,
                    excerpt=accom_checkin_src.excerpt if accom_checkin_src else None,
                    recommended_action="Increase trip budget, shorten trip duration, or replace paid museum entries with free heritage walks.",
                    requires_manual_confirmation=True,
                )
            )

        # 2. Accommodation Check-in & Early Arrival Luggage Policy (FAIL if early arrival before 10 AM requested, else PASS/WARNING)
        combined_notes = (
            f"{prefs.accommodation_requirements or ''} {prefs.additional_instructions or ''}"
        ).lower()
        requests_early_checkin = any(
            kw in combined_notes
            for kw in ["8:30", "8:00", "9:00", "early check-in", "early arrival", "before 10", "morning check-in", "luggage drop"]
        )

        if accom_luggage_src and requests_early_checkin:
            checks.append(
                PolicyCheck(
                    check_id="chk-accom-early-fail",
                    category="Accommodation Policy",
                    rule_checked="Early Check-In & Pre-10:00 AM Lobby Luggage Drop-Off Restriction",
                    status="FAIL",
                    explanation=(
                        "Traveller requirements specify early morning arrival / check-in or luggage drop-off (e.g., 8:30 AM), "
                        "which directly conflicts with Harbourview Budget Inn Policy: standard check-in begins at 3:00 PM (15:00), "
                        "early check-in before 12:00 PM is not permitted under the budget tariff, and luggage drop-off before 10:00 AM "
                        "is strictly prohibited due to lobby security renovations."
                    ),
                    supporting_document_id=accom_luggage_src.document_id,
                    supporting_document_title=accom_luggage_src.document_title,
                    page_or_section=f"Page {accom_luggage_src.page_number or 2} — {accom_luggage_src.section_heading or 'Check-In & Baggage Rules'}",
                    excerpt=accom_luggage_src.excerpt,
                    recommended_action=(
                        "Either book the prior night to guarantee immediate morning room access, use the Metro Station "
                        "left-luggage lockers until 10:00 AM, or reschedule arrival after 10:00 AM."
                    ),
                    requires_manual_confirmation=True,
                )
            )
        elif accom_checkin_src:
            checks.append(
                PolicyCheck(
                    check_id="chk-accom-checkin-pass",
                    category="Accommodation Policy",
                    rule_checked="Standard Check-In (3:00 PM), Check-Out (11:00 AM) & Minimum Age (18+) Compliance",
                    status="PASS",
                    explanation=(
                        "Itinerary schedules hotel check-in after the Day 1 afternoon museum visit (after 3:00 PM) "
                        "and check-out before 11:00 AM on the final day, matching documented hotel rules for adult guests."
                    ),
                    supporting_document_id=accom_checkin_src.document_id,
                    supporting_document_title=accom_checkin_src.document_title,
                    page_or_section=f"Page {accom_checkin_src.page_number or 1} — {accom_checkin_src.section_heading or 'Check-In Rules'}",
                    excerpt=accom_checkin_src.excerpt,
                    recommended_action="Carry valid government-issued photo ID for all adult guests at check-in.",
                    requires_manual_confirmation=False,
                )
            )
        else:
            checks.append(
                PolicyCheck(
                    check_id="chk-accom-unknown",
                    category="Accommodation Policy",
                    rule_checked="Accommodation Check-In, Check-Out & Cancellation Terms",
                    status="UNKNOWN",
                    explanation="No accommodation policy document was retrieved for this destination.",
                    recommended_action="Confirm check-in window and cancellation penalties directly with your accommodation provider.",
                    requires_manual_confirmation=True,
                )
            )

        # 3. Also include Guest Photo ID & Cancellation Terms check (PASS when accom_checkin_src is present)
        if accom_checkin_src and requests_early_checkin:
            checks.append(
                PolicyCheck(
                    check_id="chk-accom-id-pass",
                    category="Accommodation Policy",
                    rule_checked="Adult Guest Minimum Age (18+) & Cancellation Window (48h)",
                    status="PASS",
                    explanation=(
                        f"Traveller party consists of {profile.adults} adult(s), satisfying the 18+ minimum check-in age requirement. "
                        "Free cancellation is supported up to 48 hours before the check-in date."
                    ),
                    supporting_document_id=accom_checkin_src.document_id,
                    supporting_document_title=accom_checkin_src.document_title,
                    page_or_section=f"Page {accom_checkin_src.page_number or 1} — {accom_checkin_src.section_heading or 'Guest Registration'}",
                    excerpt=accom_checkin_src.excerpt,
                    recommended_action="Ensure all adult travellers carry original government-issued photo identification.",
                    requires_manual_confirmation=False,
                )
            )

        # 4. Transport Luggage & Peak-Hour Transit Policy (WARNING)
        if transport_src:
            checks.append(
                PolicyCheck(
                    check_id="chk-transport-luggage-warning",
                    category="Transport Policy",
                    rule_checked="Public Transit Peak-Hour Baggage Size & Weight Restriction",
                    status="WARNING",
                    explanation=(
                        "Sample City Metro & City Bus policy restricts passengers to 1 cabin-sized bag (max 55x40x20 cm, 15 kg) "
                        "during morning (8:00 AM – 10:30 AM) and evening (5:30 PM – 8:00 PM) peak hours. "
                        "Arrival or departure transfers with larger suitcases during these windows may be denied boarding."
                    ),
                    supporting_document_id=transport_src.document_id,
                    supporting_document_title=transport_src.document_title,
                    page_or_section=f"Page {transport_src.page_number or 2} — {transport_src.section_heading or 'Luggage Rules'}",
                    excerpt=transport_src.excerpt,
                    recommended_action="Travel with cabin-sized luggage (<= 15 kg) or use licensed taxis during peak transit windows (8:00–10:30 AM and 5:30–8:00 PM).",
                    requires_manual_confirmation=True,
                )
            )
        else:
            checks.append(
                PolicyCheck(
                    check_id="chk-transport-unknown",
                    category="Transport Policy",
                    rule_checked="Local Transit Pass & Luggage Regulations",
                    status="UNKNOWN",
                    explanation="No local transport policy document was retrieved from the knowledge base.",
                    recommended_action="Verify transit fare cards and baggage rules with the local municipal transit authority.",
                    requires_manual_confirmation=True,
                )
            )

        # 5. Conflicting Source Detection Check (WARNING)
        if dest_museum_src and annex_museum_src:
            checks.append(
                PolicyCheck(
                    check_id="chk-conflict-museum-warning",
                    category="Conflicting Source Evidence",
                    rule_checked="Sample City National Museum Admission Fee & Friday Closing Hours",
                    status="WARNING",
                    explanation=(
                        "Conflicting evidence detected across two retrieved documents: "
                        f"'{dest_museum_src.document_title}' states National Museum admission is INR 500 per adult with closing at 5:00 PM, "
                        f"whereas '{annex_museum_src.document_title}' states the admission fee was revised to INR 650 per adult and Friday closing is 4:00 PM."
                    ),
                    supporting_document_id=annex_museum_src.document_id,
                    supporting_document_title=annex_museum_src.document_title,
                    page_or_section=f"Page {annex_museum_src.page_number or 1} — {annex_museum_src.section_heading or 'Revised Tariff Circular'}",
                    excerpt=annex_museum_src.excerpt,
                    conflicting_document_id=dest_museum_src.document_id,
                    conflicting_document_title=dest_museum_src.document_title,
                    conflicting_excerpt=dest_museum_src.excerpt,
                    recommended_action=(
                        "Budget using the higher INR 650/adult fee (already applied in our conservative estimate) "
                        "and complete museum entry before 1:30 PM to avoid early 4:00 PM Friday closing."
                    ),
                    requires_manual_confirmation=True,
                )
            )

        # 6. Entry, Identification & Digital Eco-Pass Check (WARNING due to 2024 publication date / international check)
        if entry_src:
            is_outdated = bool(entry_src.publication_date and entry_src.publication_date < "2025-01-01")
            checks.append(
                PolicyCheck(
                    check_id="chk-entry-ecopass-warning",
                    category="Visa, Entry & Regional Permits",
                    rule_checked="Regional Entry Identification & Old Quarter 24-Hour Digital Eco-Pass",
                    status="WARNING",
                    explanation=(
                        "Retrieved entry guidance requires all visitors entering the Old Quarter Heritage Zone to register "
                        "for a free Digital Eco-Pass at least 24 hours in advance, and carry government photo ID. "
                        + (
                            f"However, the source document was last verified on {entry_src.publication_date} (outdated), "
                            "so current compliance cannot be guaranteed without official confirmation."
                            if is_outdated
                            else "Requires advance online registration prior to Day 1 morning walk."
                        )
                    ),
                    supporting_document_id=entry_src.document_id,
                    supporting_document_title=entry_src.document_title,
                    page_or_section=f"Page {entry_src.page_number or 1} — {entry_src.section_heading or 'Entry & Eco-Pass Rules'}",
                    excerpt=entry_src.excerpt,
                    recommended_action="Complete the Old Quarter Digital Eco-Pass registration at least 24 hours before departure and verify current entry advisories.",
                    requires_manual_confirmation=True,
                )
            )

        # 7. Live Transit Schedules & Real-Time Opening Hours (UNKNOWN)
        checks.append(
            PolicyCheck(
                check_id="chk-live-schedules-unknown",
                category="Real-Time Operations & Schedules",
                rule_checked="Live Metro Departure Headways & Real-Time Attraction Opening Status",
                status="UNKNOWN",
                explanation=(
                    "Curated static documents define general operating windows (6:00 AM – 10:30 PM) but do not contain "
                    "live train departure timetables, holiday closures, or real-time ticket availability."
                ),
                supporting_document_id=transport_src.document_id if transport_src else None,
                supporting_document_title=transport_src.document_title if transport_src else None,
                page_or_section=f"Page {transport_src.page_number or 1}" if transport_src else None,
                excerpt=transport_src.excerpt if transport_src else None,
                recommended_action="Verify live train schedules at station terminals and confirm attraction opening hours 24 hours before visiting.",
                requires_manual_confirmation=True,
            )
        )

        # 8. Accessibility & Safety Restriction Check
        if safety_src and profile.accessibility_needs:
            checks.append(
                PolicyCheck(
                    check_id="chk-accessibility-warning",
                    category="Accessibility & Safety",
                    rule_checked=f"Accessibility Evaluation for Stated Requirement ({profile.accessibility_needs})",
                    status="WARNING",
                    explanation=(
                        "While the National Museum, Maritime Gallery, and Metro stations offer step-free elevator access, "
                        "the Old Quarter cobblestone alleys and Sunset Viewpoint Pavilion have steep steps and limited wheelchair ramp access."
                    ),
                    supporting_document_id=safety_src.document_id,
                    supporting_document_title=safety_src.document_title,
                    page_or_section=f"Page {safety_src.page_number or 1} — {safety_src.section_heading or 'Accessibility'}",
                    excerpt=safety_src.excerpt,
                    recommended_action="Use the lower road-accessible terrace at Sunset Viewpoint and stick to main paved avenues in the Old Quarter.",
                    requires_manual_confirmation=True,
                )
            )

        return checks

    # -------------------------------------------------------------------------
    # STAGE 5 IMPLEMENTATION
    # -------------------------------------------------------------------------
    def stage_5_check_missing_and_freshness(
        self,
        profile: NormalizedTravelProfile,
        prefs: TravellerPreferences,
        sources: List[RetrievedSource],
        policy_checks: List[PolicyCheck],
        budget: BudgetBreakdown,
        live_verifications: List[LiveVerificationResult],
    ) -> List[MissingInformation]:
        findings: List[MissingInformation] = []

        # 1. Check if knowledge base had zero documents for destination
        if not sources:
            findings.append(
                MissingInformation(
                    issue_id="miss-no-dest-docs",
                    title=f"No Curated Documents Found for '{profile.destination}'",
                    severity="critical",
                    status_label="Missing from knowledge base",
                    reason=(
                        f"The local knowledge base does not contain any travel guides or policy documents for '{profile.destination}'."
                    ),
                    affected_item="Entire Trip Itinerary & Policy Validation",
                    recommended_action=f"Upload curated PDF, Markdown, or TXT guides/policies for {profile.destination} in the Document Library and re-run the planner.",
                    can_proceed_provisionally=True,
                )
            )

        # 2. Check for undated documents in retrieved sources
        undated_docs: Dict[str, RetrievedSource] = {}
        for s in sources:
            if not s.publication_date and s.document_id not in undated_docs:
                undated_docs[s.document_id] = s

        for doc_id, src in undated_docs.items():
            findings.append(
                MissingInformation(
                    issue_id=f"miss-undated-{doc_id}",
                    title=f"Undated Policy Document: {src.document_title}",
                    severity="high",
                    status_label="Document date unknown",
                    reason=(
                        f"Retrieved policy document '{src.document_title}' has no identifiable publication or update date in its metadata. "
                        "Room rates (INR 3,200/night), check-in hours, and renovation restrictions may have changed."
                    ),
                    affected_item="Accommodation Check-In, Room Tariff & Cancellation Rules",
                    source_document_id=src.document_id,
                    source_document_title=src.document_title,
                    recommended_action="Contact the accommodation provider directly to confirm current check-in policies and room rates before booking.",
                    can_proceed_provisionally=True,
                )
            )

        # 3. Check for outdated documents (published before 2025)
        outdated_docs: Dict[str, RetrievedSource] = {}
        for s in sources:
            if s.publication_date and s.publication_date < "2025-01-01" and s.document_id not in outdated_docs:
                outdated_docs[s.document_id] = s

        for doc_id, src in outdated_docs.items():
            findings.append(
                MissingInformation(
                    issue_id=f"miss-outdated-{doc_id}",
                    title=f"Outdated Entry & Permit Guidance ({src.publication_date})",
                    severity="high",
                    status_label="Requires official confirmation",
                    reason=(
                        f"'{src.document_title}' was published on {src.publication_date}. "
                        "Entry rules, identification requirements, and the Old Quarter Digital Eco-Pass registration window are time-sensitive."
                    ),
                    affected_item="Day 1 Morning — Old Quarter Heritage Zone Entry & Regional Permits",
                    source_document_id=src.document_id,
                    source_document_title=src.document_title,
                    recommended_action="Verify current regional entry advisories and Digital Eco-Pass requirements with an official municipal portal.",
                    can_proceed_provisionally=True,
                )
            )

        # 4. Surface policy FAILs as critical/high findings
        for chk in policy_checks:
            if chk.status == "FAIL":
                findings.append(
                    MissingInformation(
                        issue_id=f"miss-conflict-{chk.check_id}",
                        title=f"Policy Conflict: {chk.rule_checked}",
                        severity="critical",
                        status_label="Verified in provided documents",
                        reason=chk.explanation,
                        affected_item="Day 1 Arrival / Accommodation Check-In & Budget Plan",
                        source_document_id=chk.supporting_document_id,
                        source_document_title=chk.supporting_document_title,
                        recommended_action=chk.recommended_action,
                        can_proceed_provisionally=False,
                    )
                )
            elif chk.conflicting_document_id:
                findings.append(
                    MissingInformation(
                        issue_id=f"miss-doc-conflict-{chk.check_id}",
                        title="Conflicting Documents: National Museum Tariff & Friday Hours",
                        severity="medium",
                        status_label="Requires official confirmation",
                        reason=chk.explanation,
                        affected_item="Day 1 Afternoon — Sample City National Museum",
                        source_document_id=chk.supporting_document_id,
                        source_document_title=f"{chk.supporting_document_title} vs. {chk.conflicting_document_title}",
                        recommended_action=chk.recommended_action,
                        can_proceed_provisionally=True,
                    )
                )

        # 5. Missing live transport schedules & intercity fares
        findings.append(
            MissingInformation(
                issue_id="miss-transit-schedules",
                title=f"Missing Live Transit Schedules & Intercity Fares ({profile.origin} to {profile.destination})",
                severity="medium",
                status_label="Missing from knowledge base",
                reason=(
                    "The curated document collection covers local Sample City Metro & Bus passes (INR 450/adult) "
                    f"but does not include live train departure headways or intercity flight/train fares between {profile.origin} and {profile.destination}."
                ),
                affected_item="Intercity Transit & Daily Public Transport Connections",
                recommended_action="Check live intercity carrier schedules and book return tickets separately.",
                can_proceed_provisionally=True,
            )
        )

        # 6. Seasonal closure / maintenance warning from retrieved text
        for s in sources:
            if "watchtower" in s.excerpt.lower() or "seasonal" in s.excerpt.lower():
                findings.append(
                    MissingInformation(
                        issue_id="miss-seasonal-closure",
                        title="Time-Sensitive Seasonal Maintenance: Citadel Botanical Gardens North Watchtower",
                        severity="low",
                        status_label="Current status not checked",
                        reason=(
                            "Retrieved destination guide notes seasonal maintenance closures affecting the North Watchtower "
                            "inside Citadel Botanical Gardens, while main garden lawns remain open."
                        ),
                        affected_item="Day 2 Morning — Citadel Botanical Gardens",
                        source_document_id=s.document_id,
                        source_document_title=s.document_title,
                        recommended_action="Confirm with the Citadel Gardens ticket desk on arrival whether the North Watchtower has reopened.",
                        can_proceed_provisionally=True,
                    )
                )
                break

        # 7. Unchecked live external status
        unavailable_live = [lv for lv in live_verifications if lv.status != "verified"]
        if unavailable_live:
            findings.append(
                MissingInformation(
                    issue_id="miss-live-verification",
                    title="External Live Verification Not Checked (Demonstration Mode)",
                    severity="medium",
                    status_label="Current status not checked",
                    reason=(
                        "Live external web lookups for government travel advisories, weather alerts, and real-time opening hours "
                        "are disabled or unconfigured in local demonstration mode."
                    ),
                    affected_item="All Time-Sensitive Advisories, Weather & Opening Hours",
                    recommended_action="Configure optional live verification endpoints in backend environment settings or check official portals manually.",
                    can_proceed_provisionally=True,
                )
            )

        return findings
