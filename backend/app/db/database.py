"""SQLite Persistence Layer for TripWise AI using parameterized SQL queries."""
import json
import sqlite3
from pathlib import Path
from typing import Dict, List, Optional
from app.core.config import get_settings
from app.schemas.models import (
    DocumentChunkModel,
    FinalTripPlan,
    TravelDocumentDetail,
    TravelDocumentMetadata,
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
                    destination, is_demonstration, processing_status,
                    chunk_count, page_count, content_hash, created_at,
                    summary_excerpt, full_text
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

    def delete_trip(self, trip_id: str) -> bool:
        with self._get_conn() as conn:
            conn.execute("DELETE FROM workflow_runs WHERE trip_id = ?", (trip_id,))
            cur = conn.execute("DELETE FROM trips WHERE trip_id = ?", (trip_id,))
            return cur.rowcount > 0

    def _row_to_doc_meta(self, row: sqlite3.Row) -> TravelDocumentMetadata:
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
