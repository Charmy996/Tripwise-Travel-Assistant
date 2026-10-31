import {
  DashboardSummary,
  DocumentListResponse,
  FinalTripPlan,
  ItineraryDay,
  LocationModel,
  LocationSearchResponse,
  SystemSettingsStatus,
  TravelDocumentDetail,
  TravelDocumentMetadata,
  TravellerPreferences,
  TripSummary,
} from '../types/tripwise';
import {
  INITIAL_DEMO_DOCUMENTS,
  INITIAL_DEMO_DOCUMENT_DETAILS,
  INITIAL_DEMO_SUMMARY,
  INITIAL_DEMO_TRIP,
} from '../data/mockData';

const STORAGE_KEY_TRIPS = 'tripwise_saved_trips';
const STORAGE_KEY_DOCS = 'tripwise_documents';

// Curated high-priority major travel destinations for offline fallback
const CURATED_CITIES: LocationModel[] = [
  { id: 'cur-mum-1', name: 'Mumbai', admin_area: 'Maharashtra', country: 'India', country_code: 'IN', latitude: 19.076, longitude: 72.8777, display_name: 'Mumbai, Maharashtra, India', type: 'city' },
  { id: 'cur-del-1', name: 'New Delhi', admin_area: 'Delhi', country: 'India', country_code: 'IN', latitude: 28.6139, longitude: 77.209, display_name: 'New Delhi, Delhi, India', type: 'city' },
  { id: 'cur-blr-1', name: 'Bengaluru', admin_area: 'Karnataka', country: 'India', country_code: 'IN', latitude: 12.9716, longitude: 77.5946, display_name: 'Bengaluru, Karnataka, India', type: 'city' },
  { id: 'cur-lon-1', name: 'London', admin_area: 'Greater London', country: 'United Kingdom', country_code: 'GB', latitude: 51.5074, longitude: -0.1278, display_name: 'London, Greater London, United Kingdom', type: 'city' },
  { id: 'cur-nyc-1', name: 'New York', admin_area: 'New York', country: 'United States', country_code: 'US', latitude: 40.7128, longitude: -74.006, display_name: 'New York, United States', type: 'city' },
  { id: 'cur-par-1', name: 'Paris', admin_area: 'Île-de-France', country: 'France', country_code: 'FR', latitude: 48.8566, longitude: 2.3522, display_name: 'Paris, Île-de-France, France', type: 'city' },
  { id: 'cur-tok-1', name: 'Tokyo', admin_area: 'Tokyo', country: 'Japan', country_code: 'JP', latitude: 35.6762, longitude: 139.6503, display_name: 'Tokyo, Japan', type: 'city' },
  { id: 'cur-dxb-1', name: 'Dubai', admin_area: 'Dubai', country: 'United Arab Emirates', country_code: 'AE', latitude: 25.2048, longitude: 55.2708, display_name: 'Dubai, United Arab Emirates', type: 'city' },
  { id: 'cur-sin-1', name: 'Singapore', admin_area: 'Singapore', country: 'Singapore', country_code: 'SG', latitude: 1.3521, longitude: 103.8198, display_name: 'Singapore, Singapore', type: 'city' },
  { id: 'cur-sc-1', name: 'Sample City', admin_area: 'Demo Region', country: 'Demo Country', country_code: 'DM', latitude: 18.922, longitude: 72.8347, display_name: 'Sample City (Curated Demonstration Dataset)', type: 'city' },
  { id: 'cur-jai-1', name: 'Jaipur', admin_area: 'Rajasthan', country: 'India', country_code: 'IN', latitude: 26.9124, longitude: 75.7873, display_name: 'Jaipur, Rajasthan, India', type: 'city' },
  { id: 'cur-uda-1', name: 'Udaipur', admin_area: 'Rajasthan', country: 'India', country_code: 'IN', latitude: 24.5854, longitude: 73.7125, display_name: 'Udaipur, Rajasthan, India', type: 'city' },
  { id: 'cur-goa-1', name: 'Goa', admin_area: 'Goa', country: 'India', country_code: 'IN', latitude: 15.2993, longitude: 74.124, display_name: 'Goa, India', type: 'city' },
  { id: 'cur-koc-1', name: 'Kochi', admin_area: 'Kerala', country: 'India', country_code: 'IN', latitude: 9.9312, longitude: 76.2673, display_name: 'Kochi, Kerala, India', type: 'city' },
];

function getStoredTrips(): FinalTripPlan[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TRIPS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // ignore
  }
  return [INITIAL_DEMO_TRIP];
}

function saveStoredTrips(trips: FinalTripPlan[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_TRIPS, JSON.stringify(trips));
  } catch {
    // ignore
  }
}

function getStoredDocs(): TravelDocumentMetadata[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DOCS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // ignore
  }
  return INITIAL_DEMO_DOCUMENTS;
}

export const demoEngine = {
  getSettingsStatus(): SystemSettingsStatus {
    return {
      app_name: 'TripWise AI',
      version: '2.0.0',
      llm_provider: 'local_demo',
      llm_model: 'gpt-4o-mini',
      llm_configured: false,
      llm_mode_description: 'Deterministic evidence-grounded demonstration mode (local)',
      embedding_backend: 'all-MiniLM-L6-v2',
      vector_store: 'faiss_index_flat_ip',
      indexed_documents_count: 6,
      indexed_chunks_count: 27,
      live_verification_enabled: false,
      live_advisory_configured: false,
      live_weather_configured: false,
      max_upload_size_mb: 25,
      allowed_extensions: ['.pdf', '.md', '.txt'],
      location_provider: 'osm_nominatim_with_fallback',
    };
  },

  getDashboardSummary(): DashboardSummary {
    const trips = getStoredTrips();
    const docs = getStoredDocs();
    const recentTrips: TripSummary[] = trips.slice(0, 5).map((t) => ({
      trip_id: t.trip_id,
      title: t.title,
      destination: t.preferences.destination,
      origin: t.preferences.origin,
      created_at: t.created_at,
      updated_at: t.updated_at,
      duration_days: t.itinerary_days.length || 3,
      travel_style: t.preferences.travel_style,
      budget_total: t.preferences.budget_total,
      currency: t.preferences.currency,
      verification_summary_status: t.verification_summary_status,
      is_fully_verified: t.is_fully_verified,
    }));

    return {
      total_trips: trips.length,
      total_documents: docs.length,
      total_chunks: docs.reduce((acc, d) => acc + (d.chunk_count || 4), 0),
      total_workflows: trips.length,
      pending_tasks: 0,
      recent_trips: recentTrips,
      recent_documents: docs.slice(0, 5),
      policy_warning_summary: INITIAL_DEMO_SUMMARY.policy_warning_summary,
    };
  },

  getTrip(tripId: string): FinalTripPlan {
    const trips = getStoredTrips();
    const found = trips.find((t) => t.trip_id === tripId);
    return found || trips[0] || INITIAL_DEMO_TRIP;
  },

  getRecentTrips(limit = 5): TripSummary[] {
    const trips = getStoredTrips();
    return trips.slice(0, limit).map((t) => ({
      trip_id: t.trip_id,
      title: t.title,
      destination: t.preferences.destination,
      origin: t.preferences.origin,
      created_at: t.created_at,
      updated_at: t.updated_at,
      duration_days: t.itinerary_days.length || 3,
      travel_style: t.preferences.travel_style,
      budget_total: t.preferences.budget_total,
      currency: t.preferences.currency,
      verification_summary_status: t.verification_summary_status,
      is_fully_verified: t.is_fully_verified,
    }));
  },

  listTrips(): FinalTripPlan[] {
    return getStoredTrips();
  },

  resetDemoScenario(): FinalTripPlan {
    const trips = getStoredTrips().filter((t) => t.trip_id !== INITIAL_DEMO_TRIP.trip_id);
    const updated = [INITIAL_DEMO_TRIP, ...trips];
    saveStoredTrips(updated);
    return INITIAL_DEMO_TRIP;
  },

  updateTripItinerary(tripId: string, days: ItineraryDay[], recalculateBudget = true): FinalTripPlan {
    const trips = getStoredTrips();
    let currentTrip = trips.find((t) => t.trip_id === tripId) || INITIAL_DEMO_TRIP;

    let updatedDays = days;
    let totalActivitiesCost = 0;

    if (recalculateBudget) {
      updatedDays = days.map((day) => {
        const morningCost = (day.morning || []).reduce((s, a) => s + (a.estimated_cost || 0), 0);
        const afternoonCost = (day.afternoon || []).reduce((s, a) => s + (a.estimated_cost || 0), 0);
        const eveningCost = (day.evening || []).reduce((s, a) => s + (a.estimated_cost || 0), 0);
        const dayTotal = morningCost + afternoonCost + eveningCost;
        totalActivitiesCost += dayTotal;
        return {
          ...day,
          daily_estimated_cost: dayTotal,
        };
      });
    }

    const accommodationEstimate = currentTrip.budget_breakdown?.accommodation_estimate || 6400;
    const transportEstimate = currentTrip.budget_breakdown?.transport_estimate || 1800;
    const foodAndDiningEstimate = currentTrip.budget_breakdown?.food_and_dining_estimate || 4800;
    const contingencyBuffer = currentTrip.budget_breakdown?.contingency_buffer || 2500;
    const newTotalEstimate = accommodationEstimate + transportEstimate + totalActivitiesCost + foodAndDiningEstimate + contingencyBuffer;

    const updatedTrip: FinalTripPlan = {
      ...currentTrip,
      itinerary_days: updatedDays,
      updated_at: new Date().toISOString(),
      budget_breakdown: currentTrip.budget_breakdown
        ? {
            ...currentTrip.budget_breakdown,
            activities_and_entry_estimate: totalActivitiesCost,
            total_estimated_cost: newTotalEstimate,
            within_budget: newTotalEstimate <= currentTrip.preferences.budget_total,
            budget_utilization_percent: Math.round(
              (newTotalEstimate / (currentTrip.preferences.budget_total || 25000)) * 100
            ),
          }
        : currentTrip.budget_breakdown,
    };

    const newTrips = trips.map((t) => (t.trip_id === tripId ? updatedTrip : t));
    if (!trips.some((t) => t.trip_id === tripId)) newTrips.push(updatedTrip);
    saveStoredTrips(newTrips);
    return updatedTrip;
  },

  replanTrip(tripId: string, prefs?: TravellerPreferences): FinalTripPlan {
    const currentTrip = this.getTrip(tripId);
    const effectivePrefs = prefs || currentTrip.preferences;

    // Check if user performed early-arrival quick-fix (setting arrival to 3:30 PM / 15:30)
    const isQuickFixApplied =
      effectivePrefs.accommodation_requirements?.includes('3:30 PM') ||
      effectivePrefs.accommodation_requirements?.includes('15:30');

    let updatedChecks = currentTrip.policy_checks;
    let newStatus = currentTrip.verification_summary_status;
    let isFullyVerified = currentTrip.is_fully_verified;

    if (isQuickFixApplied) {
      updatedChecks = currentTrip.policy_checks.map((check) => {
        if (check.check_id === 'policy-check-hotel-early-arrival') {
          return {
            ...check,
            status: 'PASS' as const,
            rule_checked: 'Hotel Check-In & Arrival Time Policy',
            explanation:
              'Early arrival conflict resolved: Arrival scheduled for 3:30 PM (after standard 3:00 PM check-in and past the 10:00 AM restriction window). Luggage drop-off compliant with Harbourview Budget Inn Policy Page 2.',
          };
        }
        return check;
      });
      newStatus = 'All Checks Verified — No Blocking Policy Conflicts Detected';
      isFullyVerified = true;
    }

    const updatedTrip: FinalTripPlan = {
      ...currentTrip,
      preferences: effectivePrefs,
      policy_checks: updatedChecks,
      verification_summary_status: newStatus,
      is_fully_verified: isFullyVerified,
      updated_at: new Date().toISOString(),
    };

    const trips = getStoredTrips().map((t) => (t.trip_id === tripId ? updatedTrip : t));
    saveStoredTrips(trips);
    return updatedTrip;
  },

  createTrip(prefs: TravellerPreferences): FinalTripPlan {
    const newId = `trip-${Date.now()}`;
    const destination = prefs.destination || 'Sample Destination';

    const newTrip: FinalTripPlan = {
      ...INITIAL_DEMO_TRIP,
      trip_id: newId,
      title: `${destination} — 3-Day Curated Plan`,
      preferences: prefs,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      verification_summary_status: 'Fully Verified — Supported by Curated Evidence',
      is_fully_verified: true,
    };

    const trips = [newTrip, ...getStoredTrips()];
    saveStoredTrips(trips);
    return newTrip;
  },

  async searchLocations(query: string, limit = 8): Promise<LocationSearchResponse> {
    const q = query.trim().toLowerCase();
    if (!q || q.length < 2) {
      return {
        query,
        results: [],
        total: 0,
        cached: false,
        provider: 'offline_fallback',
        attribution: 'Data © OpenStreetMap contributors, ODbL 1.0',
      };
    }

    // 1. Check curated top travel destinations
    const matchedCurated = CURATED_CITIES.filter(
      (c) => c.name.toLowerCase().includes(q) || c.country.toLowerCase().includes(q)
    );

    // 2. Try direct Nominatim browser query
    let remoteResults: LocationModel[] = [];
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
        query
      )}&format=jsonv2&addressdetails=1&limit=${limit}`;

      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'Accept-Language': 'en' },
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          remoteResults = data.map((item: any) => ({
            id: `osm-${item.place_id}`,
            name:
              item.address?.city ||
              item.address?.town ||
              item.address?.village ||
              item.name ||
              query,
            admin_area: item.address?.state || item.address?.region || '',
            country: item.address?.country || '',
            country_code: (item.address?.country_code || '').toUpperCase(),
            latitude: parseFloat(item.lat),
            longitude: parseFloat(item.lon),
            display_name: item.display_name,
            type: 'city',
          }));
        }
      }
    } catch {
      // Fallback cleanly on network failure
    }

    // Blend curated + remote results, deduplicating by normalized name
    const seen = new Set<string>();
    const combined: LocationModel[] = [];

    for (const item of [...matchedCurated, ...remoteResults]) {
      const key = `${item.name.toLowerCase()}-${item.country.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        combined.push(item);
        if (combined.length >= limit) break;
      }
    }

    return {
      query,
      results: combined,
      total: combined.length,
      cached: false,
      provider: remoteResults.length > 0 ? 'nominatim' : 'offline_fallback',
      attribution: 'Data © OpenStreetMap contributors, ODbL 1.0',
    };
  },

  listDocumentsPaginated(opts: {
    category?: string;
    destination?: string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): DocumentListResponse {
    let docs = getStoredDocs();

    if (opts.category && opts.category !== 'all') {
      docs = docs.filter((d) => d.category === opts.category);
    }
    if (opts.destination && opts.destination.trim()) {
      docs = docs.filter((d) => d.destination.toLowerCase().includes(opts.destination!.toLowerCase()));
    }
    if (opts.search && opts.search.trim()) {
      const s = opts.search.toLowerCase();
      docs = docs.filter((d) => d.title.toLowerCase().includes(s) || d.filename.toLowerCase().includes(s));
    }

    const page = opts.page || 1;
    const limit = opts.limit || 10;
    const offset = (page - 1) * limit;
    const paginated = docs.slice(offset, offset + limit);

    return {
      items: paginated,
      total: docs.length,
      page,
      limit,
      total_pages: Math.max(1, Math.ceil(docs.length / limit)),
    };
  },

  getDocument(docId: string): TravelDocumentDetail {
    const detail = INITIAL_DEMO_DOCUMENT_DETAILS[docId];
    if (detail) return detail;

    const docs = getStoredDocs();
    const meta = docs.find((d) => d.document_id === docId);
    return {
      ...(meta || INITIAL_DEMO_DOCUMENTS[0]),
      full_text: 'Document extracted content preview loaded from verified knowledge base.',
      chunks: [],
    };
  },

  uploadDocument(formData: FormData): TravelDocumentDetail {
    const file = formData.get('file') as File | null;
    const filename = file?.name || 'uploaded_document.pdf';
    const category = (formData.get('category') as string) || 'destination_guide';
    const destination = (formData.get('destination') as string) || 'General';

    const newDocId = `doc-${Date.now()}`;
    const newDoc: TravelDocumentMetadata = {
      document_id: newDocId,
      title: filename.replace(/\.[^/.]+$/, ''),
      filename: filename,
      file_type: filename.endsWith('.pdf') ? 'pdf' : filename.endsWith('.md') ? 'md' : 'txt',
      file_size_bytes: file?.size || 12400,
      category: category as any,
      authority: 'user_uploaded',
      destination: destination,
      publication_date: new Date().toISOString().split('T')[0],
      last_verified_date: new Date().toISOString().split('T')[0],
      content_hash: `hash-${newDocId}`,
      chunk_count: 3,
      page_count: 1,
      is_demonstration: false,
      processing_status: 'completed',
      created_at: new Date().toISOString(),
      summary_excerpt: `Extracted summary excerpt for ${filename}. Indexed into demonstration vector store.`,
    };

    const docs = [newDoc, ...getStoredDocs()];
    try {
      localStorage.setItem(STORAGE_KEY_DOCS, JSON.stringify(docs));
    } catch {
      // ignore
    }

    return {
      ...newDoc,
      full_text: `Extracted content for ${filename}. Successfully chunked and indexed into demonstration vector store.`,
      chunks: [],
    };
  },
};
