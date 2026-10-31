import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Layers,
  ArrowRight,
  TrendingUp,
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
  DashboardSummary,
  FinalTripPlan,
  ItineraryDay,
  PolicyCheckStatus,
  RetrievedSource,
  SeverityLevel,
  SystemSettingsStatus,
  TravellerPreferences,
  TripSummary,
} from '../types/tripwise';
import { WorkflowTracker } from '../components/WorkflowTracker';
import { SourceEvidenceModal } from '../components/SourceEvidenceModal';
import { DocumentLibraryView } from '../components/DocumentLibraryView';
import { ItineraryEditor } from '../components/ItineraryEditor';
import { CityAutocomplete } from '../components/CityAutocomplete';
import { ErrorBoundary } from '../components/ErrorBoundary';
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
  const [savedTrips, setSavedTrips] = useState<TripSummary[]>([]);
  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummary | null>(null);
  const [settingsStatus, setSettingsStatus] = useState<SystemSettingsStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [tripLoading, setTripLoading] = useState<boolean>(false);
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

  const abortControllerRef = useRef<AbortController | null>(null);

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

  // Progressive Loading: Load lightweight summary first, then fetch current trip on demand
  const loadDashboardData = useCallback(async (targetTripId?: string) => {
    setLoading(true);
    setError(null);

    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      // 1. Fetch live application summary & system status without blocking on large payloads
      const [summary, sysStatus] = await Promise.all([
        api.getDashboardSummary(controller.signal).catch((err) => {
          console.warn('Dashboard summary call failed:', err);
          return null;
        }),
        api.getSettingsStatus(controller.signal).catch(() => null),
      ]);

      if (summary) {
        setDashboardSummary(summary);
        setSavedTrips(summary.recent_trips || []);
      }
      if (sysStatus) setSettingsStatus(sysStatus);

      // Determine target trip to load
      const idToLoad =
        targetTripId ||
        tripId ||
        summary?.recent_trips.find((t) => t.trip_id === 'trip-demo-sample-city')?.trip_id ||
        summary?.recent_trips[0]?.trip_id;

      if (idToLoad) {
        setTripLoading(true);
        try {
          const loaded = await api.getTrip(idToLoad, controller.signal);
          setTrip(loaded);
          setEditPrefs(loaded.preferences);
        } catch (tripErr: any) {
          console.error(`Failed to load target trip ${idToLoad}:`, tripErr);
          setError(`Unable to load selected trip (${idToLoad}). It may have been removed.`);
        } finally {
          setTripLoading(false);
        }
      } else {
        // No trips exist yet in database
        setTrip(null);
        setEditPrefs(null);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Failed to initialize trip planning workspace.');
      }
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    loadDashboardData(tripId);
    return () => {
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, [loadDashboardData, tripId]);

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
      // Refresh summary in background
      api.getDashboardSummary().then((s) => s && setDashboardSummary(s));
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
      api.getDashboardSummary().then((s) => s && setDashboardSummary(s));
    } catch (err: any) {
      setError(err.message || 'Failed to reset demonstration scenario.');
    } finally {
      setIsReplanning(false);
    }
  };

  const handleSaveItinerary = async (updatedDays: ItineraryDay[]) => {
    if (!trip) return;
    const updated = await api.updateTripItinerary(trip.trip_id, updatedDays, true);
    setTrip(updated);
    api.getDashboardSummary().then((s) => s && setDashboardSummary(s)).catch(() => {});
  };

  // Loading Skeletons for progressive initial render
  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        <div className="h-28 rounded-2xl bg-white p-6 shadow-xs animate-pulse flex items-center justify-between border border-slate-200">
          <div className="space-y-2.5">
            <div className="h-4 w-36 rounded bg-slate-200" />
            <div className="h-7 w-72 rounded bg-slate-200" />
            <div className="h-3 w-48 rounded bg-slate-100" />
          </div>
          <div className="h-10 w-32 rounded-xl bg-slate-200" />
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-white p-4 shadow-xs border border-slate-200 animate-pulse space-y-2">
              <div className="h-3 w-20 rounded bg-slate-200" />
              <div className="h-6 w-12 rounded bg-slate-300" />
              <div className="h-2 w-28 rounded bg-slate-100" />
            </div>
          ))}
        </div>

        <div className="h-72 rounded-2xl bg-white p-6 shadow-xs border border-slate-200 animate-pulse" />
      </div>
    );
  }

  // Proper Empty State when database contains no trips
  if (!trip && !loading && !tripLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-50 text-teal-800">
          <FolderOpen className="h-8 w-8" />
        </div>
        <h2 className="mt-4 font-serif text-2xl font-bold text-slate-900">
          No Saved Trips Found
        </h2>
        <p className="mt-2 text-sm text-slate-600 max-w-md mx-auto">
          You don&apos;t have any planned itineraries in SQLite storage yet. Start creating your first evidence-backed trip or restore our curated demonstration dataset.
        </p>

        {error && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
            {error}
          </div>
        )}

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/wizard')}
            className="inline-flex items-center gap-1.5 rounded-xl bg-teal-800 px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-teal-900 transition-colors"
          >
            <PlusCircle className="h-4 w-4" />
            <span>Plan New Trip</span>
          </button>
          <button
            type="button"
            onClick={handleResetDemo}
            disabled={isReplanning}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4 text-teal-700" />
            <span>{isReplanning ? 'Initializing Demo...' : 'Restore Faculty Demo Scenario'}</span>
          </button>
        </div>
      </div>
    );
  }

  if (!trip) return null;

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
      label: '2. Dynamic Itinerary',
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
      label: '5. Missing Evidence & Audit',
      icon: <AlertTriangle className="h-4 w-4" />,
      badge: trip.missing_information.length,
    },
    {
      id: 'library',
      label: '6. Document Library',
      icon: <FolderOpen className="h-4 w-4" />,
      badge: dashboardSummary?.total_documents ?? settingsStatus?.indexed_documents_count,
    },
    {
      id: 'settings',
      label: '7. System & Storage',
      icon: <Settings className="h-4 w-4" />,
    },
  ];

  return (
    <div className="min-h-screen bg-[#faf8f5] pb-16">
      {/* Top Banner Card */}
      <div className="border-b border-slate-200/80 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                    trip.is_fully_verified
                      ? 'bg-emerald-50 text-emerald-800'
                      : 'bg-amber-50 text-amber-900 border border-amber-200'
                  }`}
                >
                  {trip.is_fully_verified ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
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
                <span>Export Markdown</span>
              </button>

              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Printer className="h-3.5 w-3.5" />
                <span>Print</span>
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
                    Revise Preferences & Re-Run Pipeline
                  </h3>
                  <p className="text-xs text-slate-600">
                    Modify origin, destination, budget, dates, or constraints and re-execute verification.
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

              {/* Dynamic City Autocomplete in Re-Plan Drawer */}
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <CityAutocomplete
                    label="Origin City"
                    placeholder="Type origin (e.g. Mum, New)..."
                    value={editPrefs.origin}
                    selectedLocation={editPrefs.origin_location}
                    onChange={(loc, textVal) =>
                      setEditPrefs({
                        ...editPrefs,
                        origin: textVal,
                        origin_location: loc,
                      })
                    }
                  />
                </div>
                <div>
                  <CityAutocomplete
                    label="Destination City"
                    placeholder="Type destination..."
                    value={editPrefs.destination}
                    selectedLocation={editPrefs.destination_location}
                    onChange={(loc, textVal) =>
                      setEditPrefs({
                        ...editPrefs,
                        destination: textVal,
                        destination_location: loc,
                      })
                    }
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
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Dates</label>
                  <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                    <input
                      type="date"
                      value={editPrefs.departure_date}
                      onChange={(e) =>
                        setEditPrefs({ ...editPrefs, departure_date: e.target.value })
                      }
                      className="w-full rounded-xl border border-slate-300 bg-white px-2 py-2 text-xs"
                    />
                    <input
                      type="date"
                      value={editPrefs.return_date}
                      onChange={(e) =>
                        setEditPrefs({ ...editPrefs, return_date: e.target.value })
                      }
                      className="w-full rounded-xl border border-slate-300 bg-white px-2 py-2 text-xs"
                    />
                  </div>
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
                  placeholder="e.g., Arriving at 3:30 PM..."
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

      {/* Main Content Container wrapped in ErrorBoundary */}
      <div className="mx-auto mt-6 max-w-7xl px-4 sm:px-6 lg:px-8">
        <ErrorBoundary fallbackTitle="An error occurred in this dashboard section">
          {/* ===================================================================
              TAB 1: OVERVIEW & LIVE METRICS
          =================================================================== */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Live Application Activity Counter Cards */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                      Saved Trips
                    </span>
                    <FolderOpen className="h-4 w-4 text-teal-700" />
                  </div>
                  <div className="mt-2 font-serif text-2xl font-bold text-slate-900">
                    {dashboardSummary?.total_trips ?? savedTrips.length}
                  </div>
                  <span className="text-[10px] text-slate-500">Persistent in SQLite</span>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                      Indexed Documents
                    </span>
                    <BookOpen className="h-4 w-4 text-teal-700" />
                  </div>
                  <div className="mt-2 font-serif text-2xl font-bold text-slate-900">
                    {dashboardSummary?.total_documents ?? settingsStatus?.indexed_documents_count ?? 0}
                  </div>
                  <span className="text-[10px] text-slate-500">
                    {dashboardSummary?.total_chunks ?? settingsStatus?.indexed_chunks_count ?? 0} FAISS chunks
                  </span>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                      Workflows Run
                    </span>
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div className="mt-2 font-serif text-2xl font-bold text-slate-900">
                    {dashboardSummary?.total_workflows ?? 1}
                  </div>
                  <span className="text-[10px] text-slate-500">6-stage verifications</span>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                      Pending Tasks
                    </span>
                    <Clock className="h-4 w-4 text-indigo-600" />
                  </div>
                  <div className="mt-2 font-serif text-2xl font-bold text-slate-900">
                    {dashboardSummary?.pending_tasks ?? 0}
                  </div>
                  <span className="text-[10px] text-slate-500">Background workers</span>
                </div>
              </div>

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
                            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                          >
                            <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                            <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                            <Tooltip
                              formatter={(value: any) => [
                                `${trip.preferences.currency} ${Number(value).toLocaleString()}`,
                                'Estimated Cost',
                              ]}
                              contentStyle={{
                                backgroundColor: '#ffffff',
                                borderRadius: '12px',
                                border: '1px solid #e2e8f0',
                                fontSize: '12px',
                              }}
                            />
                            <Bar dataKey="amount" radius={[6, 6, 0, 0]}>
                              {budgetChartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>

                      <p className="mt-3 text-[11px] text-slate-500 italic">
                        Basis: {trip.budget_breakdown.basis_note}
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* Recent Trips & Document Ingestion Quick Switcher */}
              {savedTrips.length > 1 && (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-bold uppercase tracking-wider text-teal-800">
                      Recent Itineraries
                    </span>
                    <button
                      type="button"
                      onClick={() => handleTabChange('settings')}
                      className="text-xs font-semibold text-teal-800 hover:text-teal-950 flex items-center gap-1"
                    >
                      <span>Manage All ({savedTrips.length})</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {savedTrips.slice(0, 3).map((st) => {
                      const isCurrent = st.trip_id === trip.trip_id;
                      return (
                        <button
                          key={st.trip_id}
                          type="button"
                          onClick={() => {
                            if (!isCurrent) {
                              navigate(`/dashboard/${st.trip_id}`);
                            }
                          }}
                          className={`rounded-xl border p-4 text-left transition-all ${
                            isCurrent
                              ? 'border-teal-700 bg-teal-50/50 shadow-xs ring-1 ring-teal-700/20'
                              : 'border-slate-200 bg-[#faf8f5] hover:bg-slate-100/70 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="font-bold text-slate-900 truncate">{st.destination}</span>
                            {isCurrent && (
                              <span className="rounded bg-teal-700 px-1.5 py-0.2 text-[10px] font-bold text-white">
                                Active
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">{st.title}</div>
                          <div className="mt-2 text-[10px] text-slate-400 font-mono">
                            {st.currency} {st.budget_total.toLocaleString()} • {st.duration_days} days
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ===================================================================
              TAB 2: DYNAMIC ITINERARY EDITOR
          =================================================================== */}
          {activeTab === 'itinerary' && (
            <ItineraryEditor
              days={trip.itinerary_days}
              currency={trip.preferences.currency}
              tripId={trip.trip_id}
              onSave={handleSaveItinerary}
              onSelectCitation={setActiveCitation}
            />
          )}

          {/* ===================================================================
              TAB 3: KNOWLEDGE SOURCES
          =================================================================== */}
          {activeTab === 'sources' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-teal-800">
                    Stage 2 Knowledge Retrieval
                  </span>
                  <h2 className="mt-0.5 font-serif text-2xl font-bold text-slate-900">
                    Curated Evidence Corpus ({trip.retrieved_sources.length} Chunks)
                  </h2>
                  <p className="mt-1 text-xs text-slate-600">
                    Ranked by hybrid cosine similarity and BM25 lexical token match. Every claim in the generated plan traces back to one of these chunks.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {trip.retrieved_sources.map((src) => (
                  <div
                    key={src.chunk_id}
                    className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition-shadow hover:shadow-md"
                  >
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-800">
                          {src.category.replace(/_/g, ' ').toUpperCase()}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-teal-800">
                            Hybrid Score: {(src.retrieval_score * 100).toFixed(0)}%
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              src.verification_status === 'Verified in provided documents'
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : 'bg-amber-50 text-amber-900 border border-amber-200'
                            }`}
                          >
                            {src.verification_status}
                          </span>
                        </div>
                      </div>

                      <h4 className="mt-3 font-serif text-base font-bold text-slate-900">
                        {src.document_title}
                      </h4>
                      <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                        {src.page_number && <span>Page {src.page_number}</span>}
                        {src.section_heading && <span>• {src.section_heading}</span>}
                        {src.publication_date && <span>• Published: {src.publication_date}</span>}
                      </div>

                      <div className="mt-3 rounded-xl border border-slate-100 bg-[#faf8f5] p-3 font-serif text-xs leading-relaxed text-slate-700 italic">
                        &quot;{src.excerpt}&quot;
                      </div>

                      {src.matched_topics.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1">
                          {src.matched_topics.map((t, idx) => (
                            <span
                              key={idx}
                              className="rounded bg-teal-50 px-2 py-0.5 text-[10px] font-medium text-teal-800"
                            >
                              #{t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
                      <button
                        type="button"
                        onClick={() => setActiveCitation(src)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-900 hover:bg-teal-100 transition-colors"
                      >
                        <BookOpen className="h-3.5 w-3.5" />
                        <span>Inspect Full Citation</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ===================================================================
              TAB 4: POLICY CHECKS
          =================================================================== */}
          {activeTab === 'policies' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-teal-800">
                    Stage 4 Policy Enforcement
                  </span>
                  <h2 className="mt-0.5 font-serif text-2xl font-bold text-slate-900">
                    Evidence-Backed Policy Validations
                  </h2>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {(['ALL', 'PASS', 'WARNING', 'FAIL', 'UNKNOWN'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setPolicyFilter(st)}
                      className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                        policyFilter === st
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {st} ({st === 'ALL' ? trip.policy_checks.length : policyCounts[st]})
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                {filteredPolicies.map((chk) => (
                  <div
                    key={chk.check_id}
                    className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-6 py-3.5">
                      <span className="text-xs font-bold uppercase text-slate-600">
                        {chk.category}
                      </span>
                      <span
                        className={`rounded-full px-3 py-0.5 text-xs font-bold ${
                          chk.status === 'PASS'
                            ? 'bg-emerald-100 text-emerald-900'
                            : chk.status === 'WARNING'
                            ? 'bg-amber-100 text-amber-900'
                            : chk.status === 'FAIL'
                            ? 'bg-rose-100 text-rose-900'
                            : 'bg-slate-200 text-slate-800'
                        }`}
                      >
                        {chk.status}
                      </span>
                    </div>

                    <div className="p-6 space-y-3">
                      <h4 className="font-serif text-base font-bold text-slate-900">
                        {chk.rule_checked}
                      </h4>
                      <p className="text-xs leading-relaxed text-slate-700">{chk.explanation}</p>

                      {chk.excerpt && (
                        <div className="rounded-xl border border-slate-100 bg-[#faf8f5] p-3 text-xs italic text-slate-600">
                          Supporting Policy Excerpt: &quot;{chk.excerpt}&quot;
                        </div>
                      )}

                      {chk.conflicting_excerpt && (
                        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
                          <strong>Conflict Detected:</strong> &quot;{chk.conflicting_excerpt}&quot;
                        </div>
                      )}

                      <div className="pt-2 text-xs text-slate-600">
                        <strong>Recommended Action:</strong> {chk.recommended_action}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ===================================================================
              TAB 5: MISSING INFORMATION & AUDIT
          =================================================================== */}
          {activeTab === 'missing' && (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-teal-800">
                    Stage 5 Auditing
                  </span>
                  <h2 className="mt-0.5 font-serif text-2xl font-bold text-slate-900">
                    Knowledge Gaps & Freshness Flags
                  </h2>
                </div>

                <div className="flex gap-2">
                  {['all', 'high', 'medium', 'low'].map((sev) => (
                    <button
                      key={sev}
                      type="button"
                      onClick={() => setSeverityFilter(sev)}
                      className={`rounded-xl px-3 py-1.5 text-xs font-bold uppercase transition-all ${
                        severityFilter === sev
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {sev}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {filteredMissing.map((m) => (
                  <div
                    key={m.issue_id}
                    className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs"
                  >
                    <div>
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                        <span className="font-serif text-sm font-bold text-slate-900">{m.title}</span>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                            m.severity === 'high'
                              ? 'bg-rose-100 text-rose-900'
                              : m.severity === 'medium'
                              ? 'bg-amber-100 text-amber-900'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {m.severity} severity
                        </span>
                      </div>
                      <p className="mt-3 text-xs text-slate-600 leading-relaxed">{m.reason}</p>
                      <div className="mt-3 rounded-xl bg-[#faf8f5] p-3 text-xs text-slate-700">
                        <strong>Remediation:</strong> {m.recommended_action}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ===================================================================
              TAB 6: DOCUMENT LIBRARY (PAGINATED & FAST)
          =================================================================== */}
          {activeTab === 'library' && (
            <DocumentLibraryView
              onSelectCitation={(src) => setActiveCitation(src)}
              onDocumentsChanged={() => {
                api.getDashboardSummary().then((s) => s && setDashboardSummary(s));
              }}
            />
          )}

          {/* ===================================================================
              TAB 7: SYSTEM SETTINGS & SAVED TRIPS
          =================================================================== */}
          {activeTab === 'settings' && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs lg:col-span-6">
                <span className="text-xs font-bold uppercase tracking-wider text-teal-800">
                  Configuration Status
                </span>
                <h2 className="mt-1 font-serif text-xl font-bold text-slate-900">
                  Backend Architecture & AI Mode
                </h2>

                {settingsStatus ? (
                  <div className="mt-4 space-y-3 text-xs">
                    <div className="flex justify-between border-b border-slate-100 py-2">
                      <span className="text-slate-500">Retrieval Engine</span>
                      <span className="font-bold text-slate-900">{settingsStatus.vector_store}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-100 py-2">
                      <span className="text-slate-500">Embedding Model</span>
                      <span className="font-bold text-teal-800">
                        {settingsStatus.embedding_backend}
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-slate-100 py-2">
                      <span className="text-slate-500">Location Provider</span>
                      <span className="font-bold text-slate-900">
                        {settingsStatus.location_provider || 'OpenStreetMap Nominatim (+ Local Fallback)'}
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-slate-100 py-2">
                      <span className="text-slate-500">LLM Generation Mode</span>
                      <span className="font-bold text-slate-900">
                        {settingsStatus.llm_mode_description}
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-slate-100 py-2">
                      <span className="text-slate-500">Max Upload Limit</span>
                      <span className="font-bold text-slate-900">
                        {settingsStatus.max_upload_size_mb} MB ({settingsStatus.allowed_extensions.join(', ')})
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 text-xs text-slate-500">Status unavailable.</p>
                )}

                <div className="mt-6 border-t border-slate-100 pt-4">
                  <button
                    type="button"
                    onClick={handleResetDemo}
                    disabled={isReplanning}
                    className="inline-flex items-center gap-2 rounded-xl bg-teal-800 px-4 py-2.5 text-xs font-semibold text-white hover:bg-teal-900 transition-colors disabled:opacity-50"
                  >
                    <Sparkles className="h-4 w-4 text-teal-300" />
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
                    className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-800 transition-colors"
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
                            {st.origin || 'Origin'} → {st.destination} • {st.currency}{' '}
                            {st.budget_total.toLocaleString()} • {st.duration_days} days
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
                              className="rounded-lg bg-slate-900 px-3 py-1.5 font-semibold text-white hover:bg-teal-800 transition-colors"
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
        </ErrorBoundary>
      </div>

      {/* Clickable Citation Source Evidence Inspector Modal */}
      <SourceEvidenceModal
        citation={activeCitation}
        onClose={() => setActiveCitation(null)}
      />
    </div>
  );
};
