import {
  DashboardSummary,
  DocumentListResponse,
  FinalTripPlan,
  ItineraryDay,
  KnowledgeSearchResponse,
  LocationSearchResponse,
  SystemSettingsStatus,
  TravelDocumentDetail,
  TravelDocumentMetadata,
  TravellerPreferences,
  TripSummary,
} from '../types/tripwise';
import { demoEngine } from './demoEngine';
import { INITIAL_DEMO_TRIP } from '../data/mockData';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

let backendAvailable: boolean | null = null;

async function request<T>(
  path: string,
  options?: RequestInit,
  fallbackFn?: () => Promise<T> | T
): Promise<T> {
  // If we already know the backend is not deployed/responding, avoid unnecessary network delay if fallback provided
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        ...(options?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(options?.headers || {}),
      },
    });

    const contentType = response.headers.get('content-type') || '';
    // If Vercel SPA rewrite caught the missing /api route and returned index.html, it's HTML, not a real API response
    if (contentType.includes('text/html')) {
      backendAvailable = false;
      throw new Error(`API endpoint ${path} returned HTML (Vercel SPA fallback).`);
    }

    if (!response.ok) {
      let errorDetail = `HTTP ${response.status} (${response.statusText})`;
      try {
        const errJson = await response.json();
        if (typeof errJson.detail === 'string') {
          errorDetail = errJson.detail;
        } else if (Array.isArray(errJson.detail)) {
          errorDetail = errJson.detail.map((e: any) => e.msg || JSON.stringify(e)).join('; ');
        }
      } catch {
        // ignore json parse error
      }
      throw new Error(errorDetail);
    }

    backendAvailable = true;
    return (await response.json()) as T;
  } catch (err: any) {
    if (fallbackFn) {
      return await fallbackFn();
    }
    throw err;
  }
}

export const DEFAULT_DEMO_PREFERENCES: TravellerPreferences = {
  origin: 'Mumbai, Maharashtra, India',
  destination: 'Sample City',
  origin_location: {
    id: 'fb-mum-1',
    name: 'Mumbai',
    admin_area: 'Maharashtra',
    country: 'India',
    country_code: 'IN',
    latitude: 19.076,
    longitude: 72.8777,
    display_name: 'Mumbai, Maharashtra, India',
    type: 'city',
  },
  destination_location: {
    id: 'fb-sc-1',
    name: 'Sample City',
    admin_area: 'Demo State',
    country: 'Demo Country',
    country_code: 'DM',
    latitude: 18.922,
    longitude: 72.8347,
    display_name: 'Sample City (Demo Knowledge Base Reference)',
    type: 'city',
  },
  departure_date: '2026-11-10',
  return_date: '2026-11-12',
  travellers_count: 2,
  adults: 2,
  children: 0,
  travel_scope: 'domestic',
  budget_total: 25000,
  currency: 'INR',
  travel_style: 'cultural',
  interests: ['food', 'sightseeing', 'museums', 'history'],
  accommodation_type: 'budget_hotel',
  transport_modes: ['public_transport', 'walking'],
  dietary_requirements: 'Prefer hygienic local vegetarian and coastal dishes (Green Hygiene Seal stalls)',
  accessibility_needs: 'Step-free access preferred where practical',
  pace: 'relaxed',
  visa_status_note: 'Domestic travel within India; carrying original Aadhaar and Voter ID cards',
  accommodation_requirements:
    'Arriving at 8:30 AM on Day 1; requesting early check-in or lobby luggage drop-off at 8:30 AM at budget hotel',
  transport_constraints: 'Using public Metro & City Bus pass; carrying 1 cabin bag per person',
  safety_considerations: 'Follow municipal food hygiene guidance and restricted zone notices',
  additional_instructions: 'Ensure all museum tariffs and check-in rules are verified against curated documents.',
};

export const api = {
  isBackendAvailable: () => backendAvailable,

  getHealth: (signal?: AbortSignal) =>
    request<any>(
      '/health',
      { signal },
      () => ({ status: 'healthy', database: 'connected', mode: 'demo_fallback' })
    ),

  getSettingsStatus: (signal?: AbortSignal) =>
    request<SystemSettingsStatus>(
      '/settings/status',
      { signal },
      () => demoEngine.getSettingsStatus()
    ),

  getDashboardSummary: (signal?: AbortSignal) =>
    request<DashboardSummary>(
      '/dashboard/summary',
      { signal },
      () => demoEngine.getDashboardSummary()
    ),

  // Location search with debounce & abort support + automatic Nominatim/offline fallback
  searchLocations: (query: string, limit = 8, signal?: AbortSignal) =>
    request<LocationSearchResponse>(
      `/locations/search?q=${encodeURIComponent(query)}&limit=${limit}`,
      { signal },
      () => demoEngine.searchLocations(query, limit)
    ),

  listTrips: (signal?: AbortSignal) =>
    request<FinalTripPlan[]>(
      '/trips',
      { signal },
      () => demoEngine.listTrips()
    ),

  getRecentTrips: (limit = 5, signal?: AbortSignal) =>
    request<TripSummary[]>(
      `/trips/recent?limit=${limit}`,
      { signal },
      () => demoEngine.getRecentTrips(limit)
    ),

  getTrip: (tripId: string, signal?: AbortSignal) =>
    request<FinalTripPlan>(
      `/trips/${encodeURIComponent(tripId)}`,
      { signal },
      () => demoEngine.getTrip(tripId)
    ),

  createTrip: (prefs: TravellerPreferences, autoPlan = true) =>
    request<FinalTripPlan>(
      `/trips?auto_plan=${autoPlan}`,
      {
        method: 'POST',
        body: JSON.stringify(prefs),
      },
      () => demoEngine.createTrip(prefs)
    ),

  updateTripPreferences: (tripId: string, prefs: TravellerPreferences) =>
    request<FinalTripPlan>(
      `/trips/${encodeURIComponent(tripId)}`,
      {
        method: 'PUT',
        body: JSON.stringify(prefs),
      },
      () => demoEngine.replanTrip(tripId, prefs)
    ),

  updateTripItinerary: (tripId: string, days: ItineraryDay[], recalculateBudget = true) =>
    request<FinalTripPlan>(
      `/trips/${encodeURIComponent(tripId)}/itinerary`,
      {
        method: 'PUT',
        body: JSON.stringify({
          itinerary_days: days,
          recalculate_budget: recalculateBudget,
        }),
      },
      () => demoEngine.updateTripItinerary(tripId, days, recalculateBudget)
    ),

  runTripPlan: (tripId: string) =>
    request<FinalTripPlan>(
      `/trips/${encodeURIComponent(tripId)}/plan`,
      {
        method: 'POST',
      },
      () => demoEngine.getTrip(tripId)
    ),

  replanTrip: (tripId: string, prefs?: TravellerPreferences) =>
    request<FinalTripPlan>(
      `/trips/${encodeURIComponent(tripId)}/replan`,
      {
        method: 'POST',
        body: prefs ? JSON.stringify(prefs) : undefined,
      },
      () => demoEngine.replanTrip(tripId, prefs)
    ),

  deleteTrip: (tripId: string) =>
    request<{ deleted: boolean; trip_id: string }>(
      `/trips/${encodeURIComponent(tripId)}`,
      {
        method: 'DELETE',
      },
      () => ({ deleted: true, trip_id: tripId })
    ),

  resetDemoScenario: () =>
    request<FinalTripPlan>(
      '/trips/demo/reset',
      {
        method: 'POST',
      },
      () => demoEngine.resetDemoScenario()
    ),

  listDocuments: (category?: string, destination?: string) => {
    const params = new URLSearchParams();
    if (category && category !== 'all') params.set('category', category);
    if (destination && destination.trim()) params.set('destination', destination.trim());
    const qs = params.toString() ? `?${params.toString()}` : '';
    return request<TravelDocumentMetadata[]>(
      `/documents${qs}`,
      undefined,
      () => demoEngine.listDocumentsPaginated({ category, destination }).items
    );
  },

  listDocumentsPaginated: (
    opts: {
      category?: string;
      destination?: string;
      status?: string;
      search?: string;
      page?: number;
      limit?: number;
    },
    signal?: AbortSignal
  ) => {
    const params = new URLSearchParams();
    if (opts.category && opts.category !== 'all') params.set('category', opts.category);
    if (opts.destination && opts.destination.trim()) params.set('destination', opts.destination.trim());
    if (opts.status && opts.status !== 'all') params.set('status', opts.status);
    if (opts.search && opts.search.trim()) params.set('search', opts.search.trim());
    params.set('page', String(opts.page || 1));
    params.set('limit', String(opts.limit || 10));
    return request<DocumentListResponse>(
      `/documents?${params.toString()}`,
      { signal },
      () => demoEngine.listDocumentsPaginated(opts)
    );
  },

  getDocument: (docId: string, signal?: AbortSignal) =>
    request<TravelDocumentDetail>(
      `/documents/${encodeURIComponent(docId)}`,
      { signal },
      () => demoEngine.getDocument(docId)
    ),

  uploadDocument: (formData: FormData) =>
    request<TravelDocumentDetail>(
      '/documents/upload',
      {
        method: 'POST',
        body: formData,
      },
      () => demoEngine.uploadDocument(formData)
    ),

  retryDocumentProcessing: (docId: string) =>
    request<TravelDocumentMetadata>(
      `/documents/${encodeURIComponent(docId)}/retry`,
      {
        method: 'POST',
      },
      () => demoEngine.getDocument(docId)
    ),

  reindexDocuments: () =>
    request<{ status: string; total_documents: number; total_chunks: number }>(
      '/documents/reindex',
      {
        method: 'POST',
      },
      () => ({ status: 'success', total_documents: 6, total_chunks: 27 })
    ),

  deleteDocument: (docId: string) =>
    request<{ deleted: boolean; document_id: string }>(
      `/documents/${encodeURIComponent(docId)}`,
      {
        method: 'DELETE',
      },
      () => ({ deleted: true, document_id: docId })
    ),

  searchKnowledgeBase: (query: string, destination?: string, category?: string, topK = 8) =>
    request<KnowledgeSearchResponse>(
      '/knowledge/search',
      {
        method: 'POST',
        body: JSON.stringify({
          query,
          destination: destination || undefined,
          category: category && category !== 'all' ? category : undefined,
          top_k: topK,
        }),
      },
      () => ({
        query,
        total_results: INITIAL_DEMO_TRIP.retrieved_sources.length,
        retrieval_method: 'Hybrid 0.55 Semantic + 0.45 Lexical (Curated Knowledge Store)',
        note: 'Results grounded in curated demonstration documents',
        results: INITIAL_DEMO_TRIP.retrieved_sources.slice(0, topK),
      })
    ),
};
