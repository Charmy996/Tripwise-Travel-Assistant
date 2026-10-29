"""Hybrid Semantic (FAISS + Embeddings) and Lexical (BM25/Keyword) Retrieval Engine."""
import hashlib
import math
import re
from collections import Counter
from typing import Dict, List, Optional, Set, Tuple
import faiss
import numpy as np

from app.core.config import get_settings
from app.schemas.models import DocumentChunkModel, RetrievedSource, VerificationLabel


STOPWORDS: Set[str] = {
    "the", "and", "for", "with", "that", "this", "from", "are", "was", "were",
    "have", "has", "had", "not", "but", "you", "your", "can", "will", "into",
    "about", "what", "when", "where", "which", "who", "whom", "their", "there",
    "been", "being", "also", "any", "all", "such", "may", "must", "should",
    "would", "could", "our", "out", "per", "via", "upon", "within", "without",
}

SYNONYM_EXPANSIONS: Dict[str, List[str]] = {
    "hotel": ["accommodation", "check-in", "check-out", "room", "lodging", "inn", "cancellation"],
    "accommodation": ["hotel", "check-in", "check-out", "room", "booking", "inn"],
    "transport": ["metro", "bus", "transit", "luggage", "baggage", "train", "pass", "schedule"],
    "public_transport": ["metro", "bus", "transit", "pass", "train", "luggage"],
    "visa": ["entry", "passport", "identification", "permit", "immigration", "eco-pass"],
    "safety": ["emergency", "restricted", "prohibited", "hygiene", "water", "drone", "health"],
    "accessibility": ["wheelchair", "elevator", "step-free", "ramp", "tactile", "mobility"],
    "museum": ["gallery", "heritage", "cultural", "exhibition", "national", "maritime", "textile"],
    "food": ["dining", "market", "thali", "cafe", "street", "culinary", "hygiene", "meal"],
    "nature": ["gardens", "botanical", "park", "viewpoint", "sunset", "promenade"],
}


def tokenize(text: str) -> List[str]:
    tokens = re.findall(r"[a-z0-9]+(?:-[a-z0-9]+)*", text.lower())
    return [t for t in tokens if len(t) > 1 and t not in STOPWORDS]


def determine_verification_label(chunk: DocumentChunkModel) -> VerificationLabel:
    if not chunk.publication_date:
        return "Document date unknown"
    if chunk.publication_date < "2025-01-01":
        return "Requires official confirmation"
    return "Verified in provided documents"


_ST_LOAD_ATTEMPTED = False
_CACHED_ST_MODEL = None
_CACHED_BACKEND_NAME = "faiss_hybrid_semantic_384d"


class SemanticEmbedder:
    """
    Produces normalized 384-dim dense vectors for FAISS IndexFlatIP.
    Attempts to load a locally cached SentenceTransformer model once per process;
    gracefully falls back to a deterministic semantic n-gram + concept projection
    encoder so the system never blocks on external network downloads.
    """

    def __init__(self, dim: int = 384):
        global _ST_LOAD_ATTEMPTED, _CACHED_ST_MODEL, _CACHED_BACKEND_NAME
        self.dim = dim
        settings = get_settings()
        if settings.USE_NEURAL_EMBEDDINGS and not _ST_LOAD_ATTEMPTED:
            _ST_LOAD_ATTEMPTED = True
            try:
                from sentence_transformers import SentenceTransformer
                _CACHED_ST_MODEL = SentenceTransformer(
                    settings.EMBEDDING_MODEL_NAME, local_files_only=True
                )
                _CACHED_BACKEND_NAME = f"sentence_transformers:{settings.EMBEDDING_MODEL_NAME}"
            except Exception:
                _CACHED_ST_MODEL = None
                _CACHED_BACKEND_NAME = "faiss_hybrid_semantic_384d"

        self.model = _CACHED_ST_MODEL
        self.backend_name = _CACHED_BACKEND_NAME
        if self.model is not None:
            self.dim = self.model.get_sentence_embedding_dimension() or 384

    def encode(self, texts: List[str]) -> np.ndarray:
        if not texts:
            return np.zeros((0, self.dim), dtype=np.float32)

        if self.model is not None:
            try:
                vecs = self.model.encode(
                    texts, convert_to_numpy=True, normalize_embeddings=True, show_progress_bar=False
                )
                return np.asarray(vecs, dtype=np.float32)
            except Exception:
                pass

        # Deterministic dense semantic projection (unigrams + bigrams + domain concept expansion + char trigrams)
        matrix = np.zeros((len(texts), self.dim), dtype=np.float32)
        for row_idx, text in enumerate(texts):
            tokens = tokenize(text)
            expanded_tokens = list(tokens)
            for tok in tokens:
                if tok in SYNONYM_EXPANSIONS:
                    expanded_tokens.extend(SYNONYM_EXPANSIONS[tok])

            # Bigrams
            bigrams = [f"{tokens[i]}_{tokens[i+1]}" for i in range(len(tokens) - 1)]
            # Character 4-grams for morphological similarity
            clean_str = " ".join(tokens)
            char_grams = [clean_str[i : i + 4] for i in range(0, max(0, len(clean_str) - 3), 2)]

            features = (
                [(t, 2.0) for t in tokens]
                + [(et, 1.1) for et in expanded_tokens]
                + [(bg, 1.5) for bg in bigrams]
                + [(cg, 0.35) for cg in char_grams]
            )

            vec = np.zeros(self.dim, dtype=np.float32)
            for feat, weight in features:
                digest = hashlib.md5(feat.encode("utf-8")).digest()
                idx1 = int.from_bytes(digest[0:2], "little") % self.dim
                idx2 = int.from_bytes(digest[2:4], "little") % self.dim
                sign1 = 1.0 if (digest[4] & 1) == 0 else -1.0
                sign2 = 1.0 if (digest[5] & 1) == 0 else -1.0
                vec[idx1] += sign1 * weight
                vec[idx2] += sign2 * (weight * 0.5)

            norm = float(np.linalg.norm(vec))
            if norm > 1e-8:
                vec /= norm
            matrix[row_idx] = vec

        return matrix


class HybridRetriever:
    """
    Combines FAISS vector similarity search with BM25 lexical keyword matching.
    Maintains strict 1-to-1 mapping between FAISS vector row indices and DocumentChunkModel IDs.
    """

    def __init__(self):
        self.embedder = SemanticEmbedder()
        self.chunks: List[DocumentChunkModel] = []
        self.chunk_id_to_index: Dict[str, int] = {}
        self.faiss_index: Optional[faiss.IndexFlatIP] = None
        self.tokenized_corpus: List[List[str]] = []
        self.doc_freqs: Dict[str, int] = {}
        self.avg_doc_len: float = 1.0

    def rebuild_index(self, chunks: List[DocumentChunkModel]) -> None:
        """Rebuild FAISS index and BM25 inverted statistics from current database chunks."""
        # Deduplicate by chunk_id while preserving order
        seen_ids: Set[str] = set()
        unique_chunks: List[DocumentChunkModel] = []
        for c in chunks:
            if c.chunk_id not in seen_ids:
                seen_ids.add(c.chunk_id)
                unique_chunks.append(c)

        self.chunks = unique_chunks
        self.chunk_id_to_index = {c.chunk_id: i for i, c in enumerate(self.chunks)}

        # Build FAISS vector index
        self.faiss_index = faiss.IndexFlatIP(self.embedder.dim)
        if not self.chunks:
            self.tokenized_corpus = []
            self.doc_freqs = {}
            self.avg_doc_len = 1.0
            return

        corpus_texts = [
            f"{c.document_title} | {c.section_heading or ''} | {c.category} | {c.destination} | {c.content}"
            for c in self.chunks
        ]
        embeddings = self.embedder.encode(corpus_texts)
        self.faiss_index.add(embeddings)

        # Build BM25 statistics
        self.tokenized_corpus = [tokenize(text) for text in corpus_texts]
        df: Dict[str, int] = {}
        total_len = 0
        for doc_tokens in self.tokenized_corpus:
            total_len += len(doc_tokens)
            for unique_tok in set(doc_tokens):
                df[unique_tok] = df.get(unique_tok, 0) + 1
        self.doc_freqs = df
        self.avg_doc_len = max(1.0, total_len / len(self.tokenized_corpus))

    def _compute_bm25_scores(self, query: str) -> Tuple[np.ndarray, List[List[str]]]:
        n_docs = len(self.chunks)
        if n_docs == 0:
            return np.zeros(0, dtype=np.float32), []

        raw_q_tokens = tokenize(query)
        expanded_q_tokens = list(raw_q_tokens)
        for t in raw_q_tokens:
            if t in SYNONYM_EXPANSIONS:
                expanded_q_tokens.extend(SYNONYM_EXPANSIONS[t][:3])

        scores = np.zeros(n_docs, dtype=np.float32)
        matched_terms_per_doc: List[List[str]] = [[] for _ in range(n_docs)]
        k1 = 1.5
        b = 0.75

        for idx, doc_tokens in enumerate(self.tokenized_corpus):
            if not doc_tokens:
                continue
            counts = Counter(doc_tokens)
            doc_len = len(doc_tokens)
            score = 0.0
            matched: List[str] = []
            for q_tok in set(expanded_q_tokens):
                tf = counts.get(q_tok, 0)
                if tf == 0:
                    continue
                if q_tok in raw_q_tokens:
                    matched.append(q_tok)
                df = self.doc_freqs.get(q_tok, 0)
                idf = math.log(1.0 + (n_docs - df + 0.5) / (df + 0.5))
                weight_mult = 1.0 if q_tok in raw_q_tokens else 0.45
                denom = tf + k1 * (1.0 - b + b * (doc_len / self.avg_doc_len))
                score += weight_mult * idf * ((tf * (k1 + 1.0)) / denom)
            scores[idx] = score
            matched_terms_per_doc[idx] = sorted(set(matched))

        max_score = float(np.max(scores)) if len(scores) > 0 else 0.0
        if max_score > 1e-6:
            scores = scores / max_score
        return scores, matched_terms_per_doc

    def search(
        self,
        query: str,
        destination: Optional[str] = None,
        category: Optional[str] = None,
        top_k: int = 10,
        min_score: float = 0.08,
    ) -> List[RetrievedSource]:
        """
        Perform hybrid semantic + keyword retrieval, deduplicate excerpts, and rank by relevance.
        """
        if not self.chunks or self.faiss_index is None or self.faiss_index.ntotal == 0:
            return []

        q_vec = self.embedder.encode([query])
        # Search all chunks in FAISS to combine with lexical scores cleanly
        k_all = len(self.chunks)
        sim_scores, sim_indices = self.faiss_index.search(q_vec, k_all)

        semantic_by_idx = np.zeros(k_all, dtype=np.float32)
        for rank_pos in range(k_all):
            doc_idx = int(sim_indices[0, rank_pos])
            if 0 <= doc_idx < k_all:
                semantic_by_idx[doc_idx] = max(0.0, float(sim_scores[0, rank_pos]))

        bm25_by_idx, matched_terms = self._compute_bm25_scores(query)

        results: List[RetrievedSource] = []
        seen_content_hashes: Set[str] = set()

        for idx, chunk in enumerate(self.chunks):
            # Optional filtering by destination
            if destination and destination.strip():
                dest_norm = destination.strip().lower()
                chunk_dest = chunk.destination.strip().lower()
                if dest_norm not in chunk_dest and chunk_dest not in dest_norm and chunk_dest != "general":
                    continue

            # Optional filtering by category
            if category and category.strip() and category != "all":
                if chunk.category != category.strip():
                    continue

            sem_score = float(semantic_by_idx[idx])
            kw_score = float(bm25_by_idx[idx])
            hybrid_score = round(0.55 * sem_score + 0.45 * kw_score, 4)

            if hybrid_score < min_score and kw_score == 0.0:
                continue

            # Deduplicate identical chunk excerpts
            norm_excerpt_hash = hashlib.md5(
                re.sub(r"\s+", " ", chunk.content.strip().lower()).encode("utf-8")
            ).hexdigest()
            if norm_excerpt_hash in seen_content_hashes:
                continue
            seen_content_hashes.add(norm_excerpt_hash)

            results.append(
                RetrievedSource(
                    chunk_id=chunk.chunk_id,
                    document_id=chunk.document_id,
                    document_title=chunk.document_title,
                    source_type="demonstration_document" if chunk.is_demonstration else "uploaded_document",
                    category=chunk.category,
                    page_number=chunk.page_number,
                    section_heading=chunk.section_heading,
                    excerpt=chunk.content,
                    publication_date=chunk.publication_date,
                    last_verified_date=chunk.last_verified_date,
                    authority_level=chunk.authority,
                    retrieval_score=hybrid_score,
                    semantic_score=round(sem_score, 4),
                    keyword_score=round(kw_score, 4),
                    verification_status=determine_verification_label(chunk),
                    matched_topics=matched_terms[idx][:6],
                )
            )

        results.sort(key=lambda r: (r.retrieval_score, r.keyword_score), reverse=True)
        return results[:top_k]
