import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Calendar,
  BookOpen,
  ShieldCheck,
  AlertTriangle,
  FolderOpen,
  Settings,
  Download,
  Printer,
  Copy,
  Check,
  RefreshCw,
  Edit3,
  PlusCircle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  MapPin,
  Users,
  Wallet,
  Clock,
  FileText,
  Sparkles,
  Globe,
  Trash2,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { api } from '../services/api';
import {
  CitationReference,
  FinalTripPlan,
  PolicyCheckStatus,
  RetrievedSource,
  SeverityLevel,
  SystemSettingsStatus,
  TravellerPreferences,
} from '../types/tripwise';
import { WorkflowTracker } from '../components/WorkflowTracker';
import { SourceEvidenceModal } from '../components/SourceEvidenceModal';
import { DocumentLibraryView } from '../components/DocumentLibraryView';
import { downloadMarkdownPlan, formatPlanAsMarkdown } from '../utils/exportPlan';

type DashboardTab =
  | 'overview'
  | 'itinerary'
  | 'sources'
  | 'policies'
  | 'missing'
  | 'library'
  | 'settings';

export const DashboardPage: React.FC = () => {
  const { tripId } = useParams<{ tripId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const initialTab = (searchParams.get('tab') as DashboardTab) || 'overview';
  const [activeTab, setActiveTab] = useState<DashboardTab>(initialTab);

  const [trip, setTrip] = useState<FinalTripPlan | null>(null);
  const [savedTrips, setSavedTrips] = useState<FinalTripPlan[]>([]);
  const [settingsStatus, setSettingsStatus] = useState<SystemSettingsStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Modals
  const [policyFilter, setPolicyFilter] = useState<string>('ALL');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [activeCitation, setActiveCitation] = useState<CitationReference | RetrievedSource | null>(
    null
  );
  const [copied, setCopied] = useState<boolean>(false);

  // Inline Re-plan / Edit Preferences Drawer
  const [isEditingPrefs, setIsEditingPrefs] = useState<boolean>(false);
  const [editPrefs, setEditPrefs] = useState<TravellerPreferences | null>(null);
  const [isReplanning, setIsReplanning] = useState<boolean>(false);
  const [replanError, setReplanError] = useState<string | null>(null);

  useEffect(() => {
    const tabParam = searchParams.get('tab') as DashboardTab | null;
    if (
      tabParam &&
      ['overview', 'itinerary', 'sources', 'policies', 'missing', 'library', 'settings'].includes(
        tabParam
      )
    ) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  const handleTabChange = (tab: DashboardTab) => {
    setActiveTab(tab);
    setSearchParams(tab === 'overview' ? {} : { tab });
  };

  const loadDashboardData = async (targetTripId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const [allTrips, sysStatus] = await Promise.all([
        api.listTrips(),
        api.getSettingsStatus().catch(() => null),
      ]);
      setSavedTrips(allTrips);
      if (sysStatus) setSettingsStatus(sysStatus);

      const idToLoad =
        targetTripId ||
        tripId ||
        allTrips.find((t) => t.trip_id === 'trip-demo-sample-city')?.trip_id ||
        allTrips[0]?.trip_id;

      if (idToLoad) {
        const loaded = await api.getTrip(idToLoad);
        setTrip(loaded);
        setEditPrefs(loaded.preferences);
      } else {
        const resetDemo = await api.resetDemoScenario();
        setTrip(resetDemo);
        setEditPrefs(resetDemo.preferences);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load trip planning dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData(tripId);
  }, [tripId]);

  const handleCopyItinerary = async () => {
    if (!trip) return;
    const text = formatPlanAsMarkdown(trip);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  const handleReplanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trip || !editPrefs || isReplanning) return;
    if (editPrefs.return_date < editPrefs.departure_date) {
      setReplanError('Return date cannot precede departure date.');
      return;
    }
    setReplanError(null);
    setIsReplanning(true);
    try {
      const updated = await api.replanTrip(trip.trip_id, editPrefs);
      setTrip(updated);
      setEditPrefs(updated.preferences);
      setIsEditingPrefs(false);
      const list = await api.listTrips();
      setSavedTrips(list);
    } catch (err: any) {
      setReplanError(err.message || 'Failed to regenerate itinerary.');
    } finally {
      setIsReplanning(false);
    }
  };

  const handleResetDemo = async () => {
    setIsReplanning(true);
    try {
      const demo = await api.resetDemoScenario();
      setTrip(demo);
      setEditPrefs(demo.preferences);
      navigate(`/dashboard/${demo.trip_id}`);
      const list = await api.listTrips();
      setSavedTrips(list);
    } catch (err: any) {
      setError(err.message || 'Failed to reset demonstration scenario.');
    } finally {
      setIsReplanning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[75vh] flex-col items-center justify-center gap-3 bg-[#faf8f5] p-8">
        <RefreshCw className="h-8 w-8 animate-spin text-teal-700" />
        <p className="font-serif text-lg font-bold text-slate-800">
          Loading TripWise AI Planning Workspace...
        </p>
      </div>
    );
  }

  if (error || !trip) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-900">
          <h2 className="font-serif text-xl font-bold">Unable to Load Trip Plan</h2>
          <p className="mt-2 text-sm">{error || 'Trip not found.'}</p>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={() => loadDashboardData()}
              className="rounded-xl bg-rose-800 px-4 py-2 text-xs font-semibold text-white"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={handleResetDemo}
              className="rounded-xl border border-rose-300 bg-white px-4 py-2 text-xs font-semibold text-rose-900"
            >
              Restore Faculty Demo Scenario
            </button>
          </div>
        </div>
      </div>
    );
  }

  const budgetChartData = trip.budget_breakdown
    ? [
        {
          name: 'Lodging',
          amount: trip.budget_breakdown.accommodation_estimate,
          color: '#0f766e',
        },
        {
          name: 'Transit',
          amount: trip.budget_breakdown.transport_estimate,
          color: '#0284c7',
        },
        {
          name: 'Entries',
          amount: trip.budget_breakdown.activities_and_entry_estimate,
          color: '#4f46e5',
        },
        {
          name: 'Dining',
          amount: trip.budget_breakdown.food_and_dining_estimate,
          color: '#d97706',
        },
        {
          name: 'Buffer (8%)',
          amount: trip.budget_breakdown.contingency_buffer,
          color: '#64748b',
        },
      ]
    : [];

  const policyCounts = {
    PASS: trip.policy_checks.filter((c) => c.status === 'PASS').length,
    WARNING: trip.policy_checks.filter((c) => c.status === 'WARNING').length,
    FAIL: trip.policy_checks.filter((c) => c.status === 'FAIL').length,
    UNKNOWN: trip.policy_checks.filter((c) => c.status === 'UNKNOWN').length,
  };

  const filteredPolicies =
    policyFilter === 'ALL'
      ? trip.policy_checks
      : trip.policy_checks.filter((c) => c.status === policyFilter);

  const filteredMissing =
    severityFilter === 'all'
      ? trip.missing_information
      : trip.missing_information.filter((m) => m.severity === severityFilter);

  const navItems: {
    id: DashboardTab;
    label: string;
    icon: React.ReactNode;
    badge?: string | number;
  }[] = [
    { id: 'overview', label: '1. Overview', icon: <LayoutDashboard className="h-4 w-4" /> },
    {
      id: 'itinerary',
      label: '2. Itinerary',
      icon: <Calendar className="h-4 w-4" />,
      badge: `${trip.itinerary_days.length}d`,
    },
    {
      id: 'sources',
      label: '3. Knowledge Sources',
      icon: <BookOpen className="h-4 w-4" />,
      badge: trip.retrieved_sources.length,
    },
    {
      id: 'policies',
      label: '4. Policy Checks',
      icon: <ShieldCheck className="h-4 w-4" />,
      badge: trip.policy_checks.length,
    },
    {
      id: 'missing',
      label: '5. Missing Info',
      icon: <AlertTriangle className="h-4 w-4" />,
      badge: trip.missing_information.length,
    },
    { id: 'library', label: '6. Document Library', icon: <FolderOpen className="h-4 w-4" /> },
    { id: 'settings', label: '7. Settings & Trips', icon: <Settings className="h-4 w-4" /> },
  ];

  return (
    <div className="min-h-screen bg-[#faf8f5] pb-16">
      {/* Top Summary Banner */}
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                    policyCounts.FAIL > 0
                      ? 'bg-rose-50 text-rose-900 ring-1 ring-inset ring-rose-600/20'
                      : !trip.is_fully_verified
                      ? 'bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-600/20'
                      : 'bg-emerald-50 text-emerald-900 ring-1 ring-inset ring-emerald-600/20'
                  }`}
                >
                  {policyCounts.FAIL > 0 ? (
                    <XCircle className="h-3.5 w-3.5 text-rose-600" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                  )}
                  <span>{trip.verification_summary_status}</span>
                </span>

                {trip.preferences.destination.toLowerCase().includes('sample city') && (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                    Fictional Demonstration Dataset
                  </span>
                )}
              </div>

              <h1 className="mt-2 font-serif text-2xl font-bold text-slate-900 sm:text-3xl">
                {trip.title}
              </h1>

              <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-600">
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-teal-700" />
                  {trip.preferences.origin} → <strong>{trip.preferences.destination}</strong>
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 text-teal-700" />
                  {trip.preferences.departure_date} to {trip.preferences.return_date}
                </span>
                <span className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5 text-teal-700" />
                  {trip.preferences.travellers_count} Travellers ({trip.preferences.adults} Adults,{' '}
                  {trip.preferences.children} Children)
                </span>
                <span className="flex items-center gap-1">
                  <Wallet className="h-3.5 w-3.5 text-teal-700" />
                  Budget: {trip.preferences.currency}{' '}
                  {trip.preferences.budget_total.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Action Toolbar */}
            <div className="flex flex-wrap items-center gap-2 no-print">
              <button
                type="button"
                onClick={() => setIsEditingPrefs((prev) => !prev)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-teal-700/30 bg-teal-50 px-3.5 py-2 text-xs font-semibold text-teal-900 transition-colors hover:bg-teal-100"
              >
                <Edit3 className="h-3.5 w-3.5 text-teal-700" />
                <span>{isEditingPrefs ? 'Close Editor' : 'Revise & Re-Plan'}</span>
              </button>

              <button
                type="button"
                onClick={handleCopyItinerary}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                    <span className="text-emerald-700">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>Copy Plan</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => downloadMarkdownPlan(trip)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export .MD</span>
              </button>

              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-800"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>Print / PDF</span>
              </button>
            </div>
          </div>

          {/* Inline Revise Preferences & Regenerate Panel */}
          {isEditingPrefs && editPrefs && (
            <form
              onSubmit={handleReplanSubmit}
              className="mt-5 rounded-2xl border border-teal-200 bg-teal-50/40 p-5 no-print"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-teal-200/60 pb-3">
                <div>
                  <h3 className="font-serif text-base font-bold text-slate-900">
                    Revise Preferences & Re-Run 6-Stage Pipeline
                  </h3>
                  <p className="text-xs text-slate-600">
                    Modify budget, dates, or accommodation notes (e.g., change arrival time to after 3:00 PM to resolve the early check-in policy conflict) and regenerate immediately.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setEditPrefs({
                      ...editPrefs,
                      accommodation_requirements:
                        'Arriving at 3:30 PM on Day 1 during standard check-in window',
                    })
                  }
                  className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-teal-800 border border-teal-300 hover:bg-teal-50"
                >
                  Quick Fix: Set Arrival to 3:30 PM (Resolves Policy FAIL)
                </button>
              </div>

              {replanError && (
                <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-900">
                  {replanError}
                </div>
              )}

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Destination</label>
                  <input
                    type="text"
                    value={editPrefs.destination}
                    onChange={(e) =>
                      setEditPrefs({ ...editPrefs, destination: e.target.value })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Total Budget ({editPrefs.currency})
                  </label>
                  <input
                    type="number"
                    value={editPrefs.budget_total}
                    onChange={(e) =>
                      setEditPrefs({
                        ...editPrefs,
                        budget_total: Number(e.target.value) || 0,
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Departure Date
                  </label>
                  <input
                    type="date"
                    value={editPrefs.departure_date}
                    onChange={(e) =>
                      setEditPrefs({ ...editPrefs, departure_date: e.target.value })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Return Date</label>
                  <input
                    type="date"
                    value={editPrefs.return_date}
                    onChange={(e) =>
                      setEditPrefs({ ...editPrefs, return_date: e.target.value })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs"
                  />
                </div>
              </div>

              <div className="mt-3">
                <label className="block text-xs font-semibold text-slate-700">
                  Accommodation Policy Requirement Note
                </label>
                <input
                  type="text"
                  value={editPrefs.accommodation_requirements || ''}
                  onChange={(e) =>
                    setEditPrefs({
                      ...editPrefs,
                      accommodation_requirements: e.target.value,
                    })
                  }
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs"
                />
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditingPrefs(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isReplanning}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-teal-700 px-5 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isReplanning ? 'animate-spin' : ''}`} />
                  <span>
                    {isReplanning ? 'Regenerating Itinerary...' : 'Save & Regenerate Itinerary'}
                  </span>
                </button>
              </div>
            </form>
          )}

          {/* 7-Section Navigation Tabs */}
          <div className="mt-6 flex items-center gap-1.5 overflow-x-auto border-t border-slate-100 pt-4 no-print">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleTabChange(item.id)}
                  className={`flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-semibold transition-all ${
                    active
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-[#faf8f5] text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                  {item.badge !== undefined && (
                    <span
                      className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                        active ? 'bg-teal-600 text-white' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content Container */}
      <div className="mx-auto mt-6 max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* ===================================================================
            TAB 1: OVERVIEW
        =================================================================== */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* 6-Stage Workflow Visualization Tracker */}
            <WorkflowTracker
              workflowRun={trip.workflow_run}
              howCreated={trip.how_plan_was_created}
            />

            {/* Executive Summary + Key Metrics */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs lg:col-span-7">
                <span className="text-xs font-bold uppercase tracking-wider text-teal-800">
                  Executive Summary & Evidence Status
                </span>
                <h2 className="mt-1 font-serif text-xl font-bold text-slate-900">
                  Destination & Policy Overview
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-slate-700">
                  {trip.trip_summary}
                </p>

                {/* Quick Status Summary Cards */}
                <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <button
                    type="button"
                    onClick={() => {
                      setPolicyFilter('PASS');
                      handleTabChange('policies');
                    }}
                    className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-left transition-transform hover:scale-[1.02]"
                  >
                    <span className="text-[11px] font-bold uppercase text-emerald-800">
                      Policy PASS
                    </span>
                    <div className="mt-1 font-serif text-2xl font-bold text-emerald-950">
                      {policyCounts.PASS}
                    </div>
                    <span className="text-[10px] text-emerald-800">Evidence-backed</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPolicyFilter('WARNING');
                      handleTabChange('policies');
                    }}
                    className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-left transition-transform hover:scale-[1.02]"
                  >
                    <span className="text-[11px] font-bold uppercase text-amber-800">
                      Warnings
                    </span>
                    <div className="mt-1 font-serif text-2xl font-bold text-amber-950">
                      {policyCounts.WARNING}
                    </div>
                    <span className="text-[10px] text-amber-800">Needs attention</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPolicyFilter('FAIL');
                      handleTabChange('policies');
                    }}
                    className="rounded-xl border border-rose-200 bg-rose-50/70 p-3 text-left transition-transform hover:scale-[1.02]"
                  >
                    <span className="text-[11px] font-bold uppercase text-rose-800">
                      Policy Conflicts
                    </span>
                    <div className="mt-1 font-serif text-2xl font-bold text-rose-950">
                      {policyCounts.FAIL}
                    </div>
                    <span className="text-[10px] text-rose-800">Documented FAIL</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTabChange('missing')}
                    className="rounded-xl border border-slate-200 bg-[#faf8f5] p-3 text-left transition-transform hover:scale-[1.02]"
                  >
                    <span className="text-[11px] font-bold uppercase text-slate-600">
                      Missing / Freshness
                    </span>
                    <div className="mt-1 font-serif text-2xl font-bold text-slate-900">
                      {trip.missing_information.length}
                    </div>
                    <span className="text-[10px] text-slate-500">Audit items</span>
                  </button>
                </div>

                {/* Accommodation & Transport Considerations */}
                <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-[#faf8f5] p-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      Accommodation Considerations
                    </h4>
                    <ul className="mt-2 space-y-1.5 text-xs text-slate-600">
                      {trip.accommodation_considerations.map((note, idx) => (
                        <li key={idx}>• {note}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-[#faf8f5] p-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                      Transport Considerations
                    </h4>
                    <ul className="mt-2 space-y-1.5 text-xs text-slate-600">
                      {trip.transport_considerations.map((note, idx) => (
                        <li key={idx}>• {note}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              {/* Budget Analytics Card with Recharts */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs lg:col-span-5">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-teal-800">
                      Financial Feasibility
                    </span>
                    <h3 className="mt-0.5 font-serif text-xl font-bold text-slate-900">
                      Budget Estimate & Breakdown
                    </h3>
                  </div>
                  {trip.budget_breakdown && (
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold ${
                        trip.budget_breakdown.within_budget
                          ? 'bg-emerald-50 text-emerald-800'
                          : 'bg-rose-50 text-rose-800'
                      }`}
                    >
                      {trip.budget_breakdown.budget_utilization_percent}% of Budget
                    </span>
                  )}
                </div>

                {trip.budget_breakdown && (
                  <>
                    <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-slate-100 bg-[#faf8f5] p-3.5 text-xs">
                      <div>
                        <span className="text-slate-500">Stated Total Budget</span>
                        <div className="mt-0.5 font-serif text-lg font-bold text-slate-900">
                          {trip.budget_breakdown.currency}{' '}
                          {trip.budget_breakdown.total_budget.toLocaleString()}
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-500">Estimated Ground Cost</span>
                        <div className="mt-0.5 font-serif text-lg font-bold text-teal-800">
                          {trip.budget_breakdown.currency}{' '}
                          {trip.budget_breakdown.total_estimated_cost.toLocaleString()}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 h-52 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={budgetChartData}
                          margin={{ top: 10, right: 10, left: 0, bottom: 5 }}
                        >
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip
                            formatter={(val: any) =>
                              `${trip.budget_breakdown?.currency} ${Number(val).toLocaleString()}`
                            }
                          />
                          <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
                            {budgetChartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
                      <strong>Basis:</strong> {trip.budget_breakdown.basis_note}
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* Assumptions, Limitations & Disclaimers */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="font-serif text-base font-bold text-slate-900">
                  Planning Assumptions
                </h3>
                <ul className="mt-2.5 space-y-1.5 text-xs text-slate-600">
                  {trip.planning_assumptions.map((assump, i) => (
                    <li key={i}>• {assump}</li>
                  ))}
                </ul>
              </div>

              <div className="rounded-2xl border border-amber-200/80 bg-amber-50/40 p-5">
                <h3 className="font-serif text-base font-bold text-amber-950">
                  Limitations & Verification Disclaimers
                </h3>
                <ul className="mt-2.5 space-y-1.5 text-xs text-amber-900/90">
                  {trip.limitations_and_disclaimers.map((lim, i) => (
                    <li key={i}>• {lim}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            TAB 2: GENERATED ITINERARY
        =================================================================== */}
        {activeTab === 'itinerary' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-teal-800">
                  Stage 3 Output — Source-Grounded Schedule
                </span>
                <h2 className="mt-0.5 font-serif text-2xl font-bold text-slate-900">
                  {trip.itinerary_days.length}-Day Indicative Itinerary
                </h2>
                <p className="mt-1 text-xs text-slate-600">
                  Click any green citation pill below to open the Source Evidence Inspector and verify the exact document, page number, and text excerpt.
                </p>
              </div>
              <span className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900">
                Indicative Schedule — Confirm Live Opening Hours Before Departure
              </span>
            </div>

            {trip.itinerary_days.map((day) => {
              const slots = [
                { label: 'Morning', items: day.morning },
                { label: 'Afternoon', items: day.afternoon },
                { label: 'Evening', items: day.evening },
              ];

              return (
                <div
                  key={day.day_number}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-900 px-6 py-4 text-white">
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-teal-400">
                        Day {day.day_number} • {day.date}
                      </span>
                      <h3 className="font-serif text-lg font-bold">{day.theme}</h3>
                    </div>
                    <div className="rounded-lg bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-200">
                      Est. Activity & Meal Cost: {trip.preferences.currency}{' '}
                      {day.daily_estimated_cost.toLocaleString()}
                    </div>
                  </div>

                  <div className="divide-y divide-slate-100 p-6">
                    {slots.map((slot) =>
                      slot.items.map((act) => (
                        <div key={act.activity_id} className="py-5 first:pt-0 last:pb-0">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-md bg-teal-50 px-2.5 py-0.5 text-xs font-bold text-teal-900">
                                  {act.time_slot} • {act.Suggested_time}
                                </span>
                                {act.estimated_duration_hours && (
                                  <span className="flex items-center gap-1 text-xs text-slate-500">
                                    <Clock className="h-3.5 w-3.5" />
                                    {act.estimated_duration_hours} hrs
                                  </span>
                                )}
                                <span
                                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                                    act.evidence_backed
                                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                      : 'bg-amber-50 text-amber-900 border border-amber-200'
                                  }`}
                                >
                                  {act.verification_label}
                                </span>
                              </div>

                              <h4 className="mt-2 font-serif text-lg font-bold text-slate-900">
                                {act.title}
                              </h4>
                              <p className="mt-1 text-xs leading-relaxed text-slate-700 sm:text-sm">
                                {act.description}
                              </p>
                            </div>

                            <div className="shrink-0 rounded-xl border border-slate-200 bg-[#faf8f5] px-3.5 py-2 text-right text-xs">
                              <span className="text-[10px] font-semibold uppercase text-slate-400">
                                Estimated Cost ({trip.preferences.travellers_count} pax)
                              </span>
                              <div className="font-serif text-sm font-bold text-slate-900">
                                {act.estimated_cost !== null && act.estimated_cost !== undefined
                                  ? `${act.currency} ${act.estimated_cost.toLocaleString()}`
                                  : 'Unverified'}
                              </div>
                              <div className="text-[10px] text-slate-500">{act.cost_note}</div>
                            </div>
                          </div>

                          <div className="mt-3 grid grid-cols-1 gap-2 rounded-xl bg-[#faf8f5] p-3 text-xs text-slate-600 sm:grid-cols-3">
                            <div>
                              <strong>Transport:</strong> {act.transport_mode}
                            </div>
                            {act.meal_suggestion && (
                              <div>
                                <strong>Meal Note:</strong> {act.meal_suggestion}
                              </div>
                            )}
                            {act.accessibility_note && (
                              <div>
                                <strong>Accessibility:</strong> {act.accessibility_note}
                              </div>
                            )}
                          </div>

                          {/* Clickable Citations */}
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                              Supporting Sources:
                            </span>
                            {act.citations.length > 0 ? (
                              act.citations.map((cit) => (
                                <button
                                  key={cit.chunk_id}
                                  type="button"
                                  onClick={() => setActiveCitation(cit)}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-teal-700/30 bg-teal-50/80 px-2.5 py-1 text-xs font-semibold text-teal-900 transition-colors hover:bg-teal-100"
                                >
                                  <BookOpen className="h-3.5 w-3.5 text-teal-700" />
                                  <span>
                                    {cit.document_title}, page {cit.page_number ?? 1}
                                  </span>
                                </button>
                              ))
                            ) : (
                              <span className="text-xs italic text-amber-800">
                                No curated document citation available — unverified suggestion.
                              </span>
                            )}
                          </div>
                        </div>
                      ))
                    )}

                    {day.daily_notes.length > 0 && (
                      <div className="mt-4 rounded-xl border border-amber-200/80 bg-amber-50/50 p-3 text-xs text-amber-900">
                        {day.daily_notes.map((n, idx) => (
                          <div key={idx}>• {n}</div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ===================================================================
            TAB 3: KNOWLEDGE SOURCES
        =================================================================== */}
        {activeTab === 'sources' && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-teal-800">
                    Stage 2 Output — Hybrid FAISS + BM25 Evidence
                  </span>
                  <h2 className="mt-0.5 font-serif text-2xl font-bold text-slate-900">
                    Retrieved Curated Knowledge Chunks ({trip.retrieved_sources.length})
                  </h2>
                  <p className="mt-1 text-xs text-slate-600">
                    Important: Retrieval similarity scores measure vector + keyword relevance to the trip query—they are <strong>not</strong> factual confidence percentages.
                  </p>
                </div>
              </div>

              {trip.retrieved_sources.length === 0 ? (
                <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-6 text-center text-sm text-amber-900">
                  No relevant evidence chunks were found in the curated knowledge base for{' '}
                  <strong>{trip.preferences.destination}</strong>. Upload guides in the Document Library tab to ground this destination.
                </div>
              ) : (
                <div className="mt-6 space-y-4">
                  {trip.retrieved_sources.map((src) => (
                    <div
                      key={src.chunk_id}
                      className="rounded-xl border border-slate-200 bg-[#faf8f5] p-4 transition-all hover:bg-white"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-md bg-slate-900 px-2.5 py-0.5 text-xs font-semibold text-white">
                            Page {src.page_number ?? 1}
                          </span>
                          <h3 className="font-serif text-base font-bold text-slate-900">
                            {src.document_title}
                          </h3>
                          {src.section_heading && (
                            <span className="rounded-md bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-800">
                              {src.section_heading}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span
                            className={`rounded-full px-2.5 py-0.5 font-semibold ${
                              src.verification_status === 'Verified in provided documents'
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : 'bg-amber-50 text-amber-900 border border-amber-200'
                            }`}
                          >
                            {src.verification_status}
                          </span>
                          <span className="rounded-md bg-white px-2.5 py-0.5 font-mono text-[11px] text-slate-700 border border-slate-200">
                            Hybrid Score: {src.retrieval_score.toFixed(3)} (Sem:{' '}
                            {src.semantic_score.toFixed(2)} | KW: {src.keyword_score.toFixed(2)})
                          </span>
                        </div>
                      </div>

                      <blockquote className="mt-3 rounded-lg border border-slate-200/80 bg-white p-3.5 text-xs leading-relaxed text-slate-800 whitespace-pre-wrap">
                        "{src.excerpt}"
                      </blockquote>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                        <div>
                          Category: <strong className="capitalize">{src.category.replace(/_/g, ' ')}</strong> •{' '}
                          Authority: <code className="font-mono">{src.authority_level}</code> •{' '}
                          Published: <strong>{src.publication_date || 'Unknown (Undated)'}</strong>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveCitation(src)}
                          className="font-semibold text-teal-800 hover:underline"
                        >
                          Open Citation Inspector →
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===================================================================
            TAB 4: POLICY & RESTRICTION VALIDATION
        =================================================================== */}
        {activeTab === 'policies' && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-teal-800">
                    Stage 4 Output — Explainable Compliance Audit
                  </span>
                  <h2 className="mt-0.5 font-serif text-2xl font-bold text-slate-900">
                    Policy & Restriction Validation ({filteredPolicies.length})
                  </h2>
                  <p className="mt-1 text-xs text-slate-600">
                    A PASS is issued only when retrieved evidence affirmatively supports compliance. Conflicting documents are displayed side-by-side.
                  </p>
                </div>

                {/* Status Filter Pills */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {(['ALL', 'PASS', 'WARNING', 'FAIL', 'UNKNOWN'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setPolicyFilter(st)}
                      className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-colors ${
                        policyFilter === st
                          ? 'bg-slate-900 text-white'
                          : 'bg-[#faf8f5] text-slate-600 hover:bg-slate-200/70'
                      }`}
                    >
                      {st}{' '}
                      {st !== 'ALL' && `(${policyCounts[st as PolicyCheckStatus]})`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-6 space-y-4">
                {filteredPolicies.map((chk) => {
                  const badgeStyles: Record<PolicyCheckStatus, string> = {
                    PASS: 'bg-emerald-100 text-emerald-900 border-emerald-300',
                    WARNING: 'bg-amber-100 text-amber-900 border-amber-300',
                    FAIL: 'bg-rose-100 text-rose-900 border-rose-300',
                    UNKNOWN: 'bg-slate-200 text-slate-800 border-slate-300',
                  };

                  return (
                    <div
                      key={chk.check_id}
                      className={`rounded-2xl border p-5 ${
                        chk.status === 'FAIL'
                          ? 'border-rose-300 bg-rose-50/30'
                          : chk.status === 'WARNING'
                          ? 'border-amber-200 bg-amber-50/20'
                          : 'border-slate-200 bg-[#faf8f5]/60'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-lg border px-2.5 py-0.5 text-xs font-bold ${badgeStyles[chk.status]}`}
                            >
                              {chk.status}
                            </span>
                            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                              {chk.category}
                            </span>
                            {chk.requires_manual_confirmation && (
                              <span className="rounded-md bg-white px-2 py-0.5 text-[11px] font-medium text-amber-900 border border-amber-200">
                                Manual Confirmation Required
                              </span>
                            )}
                          </div>
                          <h3 className="mt-2 font-serif text-lg font-bold text-slate-900">
                            {chk.rule_checked}
                          </h3>
                        </div>
                      </div>

                      <p className="mt-2 text-xs leading-relaxed text-slate-700 sm:text-sm">
                        {chk.explanation}
                      </p>

                      {/* Supporting Document Citation & Conflicting Document Comparison */}
                      {chk.supporting_document_title && (
                        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                          <div className="rounded-xl border border-slate-200 bg-white p-3.5 text-xs">
                            <div className="flex items-center justify-between font-bold text-slate-800">
                              <span>Primary Retrieved Evidence:</span>
                              <span className="text-teal-800">{chk.page_or_section}</span>
                            </div>
                            <p className="mt-1 font-semibold text-slate-900">
                              {chk.supporting_document_title}
                            </p>
                            {chk.excerpt && (
                              <p className="mt-1.5 line-clamp-3 italic text-slate-600">
                                "{chk.excerpt}"
                              </p>
                            )}
                          </div>

                          {chk.conflicting_document_title && (
                            <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-3.5 text-xs">
                              <div className="flex items-center justify-between font-bold text-amber-950">
                                <span>Conflicting Document Detected:</span>
                                <span>Discrepancy Flagged</span>
                              </div>
                              <p className="mt-1 font-semibold text-amber-950">
                                {chk.conflicting_document_title}
                              </p>
                              {chk.conflicting_excerpt && (
                                <p className="mt-1.5 line-clamp-3 italic text-amber-900">
                                  "{chk.conflicting_excerpt}"
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="mt-4 rounded-xl border border-teal-200/80 bg-white p-3 text-xs text-slate-800">
                        <strong className="text-teal-900">Recommended Corrective Action:</strong>{' '}
                        {chk.recommended_action}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            TAB 5: MISSING INFORMATION & FRESHNESS CHECKER
        =================================================================== */}
        {activeTab === 'missing' && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-teal-800">
                    Stage 5 Output — Mandatory Freshness & Gap Audit
                  </span>
                  <h2 className="mt-0.5 font-serif text-2xl font-bold text-slate-900">
                    Missing, Outdated & Time-Sensitive Information ({filteredMissing.length})
                  </h2>
                  <p className="mt-1 text-xs text-slate-600">
                    Flags undated documents, pre-2025 advisories, conflicting sources, seasonal closures, and unverified live schedules.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {(['all', 'critical', 'high', 'medium', 'low'] as const).map((sev) => (
                    <button
                      key={sev}
                      type="button"
                      onClick={() => setSeverityFilter(sev)}
                      className={`rounded-xl px-3 py-1.5 text-xs font-bold uppercase transition-colors ${
                        severityFilter === sev
                          ? 'bg-slate-900 text-white'
                          : 'bg-[#faf8f5] text-slate-600 hover:bg-slate-200/70'
                      }`}
                    >
                      {sev}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-6 space-y-4">
                {filteredMissing.map((item) => {
                  const sevBadge: Record<SeverityLevel, string> = {
                    critical: 'bg-rose-100 text-rose-900 border-rose-300',
                    high: 'bg-amber-100 text-amber-900 border-amber-300',
                    medium: 'bg-blue-50 text-blue-900 border-blue-200',
                    low: 'bg-slate-100 text-slate-800 border-slate-300',
                  };

                  return (
                    <div
                      key={item.issue_id}
                      className="rounded-2xl border border-slate-200 bg-[#faf8f5] p-5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-lg border px-2.5 py-0.5 text-xs font-bold uppercase ${sevBadge[item.severity]}`}
                          >
                            {item.severity} Severity
                          </span>
                          <span className="rounded-full bg-white px-3 py-0.5 text-xs font-semibold text-slate-800 border border-slate-200">
                            {item.status_label}
                          </span>
                        </div>
                        <span
                          className={`text-xs font-semibold ${
                            item.can_proceed_provisionally
                              ? 'text-teal-800'
                              : 'text-rose-700'
                          }`}
                        >
                          {item.can_proceed_provisionally
                            ? 'Can Proceed Provisionally'
                            : 'Requires Resolution Before Booking'}
                        </span>
                      </div>

                      <h3 className="mt-2.5 font-serif text-lg font-bold text-slate-900">
                        {item.title}
                      </h3>
                      <p className="mt-1 text-xs leading-relaxed text-slate-700 sm:text-sm">
                        {item.reason}
                      </p>

                      <div className="mt-3 grid grid-cols-1 gap-2 rounded-xl border border-slate-200/80 bg-white p-3 text-xs sm:grid-cols-2">
                        <div>
                          <strong>Affected Item:</strong> {item.affected_item}
                        </div>
                        <div>
                          <strong>Source Reference:</strong>{' '}
                          {item.source_document_title || 'Knowledge Base / External Live Scope'}
                        </div>
                      </div>

                      <div className="mt-2.5 text-xs text-teal-950">
                        <strong>Recommended Next Action:</strong> {item.recommended_action}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Optional Live Verification Adapter Results */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
              <div className="flex items-center gap-2">
                <Globe className="h-5 w-5 text-teal-700" />
                <h3 className="font-serif text-lg font-bold text-slate-900">
                  Optional Live Information Verification Adapter Status
                </h3>
              </div>
              <p className="mt-1 text-xs text-slate-600">
                When external live APIs are unconfigured or fail, TripWise AI explicitly reports "Live verification unavailable" rather than simulating verification.
              </p>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                {trip.live_verifications.map((lv, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-slate-200 bg-[#faf8f5] p-4 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">{lv.category}</span>
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-700">
                        {lv.status}
                      </span>
                    </div>
                    <p className="mt-2 text-slate-600">{lv.message}</p>
                    <div className="mt-2 text-[10px] text-slate-400">
                      Checked: {new Date(lv.checked_at).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            TAB 6: DOCUMENT LIBRARY
        =================================================================== */}
        {activeTab === 'library' && (
          <DocumentLibraryView
            onSelectCitation={(src) => setActiveCitation(src)}
            onDocumentsChanged={() => loadDashboardData(trip.trip_id)}
          />
        )}

        {/* ===================================================================
            TAB 7: SETTINGS & SAVED TRIPS
        =================================================================== */}
        {activeTab === 'settings' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* System & Provider Configuration Status */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs lg:col-span-6">
              <span className="text-xs font-bold uppercase tracking-wider text-teal-800">
                Non-Secret Backend Configuration
              </span>
              <h2 className="mt-1 font-serif text-xl font-bold text-slate-900">
                AI Provider, Retrieval & Security Status
              </h2>

              {settingsStatus ? (
                <dl className="mt-4 divide-y divide-slate-100 text-xs">
                  <div className="flex justify-between py-2.5">
                    <dt className="font-semibold text-slate-600">Planning & Synthesis Mode</dt>
                    <dd className="font-bold text-teal-800">
                      {settingsStatus.llm_mode_description}
                    </dd>
                  </div>
                  <div className="flex justify-between py-2.5">
                    <dt className="font-semibold text-slate-600">Configured LLM Provider</dt>
                    <dd className="font-mono text-slate-800">{settingsStatus.llm_provider}</dd>
                  </div>
                  <div className="flex justify-between py-2.5">
                    <dt className="font-semibold text-slate-600">Vector & Lexical Store</dt>
                    <dd className="text-slate-800">{settingsStatus.vector_store}</dd>
                  </div>
                  <div className="flex justify-between py-2.5">
                    <dt className="font-semibold text-slate-600">Embedding Backend</dt>
                    <dd className="font-mono text-slate-800">{settingsStatus.embedding_backend}</dd>
                  </div>
                  <div className="flex justify-between py-2.5">
                    <dt className="font-semibold text-slate-600">Indexed Curated Documents</dt>
                    <dd className="font-bold text-slate-900">
                      {settingsStatus.indexed_documents_count} docs (
                      {settingsStatus.indexed_chunks_count} chunks)
                    </dd>
                  </div>
                  <div className="flex justify-between py-2.5">
                    <dt className="font-semibold text-slate-600">Upload Security Guard</dt>
                    <dd className="text-slate-800">
                      Max {settingsStatus.max_upload_size_mb} MB (
                      {settingsStatus.allowed_extensions.join(', ')})
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="mt-4 text-xs text-slate-500">Status unavailable.</p>
              )}

              <div className="mt-6 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={handleResetDemo}
                  disabled={isReplanning}
                  className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-teal-800"
                >
                  <Sparkles className="h-4 w-4" />
                  <span>Reset & Re-Run Seeded Faculty Demo Scenario</span>
                </button>
              </div>
            </div>

            {/* Saved Trips Manager */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs lg:col-span-6">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-teal-800">
                    SQLite Persistence
                  </span>
                  <h2 className="mt-1 font-serif text-xl font-bold text-slate-900">
                    Saved Trips ({savedTrips.length})
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/wizard')}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-800"
                >
                  <PlusCircle className="h-3.5 w-3.5" />
                  <span>New Trip</span>
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {savedTrips.map((st) => {
                  const isCurrent = st.trip_id === trip.trip_id;
                  return (
                    <div
                      key={st.trip_id}
                      className={`flex items-center justify-between gap-3 rounded-xl border p-3.5 text-xs ${
                        isCurrent
                          ? 'border-teal-700 bg-teal-50/40'
                          : 'border-slate-200 bg-[#faf8f5]'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-serif text-sm font-bold text-slate-900">
                            {st.title}
                          </span>
                          {isCurrent && (
                            <span className="rounded-md bg-teal-700 px-2 py-0.5 text-[10px] font-bold text-white">
                              Active
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-slate-500">
                          {st.preferences.origin} → {st.preferences.destination} •{' '}
                          {st.preferences.currency} {st.preferences.budget_total.toLocaleString()}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {!isCurrent && (
                          <button
                            type="button"
                            onClick={() => {
                              navigate(`/dashboard/${st.trip_id}`);
                              handleTabChange('overview');
                            }}
                            className="rounded-lg bg-slate-900 px-3 py-1.5 font-semibold text-white hover:bg-teal-800"
                          >
                            Open
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Clickable Citation Source Evidence Inspector Modal */}
      <SourceEvidenceModal
        citation={activeCitation}
        onClose={() => setActiveCitation(null)}
      />
    </div>
  );
};
