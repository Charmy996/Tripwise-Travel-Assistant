# TripWise AI — 6-Stage Planning & Policy Workflow

TripWise AI executes travel planning as an inspectable sequence of six deterministic stages implemented in `backend/app/workflow/pipeline.py`.

## Stage 1: Preference Identification (`preference_analysis`)
- **Input:** `TravellerPreferences` (origin, destination, dates, traveller counts, budget, style, pace, interests, transport/accommodation preferences, and practical constraints).
- **Tasks:**
  - Validates that `return_date >= departure_date` and calculates inclusive `duration_days`.
  - Detects contradictory preferences (e.g., `luxury` style paired with a `budget_hotel` or low per-person daily budget; mismatch between `travellers_count` and `adults + children`).
  - Identifies unspecified optional fields (`dietary_requirements`, `accessibility_needs`, `visa_status_note`) without silently inventing values.
- **Output:** `NormalizedTravelProfile`.

## Stage 2: Curated Knowledge Retrieval (`knowledge_retrieval`)
- **Input:** `NormalizedTravelProfile`.
- **Tasks:**
  - Executes multi-facet hybrid queries (FAISS vector similarity + BM25 lexical matching) across destination highlights, accommodation rules, transit policies, entry permits, and accessibility/safety guides.
  - Deduplicates retrieved chunks and attaches verification labels (`Verified in provided documents`, `Document date unknown`, `Requires official confirmation`).
  - Never presents retrieval similarity scores as factual confidence percentages.
- **Output:** Ranked `List[RetrievedSource]`.

## Stage 3: Destination Research & Itinerary Generation (`itinerary_generation`)
- **Input:** `NormalizedTravelProfile`, `TravellerPreferences`, `List[RetrievedSource]`.
- **Tasks:**
  - Builds a realistic day-by-day schedule (`Morning`, `Afternoon`, `Evening`) respecting transit buffers and the traveller's selected pace.
  - Attaches exact `CitationReference` objects (document title, ID, page number, section heading, excerpt) to every evidence-backed activity.
  - If a destination has no curated documents in the knowledge base, activities are explicitly labelled `"Unverified suggestion — missing from knowledge base"` with zero fabricated citations or costs.
  - Computes a transparent `BudgetBreakdown` (lodging, local transit passes, attraction entries, dining, and 8% contingency buffer).
- **Output:** `List[ItineraryDay]`, `BudgetBreakdown`, accommodation & transport notes.

## Stage 4: Policy & Restriction Validation (`policy_validation`)
- **Input:** Profile, preferences, retrieved sources, and budget breakdown.
- **Tasks:**
  - Evaluates rules across accommodation check-in/out, early arrival luggage restrictions, minimum guest age & ID, transit peak-hour baggage limits, conflicting museum tariff circulars, regional entry permits, and budget limits.
  - Produces explainable statuses:
    - `PASS`: Affirmative evidence in retrieved documents supports compliance.
    - `WARNING`: Potential issue, peak-hour constraint, outdated source, or multi-document conflict requires attention.
    - `FAIL`: Documented requirement directly conflicts with the proposed plan (e.g., requesting 8:30 AM luggage drop-off when hotel policy prohibits drop-off before 10:00 AM; or exceeding total budget).
    - `UNKNOWN`: Relevant evidence is absent from static documents (e.g., live train departure headways).
- **Output:** `List[PolicyCheck]`.

## Stage 5: Missing-Information & Freshness Checker (`missing_info_check`)
- **Input:** Profile, retrieved sources, policy checks, budget, and optional live adapter results.
- **Tasks:**
  - Audits all retrieved sources for missing publication dates (`sample-accommodation-001` -> `Document date unknown`).
  - Flags outdated guidance (`sample-entry-001` dated `2024-06-01` -> `Requires official confirmation`).
  - Flags conflicting documents (`sample-destination-001` vs `sample-annex-006` on National Museum entry fee and Friday hours).
  - Surfaces seasonal closures (Citadel Botanical Gardens North Watchtower) and unchecked external live feeds.
- **Output:** `List[MissingInformation]` and `List[LiveVerificationResult]`.

## Stage 6: Final Itinerary Assembly (`final_plan_assembly`)
- **Input:** All outputs from Stages 1–5.
- **Tasks:**
  - Synthesizes executive summary (via local deterministic engine or optional configured LLM provider with automatic fallback).
  - Determines overall verification status (never marking the plan as fully verified while any `FAIL`, `WARNING`, `UNKNOWN`, or critical/high missing items exist).
  - Packages the `"How this plan was created"` audit trail (`how_plan_was_created`) and persists the `FinalTripPlan` and `WorkflowRun` to SQLite.
- **Output:** `FinalTripPlan`.
