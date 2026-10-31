import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Clock,
  Layers,
  FileCheck,
} from 'lucide-react';
import { api } from '../services/api';
import {
  DocumentCategory,
  DocumentProcessingStatus,
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
  const [totalDocuments, setTotalDocuments] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [page, setPage] = useState<number>(1);
  const limit = 8;

  const [loading, setLoading] = useState<boolean>(true);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
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
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Deletion Confirmation Modal
  const [docToDelete, setDocToDelete] = useState<TravelDocumentMetadata | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Knowledge Search state
  const [knowledgeQuery, setKnowledgeQuery] = useState<string>('');
  const [knowledgeDest, setKnowledgeDest] = useState<string>('');
  const [searchResults, setSearchResults] = useState<RetrievedSource[] | null>(null);
  const [searchMethod, setSearchMethod] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);

  // Document Preview Drawer/Modal (loaded on demand)
  const [inspectedDocId, setInspectedDocId] = useState<string | null>(null);
  const [inspectedDoc, setInspectedDoc] = useState<TravelDocumentDetail | null>(null);
  const [loadingInspection, setLoadingInspection] = useState<boolean>(false);

  // Retry state
  const [retryingDocId, setRetryingDocId] = useState<string | null>(null);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load documents paginated
  const loadDocuments = useCallback(async (isPolling = false) => {
    if (!isPolling) setLoading(true);
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await api.listDocumentsPaginated(
        {
          category: categoryFilter,
          status: statusFilter,
          search: debouncedSearch,
          page: page,
          limit: limit,
        },
        controller.signal
      );
      setDocuments(res.items);
      setTotalDocuments(res.total);
      setTotalPages(res.total_pages);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setFeedback({ type: 'error', message: err.message || 'Failed to load documents.' });
      }
    } finally {
      if (!isPolling) setLoading(false);
    }
  }, [categoryFilter, statusFilter, debouncedSearch, page]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  // Check if any documents are currently in non-terminal processing states
  const hasActiveProcessing = documents.some((d) =>
    ['uploaded', 'queued', 'extracting', 'chunking', 'generating_embeddings', 'indexing', 'processing'].includes(
      d.processing_status
    )
  );

  // Poll while processing in background
  useEffect(() => {
    if (hasActiveProcessing) {
      pollIntervalRef.current = setInterval(() => {
        loadDocuments(true);
      }, 2500);
    } else {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    }
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [hasActiveProcessing, loadDocuments]);

  // Handle Drag & Drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      handleFileSelected(file);
    }
  };

  const handleFileSelected = (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!['pdf', 'txt', 'md'].includes(ext)) {
      setFeedback({
        type: 'error',
        message: `Unsupported file extension (.${ext}). Allowed formats: .pdf, .txt, .md`,
      });
      return;
    }
    setUploadFile(file);
    if (!uploadTitle.trim()) {
      setUploadTitle(file.name.replace(/\.[^/.]+$/, ''));
    }
    setFeedback(null);
  };

  // Submit Upload
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      setFeedback({ type: 'error', message: 'Please select a document file (.pdf, .md, .txt).' });
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
        message: `Uploaded "${created.title}". Ingestion and vector indexing started in background.`,
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

  // Retry Failed Processing
  const handleRetryProcessing = async (docId: string) => {
    setRetryingDocId(docId);
    setFeedback(null);
    try {
      await api.retryDocumentProcessing(docId);
      setFeedback({
        type: 'success',
        message: `Processing queued again for document. Tracking background status...`,
      });
      await loadDocuments();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Retry failed.' });
    } finally {
      setRetryingDocId(null);
    }
  };

  // On-demand inspection drawer
  const handleInspectDocument = async (docId: string) => {
    setInspectedDocId(docId);
    setLoadingInspection(true);
    setInspectedDoc(null);
    try {
      const doc = await api.getDocument(docId);
      setInspectedDoc(doc);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Unable to load document details.' });
      setInspectedDocId(null);
    } finally {
      setLoadingInspection(false);
    }
  };

  // Delete Document
  const handleConfirmDelete = async () => {
    if (!docToDelete) return;
    setIsDeleting(true);
    setFeedback(null);
    try {
      await api.deleteDocument(docToDelete.document_id);
      setFeedback({
        type: 'success',
        message: `Removed "${docToDelete.title}" and cleaned up search vectors.`,
      });
      setDocToDelete(null);
      await loadDocuments();
      onDocumentsChanged?.();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to delete document.' });
    } finally {
      setIsDeleting(false);
    }
  };

  // Re-index all documents
  const handleReindex = async () => {
    setIsReindexing(true);
    setFeedback(null);
    try {
      const res = await api.reindexDocuments();
      setFeedback({
        type: 'success',
        message: `Re-indexed ${res.total_documents} documents (${res.total_chunks} unique chunks in FAISS index).`,
      });
      await loadDocuments();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Re-indexing failed.' });
    } finally {
      setIsReindexing(false);
    }
  };

  // Knowledge search
  const handleKnowledgeSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!knowledgeQuery.trim()) return;
    setIsSearching(true);
    setSearchResults(null);
    try {
      const res = await api.searchKnowledgeBase(knowledgeQuery.trim(), knowledgeDest.trim() || undefined, 'all', 8);
      setSearchResults(res.results);
      setSearchMethod(res.retrieval_method);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Search failed.' });
    } finally {
      setIsSearching(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const renderStatusBadge = (status: DocumentProcessingStatus, error?: string | null) => {
    switch (status) {
      case 'uploaded':
      case 'queued':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-800 border border-indigo-200">
            <Clock className="h-3 w-3 animate-pulse text-indigo-600" />
            <span>Queued</span>
          </span>
        );
      case 'extracting':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800 border border-amber-200">
            <RefreshCw className="h-3 w-3 animate-spin text-amber-600" />
            <span>Extracting Text</span>
          </span>
        );
      case 'chunking':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-0.5 text-[11px] font-semibold text-orange-800 border border-orange-200">
            <Layers className="h-3 w-3 animate-pulse text-orange-600" />
            <span>Chunking</span>
          </span>
        );
      case 'generating_embeddings':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2.5 py-0.5 text-[11px] font-semibold text-purple-800 border border-purple-200">
            <Sparkles className="h-3 w-3 animate-spin text-purple-600" />
            <span>Embedding</span>
          </span>
        );
      case 'indexing':
      case 'processing':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-0.5 text-[11px] font-semibold text-teal-800 border border-teal-200">
            <RefreshCw className="h-3 w-3 animate-spin text-teal-600" />
            <span>Indexing</span>
          </span>
        );
      case 'completed':
      case 'indexed':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="h-3 w-3 text-emerald-600" />
            <span>Completed</span>
          </span>
        );
      case 'failed':
        return (
          <span
            title={error || 'Document processing failed.'}
            className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-semibold text-rose-800 border border-rose-200"
          >
            <AlertCircle className="h-3 w-3 text-rose-600" />
            <span>Failed</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-700">
            <span>{status}</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-teal-800">
            Knowledge Ingestion & Vector Corpus
          </span>
          <h2 className="mt-1 font-serif text-2xl font-bold text-slate-900">
            Curated Document Library
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            Manage evidence documents, inspect chunk boundaries, upload regional policy guidelines, and trigger background vector indexing.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {hasActiveProcessing && (
            <div className="flex items-center gap-2 rounded-xl bg-teal-50 border border-teal-200 px-3 py-1.5 text-xs text-teal-900">
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-teal-700" />
              <span>Background Tasks Active...</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleReindex}
            disabled={isReindexing}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isReindexing ? 'animate-spin' : ''}`} />
            <span>{isReindexing ? 'Re-indexing...' : 'Re-index FAISS'}</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          role="alert"
          className={`flex items-start justify-between gap-3 rounded-xl border p-4 text-xs ${
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-rose-200 bg-rose-50 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="rounded p-0.5 text-slate-400 hover:text-slate-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Upload Zone & Form */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <h3 className="font-serif text-lg font-bold text-slate-900 mb-4">
          Ingest New Travel or Policy Document
        </h3>

        <form onSubmit={handleUploadSubmit} className="space-y-4">
          {/* Drag & Drop Area */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
              isDragging
                ? 'border-teal-600 bg-teal-50/50'
                : uploadFile
                ? 'border-emerald-400 bg-emerald-50/30'
                : 'border-slate-300 bg-slate-50/50 hover:bg-slate-50'
            }`}
          >
            <input
              id="doc-file-input"
              type="file"
              accept=".pdf,.txt,.md"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileSelected(e.target.files[0]);
                }
              }}
              className="absolute inset-0 cursor-pointer opacity-0"
            />

            {uploadFile ? (
              <div className="flex flex-col items-center gap-1.5">
                <FileCheck className="h-8 w-8 text-emerald-600" />
                <span className="text-xs font-bold text-slate-900">{uploadFile.name}</span>
                <span className="text-[11px] text-slate-500">
                  {formatFileSize(uploadFile.size)} • Click or drop another file to replace
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1.5">
                <Upload className="h-8 w-8 text-teal-700" />
                <span className="text-xs font-bold text-slate-900">
                  Drag and drop a PDF, Markdown, or TXT file here
                </span>
                <span className="text-[11px] text-slate-500">
                  Or click to browse your computer (Max 10 MB)
                </span>
              </div>
            )}
          </div>

          {/* Form Fields */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700">Document Title *</label>
              <input
                type="text"
                required
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                placeholder="e.g., Regional Heritage Policy"
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-teal-700 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">Category *</label>
              <select
                value={uploadCategory}
                onChange={(e) => setUploadCategory(e.target.value as DocumentCategory)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-teal-700 focus:outline-none"
              >
                {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">Destination *</label>
              <input
                type="text"
                value={uploadDestination}
                onChange={(e) => setUploadDestination(e.target.value)}
                placeholder="e.g., Sample City or General"
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-teal-700 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">Publication Date</label>
              <input
                type="date"
                value={uploadPubDate}
                onChange={(e) => setUploadPubDate(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-teal-700 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isUploading || !uploadFile}
              className="inline-flex items-center gap-1.5 rounded-xl bg-teal-800 px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-teal-900 transition-colors disabled:opacity-50"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>{isUploading ? 'Uploading...' : 'Upload & Process in Background'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Filters & Search Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          {/* Search Box */}
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search documents by title or file..."
              className="w-full rounded-xl border border-slate-300 py-2 pl-9 pr-3 text-xs focus:border-teal-700 focus:outline-none"
            />
          </div>

          {/* Category Dropdown */}
          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-teal-700 focus:outline-none"
          >
            <option value="all">All Categories</option>
            {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>

          {/* Status Dropdown */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-slate-300 px-3 py-2 text-xs focus:border-teal-700 focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="completed">Completed / Indexed</option>
            <option value="queued">Queued / Processing</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        <div className="text-xs text-slate-500">
          Showing <strong>{documents.length}</strong> of <strong>{totalDocuments}</strong> documents
        </div>
      </div>

      {/* Documents Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        {loading ? (
          <div className="flex items-center justify-center p-12 text-xs text-slate-500">
            <RefreshCw className="mr-2 h-5 w-5 animate-spin text-teal-700" />
            <span>Loading document records...</span>
          </div>
        ) : documents.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500">
            <FolderOpen className="mx-auto h-8 w-8 text-slate-300 mb-2" />
            <p className="font-semibold text-slate-700">No documents found.</p>
            <p className="mt-1 text-slate-400">
              Try adjusting your category, search, or status filter.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-bold uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-3.5">Document</th>
                  <th className="px-4 py-3.5">Category</th>
                  <th className="px-4 py-3.5">Size</th>
                  <th className="px-4 py-3.5">Destination</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5">Chunks</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {documents.map((doc) => (
                  <tr key={doc.document_id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-start gap-2.5">
                        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-teal-800" />
                        <div>
                          <div className="font-semibold text-slate-900 line-clamp-1">
                            {doc.title}
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                            <span>{doc.filename}</span>
                            <span>•</span>
                            <span className="uppercase font-mono font-bold text-[10px] text-slate-500">
                              .{doc.file_type}
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3.5 text-slate-600">
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                        {CATEGORY_LABELS[doc.category] || doc.category}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 font-mono text-[11px] text-slate-500">
                      {formatFileSize(doc.file_size_bytes)}
                    </td>

                    <td className="px-4 py-3.5 text-slate-600 font-medium">
                      {doc.destination}
                    </td>

                    <td className="px-4 py-3.5">
                      {renderStatusBadge(doc.processing_status, doc.processing_error)}
                      {doc.processing_error && (
                        <div className="mt-0.5 text-[10px] text-rose-600 truncate max-w-[140px]" title={doc.processing_error}>
                          {doc.processing_error}
                        </div>
                      )}
                    </td>

                    <td className="px-4 py-3.5 text-slate-700 font-semibold">
                      {doc.chunk_count}
                    </td>

                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {doc.processing_status === 'failed' && (
                          <button
                            type="button"
                            onClick={() => handleRetryProcessing(doc.document_id)}
                            disabled={retryingDocId === doc.document_id}
                            title="Retry Background Processing"
                            className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 transition-colors"
                          >
                            <RotateCcw className={`h-3 w-3 ${retryingDocId === doc.document_id ? 'animate-spin' : ''}`} />
                            <span>Retry</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleInspectDocument(doc.document_id)}
                          title="Preview Extracted Content & Chunks"
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-teal-50 hover:text-teal-900 transition-colors"
                        >
                          <Eye className="h-3 w-3" />
                          <span>Preview</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setDocToDelete(doc)}
                          title="Delete Document"
                          className="rounded-lg border border-slate-200 p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-700 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 text-xs bg-slate-50/50">
            <span className="text-slate-500">
              Page <strong>{page}</strong> of <strong>{totalPages}</strong>
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-slate-700 hover:bg-slate-100 disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>Previous</span>
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-slate-700 hover:bg-slate-100 disabled:opacity-40"
              >
                <span>Next</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Interactive Hybrid Knowledge Search Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="h-4 w-4 text-teal-700" />
          <h3 className="font-serif text-lg font-bold text-slate-900">
            Interactive Hybrid Knowledge Search Test
          </h3>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Test live hybrid semantic FAISS + lexical BM25 retrieval directly against current indexed chunks.
        </p>

        <form onSubmit={handleKnowledgeSearch} className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            required
            value={knowledgeQuery}
            onChange={(e) => setKnowledgeQuery(e.target.value)}
            placeholder="e.g., Museum tariffs, check-in rules, metro passes..."
            className="min-w-[240px] flex-1 rounded-xl border border-slate-300 px-3.5 py-2 text-xs focus:border-teal-700 focus:outline-none"
          />
          <input
            type="text"
            value={knowledgeDest}
            onChange={(e) => setKnowledgeDest(e.target.value)}
            placeholder="Destination filter (optional)"
            className="w-48 rounded-xl border border-slate-300 px-3.5 py-2 text-xs focus:border-teal-700 focus:outline-none"
          />
          <button
            type="submit"
            disabled={isSearching}
            className="inline-flex items-center gap-1.5 rounded-xl bg-teal-800 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-teal-900 transition-colors disabled:opacity-50"
          >
            <Search className="h-3.5 w-3.5" />
            <span>{isSearching ? 'Searching...' : 'Run Hybrid Search'}</span>
          </button>
        </form>

        {searchResults && (
          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Method: <strong>{searchMethod}</strong></span>
              <span>Found <strong>{searchResults.length}</strong> matching chunks</span>
            </div>

            <div className="space-y-2">
              {searchResults.map((r) => (
                <div key={r.chunk_id} className="rounded-xl border border-slate-200 bg-[#faf8f5] p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">{r.document_title}</span>
                    <span className="rounded bg-teal-50 px-2 py-0.5 font-mono text-[10px] font-bold text-teal-800">
                      Score: {(r.retrieval_score * 100).toFixed(0)}%
                    </span>
                  </div>
                  <p className="mt-1 text-slate-600 line-clamp-2">{r.excerpt}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Preview Modal / Drawer */}
      {inspectedDocId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-900 px-6 py-4 text-white">
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-teal-400" />
                <h3 className="font-serif text-lg font-bold">
                  {inspectedDoc ? inspectedDoc.title : 'Loading Document...'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setInspectedDocId(null)}
                className="rounded-lg p-1 text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {loadingInspection ? (
                <div className="flex items-center justify-center py-12 text-xs text-slate-500">
                  <RefreshCw className="mr-2 h-5 w-5 animate-spin text-teal-700" />
                  <span>Loading full document text & indexed chunks...</span>
                </div>
              ) : inspectedDoc ? (
                <>
                  <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-xs sm:grid-cols-4">
                    <div>
                      <span className="text-slate-400">File</span>
                      <div className="font-semibold text-slate-800">{inspectedDoc.filename}</div>
                    </div>
                    <div>
                      <span className="text-slate-400">Category</span>
                      <div className="font-semibold text-slate-800">{CATEGORY_LABELS[inspectedDoc.category]}</div>
                    </div>
                    <div>
                      <span className="text-slate-400">Pages / Chunks</span>
                      <div className="font-semibold text-slate-800">
                        {inspectedDoc.page_count} page(s) • {inspectedDoc.chunks.length} chunks
                      </div>
                    </div>
                    <div>
                      <span className="text-slate-400">Status</span>
                      <div>{renderStatusBadge(inspectedDoc.processing_status)}</div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-serif text-sm font-bold text-slate-900 mb-2">
                      Indexed Chunks ({inspectedDoc.chunks.length})
                    </h4>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {inspectedDoc.chunks.map((chk) => (
                        <div key={chk.chunk_id} className="rounded-xl border border-slate-200 bg-[#faf8f5] p-3 text-xs">
                          <div className="flex items-center justify-between text-[11px] font-semibold text-teal-900 mb-1">
                            <span>Chunk #{chk.chunk_index} • Page {chk.page_number ?? 1}</span>
                            <span className="text-slate-500">{chk.section_heading || 'General'}</span>
                          </div>
                          <p className="text-slate-700 whitespace-pre-wrap">{chk.content}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {inspectedDoc.full_text && (
                    <div>
                      <h4 className="font-serif text-sm font-bold text-slate-900 mb-2">
                        Raw Extracted Text
                      </h4>
                      <pre className="max-h-48 overflow-y-auto rounded-xl bg-slate-50 p-3 font-mono text-[11px] text-slate-700 whitespace-pre-wrap">
                        {inspectedDoc.full_text}
                      </pre>
                    </div>
                  )}
                </>
              ) : null}
            </div>

            <div className="border-t border-slate-100 bg-slate-50 px-6 py-3 flex justify-end">
              <button
                type="button"
                onClick={() => setInspectedDocId(null)}
                className="rounded-xl bg-teal-800 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-900"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {docToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-200">
            <div className="flex items-center gap-3 text-rose-700">
              <div className="rounded-xl bg-rose-50 p-2.5">
                <Trash2 className="h-6 w-6" />
              </div>
              <h3 className="font-serif text-lg font-bold text-slate-900">
                Confirm Document Deletion
              </h3>
            </div>

            <p className="mt-3 text-xs text-slate-600 leading-relaxed">
              Are you sure you want to delete <strong>&quot;{docToDelete.title}&quot;</strong> ({docToDelete.filename})?
              All associated chunks ({docToDelete.chunk_count}) will be permanently removed from SQLite and the FAISS vector search index.
            </p>

            <div className="mt-6 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setDocToDelete(null)}
                disabled={isDeleting}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="rounded-xl bg-rose-700 px-4 py-2 text-xs font-bold text-white hover:bg-rose-800 disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
