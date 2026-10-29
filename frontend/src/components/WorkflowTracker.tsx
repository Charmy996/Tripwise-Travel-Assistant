import React, { useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Loader2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  FileSearch,
  ShieldCheck,
  Sliders,
} from 'lucide-react';
import { WorkflowRun, WorkflowStageDetail, WorkflowStageStatus } from '../types/tripwise';

interface WorkflowTrackerProps {
  workflowRun?: WorkflowRun | null;
  howCreated?: Record<string, any>;
}

const statusConfig: Record<
  WorkflowStageStatus,
  { label: string; badgeClass: string; icon: React.ReactNode; dotClass: string }
> = {
  pending: {
    label: 'Pending',
    badgeClass: 'bg-slate-100 text-slate-600 border-slate-200',
    icon: <Clock className="h-4 w-4 text-slate-400" />,
    dotClass: 'bg-slate-300',
  },
  running: {
    label: 'Running',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    icon: <Loader2 className="h-4 w-4 animate-spin text-blue-600" />,
    dotClass: 'bg-blue-600',
  },
  completed: {
    label: 'Completed',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    icon: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
    dotClass: 'bg-emerald-600',
  },
  completed_with_warnings: {
    label: 'Completed with warnings',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    icon: <AlertTriangle className="h-4 w-4 text-amber-600" />,
    dotClass: 'bg-amber-500',
  },
  failed: {
    label: 'Failed',
    badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
    icon: <XCircle className="h-4 w-4 text-rose-600" />,
    dotClass: 'bg-rose-600',
  },
};

export const WorkflowTracker: React.FC<WorkflowTrackerProps> = ({
  workflowRun,
  howCreated,
}) => {
  const [selectedStage, setSelectedStage] = useState<number | null>(null);
  const [showHowPanel, setShowHowPanel] = useState<boolean>(false);

  if (!workflowRun || !workflowRun.stages?.length) {
    return null;
  }

  const activeStageDetail: WorkflowStageDetail | undefined = workflowRun.stages.find(
    (s) => s.stage_number === selectedStage
  );

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-teal-800">
              Multi-Stage AI Pipeline Execution
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-mono text-[11px] text-slate-600">
              {workflowRun.run_id}
            </span>
          </div>
          <h3 className="mt-0.5 font-serif text-lg font-bold text-slate-900">
            6-Stage Evidence & Policy Verification Tracker
          </h3>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowHowPanel((prev) => !prev)}
            className="flex items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50/70 px-3.5 py-1.5 text-xs font-semibold text-teal-900 transition-colors hover:bg-teal-100"
          >
            <Sparkles className="h-3.5 w-3.5 text-teal-700" />
            <span>How this plan was created</span>
            {showHowPanel ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Connected 6-Stage Horizontal (Desktop) / Vertical (Mobile) Tracker */}
      <div className="mt-5 grid grid-cols-1 gap-3 lg:grid-cols-6">
        {workflowRun.stages.map((stage, idx) => {
          const cfg = statusConfig[stage.status] || statusConfig.pending;
          const isSelected = selectedStage === stage.stage_number;

          return (
            <div key={stage.stage_id} className="relative flex flex-col">
              <button
                type="button"
                onClick={() =>
                  setSelectedStage(isSelected ? null : stage.stage_number)
                }
                className={`flex h-full flex-col justify-between rounded-xl border p-3.5 text-left transition-all ${
                  isSelected
                    ? 'border-teal-700 bg-teal-50/40 ring-2 ring-teal-700/20'
                    : 'border-slate-200/80 bg-[#faf8f5]/60 hover:border-slate-300 hover:bg-white'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                      {stage.stage_number}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cfg.badgeClass}`}
                    >
                      {cfg.icon}
                      <span>{cfg.label}</span>
                    </span>
                  </div>
                  <h4 className="mt-2.5 text-xs font-bold text-slate-900">
                    {stage.stage_name}
                  </h4>
                  <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-slate-600">
                    {stage.summary}
                  </p>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-slate-200/60 pt-2 text-[10px] text-slate-500">
                  <span>
                    {stage.completed_at
                      ? new Date(stage.completed_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })
                      : '—'}
                  </span>
                  <span className="font-semibold text-teal-800">
                    {isSelected ? 'Hide details' : 'Inspect →'}
                  </span>
                </div>
              </button>

              {idx < workflowRun.stages.length - 1 && (
                <div className="hidden lg:block absolute -right-2 top-1/2 z-10 h-0.5 w-2 bg-slate-300" />
              )}
            </div>
          );
        })}
      </div>

      {/* Expandable Stage Output Inspector */}
      {activeStageDetail && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-[#faf8f5] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-teal-800">
                Stage {activeStageDetail.stage_number} Inspection
              </span>
              <h4 className="font-serif text-base font-bold text-slate-900">
                {activeStageDetail.stage_name} — {activeStageDetail.summary}
              </h4>
            </div>
            <button
              type="button"
              onClick={() => setSelectedStage(null)}
              className="text-xs font-medium text-slate-500 hover:text-slate-800"
            >
              Close stage output
            </button>
          </div>

          {activeStageDetail.warnings.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-900">
              <p className="font-semibold">Stage Warnings & Flags:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {activeStageDetail.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {activeStageDetail.error && (
            <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
              <strong>Stage Error:</strong> {activeStageDetail.error}
            </div>
          )}

          <div className="mt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Structured Stage Output
            </p>
            <pre className="mt-1.5 max-h-56 overflow-auto rounded-lg border border-slate-200 bg-white p-3 font-mono text-xs text-slate-800">
              {JSON.stringify(activeStageDetail.details, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* "How this plan was created" Panel */}
      {showHowPanel && howCreated && (
        <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50/40 p-4 sm:p-5">
          <h4 className="font-serif text-base font-bold text-slate-900">
            How This Plan Was Created (Explainable AI Traceability)
          </h4>
          <p className="mt-1 text-xs text-slate-600">
            Every recommendation and policy outcome in this itinerary was synthesized through deterministic workflow stages grounded in retrieved documents.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-3.5">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                <Sliders className="h-4 w-4 text-teal-700" />
                <span>1. Preferences Normalized</span>
              </div>
              {howCreated.preferences_used && (
                <ul className="mt-2 space-y-1 text-xs text-slate-600">
                  <li>
                    <strong>Route:</strong> {howCreated.preferences_used.origin} →{' '}
                    {howCreated.preferences_used.destination}
                  </li>
                  <li>
                    <strong>Duration:</strong> {howCreated.preferences_used.duration_days} days (
                    {howCreated.preferences_used.travellers})
                  </li>
                  <li>
                    <strong>Budget:</strong> {howCreated.preferences_used.budget}
                  </li>
                  <li>
                    <strong>Style & Pace:</strong> {howCreated.preferences_used.style_and_pace}
                  </li>
                  <li>
                    <strong>Interests:</strong>{' '}
                    {(howCreated.preferences_used.interests || []).join(', ')}
                  </li>
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3.5">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                <FileSearch className="h-4 w-4 text-teal-700" />
                <span>2. Curated Documents Consulted</span>
              </div>
              <ul className="mt-2 space-y-1.5 text-xs text-slate-600">
                {(howCreated.documents_consulted || []).map((doc: any) => (
                  <li key={doc.document_id} className="flex items-start justify-between gap-2">
                    <span className="font-medium text-slate-800">{doc.document_title}</span>
                    <span className="shrink-0 rounded-md bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-800">
                      {doc.chunks_used} chunk(s)
                    </span>
                  </li>
                ))}
                {(!howCreated.documents_consulted ||
                  howCreated.documents_consulted.length === 0) && (
                  <li className="italic text-amber-800">
                    No matching documents in knowledge base; flagged as unverified.
                  </li>
                )}
              </ul>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3.5">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                <ShieldCheck className="h-4 w-4 text-teal-700" />
                <span>3. Validation & Freshness Checks</span>
              </div>
              <ul className="mt-2 space-y-1.5 text-xs text-slate-600">
                {(howCreated.validation_steps_performed || []).map((step: string, i: number) => (
                  <li key={i}>• {step}</li>
                ))}
                <li className="pt-1 text-[11px] font-medium text-teal-800">
                  Mode: {howCreated.generation_mode || workflowRun.generation_mode}
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
