"""Comprehensive Automated Test Suite for TripWise AI (Covers Requirements 1 through 18)."""
import io
import os
from pathlib import Path
import pymupdf as fitz
import pytest
from fastapi.testclient import TestClient

from app.api.routes import set_test_dependencies
from app.db.database import DatabaseManager
from app.main import app
from app.retrieval.document_processor import (
    chunk_document_pages,
    extract_pages_from_pdf,
    extract_pages_from_text_or_md,
    process_document_bytes,
    sanitize_filename,
    validate_upload_file,
)
from app.retrieval.hybrid_retriever import HybridRetriever
from app.schemas.models import TravellerPreferences
from app.services.live_adapter import LiveVerificationAdapter, is_safe_external_url
from app.services.llm_service import LLMService
from app.services.seed_service import DEMO_TRIP_ID, ensure_seeded, get_default_demo_preferences
from app.workflow.pipeline import TripPlanningWorkflow


@pytest.fixture()
def test_env(tmp_path: Path):
    db_file = tmp_path / "test_tripwise.db"
    db = DatabaseManager(db_path=db_file)
    retriever = HybridRetriever()
    ensure_seeded(db, retriever, force_reseed=True)
    set_test_dependencies(db, retriever)
    client = TestClient(app)
    return db, retriever, client


# 1. Preference validation & Contradiction Detection
def test_01_preference_validation_and_contradictions(test_env):
    _, retriever, _ = test_env
    workflow = TripPlanningWorkflow(retriever)

    prefs = get_default_demo_preferences()
    prefs.travel_style = "luxury"
    prefs.accommodation_type = "budget_hotel"
    prefs.budget_total = 4000.0  # Very low for 2 adults over 3 days
    prefs.adults = 1
    prefs.children = 0
    prefs.travellers_count = 2  # Mismatch with adults + children

    profile = workflow.stage_1_identify_preferences(prefs)
    assert profile.duration_days == 3
    assert len(profile.detected_conflicts) >= 2
    assert any("mismatch" in c.lower() for c in profile.detected_conflicts)
    assert any("contradictory" in c.lower() for c in profile.detected_conflicts)


# 2. Invalid date ranges
def test_02_invalid_date_ranges(test_env):
    _, retriever, client = test_env
    workflow = TripPlanningWorkflow(retriever)

    prefs = get_default_demo_preferences()
    prefs.departure_date = "2026-11-15"
    prefs.return_date = "2026-11-10"  # Return precedes departure

    with pytest.raises(ValueError, match="cannot precede departure date"):
        workflow.stage_1_identify_preferences(prefs)

    resp = client.post("/api/trips", json=prefs.model_dump())
    assert resp.status_code == 422
    assert "cannot precede" in resp.json()["detail"]


# 3. Budget constraint evaluation (PASS vs FAIL)
def test_03_budget_constraint_evaluation(test_env):
    _, retriever, _ = test_env
    workflow = TripPlanningWorkflow(retriever)

    # Sufficient budget -> PASS
    prefs_ok = get_default_demo_preferences()
    prefs_ok.budget_total = 25000.0
    plan_ok = workflow.execute("trip-budget-ok", prefs_ok)
    assert plan_ok.budget_breakdown is not None
    assert plan_ok.budget_breakdown.within_budget is True
    budget_checks_ok = [c for c in plan_ok.policy_checks if "Budget" in c.category]
    assert any(c.status == "PASS" for c in budget_checks_ok)

    # Insufficient budget -> FAIL
    prefs_low = get_default_demo_preferences()
    prefs_low.budget_total = 3000.0  # Too low for 2 nights hotel + passes + museum + meals
    plan_low = workflow.execute("trip-budget-low", prefs_low)
    assert plan_low.budget_breakdown is not None
    assert plan_low.budget_breakdown.within_budget is False
    budget_checks_low = [c for c in plan_low.policy_checks if "Budget" in c.category]
    assert any(c.status == "FAIL" for c in budget_checks_low)


# 4. Document upload validation (types, empty files, path traversal)
def test_04_document_upload_validation(test_env):
    _, _, client = test_env

    # Disallowed extension
    with pytest.raises(ValueError, match="Unsupported file type"):
        validate_upload_file("malicious.exe", b"binary content")

    # Empty file
    with pytest.raises(ValueError, match="empty"):
        validate_upload_file("empty.txt", b"")

    # Path traversal sanitization
    safe_name = sanitize_filename("../../etc/passwd")
    assert ".." not in safe_name
    assert "/" not in safe_name

    # API upload of invalid extension returns 400
    resp = client.post(
        "/api/documents/upload",
        files={"file": ("script.sh", b"echo hello", "application/x-sh")},
        data={"title": "Bad File", "category": "other", "destination": "Sample City"},
    )
    assert resp.status_code == 400


# 5. PDF and text extraction (including blank/scanned PDF rejection)
def test_05_pdf_and_text_extraction():
    # Create a valid 2-page PDF
    doc = fitz.open()
    p1 = doc.new_page()
    p1.insert_text((72, 72), "Section 1: Page One Content\nCheck-in begins at 3:00 PM.")
    p2 = doc.new_page()
    p2.insert_text((72, 72), "Section 2: Page Two Content\nCheck-out is by 11:00 AM.")
    pdf_bytes = doc.tobytes()
    doc.close()

    pages = extract_pages_from_pdf(pdf_bytes)
    assert len(pages) == 2
    assert pages[0][0] == 1 and "3:00 PM" in pages[0][1]
    assert pages[1][0] == 2 and "11:00 AM" in pages[1][1]

    # Blank / scanned PDF with no extractable text should raise clear error
    blank_doc = fitz.open()
    blank_doc.new_page()
    blank_bytes = blank_doc.tobytes()
    blank_doc.close()
    with pytest.raises(ValueError, match="No extractable text found in PDF"):
        extract_pages_from_pdf(blank_bytes)


# 6. Document chunking and metadata preservation
def test_06_chunking_and_metadata_preservation():
    md_text = (
        "# Section 1: Transit Rules\n"
        "Metro pass costs INR 450 per adult for 3 days.\n\n"
        "--- PAGE 2 ---\n\n"
        "# Section 2: Baggage Rules\n"
        "Passengers may carry 1 cabin bag up to 15 kg during peak hours."
    ).encode("utf-8")

    pages = extract_pages_from_text_or_md(md_text)
    assert len(pages) == 2
    chunks = chunk_document_pages(
        document_id="test-doc-meta",
        document_title="Transit Test Manual",
        category="transport_policy",
        authority="demonstration_source",
        destination="Sample City",
        pages=pages,
        publication_date="2026-01-10",
    )
    assert len(chunks) >= 2
    assert chunks[0].page_number == 1
    assert "Transit Rules" in (chunks[0].section_heading or "")
    assert chunks[-1].page_number == 2
    assert "Baggage Rules" in (chunks[-1].section_heading or "")
    assert chunks[0].publication_date == "2026-01-10"


# 7. Semantic and keyword hybrid retrieval
def test_07_semantic_and_keyword_retrieval(test_env):
    _, retriever, _ = test_env

    results = retriever.search(
        query="Harbourview Budget Inn check-in 3:00 PM early arrival luggage drop-off",
        destination="Sample City",
        top_k=5,
    )
    assert len(results) > 0
    top_hit = results[0]
    assert top_hit.document_id == "sample-accommodation-001"
    assert top_hit.page_number == 2
    assert "3:00 PM" in top_hit.excerpt
    assert top_hit.retrieval_score > 0


# 8. Citation generation from actual retrieved chunks (and zero fabricated citations on unknown destination)
def test_08_citations_and_no_fabrication_on_missing_docs(test_env):
    _, retriever, _ = test_env
    workflow = TripPlanningWorkflow(retriever)

    # Seeded destination has real retrieved citations
    demo_plan = workflow.execute("trip-cited", get_default_demo_preferences())
    all_acts = [
        a
        for d in demo_plan.itinerary_days
        for a in (d.morning + d.afternoon + d.evening)
    ]
    assert all(a.evidence_backed and len(a.citations) > 0 for a in all_acts)
    for act in all_acts:
        for cit in act.citations:
            # Verify every cited chunk actually exists in retrieved_sources
            assert any(r.chunk_id == cit.chunk_id for r in demo_plan.retrieved_sources)
            assert cit.page_number is not None and cit.page_number >= 1

    # Unknown destination with no documents in knowledge base MUST NEVER fabricate citations
    unknown_prefs = get_default_demo_preferences()
    unknown_prefs.destination = "Atlantis Nowhere Island"
    unknown_plan = workflow.execute("trip-unknown-dest", unknown_prefs)
    assert len(unknown_plan.retrieved_sources) == 0
    unknown_acts = [
        a
        for d in unknown_plan.itinerary_days
        for a in (d.morning + d.afternoon + d.evening)
    ]
    for act in unknown_acts:
        assert act.evidence_backed is False
        assert len(act.citations) == 0
        assert "Unverified suggestion" in act.verification_label


# 9. Policy PASS, WARNING, FAIL, and UNKNOWN outcomes
def test_09_policy_pass_warning_fail_unknown_outcomes(test_env):
    db, _, _ = test_env
    demo_trip = db.get_trip(DEMO_TRIP_ID)
    assert demo_trip is not None

    statuses = {c.status for c in demo_trip.policy_checks}
    assert "PASS" in statuses
    assert "WARNING" in statuses
    assert "FAIL" in statuses
    assert "UNKNOWN" in statuses


# 10, 11, 12. Missing-info detection, Conflicting source detection, Outdated & Undated warnings
def test_10_11_12_missing_conflicting_outdated_and_undated_detection(test_env):
    db, _, _ = test_env
    demo_trip = db.get_trip(DEMO_TRIP_ID)
    assert demo_trip is not None

    # 11. Conflicting source detection (Destination Guide INR 500 vs Municipal Circular INR 650)
    conflict_checks = [
        c for c in demo_trip.policy_checks if c.conflicting_document_id is not None
    ]
    assert len(conflict_checks) >= 1
    c_chk = conflict_checks[0]
    assert c_chk.supporting_document_id == "sample-annex-006"
    assert c_chk.conflicting_document_id == "sample-destination-001"

    # 12. Undated & Outdated document warnings in missing_information
    labels = {m.status_label for m in demo_trip.missing_information}
    assert "Document date unknown" in labels  # sample-accommodation-001 has publication_date=None
    assert "Requires official confirmation" in labels  # sample-entry-001 dated 2024-06-01
    assert "Missing from knowledge base" in labels  # Live transit schedules
    assert "Current status not checked" in labels  # Seasonal closure & live verification


# 13 & 14. Missing API credentials and AI provider failure fallback
def test_13_14_missing_credentials_and_ai_provider_failure(test_env, monkeypatch):
    _, retriever, _ = test_env
    workflow = TripPlanningWorkflow(retriever)
    profile = workflow.stage_1_identify_preferences(get_default_demo_preferences())
    sources = workflow.stage_2_retrieve_knowledge(profile)

    # 13. Missing API credentials -> local deterministic mode
    monkeypatch.setenv("LLM_PROVIDER", "local_demo")
    monkeypatch.setenv("LLM_API_KEY", "")
    llm = LLMService()
    summary, mode, warn = llm.generate_grounded_summary(profile, sources)
    assert mode == "local_deterministic_evidence_backed"
    assert warn is None
    assert "Sample City" in summary

    # 14. Configured provider with unreachable URL -> graceful fallback without crashing
    monkeypatch.setenv("LLM_PROVIDER", "openai_compatible")
    monkeypatch.setenv("LLM_API_KEY", "sk-test-fake-key")
    monkeypatch.setenv("LLM_BASE_URL", "http://127.0.0.1:59999/v1")
    monkeypatch.setenv("LLM_TIMEOUT_SECONDS", "0.5")
    summary_fb, mode_fb, warn_fb = llm.generate_grounded_summary(profile, sources)
    assert mode_fb == "local_deterministic_fallback"
    assert warn_fb is not None
    assert "fell back to deterministic" in warn_fb
    assert len(summary_fb) > 20


# 15. Workflow stage failures & Live lookup failure handling
def test_15_workflow_stage_failure_and_live_adapter_safety(test_env, monkeypatch):
    _, retriever, _ = test_env
    workflow = TripPlanningWorkflow(retriever)
    prefs = get_default_demo_preferences()

    with pytest.raises(RuntimeError, match="Simulated Stage 3"):
        workflow.execute("trip-fail-stage", prefs, simulate_stage_failure=3)

    # Verify failed live lookup is NEVER represented as a successful verification
    monkeypatch.setenv("LIVE_VERIFICATION_ENABLED", "true")
    monkeypatch.setenv("LIVE_ADVISORY_ENDPOINT", "https://invalid.example.test/advisory")
    monkeypatch.setenv("LIVE_TIMEOUT_SECONDS", "0.5")
    adapter = LiveVerificationAdapter()
    live_results = adapter.check_live_sources("Sample City", "domestic")
    advisory_res = next(r for r in live_results if "Visa" in r.category)
    assert advisory_res.status == "failed"
    assert "does NOT prove" in advisory_res.message or "Do not assume compliance" in advisory_res.message

    # SSRF protection check
    assert is_safe_external_url("http://localhost:8000/admin") is False
    assert is_safe_external_url("file:///etc/passwd") is False
    assert is_safe_external_url("https://travel.state.gov/content/advisories.html") is True


# 16, 17, 18. Saving/retrieving trips, Document deletion/cleanup, and End-to-End API workflow
def test_16_17_18_end_to_end_api_trips_and_document_lifecycle(test_env):
    _, retriever, client = test_env

    # 18. Health & seeded demo trip verification
    health = client.get("/api/health").json()
    assert health["status"] == "healthy"
    assert health["knowledge_base"]["indexed_documents"] >= 6

    demo_resp = client.get(f"/api/trips/{DEMO_TRIP_ID}")
    assert demo_resp.status_code == 200
    demo_data = demo_resp.json()
    assert demo_data["is_fully_verified"] is False
    assert len(demo_data["itinerary_days"]) == 3
    assert len(demo_data["workflow_run"]["stages"]) == 6

    # 16. Create a new trip, update preferences, and replan via REST API
    new_prefs = get_default_demo_preferences()
    new_prefs.accommodation_requirements = "Standard arrival after 3:30 PM"  # Resolves early check-in FAIL!
    create_resp = client.post("/api/trips", json=new_prefs.model_dump())
    assert create_resp.status_code == 201
    created_trip = create_resp.json()
    new_trip_id = created_trip["trip_id"]

    # Since early arrival conflict was removed, check that chk-accom-early-fail is no longer triggered
    checks_resp = client.get(f"/api/trips/{new_trip_id}/checks")
    assert checks_resp.status_code == 200
    assert not any(c["check_id"] == "chk-accom-early-fail" for c in checks_resp.json())

    # Update preferences and replan
    new_prefs.budget_total = 30000.0
    replan_resp = client.post(f"/api/trips/{new_trip_id}/replan", json=new_prefs.model_dump())
    assert replan_resp.status_code == 200
    assert replan_resp.json()["preferences"]["budget_total"] == 30000.0

    # 17. Upload a new document, search it, and delete it (verifying index cleanup)
    custom_md = (
        "# Jaipur Heritage Palace Guide (Demonstration)\n"
        "## Section 1: Amber Fort & Hawa Mahal\n"
        "Recommended visit duration for Hawa Mahal is 1.5 hours. Entry fee is INR 200 per adult."
    ).encode("utf-8")

    up_resp = client.post(
        "/api/documents/upload",
        files={"file": ("jaipur_guide.md", custom_md, "text/markdown")},
        data={
            "title": "Jaipur Heritage Guide",
            "category": "destination_guide",
            "destination": "Jaipur",
            "authority": "demonstration_source",
            "publication_date": "2026-02-01",
            "is_demonstration": "true",
        },
    )
    assert up_resp.status_code == 201
    uploaded_doc_id = up_resp.json()["document_id"]

    # Duplicate upload should return 409 Conflict
    dup_resp = client.post(
        "/api/documents/upload",
        files={"file": ("jaipur_guide_copy.md", custom_md, "text/markdown")},
        data={
            "title": "Jaipur Heritage Guide Copy",
            "category": "destination_guide",
            "destination": "Jaipur",
        },
    )
    assert dup_resp.status_code == 409

    # Search for Jaipur in knowledge base
    search_resp = client.post(
        "/api/knowledge/search",
        json={"query": "Hawa Mahal entry fee INR 200", "destination": "Jaipur", "top_k": 5},
    )
    assert search_resp.status_code == 200
    assert search_resp.json()["total_results"] >= 1
    assert search_resp.json()["results"][0]["document_id"] == uploaded_doc_id

    # Delete the uploaded document and confirm chunks are gone from retriever & DB
    del_resp = client.delete(f"/api/documents/{uploaded_doc_id}")
    assert del_resp.status_code == 200
    assert del_resp.json()["deleted"] is True

    search_after_del = client.post(
        "/api/knowledge/search",
        json={"query": "Hawa Mahal entry fee INR 200", "destination": "Jaipur", "top_k": 5},
    )
    assert search_after_del.json()["total_results"] == 0
