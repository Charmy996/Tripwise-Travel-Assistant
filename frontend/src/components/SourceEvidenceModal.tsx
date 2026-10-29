import React from 'react';
import { X, FileText, ShieldAlert, CheckCircle2, Calendar, BookOpen, Tag } from 'lucide-react';
import { CitationReference, RetrievedSource } from '../types/tripwise';

interface SourceEvidenceModalProps {
  citation: CitationReference | RetrievedSource | null;
  onClose: () => void;
}

export const SourceEvidenceModal: React.FC<SourceEvidenceModalProps> = ({
  citation,
  onClose,
}) => {
  if (!citation) return null;

  const isDemo =
    'is_demonstration' in citation
      ? citation.is_demonstration
      : citation.source_type === 'demonstration_document';

  const authority =
    'authority' in citation ? citation.authority : citation.authority_level;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-800">
                  Traceable Source Citation
                </span>
                <span className="rounded-md bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                  Page {citation.page_number ?? 1}
                </span>
                {citation.section_heading && (
                  <span className="rounded-md bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                    {citation.section_heading}
                  </span>
                )}
              </div>
              <h3 className="mt-1.5 font-serif text-lg font-bold text-slate-900">
                {citation.document_title}
              </h3>
              <p className="text-xs text-slate-500">
                Document ID: <code className="font-mono text-slate-700">{citation.document_id}</code>{' '}
                • Chunk ID: <code className="font-mono text-slate-700">{citation.chunk_id}</code>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Authority & Demonstration Banner */}
        <div
          className={`mt-4 flex items-start gap-2.5 rounded-xl border p-3.5 text-xs ${
            isDemo
              ? 'border-amber-200 bg-amber-50/80 text-amber-900'
              : 'border-teal-200 bg-teal-50/70 text-teal-900'
          }`}
        >
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">
              Status:{' '}
              {isDemo
                ? 'Demonstration document — fictional educational policy, not a real booking or government policy.'
                : 'Uploaded reference document — verify current terms with official provider.'}
            </p>
            <p className="mt-0.5 opacity-90">
              Verification Status: <strong>{citation.verification_status}</strong> • Authority:{' '}
              <code className="font-mono">{authority}</code>
            </p>
          </div>
        </div>

        {/* Supporting Excerpt */}
        <div className="mt-5">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500">
            <span>Exact Retrieved Document Excerpt</span>
            <span>
              Published: {citation.publication_date ? citation.publication_date : 'Date Unknown (Undated)'}
            </span>
          </div>
          <blockquote className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-[#faf8f5] p-4 font-sans text-sm leading-relaxed text-slate-800 whitespace-pre-wrap">
            "{citation.excerpt}"
          </blockquote>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <Tag className="h-3.5 w-3.5 text-teal-700" />
            <span>Category: {citation.category.replace(/_/g, ' ')}</span>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
};
