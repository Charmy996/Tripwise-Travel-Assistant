"""REST API Routes for TripWise AI."""
from datetime import datetime, timezone
import hashlib
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Union
import uuid
from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, Query, UploadFile, status

from app.core.config import get_settings
from app.db.database import DatabaseManager
from app.retrieval.document_processor import (
    chunk_document_pages,
    extract_pages_from_pdf,
    extract_pages_from_text_or_md,
    process_document_bytes,
    sanitize_filename,
    validate_upload_file,
)
from app.retrieval.hybrid_retriever import HybridRetriever
from app.schemas.models import (
    DashboardSummary,
    DocumentCategory,
    DocumentListResponse,
    FinalTripPlan,
    ItineraryActivity,
    ItineraryDay,
    ItineraryUpdateRequest,
    KnowledgeSearchRequest,
    KnowledgeSearchResponse,
    LocationSearchResponse,
    MissingInformation,
    PolicyCheck,
    RetrievedSource,
    TravelDocumentDetail,
    TravelDocumentMetadata,
    TravellerPreferences,
    TripSummary,
    WorkflowRun,
)
from app.services.location_service import get_location_service
from app.services.seed_service import DEMO_TRIP_ID, ensure_seeded, get_default_demo_preferences
from app.workflow.pipeline import TripPlanningWorkflow

logger = logging.getLogger(__name__)
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


# -----------------------------------------------------------------------------
# SYSTEM & HEALTH ENDPOINTS
# -----------------------------------------------------------------------------

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
        "location_provider": settings.LOCATION_PROVIDER,
    }


# -----------------------------------------------------------------------------
# DASHBOARD SUMMARY ENDPOINT
# -----------------------------------------------------------------------------

@router.get("/dashboard/summary", response_model=DashboardSummary)
def get_dashboard_summary() -> DashboardSummary:
    """Fetch live application statistics without heavy full-itinerary or vector payload overhead."""
    db = get_db()
    return db.get_dashboard_summary()


# -----------------------------------------------------------------------------
# DYNAMIC LOCATION AUTOCOMPLETE
# -----------------------------------------------------------------------------

@router.get("/locations/search", response_model=LocationSearchResponse)
async def search_locations(
    q: str = Query(..., min_length=1, description="Origin or destination search query (e.g. 'Mum', 'Lon', 'New')"),
    limit: int = Query(default=8, ge=1, le=25),
) -> LocationSearchResponse:
    """Search for matching cities with caching, rate limiting, and offline fallback."""
    loc_service = get_location_service()
    return await loc_service.search_locations(query=q, limit=limit)


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


@router.get("/trips/recent", response_model=List[TripSummary])
def get_recent_trips(
    limit: int = Query(default=5, ge=1, le=50),
) -> List[TripSummary]:
    """Return lightweight trip summaries for fast dashboard lists without deep payload serialization."""
    db = get_db()
    return db.list_trips_summary(limit=limit, offset=0)


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


@router.put("/trips/{trip_id}/itinerary", response_model=FinalTripPlan)
def update_trip_itinerary(
    trip_id: str,
    request: ItineraryUpdateRequest,
) -> FinalTripPlan:
    """Save user modifications to the itinerary (add/remove/reorder activities) and recompute budget totals."""
    db = get_db()
    try:
        return db.save_trip_itinerary(
            trip_id=trip_id,
            itinerary_days=request.itinerary_days,
            recalculate_budget=request.recalculate_budget,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc


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
# DOCUMENT LIBRARY & INGESTION (BACKGROUND PROCESSING)
# -----------------------------------------------------------------------------

def _process_document_in_background(
    doc_id: str,
    safe_disk_name: str,
    title: str,
    category: DocumentCategory,
    destination: str,
    authority: str,
    pub_date_clean: Optional[str],
    is_demonstration: bool,
) -> None:
    """Asynchronous background worker: Extract -> Chunk -> Embed -> Index."""
    db = get_db()
    retriever = get_retriever()
    settings = get_settings()
    disk_path = settings.UPLOAD_DOCS_DIR / safe_disk_name

    if not disk_path.exists():
        db.update_document_status(doc_id, status="failed", error="Raw file missing on server disk.")
        return

    try:
        content_bytes = disk_path.read_bytes()
        safe_name, ext = validate_upload_file(disk_path.name, content_bytes)

        # 1. Extracting text
        db.update_document_status(doc_id, status="extracting")
        if ext == ".pdf":
            pages = extract_pages_from_pdf(content_bytes)
        else:
            pages = extract_pages_from_text_or_md(content_bytes)

        # 2. Chunking
        db.update_document_status(doc_id, status="chunking", page_count=len(pages))
        chunks = chunk_document_pages(
            document_id=doc_id,
            document_title=title,
            category=category,
            authority=authority,
            destination=destination,
            pages=pages,
            publication_date=pub_date_clean,
            last_verified_date=pub_date_clean,
            is_demonstration=is_demonstration,
        )
        if not chunks:
            raise ValueError("Document could not be segmented into valid text chunks.")

        # 3. Generating embeddings
        db.update_document_status(doc_id, status="generating_embeddings", chunk_count=len(chunks))

        # 4. Indexing into SQLite & FAISS
        db.update_document_status(doc_id, status="indexing")
        full_text = "\n\n".join([f"[Page {p}] {txt}" for p, txt in pages])
        summary_excerpt = chunks[0].content[:240] + ("..." if len(chunks[0].content) > 240 else "")

        doc_detail = TravelDocumentDetail(
            document_id=doc_id,
            title=title,
            filename=safe_name,
            file_type=ext.lstrip("."),
            file_size_bytes=len(content_bytes),
            category=category,
            authority=authority,
            publication_date=pub_date_clean,
            last_verified_date=pub_date_clean,
            destination=destination,
            is_demonstration=is_demonstration,
            processing_status="completed",
            chunk_count=len(chunks),
            page_count=len(pages),
            content_hash=hashlib.sha256(content_bytes).hexdigest(),
            created_at=_now_iso(),
            summary_excerpt=summary_excerpt,
            full_text=full_text,
            chunks=chunks,
        )
        db.upsert_document(doc_detail, chunks)

        all_chunks = db.get_all_chunks()
        retriever.rebuild_index(all_chunks)

        db.update_document_status(
            doc_id,
            status="completed",
            chunk_count=len(chunks),
            page_count=len(pages),
            summary_excerpt=summary_excerpt,
            full_text=full_text,
            error=None,
        )
    except Exception as exc:
        logger.exception(f"Background processing failed for document '{doc_id}': {exc}")
        db.update_document_status(doc_id, status="failed", error=str(exc))


@router.get("/documents")
def list_documents(
    category: Optional[str] = Query(default=None),
    destination: Optional[str] = Query(default=None),
    status_filter: Optional[str] = Query(default=None, alias="status"),
    search: Optional[str] = Query(default=None),
    page: Optional[int] = Query(default=None, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
) -> Any:
    """List documents with optional pagination, category filter, destination query, and text search."""
    db = get_db()
    if page is not None:
        items, total = db.list_documents_paginated(
            category=category,
            destination=destination,
            status=status_filter,
            search=search,
            page=page,
            limit=limit,
        )
        total_pages = max(1, (total + limit - 1) // limit)
        return DocumentListResponse(
            items=items,
            total=total,
            page=page,
            limit=limit,
            total_pages=total_pages,
        )

    # Backward compatible unpaginated list
    docs = db.list_documents()
    if category and category != "all":
        docs = [d for d in docs if d.category == category]
    if destination and destination.strip():
        q_dest = destination.strip().lower()
        docs = [d for d in docs if q_dest in d.destination.lower()]
    if status_filter and status_filter.lower() != "all":
        docs = [d for d in docs if d.processing_status == status_filter.lower()]
    if search and search.strip():
        q_search = search.strip().lower()
        docs = [
            d
            for d in docs
            if q_search in d.title.lower()
            or q_search in d.filename.lower()
            or q_search in d.destination.lower()
        ]
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
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    title: str = Form(...),
    category: DocumentCategory = Form(default="destination_guide"),
    destination: str = Form(default="Sample City"),
    authority: str = Form(default="uploaded_reference"),
    publication_date: Optional[str] = Form(default=None),
    is_demonstration: bool = Form(default=False),
) -> TravelDocumentDetail:
    """
    Safely stores uploaded file immediately and queues processing to background worker.
    Returns upload confirmation instantly without blocking on PDF parsing or FAISS rebuilding.
    """
    db = get_db()
    settings = get_settings()

    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file must have a valid filename.",
        )

    content_bytes = await file.read()
    try:
        safe_name, ext = validate_upload_file(file.filename, content_bytes)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

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

    # Save file safely to disk
    safe_disk_name = f"{doc_id}_{sanitize_filename(file.filename)}"
    disk_path = settings.UPLOAD_DOCS_DIR / safe_disk_name
    disk_path.write_bytes(content_bytes)

    # Create initial document record with 'uploaded' status
    doc_meta = db.create_initial_document(
        document_id=doc_id,
        title=title.strip() or file.filename,
        filename=file.filename,
        file_type=ext.lstrip("."),
        file_size_bytes=len(content_bytes),
        category=category,
        authority=authority.strip() or "uploaded_reference",
        destination=destination.strip() or "General",
        publication_date=pub_date_clean,
        content_hash=content_hash,
        created_at=_now_iso(),
        status="uploaded",
    )

    # Schedule background processing
    background_tasks.add_task(
        _process_document_in_background,
        doc_id=doc_id,
        safe_disk_name=safe_disk_name,
        title=title.strip() or file.filename,
        category=category,
        destination=destination.strip() or "General",
        authority=authority.strip() or "uploaded_reference",
        pub_date_clean=pub_date_clean,
        is_demonstration=is_demonstration,
    )

    return TravelDocumentDetail(
        **doc_meta.model_dump(),
        full_text="",
        chunks=[],
    )


@router.post("/documents/{document_id}/retry", response_model=TravelDocumentMetadata)
def retry_document_processing(
    document_id: str,
    background_tasks: BackgroundTasks,
) -> TravelDocumentMetadata:
    """Retry failed document processing in background."""
    db = get_db()
    settings = get_settings()
    doc = db.get_document(document_id)
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document '{document_id}' not found.",
        )

    # Locate raw file
    candidates = list(settings.UPLOAD_DOCS_DIR.glob(f"{document_id}_*"))
    if not candidates:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Raw document file for '{document_id}' not found on server disk.",
        )
    safe_disk_name = candidates[0].name

    db.update_document_status(document_id, status="queued", error=None)
    background_tasks.add_task(
        _process_document_in_background,
        doc_id=document_id,
        safe_disk_name=safe_disk_name,
        title=doc.title,
        category=doc.category,
        destination=doc.destination,
        authority=doc.authority,
        pub_date_clean=doc.publication_date,
        is_demonstration=doc.is_demonstration,
    )

    updated = db.get_document(document_id)
    return updated or doc


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
