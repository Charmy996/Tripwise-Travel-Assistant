"""Document ingestion, validation, extraction (PDF/MD/TXT), normalization, and chunking."""
import hashlib
import os
import re
from pathlib import Path
from typing import List, Optional, Tuple
import pymupdf as fitz  # PyMuPDF

from app.core.config import get_settings
from app.schemas.models import DocumentCategory, DocumentChunkModel, TravelDocumentDetail


PROMPT_INJECTION_PATTERNS = [
    r"(?i)ignore\s+(all\s+)?(previous|prior)\s+instructions",
    r"(?i)system\s+prompt\s*:",
    r"(?i)you\s+are\s+now\s+an?\s+unrestricted",
    r"(?i)execute\s+shell\s+command",
]


def sanitize_filename(filename: str) -> str:
    """Prevent path traversal and unsafe characters in filenames."""
    if not filename:
        raise ValueError("Filename is empty.")
    # Reject raw traversal patterns explicitly
    if ".." in filename or "/" in filename or "\\" in filename:
        base = os.path.basename(filename.replace("\\", "/"))
    else:
        base = filename
    cleaned = re.sub(r"[^A-Za-z0-9._\- ]", "_", base).strip(" .")
    if not cleaned:
        raise ValueError("Invalid filename after sanitization.")
    return cleaned


def validate_upload_file(filename: str, content_bytes: bytes) -> Tuple[str, str]:
    """Validate file extension, size, and non-empty payload."""
    settings = get_settings()
    safe_name = sanitize_filename(filename)
    ext = Path(safe_name).suffix.lower()
    if ext not in settings.ALLOWED_EXTENSIONS:
        raise ValueError(
            f"Unsupported file type '{ext}'. Allowed types: {', '.join(settings.ALLOWED_EXTENSIONS)}"
        )
    if len(content_bytes) == 0:
        raise ValueError("Uploaded file is empty (0 bytes).")
    if len(content_bytes) > settings.MAX_UPLOAD_SIZE_BYTES:
        max_mb = settings.MAX_UPLOAD_SIZE_BYTES / (1024 * 1024)
        raise ValueError(f"File size exceeds maximum limit of {max_mb:.0f} MB.")
    return safe_name, ext


def neutralize_untrusted_text(text: str) -> str:
    """Neutralize prompt-injection directives in untrusted document content."""
    cleaned = text
    for pattern in PROMPT_INJECTION_PATTERNS:
        cleaned = re.sub(pattern, "[REDACTED_UNTRUSTED_DIRECTIVE]", cleaned)
    return cleaned


def extract_pages_from_pdf(content_bytes: bytes) -> List[Tuple[int, str]]:
    """Extract text page-by-page from a PDF byte stream using PyMuPDF."""
    try:
        doc = fitz.open(stream=content_bytes, filetype="pdf")
    except Exception as exc:
        raise ValueError(f"Malformed or unreadable PDF file: {exc}") from exc

    if doc.page_count == 0:
        doc.close()
        raise ValueError("PDF file contains 0 pages.")

    pages: List[Tuple[int, str]] = []
    total_extracted_chars = 0
    for idx in range(doc.page_count):
        page = doc.load_page(idx)
        page_text = page.get_text("text") or ""
        normalized = normalize_text(page_text)
        total_extracted_chars += len(normalized.strip())
        pages.append((idx + 1, normalized))
    doc.close()

    if total_extracted_chars < 10:
        raise ValueError(
            "No extractable text found in PDF. The document appears to be a scanned image without an OCR text layer."
        )
    return pages


def extract_pages_from_text_or_md(content_bytes: bytes) -> List[Tuple[int, str]]:
    """Extract text from TXT or Markdown files, supporting explicit page markers if present."""
    try:
        raw_text = content_bytes.decode("utf-8")
    except UnicodeDecodeError:
        try:
            raw_text = content_bytes.decode("latin-1")
        except Exception as exc:
            raise ValueError(f"Unable to decode text file: {exc}") from exc

    normalized = normalize_text(raw_text)
    if len(normalized.strip()) < 10:
        raise ValueError("Document contains no meaningful extractable text.")

    # Check if the document has explicit page delimiters such as "--- PAGE 2 ---" or "[Page 2]"
    page_splits = re.split(r"(?im)^(?:---\s*PAGE\s+(\d+)\s*---|\[Page\s+(\d+)\])\s*$", normalized)
    if len(page_splits) > 1:
        pages: List[Tuple[int, str]] = []
        current_page = 1
        first_part = page_splits[0].strip()
        if first_part:
            pages.append((1, first_part))
        i = 1
        while i < len(page_splits):
            p_num_1 = page_splits[i]
            p_num_2 = page_splits[i + 1] if i + 1 < len(page_splits) else None
            content_part = page_splits[i + 2] if i + 2 < len(page_splits) else ""
            num_str = p_num_1 or p_num_2
            if num_str and num_str.isdigit():
                current_page = int(num_str)
            if content_part.strip():
                pages.append((current_page, content_part.strip()))
            i += 3
        if pages:
            return pages

    # Otherwise assign synthetic logical pages every ~1800 characters on paragraph boundaries
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", normalized) if p.strip()]
    pages = []
    current_page = 1
    current_buf: List[str] = []
    current_len = 0
    for para in paragraphs:
        if current_len + len(para) > 1800 and current_buf:
            pages.append((current_page, "\n\n".join(current_buf)))
            current_page += 1
            current_buf = [para]
            current_len = len(para)
        else:
            current_buf.append(para)
            current_len += len(para)
    if current_buf:
        pages.append((current_page, "\n\n".join(current_buf)))
    return pages or [(1, normalized)]


def normalize_text(text: str) -> str:
    """Normalize whitespace and neutralize untrusted prompt directives."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return neutralize_untrusted_text(text.strip())


def chunk_document_pages(
    document_id: str,
    document_title: str,
    category: DocumentCategory,
    authority: str,
    destination: str,
    pages: List[Tuple[int, str]],
    publication_date: Optional[str] = None,
    last_verified_date: Optional[str] = None,
    is_demonstration: bool = True,
    max_chunk_chars: int = 650,
) -> List[DocumentChunkModel]:
    """Chunk extracted pages while preserving page numbers and section headings."""
    chunks: List[DocumentChunkModel] = []
    chunk_index = 0
    current_section = "General Overview"

    heading_regex = re.compile(
        r"^(?:#{1,4}\s+(.+)|(?:Section|Article|Part|Rule|Policy)\s+\d+[:.\-]\s*(.+)|([A-Z][A-Za-z0-9 &,\-/()]{4,60}):)$"
    )

    for page_num, page_text in pages:
        lines = page_text.split("\n")
        buffer_lines: List[str] = []
        buffer_len = 0

        def flush_buffer(section_name: str):
            nonlocal chunk_index, buffer_lines, buffer_len
            text_block = "\n".join(buffer_lines).strip()
            if len(text_block) >= 20:
                chunk_id = f"{document_id}-chunk-{chunk_index:03d}"
                chunks.append(
                    DocumentChunkModel(
                        chunk_id=chunk_id,
                        document_id=document_id,
                        document_title=document_title,
                        category=category,
                        authority=authority,
                        destination=destination,
                        page_number=page_num,
                        section_heading=section_name,
                        chunk_index=chunk_index,
                        content=text_block,
                        publication_date=publication_date,
                        last_verified_date=last_verified_date,
                        is_demonstration=is_demonstration,
                    )
                )
                chunk_index += 1
            buffer_lines = []
            buffer_len = 0

        for line in lines:
            stripped = line.strip()
            if not stripped:
                if buffer_len >= max_chunk_chars * 0.65:
                    flush_buffer(current_section)
                continue

            match = heading_regex.match(stripped)
            if match:
                # Flush previous section content before starting new heading
                if buffer_lines:
                    flush_buffer(current_section)
                heading_title = match.group(1) or match.group(2) or match.group(3) or stripped
                current_section = heading_title.strip("#: ").strip()
                buffer_lines.append(stripped)
                buffer_len += len(stripped)
                continue

            if buffer_len + len(stripped) > max_chunk_chars and buffer_lines:
                flush_buffer(current_section)

            buffer_lines.append(stripped)
            buffer_len += len(stripped)

        if buffer_lines:
            flush_buffer(current_section)

    return chunks


def process_document_bytes(
    document_id: str,
    title: str,
    filename: str,
    content_bytes: bytes,
    category: DocumentCategory,
    authority: str = "demonstration_source",
    destination: str = "Sample City",
    publication_date: Optional[str] = None,
    last_verified_date: Optional[str] = None,
    is_demonstration: bool = True,
    created_at: str = "",
) -> Tuple[TravelDocumentDetail, List[DocumentChunkModel]]:
    """Run full pipeline: Validate -> Extract -> Normalize -> Chunk."""
    safe_name, ext = validate_upload_file(filename, content_bytes)
    content_hash = hashlib.sha256(content_bytes).hexdigest()

    if ext == ".pdf":
        pages = extract_pages_from_pdf(content_bytes)
    else:
        pages = extract_pages_from_text_or_md(content_bytes)

    full_text = "\n\n".join([f"[Page {p}] {txt}" for p, txt in pages])
    chunks = chunk_document_pages(
        document_id=document_id,
        document_title=title,
        category=category,
        authority=authority,
        destination=destination,
        pages=pages,
        publication_date=publication_date,
        last_verified_date=last_verified_date,
        is_demonstration=is_demonstration,
    )

    if not chunks:
        raise ValueError("Document could not be segmented into valid text chunks.")

    summary_excerpt = chunks[0].content[:240] + ("..." if len(chunks[0].content) > 240 else "")

    doc_detail = TravelDocumentDetail(
        document_id=document_id,
        title=title,
        filename=safe_name,
        file_type=ext.lstrip("."),
        file_size_bytes=len(content_bytes),
        category=category,
        authority=authority,
        publication_date=publication_date,
        last_verified_date=last_verified_date,
        destination=destination,
        is_demonstration=is_demonstration,
        processing_status="indexed",
        chunk_count=len(chunks),
        page_count=len(pages),
        content_hash=content_hash,
        created_at=created_at,
        summary_excerpt=summary_excerpt,
        full_text=full_text,
        chunks=chunks,
    )
    return doc_detail, chunks
