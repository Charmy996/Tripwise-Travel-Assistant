"""REST API Routes for TripWise AI."""
from datetime import datetime, timezone
import hashlib
from typing import Any, Dict, List, Optional
import uuid
from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile, status

from app.core.config import get_settings
from app.db.database import DatabaseManager
from app.retrieval.document_processor import process_document_bytes, sanitize_filename
from app.retrieval.hybrid_retriever import HybridRetriever
from app.schemas.models import (
    DocumentCategory,
    FinalTripPlan,
    KnowledgeSearchRequest,
    KnowledgeSearchResponse,
    MissingInformation,
    PolicyCheck,
    RetrievedSource,
    TravelDocumentDetail,
    TravelDocumentMetadata,
    TravellerPreferences,
    WorkflowRun,
)
from app.services.seed_service import DEMO_TRIP_ID, ensure_seeded, get_default_demo_preferences
from app.workflow.pipeline import TripPlanningWorkflow


router = APIRouter()

# Singleton runtime state (can be overridden in tests)
_db: Optional[DatabaseManager] = None
_retriever: Optional[HybridRetriever] = None


def get_db() -> DatabaseManager:
    global _db
    if _db is None:
        _db = DatabaseManager()
    return _db


def get_retriever() -> HybridRetriever:
    global _retriever
    if _retriever is None:
        _retriever = HybridRetriever()
        db = get_db()
        _retriever.rebuild_index(db.get_all_chunks())
    return _retriever


def set_test_dependencies(db: DatabaseManager, retriever: HybridRetriever) -> None:
    global _db, _retriever
    _db = db
    _retriever = retriever


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.get("/health")
def health_check() -> Dict[str, Any]:
    db = get_db()
    retriever = get_retriever()
    settings = get_settings()
    docs = db.list_documents()
    chunks = db.get_all_chunks()
    return {
        "status": "healthy",
        "application": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "knowledge_base": {
            "indexed_documents": len(docs),
            "indexed_chunks": len(chunks),
            "faiss_vectors": retriever.faiss_index.ntotal if retriever.faiss_index else 0,
            "embedding_backend": retriever.embedder.backend_name,
        },
        "ai_mode": "llm_provider" if settings.is_llm_configured else "local_deterministic_demo",
        "live_verification_enabled": settings.LIVE_VERIFICATION_ENABLED,
    }


@router.get("/settings/status")
def get_settings_status() -> Dict[str, Any]:
    settings = get_settings()
    retriever = get_retriever()
    db = get_db()
    return {
        "app_name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "llm_provider": settings.LLM_PROVIDER,
        "llm_model": settings.LLM_MODEL,
        "llm_configured": settings.is_llm_configured,
        "llm_mode_description": (
            f"Connected to {settings.LLM_PROVIDER} ({settings.LLM_MODEL}) with local fallback"
            if settings.is_llm_configured
            else "Local Deterministic Evidence-Backed Mode (No external paid API key required)"
        ),
        "embedding_backend": retriever.embedder.backend_name,
        "vector_store": "FAISS (IndexFlatIP) + BM25 Lexical Hybrid",
        "indexed_documents_count": len(db.list_documents()),
        "indexed_chunks_count": len(db.get_all_chunks()),
        "live_verification_enabled": settings.LIVE_VERIFICATION_ENABLED,
        "live_advisory_configured": bool(settings.LIVE_ADVISORY_ENDPOINT),
        "live_weather_configured": bool(settings.LIVE_WEATHER_ENDPOINT),
        "max_upload_size_mb": settings.MAX_UPLOAD_SIZE_BYTES / (1024 * 1024),
        "allowed_extensions": settings.ALLOWED_EXTENSIONS,
    }


# -----------------------------------------------------------------------------
# TRIPS & WORKFLOW ENDPOINTS
# -----------------------------------------------------------------------------

@router.post("/trips", response_model=FinalTripPlan, status_code=status.HTTP_201_CREATED)
def create_trip(
    preferences: TravellerPreferences,
    auto_plan: bool = Query(default=True, description="Automatically run the 6-stage workflow upon creation"),
) -> FinalTripPlan:
    db = get_db()
    retriever = get_retriever()
    workflow = TripPlanningWorkflow(retriever)

    # Validate date logic early via Stage 1
    try:
        profile = workflow.stage_1_identify_preferences(preferences)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    trip_id = f"trip-{uuid.uuid4().hex[:10]}"
    now_ts = _now_iso()

    if auto_plan:
        try:
            plan = workflow.execute(trip_id=trip_id, preferences=preferences, created_at=now_ts)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
    else:
        plan = FinalTripPlan(
            trip_id=trip_id,
            title=f"{profile.destination} — {profile.duration_days}-Day {profile.travel_style.title()} Draft",
            created_at=now_ts,
            updated_at=now_ts,
            verification_summary_status="Draft — Workflow Not Yet Executed",
            is_fully_verified=False,
            preferences=preferences,
            normalized_profile=profile,
        )

    db.save_trip(plan)
    return plan


@router.get("/trips", response_model=List[FinalTripPlan])
def list_trips() -> List[FinalTripPlan]:
    db = get_db()
    return db.list_trips()


@router.get("/trips/{trip_id}", response_model=FinalTripPlan)
def get_trip(trip_id: str) -> FinalTripPlan:
    db = get_db()
    trip = db.get_trip(trip_id)
    if not trip:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Trip '{trip_id}' not found.",
        )
    return trip


@router.put("/trips/{trip_id}", response_model=FinalTripPlan)
def update_trip_preferences(
    trip_id: str,
    preferences: TravellerPreferences,
) -> FinalTripPlan:
    db = get_db()
    retriever = get_retriever()
    existing = db.get_trip(trip_id)
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Trip '{trip_id}' not found.",
        )

    workflow = TripPlanningWorkflow(retriever)
    try:
        profile = workflow.stage_1_identify_preferences(preferences)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    existing.preferences = preferences
    existing.normalized_profile = profile
    existing.title = f"{profile.destination} — {profile.duration_days}-Day {profile.travel_style.title()} Plan"
    existing.updated_at = _now_iso()
    db.save_trip(existing)
    return existing


@router.delete("/trips/{trip_id}")
def delete_trip(trip_id: str) -> Dict[str, Any]:
    db = get_db()
    deleted = db.delete_trip(trip_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Trip '{trip_id}' not found.",
        )
    return {"deleted": True, "trip_id": trip_id}


@router.post("/trips/{trip_id}/plan", response_model=FinalTripPlan)
def run_trip_plan(trip_id: str) -> FinalTripPlan:
    db = get_db()
    retriever = get_retriever()
    existing = db.get_trip(trip_id)
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Trip '{trip_id}' not found.",
        )

    workflow = TripPlanningWorkflow(retriever)
    try:
        updated_plan = workflow.execute(
            trip_id=trip_id,
            preferences=existing.preferences,
            created_at=existing.created_at,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    db.save_trip(updated_plan)
    return updated_plan


@router.post("/trips/{trip_id}/replan", response_model=FinalTripPlan)
def replan_trip(
    trip_id: str,
    preferences: Optional[TravellerPreferences] = None,
) -> FinalTripPlan:
    db = get_db()
    retriever = get_retriever()
    existing = db.get_trip(trip_id)
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Trip '{trip_id}' not found.",
        )

    prefs_to_use = preferences if preferences is not None else existing.preferences
    workflow = TripPlanningWorkflow(retriever)
    try:
        updated_plan = workflow.execute(
            trip_id=trip_id,
            preferences=prefs_to_use,
            created_at=existing.created_at,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    db.save_trip(updated_plan)
    return updated_plan


@router.post("/trips/demo/reset", response_model=FinalTripPlan)
def reset_demo_scenario() -> FinalTripPlan:
    db = get_db()
    retriever = get_retriever()
    ensure_seeded(db, retriever, force_reseed=True)
    demo_trip = db.get_trip(DEMO_TRIP_ID)
    if not demo_trip:
        raise HTTPException(status_code=500, detail="Failed to initialize demonstration trip.")
    return demo_trip


@router.get("/trips/{trip_id}/workflow", response_model=WorkflowRun)
def get_trip_workflow(trip_id: str) -> WorkflowRun:
    db = get_db()
    trip = db.get_trip(trip_id)
    if not trip or not trip.workflow_run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Workflow run for trip '{trip_id}' not found.",
        )
    return trip.workflow_run


@router.get("/trips/{trip_id}/sources", response_model=List[RetrievedSource])
def get_trip_sources(trip_id: str) -> List[RetrievedSource]:
    db = get_db()
    trip = db.get_trip(trip_id)
    if not trip:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Trip '{trip_id}' not found.",
        )
    return trip.retrieved_sources


@router.get("/trips/{trip_id}/checks", response_model=List[PolicyCheck])
def get_trip_checks(
    trip_id: str,
    status_filter: Optional[str] = Query(default=None, alias="status"),
) -> List[PolicyCheck]:
    db = get_db()
    trip = db.get_trip(trip_id)
    if not trip:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Trip '{trip_id}' not found.",
        )
    if status_filter and status_filter.upper() != "ALL":
        return [c for c in trip.policy_checks if c.status == status_filter.upper()]
    return trip.policy_checks


@router.get("/trips/{trip_id}/missing-information", response_model=List[MissingInformation])
def get_trip_missing_information(
    trip_id: str,
    severity: Optional[str] = Query(default=None),
) -> List[MissingInformation]:
    db = get_db()
    trip = db.get_trip(trip_id)
    if not trip:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Trip '{trip_id}' not found.",
        )
    if severity and severity.lower() != "all":
        return [m for m in trip.missing_information if m.severity == severity.lower()]
    return trip.missing_information


# -----------------------------------------------------------------------------
# DOCUMENT LIBRARY & KNOWLEDGE SEARCH ENDPOINTS
# -----------------------------------------------------------------------------

@router.get("/documents", response_model=List[TravelDocumentMetadata])
def list_documents(
    category: Optional[str] = Query(default=None),
    destination: Optional[str] = Query(default=None),
) -> List[TravelDocumentMetadata]:
    db = get_db()
    docs = db.list_documents()
    if category and category != "all":
        docs = [d for d in docs if d.category == category]
    if destination and destination.strip():
        q_dest = destination.strip().lower()
        docs = [d for d in docs if q_dest in d.destination.lower()]
    return docs


@router.get("/documents/{document_id}", response_model=TravelDocumentDetail)
def get_document_detail(document_id: str) -> TravelDocumentDetail:
    db = get_db()
    doc = db.get_document(document_id)
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document '{document_id}' not found.",
        )
    return doc


@router.post(
    "/documents/upload",
    response_model=TravelDocumentDetail,
    status_code=status.HTTP_201_CREATED,
)
async def upload_document(
    file: UploadFile = File(...),
    title: str = Form(...),
    category: DocumentCategory = Form(default="destination_guide"),
    destination: str = Form(default="Sample City"),
    authority: str = Form(default="uploaded_reference"),
    publication_date: Optional[str] = Form(default=None),
    is_demonstration: bool = Form(default=False),
) -> TravelDocumentDetail:
    db = get_db()
    retriever = get_retriever()
    settings = get_settings()

    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file must have a valid filename.",
        )

    content_bytes = await file.read()
    content_hash = hashlib.sha256(content_bytes).hexdigest()

    # Check duplicate content hash
    duplicate = db.find_document_by_hash(content_hash)
    if duplicate:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Duplicate document detected: content matches already indexed document '{duplicate.title}' ({duplicate.document_id}).",
        )

    doc_id = f"doc-{uuid.uuid4().hex[:8]}"
    pub_date_clean = publication_date.strip() if (publication_date and publication_date.strip()) else None

    try:
        doc_detail, chunks = process_document_bytes(
            document_id=doc_id,
            title=title.strip() or file.filename,
            filename=file.filename,
            content_bytes=content_bytes,
            category=category,
            authority=authority.strip() or "uploaded_reference",
            destination=destination.strip() or "General",
            publication_date=pub_date_clean,
            last_verified_date=pub_date_clean,
            is_demonstration=is_demonstration,
            created_at=_now_iso(),
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    # Save file safely inside UPLOAD_DOCS_DIR
    safe_disk_name = f"{doc_id}_{sanitize_filename(file.filename)}"
    disk_path = settings.UPLOAD_DOCS_DIR / safe_disk_name
    disk_path.write_bytes(content_bytes)

    db.upsert_document(doc_detail, chunks)
    retriever.rebuild_index(db.get_all_chunks())
    return doc_detail


@router.post("/documents/reindex")
def reindex_documents() -> Dict[str, Any]:
    db = get_db()
    retriever = get_retriever()
    all_chunks = db.get_all_chunks()
    retriever.rebuild_index(all_chunks)
    return {
        "status": "reindexed",
        "total_documents": len(db.list_documents()),
        "total_chunks": len(all_chunks),
        "faiss_vectors": retriever.faiss_index.ntotal if retriever.faiss_index else 0,
    }


@router.delete("/documents/{document_id}")
def delete_document(document_id: str) -> Dict[str, Any]:
    db = get_db()
    retriever = get_retriever()
    settings = get_settings()

    existing = db.get_document(document_id)
    if not existing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document '{document_id}' not found.",
        )

    db.delete_document(document_id)

    # Remove uploaded file if present
    for candidate in settings.UPLOAD_DOCS_DIR.glob(f"{document_id}_*"):
        try:
            candidate.unlink()
        except OSError:
            pass

    all_chunks = db.get_all_chunks()
    retriever.rebuild_index(all_chunks)
    return {
        "deleted": True,
        "document_id": document_id,
        "remaining_chunks": len(all_chunks),
    }


@router.post("/knowledge/search", response_model=KnowledgeSearchResponse)
def search_knowledge_base(request: KnowledgeSearchRequest) -> KnowledgeSearchResponse:
    retriever = get_retriever()
    results = retriever.search(
        query=request.query,
        destination=request.destination,
        category=request.category,
        top_k=request.top_k,
    )
    return KnowledgeSearchResponse(
        query=request.query,
        total_results=len(results),
        retrieval_method=f"Hybrid ({retriever.embedder.backend_name} + BM25 Lexical)",
        results=results,
    )
