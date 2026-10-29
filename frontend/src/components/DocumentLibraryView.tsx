import React, { useState, useEffect } from 'react';
import {
  Upload,
  Search,
  FileText,
  Trash2,
  RefreshCw,
  Eye,
  CheckCircle2,
  AlertCircle,
  BookOpen,
  FolderOpen,
  Sparkles,
  X,
} from 'lucide-react';
import { api } from '../services/api';
import {
  DocumentCategory,
  RetrievedSource,
  TravelDocumentDetail,
  TravelDocumentMetadata,
} from '../types/tripwise';

const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  destination_guide: 'Destination Guide',
  accommodation_policy: 'Accommodation Policy',
  transport_policy: 'Transport Policy',
  visa_and_entry_guidance: 'Visa & Entry Guidance',
  safety_and_travel_restrictions: 'Safety & Travel Restrictions',
  accessibility_guidance: 'Accessibility Guidance',
  other: 'Other Reference',
};

interface DocumentLibraryViewProps {
  onSelectCitation?: (src: RetrievedSource) => void;
  onDocumentsChanged?: () => void;
}

export const DocumentLibraryView: React.FC<DocumentLibraryViewProps> = ({
  onSelectCitation,
  onDocumentsChanged,
}) => {
  const [documents, setDocuments] = useState<TravelDocumentMetadata[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );

  // Upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState<string>('');
  const [uploadCategory, setUploadCategory] = useState<DocumentCategory>('destination_guide');
  const [uploadDestination, setUploadDestination] = useState<string>('Sample City');
  const [uploadPubDate, setUploadPubDate] = useState<string>('2026-02-15');
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isReindexing, setIsReindexing] = useState<boolean>(false);

  // Hybrid Knowledge Search state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchDest, setSearchDest] = useState<string>('');
  const [searchResults, setSearchResults] = useState<RetrievedSource[] | null>(null);
  const [searchMethod, setSearchMethod] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);

  // Document Inspector Modal
  const [inspectedDoc, setInspectedDoc] = useState<TravelDocumentDetail | null>(null);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const list = await api.listDocuments(categoryFilter);
      setDocuments(list);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to load documents.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, [categoryFilter]);

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      setFeedback({ type: 'error', message: 'Please choose a PDF, Markdown (.md), or TXT file to upload.' });
      return;
    }

    const ext = uploadFile.name.split('.').pop()?.toLowerCase() || '';
    if (!['pdf', 'txt', 'md'].includes(ext)) {
      setFeedback({
        type: 'error',
        message: `Unsupported file extension (.${ext}). Allowed: .pdf, .txt, .md`,
      });
      return;
    }

    if (uploadFile.size > 10 * 1024 * 1024) {
      setFeedback({ type: 'error', message: 'File exceeds the 10 MB maximum upload limit.' });
      return;
    }

    setIsUploading(true);
    setFeedback(null);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('title', uploadTitle.trim() || uploadFile.name);
      formData.append('category', uploadCategory);
      formData.append('destination', uploadDestination.trim() || 'Sample City');
      formData.append('authority', 'uploaded_reference');
      if (uploadPubDate.trim()) {
        formData.append('publication_date', uploadPubDate.trim());
      }
      formData.append('is_demonstration', 'false');

      const created = await api.uploadDocument(formData);
      setFeedback({
        type: 'success',
        message: `Indexed "${created.title}" into ${created.chunk_count} retrievable chunks (${created.page_count} page(s)).`,
      });
      setUploadFile(null);
      setUploadTitle('');
      await loadDocuments();
      onDocumentsChanged?.();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Document upload failed.' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleReindex = async () => {
    setIsReindexing(true);
    setFeedback(null);
    try {
      const res = await api.reindexDocuments();
      setFeedback({
        type: 'success',
        message: `Re-indexed ${res.total_documents} documents (${res.total_chunks} unique chunks in FAISS + BM25 index).`,
      });
      await loadDocuments();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Re-indexing failed.' });
    } finally {
      setIsReindexing(false);
    }
  };

  const handleDeleteDocument = async (docId: string, title: string) => {
    setFeedback(null);
    try {
      await api.deleteDocument(docId);
      setFeedback({
        type: 'success',
        message: `Removed "${title}" and cleaned up all associated FAISS/SQLite chunks.`,
      });
      if (inspectedDoc?.document_id === docId) {
        setInspectedDoc(null);
      }
      await loadDocuments();
      onDocumentsChanged?.();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Delete failed.' });
    }
  };

  const handleInspectDocument = async (docId: string) => {
    try {
      const detail = await api.getDocument(docId);
      setInspectedDoc(detail);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Could not load document detail.' });
    }
  };

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const resp = await api.searchKnowledgeBase(
        searchQuery.trim(),
        searchDest.trim() || undefined,
        categoryFilter !== 'all' ? categoryFilter : undefined,
        8
      );
      setSearchResults(resp.results);
      setSearchMethod(resp.retrieval_method);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Knowledge search failed.' });
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-teal-800">
            Curated Travel Knowledge Base
          </span>
          <h2 className="mt-1 font-serif text-2xl font-bold text-slate-900">
            Document Library & Hybrid Retrieval Pipeline
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            Pipeline: Upload → Validate → Extract Text (PyMuPDF / Markdown / TXT) → Normalize → Chunk → Embed (FAISS) → Index → Retrieve → Cite.
          </p>
        </div>

        <button
          type="button"
          onClick={handleReindex}
          disabled={isReindexing}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-[#faf8f5] px-4 py-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 text-teal-700 ${isReindexing ? 'animate-spin' : ''}`} />
          <span>{isReindexing ? 'Re-indexing...' : 'Re-Index All Documents'}</span>
        </button>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`flex items-start justify-between gap-3 rounded-xl border p-4 text-xs ${
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-rose-200 bg-rose-50 text-rose-900'
          }`}
        >
          <div className="flex items-start gap-2.5">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
            )}
            <span className="font-medium">{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Grid: Upload Form + Hybrid Search */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Upload Form */}
        <form
          onSubmit={handleUploadSubmit}
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs lg:col-span-5"
        >
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Upload className="h-4 w-4 text-teal-700" />
            <h3 className="font-serif text-base font-bold text-slate-900">
              Upload Guide or Policy Document
            </h3>
          </div>

          <div className="mt-4 space-y-3.5 text-xs">
            <div>
              <label className="block font-semibold text-slate-700">
                Select File (.pdf, .md, .txt — max 10 MB) *
              </label>
              <input
                type="file"
                accept=".pdf,.md,.txt"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setUploadFile(f);
                  if (f && !uploadTitle) {
                    setUploadTitle(f.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' '));
                  }
                }}
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-[#faf8f5] px-3 py-2 text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-teal-700 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700">Document Title *</label>
              <input
                type="text"
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                placeholder="e.g., Sample City Luxury Resort Policy"
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-teal-700 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700">Category</label>
                <select
                  value={uploadCategory}
                  onChange={(e) => setUploadCategory(e.target.value as DocumentCategory)}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-xs focus:border-teal-700 focus:outline-none"
                >
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700">Destination</label>
                <input
                  type="text"
                  value={uploadDestination}
                  onChange={(e) => setUploadDestination(e.target.value)}
                  placeholder="Sample City"
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-teal-700 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700">
                Publication / Verification Date (Leave empty to test undated warning)
              </label>
              <input
                type="date"
                value={uploadPubDate}
                onChange={(e) => setUploadPubDate(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-teal-700 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={isUploading}
              className="w-full rounded-xl bg-teal-700 px-4 py-2.5 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-teal-800 disabled:opacity-60"
            >
              {isUploading ? 'Processing & Indexing Chunks...' : 'Upload, Extract & Index Document'}
            </button>
          </div>
        </form>

        {/* Hybrid Semantic + Keyword Search */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs lg:col-span-7">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-teal-700" />
              <h3 className="font-serif text-base font-bold text-slate-900">
                Test Hybrid Semantic + Keyword Retrieval
              </h3>
            </div>
            <span className="text-[11px] text-slate-500">
              Scores measure similarity, not factual certainty
            </span>
          </div>

          <form onSubmit={handleSearchSubmit} className="mt-4 flex flex-col gap-2.5 sm:flex-row">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search e.g. 'check-in 3:00 PM luggage drop-off' or 'National Museum tariff'..."
              className="flex-1 rounded-xl border border-slate-300 px-3.5 py-2 text-xs focus:border-teal-700 focus:outline-none"
            />
            <input
              type="text"
              value={searchDest}
              onChange={(e) => setSearchDest(e.target.value)}
              placeholder="Destination filter (optional)"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs sm:w-44 focus:border-teal-700 focus:outline-none"
            />
            <button
              type="submit"
              disabled={isSearching}
              className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800"
            >
              {isSearching ? 'Searching...' : 'Search Index'}
            </button>
          </form>

          {/* Quick Search Presets */}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="text-slate-400">Quick queries:</span>
            {[
              'check-in 3:00 PM early arrival luggage',
              'National Museum admission fee Friday closing',
              'peak hours cabin bag 15 kg metro',
              'Old Quarter Digital Eco-Pass 24 hours',
            ].map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setSearchQuery(q)}
                className="rounded-md bg-[#faf8f5] px-2 py-0.5 text-slate-600 border border-slate-200 hover:bg-teal-50 hover:text-teal-900"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Search Results */}
          {searchResults !== null && (
            <div className="mt-4 space-y-2.5 max-h-72 overflow-y-auto pr-1">
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500">
                <span>
                  Found {searchResults.length} matching chunk(s) via {searchMethod}
                </span>
                <button
                  type="button"
                  onClick={() => setSearchResults(null)}
                  className="text-teal-700 hover:underline"
                >
                  Clear results
                </button>
              </div>
              {searchResults.map((res) => (
                <div
                  key={res.chunk_id}
                  className="rounded-xl border border-slate-200 bg-[#faf8f5] p-3 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-slate-900">
                      {res.document_title} (Page {res.page_number ?? 1})
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="rounded-md bg-teal-100/80 px-2 py-0.5 font-mono text-[10px] font-semibold text-teal-900">
                        Hybrid Sim: {res.retrieval_score.toFixed(3)}
                      </span>
                      <button
                        type="button"
                        onClick={() => onSelectCitation?.(res)}
                        className="rounded-md bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-teal-800"
                      >
                        Cite / Inspect
                      </button>
                    </div>
                  </div>
                  <p className="mt-1.5 line-clamp-3 text-slate-700">"{res.excerpt}"</p>
                </div>
              ))}
              {searchResults.length === 0 && (
                <p className="py-4 text-center text-xs text-slate-500">
                  No relevant chunks matched your query in the local knowledge base.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Indexed Document Collection List */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h3 className="font-serif text-lg font-bold text-slate-900">
              Indexed Curated Documents ({documents.length})
            </h3>
            <p className="text-xs text-slate-500">
              Click "Inspect Chunks & Text" on any document to view extracted page content and metadata.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {['all', ...Object.keys(CATEGORY_LABELS)].map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  categoryFilter === cat
                    ? 'bg-slate-900 text-white'
                    : 'bg-[#faf8f5] text-slate-600 hover:bg-slate-200/70'
                }`}
              >
                {cat === 'all' ? 'All Categories' : CATEGORY_LABELS[cat as DocumentCategory]}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="py-8 text-center text-xs text-slate-500">Loading indexed documents...</p>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            {documents.map((doc) => (
              <div
                key={doc.document_id}
                className="flex flex-col justify-between rounded-xl border border-slate-200 bg-[#faf8f5]/70 p-4 transition-all hover:bg-white hover:shadow-xs"
              >
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="rounded-md bg-teal-50 px-2.5 py-0.5 text-[11px] font-semibold text-teal-800 border border-teal-200">
                      {CATEGORY_LABELS[doc.category] || doc.category}
                    </span>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                      <span className="rounded-md bg-slate-200/70 px-2 py-0.5 font-mono uppercase text-slate-700">
                        {doc.file_type}
                      </span>
                      <span>• {doc.page_count} page(s)</span>
                      <span>• {doc.chunk_count} chunks</span>
                    </div>
                  </div>

                  <h4 className="mt-2 font-serif text-base font-bold text-slate-900">
                    {doc.title}
                  </h4>

                  <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                    {doc.summary_excerpt}
                  </p>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/70 pt-3 text-[11px] text-slate-500">
                  <div>
                    <span className="font-semibold text-slate-700">{doc.destination}</span> •{' '}
                    {doc.publication_date ? (
                      <span>Published: {doc.publication_date}</span>
                    ) : (
                      <span className="font-semibold text-amber-800">Date Unknown (Undated)</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleInspectDocument(doc.document_id)}
                      className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-teal-800"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>Inspect Chunks</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteDocument(doc.document_id, doc.title)}
                      className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-100"
                      title="Delete document and remove index entries"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Document & Chunk Inspector Modal */}
      {inspectedDoc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex max-h-[85vh] w-full max-w-4xl flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-teal-800">
                  Document Metadata & Extracted Chunks ({inspectedDoc.chunks.length})
                </span>
                <h3 className="mt-1 font-serif text-xl font-bold text-slate-900">
                  {inspectedDoc.title}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  ID: <code className="font-mono">{inspectedDoc.document_id}</code> • Destination:{' '}
                  <strong>{inspectedDoc.destination}</strong> • Published:{' '}
                  <strong>{inspectedDoc.publication_date || 'Unknown (Undated)'}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectedDoc(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-2">
              {inspectedDoc.chunks.map((c) => (
                <div
                  key={c.chunk_id}
                  className="rounded-xl border border-slate-200 bg-[#faf8f5] p-3.5 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 pb-2">
                    <span className="font-mono font-bold text-teal-900">{c.chunk_id}</span>
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-white px-2 py-0.5 font-semibold text-slate-700 border border-slate-200">
                        Page {c.page_number ?? 1}
                      </span>
                      {c.section_heading && (
                        <span className="rounded-md bg-teal-50 px-2 py-0.5 font-medium text-teal-800">
                          {c.section_heading}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap leading-relaxed text-slate-800">
                    {c.content}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
