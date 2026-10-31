import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  MapPin,
  Calendar,
  Users,
  Wallet,
  Sparkles,
  ShieldCheck,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Sliders,
  FileCheck2,
  Edit3,
} from 'lucide-react';
import { api, DEFAULT_DEMO_PREFERENCES } from '../services/api';
import { PaceType, TravelScopeType, TravelStyleType, TravellerPreferences } from '../types/tripwise';
import { CityAutocomplete } from '../components/CityAutocomplete';

const INTEREST_OPTIONS = [
  'food',
  'sightseeing',
  'museums',
  'history',
  'nature',
  'shopping',
  'nightlife',
  'beaches',
  'photography',
];

const TRANSPORT_OPTIONS = [
  { id: 'public_transport', label: 'Public Transport (Metro / Bus)' },
  { id: 'walking', label: 'Walking & Pedestrian Routes' },
  { id: 'taxi_cab', label: 'Licensed Taxi / Rideshare' },
  { id: 'rental_car', label: 'Private Car / Rental' },
];

export const TripWizardPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState<number>(1);
  const [prefs, setPrefs] = useState<TravellerPreferences>({
    ...DEFAULT_DEMO_PREFERENCES,
  });
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    const destParam = searchParams.get('destination');
    if (destParam && destParam.trim()) {
      setPrefs((prev) => ({ ...prev, destination: destParam.trim() }));
    }
  }, [searchParams]);

  const validateCurrentStep = (targetStep: number): string | null => {
    if (targetStep >= 1) {
      if (!prefs.origin.trim()) return 'Origin city is required.';
      if (!prefs.destination.trim()) return 'Destination city or region is required.';
      const normOrigin = (prefs.origin_location?.name || prefs.origin).trim().toLowerCase();
      const normDest = (prefs.destination_location?.name || prefs.destination).trim().toLowerCase();
      if (normOrigin === normDest) {
        return 'Origin and Destination cities cannot be identical. Please select different cities.';
      }
      if (!prefs.departure_date || !prefs.return_date) {
        return 'Both departure date and return date are required.';
      }
      if (prefs.return_date < prefs.departure_date) {
        return 'Return date cannot precede departure date.';
      }
      if (prefs.adults < 1 || prefs.travellers_count < 1) {
        return 'At least 1 adult traveller is required.';
      }
    }
    if (targetStep >= 2) {
      if (!prefs.budget_total || prefs.budget_total <= 0) {
        return 'Total budget must be greater than zero.';
      }
      if (prefs.interests.length === 0) {
        return 'Please select at least one travel interest.';
      }
      if (prefs.transport_modes.length === 0) {
        return 'Please select at least one preferred transport mode.';
      }
    }
    return null;
  };

  const handleNextStep = () => {
    const err = validateCurrentStep(step);
    if (err) {
      setValidationError(err);
      return;
    }
    setValidationError(null);
    setStep((s) => Math.min(4, s + 1));
  };

  const handlePrevStep = () => {
    setValidationError(null);
    setStep((s) => Math.max(1, s - 1));
  };

  const toggleInterest = (interest: string) => {
    setPrefs((prev) => {
      const exists = prev.interests.includes(interest);
      const next = exists
        ? prev.interests.filter((i) => i !== interest)
        : [...prev.interests, interest];
      return { ...prev, interests: next };
    });
  };

  const toggleTransport = (mode: string) => {
    setPrefs((prev) => {
      const exists = prev.transport_modes.includes(mode);
      const next = exists
        ? prev.transport_modes.filter((m) => m !== mode)
        : [...prev.transport_modes, mode];
      return { ...prev, transport_modes: next };
    });
  };

  const handleLoadDemoPreset = () => {
    setPrefs({ ...DEFAULT_DEMO_PREFERENCES });
    setValidationError(null);
  };

  const handleSubmitPlan = async () => {
    if (isSubmitting) return;
    const err = validateCurrentStep(3);
    if (err) {
      setValidationError(err);
      return;
    }
    setValidationError(null);
    setIsSubmitting(true);
    try {
      const createdPlan = await api.createTrip(prefs, true);
      navigate(`/dashboard/${createdPlan.trip_id}`);
    } catch (error: any) {
      setValidationError(error.message || 'Failed to execute planning workflow.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const durationDays = (() => {
    if (!prefs.departure_date || !prefs.return_date) return 0;
    const d1 = new Date(prefs.departure_date);
    const d2 = new Date(prefs.return_date);
    const diff = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    return diff > 0 ? diff : 0;
  })();

  return (
    <div className="min-h-screen bg-[#faf8f5] py-10">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        {/* Header & Demo Preset Button */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-teal-800">
              Multi-Step Trip Configuration
            </span>
            <h1 className="mt-1 font-serif text-3xl font-bold text-slate-900">
              Plan Your Evidence-Backed Itinerary
            </h1>
          </div>

          <button
            type="button"
            onClick={handleLoadDemoPreset}
            className="inline-flex items-center gap-1.5 rounded-xl border border-teal-700/30 bg-teal-50 px-3.5 py-2 text-xs font-semibold text-teal-900 transition-colors hover:bg-teal-100"
          >
            <Sparkles className="h-3.5 w-3.5 text-teal-700" />
            <span>Load Mumbai → Sample City Demo Preset</span>
          </button>
        </div>

        {/* 4-Step Progress Indicator */}
        <div className="mt-8 grid grid-cols-4 gap-2 sm:gap-4">
          {[
            { num: 1, title: 'Destination & Dates' },
            { num: 2, title: 'Style & Preferences' },
            { num: 3, title: 'Policy Constraints' },
            { num: 4, title: 'Review & Verify' },
          ].map((item) => {
            const active = step === item.num;
            const done = step > item.num;
            return (
              <button
                key={item.num}
                type="button"
                onClick={() => {
                  if (item.num < step) {
                    setValidationError(null);
                    setStep(item.num);
                  }
                }}
                className={`flex flex-col rounded-xl border p-3 text-left transition-all ${
                  active
                    ? 'border-teal-700 bg-white shadow-sm ring-2 ring-teal-700/15'
                    : done
                    ? 'border-teal-200 bg-teal-50/50 cursor-pointer'
                    : 'border-slate-200 bg-white/60 opacity-75'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                      active
                        ? 'bg-teal-700 text-white'
                        : done
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {done ? '✓' : item.num}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Step {item.num}
                  </span>
                </div>
                <span className="mt-2 text-xs font-bold text-slate-900 line-clamp-1">
                  {item.title}
                </span>
              </button>
            );
          })}
        </div>

        {/* Validation Alert */}
        {validationError && (
          <div
            role="alert"
            className="mt-6 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"
          >
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
            <div>
              <p className="font-semibold">Please resolve the following input issue:</p>
              <p className="mt-0.5 text-xs">{validationError}</p>
            </div>
          </div>
        )}

        {/* Form Card */}
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          {/* STEP 1: DESTINATION & DATES */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="border-b border-slate-100 pb-4">
                <h2 className="font-serif text-xl font-bold text-slate-900">
                  Step 1: Destination, Dates & Travellers
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Tip: Enter <strong>Sample City</strong> to test against the 6 seeded demonstration documents, or enter any city to test custom uploads / missing-evidence handling.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <CityAutocomplete
                    label="Origin City"
                    placeholder="Type origin city (e.g. Mum, New, Lon)..."
                    value={prefs.origin}
                    selectedLocation={prefs.origin_location}
                    onChange={(loc, textVal) =>
                      setPrefs((prev) => ({
                        ...prev,
                        origin: textVal,
                        origin_location: loc,
                      }))
                    }
                    required
                  />
                  {prefs.origin_location && (
                    <div className="mt-1 text-[11px] text-slate-500 flex items-center gap-1">
                      <span>Coordinates: {prefs.origin_location.latitude?.toFixed(3)}, {prefs.origin_location.longitude?.toFixed(3)}</span>
                      <span>•</span>
                      <span>{prefs.origin_location.country}</span>
                    </div>
                  )}
                </div>

                <div>
                  <CityAutocomplete
                    label="Destination City or Region"
                    placeholder="Type destination (e.g. Sample City, Lon, Del)..."
                    value={prefs.destination}
                    selectedLocation={prefs.destination_location}
                    onChange={(loc, textVal) =>
                      setPrefs((prev) => ({
                        ...prev,
                        destination: textVal,
                        destination_location: loc,
                      }))
                    }
                    required
                  />
                  {prefs.destination_location && (
                    <div className="mt-1 text-[11px] text-slate-500 flex items-center gap-1">
                      <span>Coordinates: {prefs.destination_location.latitude?.toFixed(3)}, {prefs.destination_location.longitude?.toFixed(3)}</span>
                      <span>•</span>
                      <span>{prefs.destination_location.country}</span>
                    </div>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="departure-date-input"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Departure Date *
                  </label>
                  <input
                    id="departure-date-input"
                    type="date"
                    value={prefs.departure_date}
                    onChange={(e) => setPrefs({ ...prefs, departure_date: e.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-teal-700 focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="return-date-input"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Return Date * {durationDays > 0 && `(${durationDays} inclusive days)`}
                  </label>
                  <input
                    id="return-date-input"
                    type="date"
                    value={prefs.return_date}
                    onChange={(e) => setPrefs({ ...prefs, return_date: e.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-teal-700 focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="adults-input"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Adults (18+) *
                  </label>
                  <input
                    id="adults-input"
                    type="number"
                    min={1}
                    max={30}
                    value={prefs.adults}
                    onChange={(e) => {
                      const adults = Math.max(1, Number(e.target.value) || 1);
                      setPrefs({
                        ...prefs,
                        adults,
                        travellers_count: adults + prefs.children,
                      });
                    }}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-teal-700 focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="children-input"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Children (Under 18)
                  </label>
                  <input
                    id="children-input"
                    type="number"
                    min={0}
                    max={20}
                    value={prefs.children}
                    onChange={(e) => {
                      const children = Math.max(0, Number(e.target.value) || 0);
                      setPrefs({
                        ...prefs,
                        children,
                        travellers_count: prefs.adults + children,
                      });
                    }}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-teal-700 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Travel Scope *
                </label>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  {(['domestic', 'international'] as TravelScopeType[]).map((scope) => (
                    <button
                      key={scope}
                      type="button"
                      onClick={() => setPrefs({ ...prefs, travel_scope: scope })}
                      className={`rounded-xl border px-4 py-3 text-left text-xs font-semibold transition-all ${
                        prefs.travel_scope === scope
                          ? 'border-teal-700 bg-teal-50/70 text-teal-950 ring-1 ring-teal-700'
                          : 'border-slate-200 bg-[#faf8f5] text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div className="capitalize">{scope} Travel</div>
                      <div className="mt-0.5 text-[11px] font-normal text-slate-500">
                        {scope === 'domestic'
                          ? 'Government photo ID & regional entry permit validation'
                          : 'Passport validity, visa guidance & embassy advisory checks'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: PREFERENCES */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="border-b border-slate-100 pb-4">
                <h2 className="font-serif text-xl font-bold text-slate-900">
                  Step 2: Budget, Style, Interests & Pace
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Configure your budget and travel preferences so the itinerary generator and policy validator can evaluate compatibility.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label
                    htmlFor="budget-input"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Total Trip Budget *
                  </label>
                  <input
                    id="budget-input"
                    type="number"
                    min={500}
                    step={500}
                    value={prefs.budget_total}
                    onChange={(e) =>
                      setPrefs({ ...prefs, budget_total: Number(e.target.value) || 0 })
                    }
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-teal-700 focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="currency-select"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Currency
                  </label>
                  <select
                    id="currency-select"
                    value={prefs.currency}
                    onChange={(e) => setPrefs({ ...prefs, currency: e.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm focus:border-teal-700 focus:outline-none"
                  >
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Travel Style
                  </label>
                  <select
                    value={prefs.travel_style}
                    onChange={(e) =>
                      setPrefs({ ...prefs, travel_style: e.target.value as TravelStyleType })
                    }
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm focus:border-teal-700 focus:outline-none"
                  >
                    <option value="cultural">Cultural & Heritage</option>
                    <option value="relaxed">Relaxed & Leisure</option>
                    <option value="adventure">Adventure & Outdoors</option>
                    <option value="family">Family Friendly</option>
                    <option value="backpacking">Backpacking & Budget</option>
                    <option value="luxury">Luxury & Comfort</option>
                    <option value="business">Business & Bleisure</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Preferred Accommodation
                  </label>
                  <select
                    value={prefs.accommodation_type}
                    onChange={(e) =>
                      setPrefs({ ...prefs, accommodation_type: e.target.value })
                    }
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm focus:border-teal-700 focus:outline-none"
                  >
                    <option value="budget_hotel">Budget Hotel (e.g., Harbourview Inn)</option>
                    <option value="boutique_hotel">Boutique Heritage Hotel</option>
                    <option value="resort">Standard / Luxury Resort</option>
                    <option value="hostel">Backpacker Hostel</option>
                    <option value="serviced_apartment">Serviced Apartment</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Itinerary Pace
                  </label>
                  <select
                    value={prefs.pace}
                    onChange={(e) =>
                      setPrefs({ ...prefs, pace: e.target.value as PaceType })
                    }
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm focus:border-teal-700 focus:outline-none"
                  >
                    <option value="relaxed">Relaxed (Generous buffers)</option>
                    <option value="balanced">Balanced (Moderate sightseeing)</option>
                    <option value="packed">Packed (High activity density)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Interests (Select one or more) *
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {INTEREST_OPTIONS.map((interest) => {
                    const selected = prefs.interests.includes(interest);
                    return (
                      <button
                        key={interest}
                        type="button"
                        onClick={() => toggleInterest(interest)}
                        className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold capitalize transition-all ${
                          selected
                            ? 'border-teal-700 bg-teal-700 text-white'
                            : 'border-slate-200 bg-[#faf8f5] text-slate-700 hover:bg-slate-200/70'
                        }`}
                      >
                        {interest}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Preferred Transport Modes *
                </label>
                <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {TRANSPORT_OPTIONS.map((opt) => {
                    const selected = prefs.transport_modes.includes(opt.id);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => toggleTransport(opt.id)}
                        className={`rounded-xl border px-3.5 py-2.5 text-left text-xs font-semibold transition-all ${
                          selected
                            ? 'border-teal-700 bg-teal-50/70 text-teal-950'
                            : 'border-slate-200 bg-[#faf8f5] text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {selected ? '✓ ' : '+ '}
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Dietary Preferences (Optional)
                  </label>
                  <input
                    type="text"
                    value={prefs.dietary_requirements || ''}
                    onChange={(e) =>
                      setPrefs({ ...prefs, dietary_requirements: e.target.value })
                    }
                    placeholder="e.g., Vegetarian, Green Hygiene Seal street stalls"
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-teal-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Accessibility Requirements (Optional)
                  </label>
                  <input
                    type="text"
                    value={prefs.accessibility_needs || ''}
                    onChange={(e) =>
                      setPrefs({ ...prefs, accessibility_needs: e.target.value })
                    }
                    placeholder="e.g., Step-free elevator access preferred"
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-teal-700 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: PRACTICAL REQUIREMENTS */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="border-b border-slate-100 pb-4">
                <h2 className="font-serif text-xl font-bold text-slate-900">
                  Step 3: Practical & Policy Requirements
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Specify arrival times, baggage plans, or permit notes so Stage 4 can validate them against retrieved accommodation and transport rules.
                </p>
              </div>

              <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-3.5 text-xs text-teal-900">
                <strong>Privacy & Security Guard:</strong> Never enter passport numbers, Aadhaar numbers, payment card details, or sensitive personal data. Only describe general policy requirements.
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Accommodation Policy Requirements (Check-in time, luggage drop-off, cancellation)
                  </label>
                  <input
                    type="text"
                    value={prefs.accommodation_requirements || ''}
                    onChange={(e) =>
                      setPrefs({ ...prefs, accommodation_requirements: e.target.value })
                    }
                    placeholder="e.g., Arriving at 8:30 AM on Day 1; requesting early check-in or luggage drop-off"
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-teal-700 focus:outline-none"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    Tip: Keeping the 8:30 AM early check-in/luggage drop-off note triggers a real policy conflict (<strong>FAIL</strong>) against Harbourview Budget Inn's 10:00 AM renovation restriction!
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Transport & Baggage Constraints
                  </label>
                  <input
                    type="text"
                    value={prefs.transport_constraints || ''}
                    onChange={(e) =>
                      setPrefs({ ...prefs, transport_constraints: e.target.value })
                    }
                    placeholder="e.g., Using public Metro pass; carrying 1 cabin bag per person"
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-teal-700 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Travel Document or Entry Considerations
                  </label>
                  <input
                    type="text"
                    value={prefs.visa_status_note || ''}
                    onChange={(e) =>
                      setPrefs({ ...prefs, visa_status_note: e.target.value })
                    }
                    placeholder="e.g., Domestic travel within India; carrying government photo ID"
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-teal-700 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Safety Considerations & Additional Instructions
                  </label>
                  <textarea
                    rows={2}
                    value={prefs.additional_instructions || ''}
                    onChange={(e) =>
                      setPrefs({ ...prefs, additional_instructions: e.target.value })
                    }
                    placeholder="Any additional notes for the planning pipeline..."
                    className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm focus:border-teal-700 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: REVIEW & LAUNCH */}
          {step === 4 && (
            <div className="space-y-6">
              <div className="border-b border-slate-100 pb-4">
                <h2 className="font-serif text-xl font-bold text-slate-900">
                  Step 4: Review Preferences & Verification Scope
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Review your inputs below. You can jump back to any step to edit before launching the 6-stage planning and policy verification pipeline.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-[#faf8f5] p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-teal-800">
                      Route & Travellers
                    </span>
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="flex items-center gap-1 text-xs font-semibold text-teal-700 hover:underline"
                    >
                      <Edit3 className="h-3 w-3" /> Edit
                    </button>
                  </div>
                  <dl className="mt-2.5 space-y-1.5 text-xs text-slate-700">
                    <div>
                      <strong>Origin → Destination:</strong> {prefs.origin} → {prefs.destination}
                    </div>
                    <div>
                      <strong>Dates:</strong> {prefs.departure_date} to {prefs.return_date} (
                      {durationDays} days)
                    </div>
                    <div>
                      <strong>Travellers:</strong> {prefs.travellers_count} total ({prefs.adults}{' '}
                      adults, {prefs.children} children)
                    </div>
                    <div>
                      <strong>Scope:</strong> <span className="capitalize">{prefs.travel_scope}</span>
                    </div>
                  </dl>
                </div>

                <div className="rounded-xl border border-slate-200 bg-[#faf8f5] p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-teal-800">
                      Budget, Style & Pace
                    </span>
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      className="flex items-center gap-1 text-xs font-semibold text-teal-700 hover:underline"
                    >
                      <Edit3 className="h-3 w-3" /> Edit
                    </button>
                  </div>
                  <dl className="mt-2.5 space-y-1.5 text-xs text-slate-700">
                    <div>
                      <strong>Total Budget:</strong> {prefs.currency}{' '}
                      {prefs.budget_total.toLocaleString()}
                    </div>
                    <div>
                      <strong>Style & Pace:</strong>{' '}
                      <span className="capitalize">
                        {prefs.travel_style} ({prefs.pace} pace)
                      </span>
                    </div>
                    <div>
                      <strong>Interests:</strong> {prefs.interests.join(', ')}
                    </div>
                    <div>
                      <strong>Accommodation:</strong> {prefs.accommodation_type.replace(/_/g, ' ')}
                    </div>
                  </dl>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-[#faf8f5] p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-teal-800">
                    Stated Policy & Practical Requirements
                  </span>
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="flex items-center gap-1 text-xs font-semibold text-teal-700 hover:underline"
                  >
                    <Edit3 className="h-3 w-3" /> Edit
                  </button>
                </div>
                <ul className="mt-2 space-y-1 text-xs text-slate-700">
                  <li>
                    <strong>Accommodation Note:</strong>{' '}
                    {prefs.accommodation_requirements || 'None specified'}
                  </li>
                  <li>
                    <strong>Transport Note:</strong>{' '}
                    {prefs.transport_constraints || 'None specified'}
                  </li>
                  <li>
                    <strong>Accessibility / Dietary:</strong>{' '}
                    {prefs.accessibility_needs || 'Standard'} /{' '}
                    {prefs.dietary_requirements || 'Standard'}
                  </li>
                </ul>
              </div>

              {/* What the assistant will verify */}
              <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-4">
                <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-teal-900">
                  <FileCheck2 className="h-4 w-4 text-teal-700" />
                  <span>What TripWise AI Will Verify During Execution</span>
                </h3>
                <ul className="mt-2 grid grid-cols-1 gap-1.5 text-xs text-slate-700 sm:grid-cols-2">
                  <li>• Normalize inputs & detect preference contradictions (Stage 1)</li>
                  <li>• Hybrid FAISS + BM25 search across curated documents (Stage 2)</li>
                  <li>• Assemble day-by-day schedule with page-level citations (Stage 3)</li>
                  <li>• Validate check-in, baggage, entry & budget rules (Stage 4)</li>
                  <li>• Flag undated policies, 2024 advisories & conflicting tariffs (Stage 5)</li>
                  <li>• Assemble final audit-ready plan & traceability links (Stage 6)</li>
                </ul>
              </div>
            </div>
          )}

          {/* Navigation Controls */}
          <div className="mt-8 flex items-center justify-between border-t border-slate-100 pt-5">
            {step > 1 ? (
              <button
                type="button"
                onClick={handlePrevStep}
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Previous Step</span>
              </button>
            ) : (
              <div />
            )}

            {step < 4 ? (
              <button
                type="button"
                onClick={handleNextStep}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-semibold text-white hover:bg-teal-800"
              >
                <span>Continue to Step {step + 1}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmitPlan}
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-teal-800 disabled:opacity-60"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Running 6-Stage Verification Pipeline...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    <span>Start Planning & Policy Workflow</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
