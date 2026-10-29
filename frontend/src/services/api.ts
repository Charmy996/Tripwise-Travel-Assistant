import {
  FinalTripPlan,
  KnowledgeSearchResponse,
  SystemSettingsStatus,
  TravelDocumentDetail,
  TravelDocumentMetadata,
  TravellerPreferences,
} from '../types/tripwise';

const rawBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
const API_BASE = rawBase ? rawBase.replace(/\/+$/, '') : '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options?.headers || {}),
    },
  });

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
      // ignore json parse errors
    }
    throw new Error(errorDetail);
  }

  return response.json() as Promise<T>;
}

export const DEFAULT_DEMO_PREFERENCES: TravellerPreferences = {
  origin: 'Mumbai, India',
  destination: 'Sample City',
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
  getHealth: () => request<any>('/health'),
  getSettingsStatus: () => request<SystemSettingsStatus>('/settings/status'),

  listTrips: () => request<FinalTripPlan[]>('/trips'),
  getTrip: (tripId: string) => request<FinalTripPlan>(`/trips/${encodeURIComponent(tripId)}`),
  createTrip: (prefs: TravellerPreferences, autoPlan = true) =>
    request<FinalTripPlan>(`/trips?auto_plan=${autoPlan}`, {
      method: 'POST',
      body: JSON.stringify(prefs),
    }),
  updateTripPreferences: (tripId: string, prefs: TravellerPreferences) =>
    request<FinalTripPlan>(`/trips/${encodeURIComponent(tripId)}`, {
      method: 'PUT',
      body: JSON.stringify(prefs),
    }),
  runTripPlan: (tripId: string) =>
    request<FinalTripPlan>(`/trips/${encodeURIComponent(tripId)}/plan`, {
      method: 'POST',
    }),
  replanTrip: (tripId: string, prefs?: TravellerPreferences) =>
    request<FinalTripPlan>(`/trips/${encodeURIComponent(tripId)}/replan`, {
      method: 'POST',
      body: prefs ? JSON.stringify(prefs) : undefined,
    }),
  deleteTrip: (tripId: string) =>
    request<{ deleted: boolean; trip_id: string }>(`/trips/${encodeURIComponent(tripId)}`, {
      method: 'DELETE',
    }),
  resetDemoScenario: () =>
    request<FinalTripPlan>('/trips/demo/reset', {
      method: 'POST',
    }),

  listDocuments: (category?: string, destination?: string) => {
    const params = new URLSearchParams();
    if (category && category !== 'all') params.set('category', category);
    if (destination && destination.trim()) params.set('destination', destination.trim());
    const qs = params.toString() ? `?${params.toString()}` : '';
    return request<TravelDocumentMetadata[]>(`/documents${qs}`);
  },
  getDocument: (docId: string) =>
    request<TravelDocumentDetail>(`/documents/${encodeURIComponent(docId)}`),
  uploadDocument: (formData: FormData) =>
    request<TravelDocumentDetail>('/documents/upload', {
      method: 'POST',
      body: formData,
    }),
  reindexDocuments: () =>
    request<{ status: string; total_documents: number; total_chunks: number }>('/documents/reindex', {
      method: 'POST',
    }),
  deleteDocument: (docId: string) =>
    request<{ deleted: boolean; document_id: string }>(`/documents/${encodeURIComponent(docId)}`, {
      method: 'DELETE',
    }),

  searchKnowledgeBase: (query: string, destination?: string, category?: string, topK = 8) =>
    request<KnowledgeSearchResponse>('/knowledge/search', {
      method: 'POST',
      body: JSON.stringify({
        query,
        destination: destination || undefined,
        category: category && category !== 'all' ? category : undefined,
        top_k: topK,
      }),
    }),
};
