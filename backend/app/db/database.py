"""SQLite Persistence Layer for TripWise AI using parameterized SQL queries."""
from datetime import datetime, timezone
import json
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from app.core.config import get_settings
from app.schemas.models import (
    DashboardSummary,
    DocumentCategory,
    DocumentChunkModel,
    DocumentProcessingStatus,
    FinalTripPlan,
    ItineraryActivity,
    ItineraryDay,
    TravelDocumentDetail,
    TravelDocumentMetadata,
    TripSummary,
    WorkflowRun,
)


class DatabaseManager:
    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or get_settings().DB_PATH
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _get_conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON;")
        return conn

    def _init_db(self) -> None:
        with self._get_conn() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS documents (
                    document_id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    file_type TEXT NOT NULL,
                    file_size_bytes INTEGER NOT NULL,
                    category TEXT NOT NULL,
                    authority TEXT NOT NULL,
                    publication_date TEXT,
                    last_verified_date TEXT,
                    destination TEXT NOT NULL,
                    is_demonstration INTEGER NOT NULL DEFAULT 1,
                    processing_status TEXT NOT NULL DEFAULT 'indexed',
                    processing_error TEXT DEFAULT NULL,
                    chunk_count INTEGER NOT NULL DEFAULT 0,
                    page_count INTEGER NOT NULL DEFAULT 1,
                    content_hash TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    summary_excerpt TEXT NOT NULL DEFAULT '',
                    full_text TEXT NOT NULL DEFAULT ''
                );

                CREATE TABLE IF NOT EXISTS document_chunks (
                    chunk_id TEXT PRIMARY KEY,
                    document_id TEXT NOT NULL,
                    document_title TEXT NOT NULL,
                    category TEXT NOT NULL,
                    authority TEXT NOT NULL,
                    destination TEXT NOT NULL,
                    page_number INTEGER,
                    section_heading TEXT,
                    chunk_index INTEGER NOT NULL,
                    content TEXT NOT NULL,
                    publication_date TEXT,
                    last_verified_date TEXT,
                    is_demonstration INTEGER NOT NULL DEFAULT 1,
                    FOREIGN KEY (document_id) REFERENCES documents(document_id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_chunks_doc_id ON document_chunks(document_id);
                CREATE INDEX IF NOT EXISTS idx_chunks_dest ON document_chunks(destination);
                CREATE INDEX IF NOT EXISTS idx_chunks_cat ON document_chunks(category);
                CREATE INDEX IF NOT EXISTS idx_docs_created ON documents(created_at);
                CREATE INDEX IF NOT EXISTS idx_docs_hash ON documents(content_hash);
                CREATE INDEX IF NOT EXISTS idx_docs_status ON documents(processing_status);

                CREATE TABLE IF NOT EXISTS trips (
                    trip_id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    destination TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    verification_summary_status TEXT NOT NULL,
                    is_fully_verified INTEGER NOT NULL DEFAULT 0,
                    plan_json TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_trips_updated ON trips(updated_at);

                CREATE TABLE IF NOT EXISTS workflow_runs (
                    run_id TEXT PRIMARY KEY,
                    trip_id TEXT NOT NULL,
                    overall_status TEXT NOT NULL,
                    started_at TEXT NOT NULL,
                    completed_at TEXT,
                    run_json TEXT NOT NULL,
                    FOREIGN KEY (trip_id) REFERENCES trips(trip_id) ON DELETE CASCADE
                );
                """
            )

            # Migration: check if processing_error column exists in pre-existing database
            cols = [r["name"] for r in conn.execute("PRAGMA table_info(documents)").fetchall()]
            if "processing_error" not in cols:
                try:
                    conn.execute("ALTER TABLE documents ADD COLUMN processing_error TEXT DEFAULT NULL;")
                except sqlite3.OperationalError:
                    pass

    # --- Document Operations ---

    def find_document_by_hash(self, content_hash: str) -> Optional[TravelDocumentMetadata]:
        with self._get_conn() as conn:
            row = conn.execute(
                "SELECT * FROM documents WHERE content_hash = ? LIMIT 1",
                (content_hash,),
            ).fetchone()
            if not row:
                return None
            return self._row_to_doc_meta(row)

    def create_initial_document(
        self,
        document_id: str,
        title: str,
        filename: str,
        file_type: str,
        file_size_bytes: int,
        category: DocumentCategory,
        authority: str,
        destination: str,
        publication_date: Optional[str],
        content_hash: str,
        created_at: str,
        status: DocumentProcessingStatus = "uploaded",
    ) -> TravelDocumentMetadata:
        with self._get_conn() as conn:
            conn.execute(
                """
                INSERT INTO documents (
                    document_id, title, filename, file_type, file_size_bytes,
                    category, authority, publication_date, last_verified_date,
                    destination, is_demonstration, processing_status, processing_error,
                    chunk_count, page_count, content_hash, created_at,
                    summary_excerpt, full_text
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(document_id) DO UPDATE SET
                    title=excluded.title,
                    filename=excluded.filename,
                    processing_status=excluded.processing_status,
                    processing_error=NULL
                """,
                (
                    document_id,
                    title,
                    filename,
                    file_type,
                    file_size_bytes,
                    category,
                    authority,
                    publication_date,
                    publication_date,
                    destination,
                    0,
                    status,
                    None,
                    0,
                    1,
                    content_hash,
                    created_at,
                    "File uploaded. Processing in background...",
                    "",
                ),
            )
            row = conn.execute("SELECT * FROM documents WHERE document_id = ?", (document_id,)).fetchone()
            return self._row_to_doc_meta(row)

    def update_document_status(
        self,
        document_id: str,
        status: DocumentProcessingStatus,
        error: Optional[str] = None,
        chunk_count: Optional[int] = None,
        page_count: Optional[int] = None,
        summary_excerpt: Optional[str] = None,
        full_text: Optional[str] = None,
    ) -> None:
        updates = ["processing_status = ?", "processing_error = ?"]
        params: List[Any] = [status, error]

        if chunk_count is not None:
            updates.append("chunk_count = ?")
            params.append(chunk_count)
        if page_count is not None:
            updates.append("page_count = ?")
            params.append(page_count)
        if summary_excerpt is not None:
            updates.append("summary_excerpt = ?")
            params.append(summary_excerpt)
        if full_text is not None:
            updates.append("full_text = ?")
            params.append(full_text)

        params.append(document_id)
        with self._get_conn() as conn:
            conn.execute(
                f"UPDATE documents SET {', '.join(updates)} WHERE document_id = ?",
                params,
            )

    def upsert_document(
        self, doc: TravelDocumentDetail, chunks: List[DocumentChunkModel]
    ) -> None:
        with self._get_conn() as conn:
            # Remove existing chunks for this document_id to prevent duplicate chunks on re-index
            conn.execute(
                "DELETE FROM document_chunks WHERE document_id = ?",
                (doc.document_id,),
            )
            conn.execute(
                """
                INSERT INTO documents (
                    document_id, title, filename, file_type, file_size_bytes,
                    category, authority, publication_date, last_verified_date,
                    destination, is_demonstration, processing_status, processing_error,
                    chunk_count, page_count, content_hash, created_at,
                    summary_excerpt, full_text
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(document_id) DO UPDATE SET
                    title=excluded.title,
                    filename=excluded.filename,
                    file_type=excluded.file_type,
                    file_size_bytes=excluded.file_size_bytes,
                    category=excluded.category,
                    authority=excluded.authority,
                    publication_date=excluded.publication_date,
                    last_verified_date=excluded.last_verified_date,
                    destination=excluded.destination,
                    is_demonstration=excluded.is_demonstration,
                    processing_status=excluded.processing_status,
                    processing_error=excluded.processing_error,
                    chunk_count=excluded.chunk_count,
                    page_count=excluded.page_count,
                    content_hash=excluded.content_hash,
                    summary_excerpt=excluded.summary_excerpt,
                    full_text=excluded.full_text
                """,
                (
                    doc.document_id,
                    doc.title,
                    doc.filename,
                    doc.file_type,
                    doc.file_size_bytes,
                    doc.category,
                    doc.authority,
                    doc.publication_date,
                    doc.last_verified_date,
                    doc.destination,
                    1 if doc.is_demonstration else 0,
                    doc.processing_status,
                    doc.processing_error,
                    len(chunks),
                    doc.page_count,
                    doc.content_hash,
                    doc.created_at,
                    doc.summary_excerpt,
                    doc.full_text,
                ),
            )

            for chunk in chunks:
                conn.execute(
                    """
                    INSERT INTO document_chunks (
                        chunk_id, document_id, document_title, category, authority,
                        destination, page_number, section_heading, chunk_index,
                        content, publication_date, last_verified_date, is_demonstration
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        chunk.chunk_id,
                        chunk.document_id,
                        chunk.document_title,
                        chunk.category,
                        chunk.authority,
                        chunk.destination,
                        chunk.page_number,
                        chunk.section_heading,
                        chunk.chunk_index,
                        chunk.content,
                        chunk.publication_date,
                        chunk.last_verified_date,
                        1 if chunk.is_demonstration else 0,
                    ),
                )

    def list_documents(self) -> List[TravelDocumentMetadata]:
        with self._get_conn() as conn:
            rows = conn.execute(
                "SELECT * FROM documents ORDER BY created_at DESC, document_id ASC"
            ).fetchall()
            return [self._row_to_doc_meta(r) for r in rows]

    def list_documents_paginated(
        self,
        category: Optional[str] = None,
        destination: Optional[str] = None,
        status: Optional[str] = None,
        search: Optional[str] = None,
        page: int = 1,
        limit: int = 20,
    ) -> Tuple[List[TravelDocumentMetadata], int]:
        query_conditions = []
        params: List[Any] = []

        if category and category.lower() != "all":
            query_conditions.append("category = ?")
            params.append(category)

        if destination and destination.strip():
            query_conditions.append("LOWER(destination) LIKE ?")
            params.append(f"%{destination.strip().lower()}%")

        if status and status.lower() != "all":
            if status.lower() == "completed":
                query_conditions.append("processing_status IN ('completed', 'indexed')")
            else:
                query_conditions.append("processing_status = ?")
                params.append(status.lower())

        if search and search.strip():
            q_like = f"%{search.strip().lower()}%"
            query_conditions.append("(LOWER(title) LIKE ? OR LOWER(filename) LIKE ? OR LOWER(destination) LIKE ?)")
            params.extend([q_like, q_like, q_like])

        where_clause = f"WHERE {' AND '.join(query_conditions)}" if query_conditions else ""

        with self._get_conn() as conn:
            # Count total matching rows
            count_sql = f"SELECT count(*) FROM documents {where_clause}"
            total = conn.execute(count_sql, params).fetchone()[0]

            # Fetch paginated rows
            offset = max(0, (page - 1) * limit)
            data_sql = f"SELECT * FROM documents {where_clause} ORDER BY created_at DESC LIMIT ? OFFSET ?"
            paged_params = list(params) + [limit, offset]
            rows = conn.execute(data_sql, paged_params).fetchall()
            items = [self._row_to_doc_meta(r) for r in rows]

            return items, total

    def get_document(self, document_id: str) -> Optional[TravelDocumentDetail]:
        with self._get_conn() as conn:
            row = conn.execute(
                "SELECT * FROM documents WHERE document_id = ?", (document_id,)
            ).fetchone()
            if not row:
                return None
            chunk_rows = conn.execute(
                "SELECT * FROM document_chunks WHERE document_id = ? ORDER BY chunk_index ASC",
                (document_id,),
            ).fetchall()
            chunks = [self._row_to_chunk(c) for c in chunk_rows]
            meta = self._row_to_doc_meta(row)
            return TravelDocumentDetail(
                **meta.model_dump(),
                full_text=row["full_text"],
                chunks=chunks,
            )

    def delete_document(self, document_id: str) -> bool:
        with self._get_conn() as conn:
            conn.execute(
                "DELETE FROM document_chunks WHERE document_id = ?", (document_id,)
            )
            cur = conn.execute(
                "DELETE FROM documents WHERE document_id = ?", (document_id,)
            )
            return cur.rowcount > 0

    def get_all_chunks(self) -> List[DocumentChunkModel]:
        with self._get_conn() as conn:
            rows = conn.execute(
                "SELECT * FROM document_chunks ORDER BY document_id ASC, chunk_index ASC"
            ).fetchall()
            return [self._row_to_chunk(r) for r in rows]

    # --- Trip Operations ---

    def save_trip(self, trip: FinalTripPlan) -> None:
        plan_json = trip.model_dump_json()
        with self._get_conn() as conn:
            conn.execute(
                """
                INSERT INTO trips (
                    trip_id, title, destination, created_at, updated_at,
                    verification_summary_status, is_fully_verified, plan_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(trip_id) DO UPDATE SET
                    title=excluded.title,
                    destination=excluded.destination,
                    updated_at=excluded.updated_at,
                    verification_summary_status=excluded.verification_summary_status,
                    is_fully_verified=excluded.is_fully_verified,
                    plan_json=excluded.plan_json
                """,
                (
                    trip.trip_id,
                    trip.title,
                    trip.preferences.destination,
                    trip.created_at,
                    trip.updated_at,
                    trip.verification_summary_status,
                    1 if trip.is_fully_verified else 0,
                    plan_json,
                ),
            )
            if trip.workflow_run:
                conn.execute(
                    """
                    INSERT INTO workflow_runs (
                        run_id, trip_id, overall_status, started_at, completed_at, run_json
                    ) VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(run_id) DO UPDATE SET
                        overall_status=excluded.overall_status,
                        completed_at=excluded.completed_at,
                        run_json=excluded.run_json
                    """,
                    (
                        trip.workflow_run.run_id,
                        trip.trip_id,
                        trip.workflow_run.overall_status,
                        trip.workflow_run.started_at,
                        trip.workflow_run.completed_at,
                        trip.workflow_run.model_dump_json(),
                    ),
                )

    def get_trip(self, trip_id: str) -> Optional[FinalTripPlan]:
        with self._get_conn() as conn:
            row = conn.execute(
                "SELECT plan_json FROM trips WHERE trip_id = ?", (trip_id,)
            ).fetchone()
            if not row:
                return None
            return FinalTripPlan.model_validate_json(row["plan_json"])

    def list_trips(self) -> List[FinalTripPlan]:
        with self._get_conn() as conn:
            rows = conn.execute(
                "SELECT plan_json FROM trips ORDER BY updated_at DESC"
            ).fetchall()
            return [FinalTripPlan.model_validate_json(r["plan_json"]) for r in rows]

    def list_trips_summary(self, limit: int = 10, offset: int = 0) -> List[TripSummary]:
        with self._get_conn() as conn:
            rows = conn.execute(
                "SELECT plan_json FROM trips ORDER BY updated_at DESC LIMIT ? OFFSET ?",
                (limit, offset),
            ).fetchall()
            summaries: List[TripSummary] = []
            for r in rows:
                try:
                    data = json.loads(r["plan_json"])
                    prefs = data.get("preferences", {})
                    profile = data.get("normalized_profile", {})
                    summaries.append(
                        TripSummary(
                            trip_id=data.get("trip_id", ""),
                            title=data.get("title", ""),
                            destination=prefs.get("destination") or data.get("destination", "Destination"),
                            origin=prefs.get("origin"),
                            created_at=data.get("created_at", ""),
                            updated_at=data.get("updated_at", ""),
                            duration_days=profile.get("duration_days") or len(data.get("itinerary_days", [])) or 1,
                            travel_style=prefs.get("travel_style", "cultural"),
                            budget_total=float(prefs.get("budget_total", 0.0)),
                            currency=prefs.get("currency", "INR"),
                            verification_summary_status=data.get("verification_summary_status", "Draft"),
                            is_fully_verified=bool(data.get("is_fully_verified", False)),
                        )
                    )
                except Exception:
                    pass
            return summaries

    def save_trip_itinerary(
        self,
        trip_id: str,
        itinerary_days: List[ItineraryDay],
        recalculate_budget: bool = True,
    ) -> FinalTripPlan:
        trip = self.get_trip(trip_id)
        if not trip:
            raise ValueError(f"Trip '{trip_id}' not found.")

        # Recalculate daily costs
        total_activities_cost = 0.0
        for day in itinerary_days:
            day_sum = 0.0
            for act in (day.morning + day.afternoon + day.evening):
                if act.estimated_cost is not None and act.estimated_cost > 0:
                    day_sum += act.estimated_cost
            day.daily_estimated_cost = round(day_sum, 2)
            total_activities_cost += day_sum

        trip.itinerary_days = itinerary_days
        now_ts = datetime.now(timezone.utc).isoformat()
        trip.updated_at = now_ts

        # Recalculate budget breakdown if present
        if recalculate_budget and trip.budget_breakdown:
            bb = trip.budget_breakdown
            bb.activities_and_entry_estimate = round(total_activities_cost, 2)
            new_ground_cost = (
                bb.accommodation_estimate
                + bb.transport_estimate
                + bb.activities_and_entry_estimate
                + bb.food_and_dining_estimate
                + bb.contingency_buffer
            )
            bb.total_estimated_cost = round(new_ground_cost, 2)
            bb.within_budget = bb.total_estimated_cost <= bb.total_budget
            if bb.total_budget > 0:
                bb.budget_utilization_percent = round((bb.total_estimated_cost / bb.total_budget) * 100, 1)

        self.save_trip(trip)
        return trip

    def delete_trip(self, trip_id: str) -> bool:
        with self._get_conn() as conn:
            conn.execute("DELETE FROM workflow_runs WHERE trip_id = ?", (trip_id,))
            cur = conn.execute("DELETE FROM trips WHERE trip_id = ?", (trip_id,))
            return cur.rowcount > 0

    def get_dashboard_summary(self) -> DashboardSummary:
        with self._get_conn() as conn:
            total_trips = conn.execute("SELECT count(*) FROM trips").fetchone()[0]
            total_docs = conn.execute("SELECT count(*) FROM documents").fetchone()[0]
            total_chunks = conn.execute("SELECT count(*) FROM document_chunks").fetchone()[0]
            total_workflows = conn.execute("SELECT count(*) FROM workflow_runs").fetchone()[0]

            pending_tasks = conn.execute(
                """
                SELECT count(*) FROM documents
                WHERE processing_status IN ('uploaded', 'queued', 'extracting', 'chunking', 'generating_embeddings', 'indexing', 'processing')
                """
            ).fetchone()[0]

            # Fetch recent documents (top 5)
            recent_doc_rows = conn.execute(
                "SELECT * FROM documents ORDER BY created_at DESC LIMIT 5"
            ).fetchall()
            recent_docs = [self._row_to_doc_meta(r) for r in recent_doc_rows]

            # Compute policy counts across all saved trips
            policy_counts = {"PASS": 0, "WARNING": 0, "FAIL": 0, "UNKNOWN": 0}
            trips_rows = conn.execute("SELECT plan_json FROM trips ORDER BY updated_at DESC LIMIT 10").fetchall()
            for tr in trips_rows:
                try:
                    p_data = json.loads(tr["plan_json"])
                    for chk in p_data.get("policy_checks", []):
                        st = chk.get("status", "UNKNOWN").upper()
                        if st in policy_counts:
                            policy_counts[st] += 1
                except Exception:
                    pass

        recent_trips = self.list_trips_summary(limit=5, offset=0)

        return DashboardSummary(
            total_trips=total_trips,
            total_documents=total_docs,
            total_chunks=total_chunks,
            total_workflows=total_workflows,
            pending_tasks=pending_tasks,
            recent_trips=recent_trips,
            recent_documents=recent_docs,
            policy_warning_summary=policy_counts,
        )

    # --- Helper Serializers ---

    def _row_to_doc_meta(self, row: sqlite3.Row) -> TravelDocumentMetadata:
        keys = row.keys()
        return TravelDocumentMetadata(
            document_id=row["document_id"],
            title=row["title"],
            filename=row["filename"],
            file_type=row["file_type"],
            file_size_bytes=row["file_size_bytes"],
            category=row["category"],
            authority=row["authority"],
            publication_date=row["publication_date"],
            last_verified_date=row["last_verified_date"],
            destination=row["destination"],
            is_demonstration=bool(row["is_demonstration"]),
            processing_status=row["processing_status"],
            processing_error=row["processing_error"] if "processing_error" in keys else None,
            chunk_count=row["chunk_count"],
            page_count=row["page_count"],
            content_hash=row["content_hash"],
            created_at=row["created_at"],
            summary_excerpt=row["summary_excerpt"],
        )

    def _row_to_chunk(self, row: sqlite3.Row) -> DocumentChunkModel:
        return DocumentChunkModel(
            chunk_id=row["chunk_id"],
            document_id=row["document_id"],
            document_title=row["document_title"],
            category=row["category"],
            authority=row["authority"],
            destination=row["destination"],
            page_number=row["page_number"],
            section_heading=row["section_heading"],
            chunk_index=row["chunk_index"],
            content=row["content"],
            publication_date=row["publication_date"],
            last_verified_date=row["last_verified_date"],
            is_demonstration=bool(row["is_demonstration"]),
        )
