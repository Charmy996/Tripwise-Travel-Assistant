import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Compass,
  Search,
  ArrowRight,
  BookOpen,
  ShieldCheck,
  AlertTriangle,
  FileText,
  CheckCircle2,
  Scale,
  Database,
  Clock,
  Sparkles,
} from 'lucide-react';

const EXAMPLE_DESTINATIONS = [
  {
    name: 'Sample City',
    tag: 'Full Curated Demo Dataset (6 Docs Indexed)',
    style: 'Cultural & Coastal Heritage',
    budget: 'INR 25,000 • 3 Days',
    image:
      'https://images.unsplash.com/photo-1514222134-b57cbb8ce073?auto=format&fit=crop&w=900&q=80',
    description:
      'Complete demonstration scenario with destination guide, 2-page PDF hotel policy, transit luggage rules, 2024 entry permit guidance, and conflicting museum tariff circulars.',
    isSeeded: true,
  },
  {
    name: 'Udaipur, Rajasthan',
    tag: 'Upload Custom Guides or Test Missing-Evidence Mode',
    style: 'Lakeside Palaces & Crafts',
    budget: 'INR 30,000 • 3 Days',
    image:
      'https://images.unsplash.com/photo-1599661046289-e31897846e41?auto=format&fit=crop&w=900&q=80',
    description:
      'Test how TripWise AI transparently labels recommendations as unverified when curated documents are missing, or upload your own PDF/Markdown guides.',
    isSeeded: false,
  },
  {
    name: 'Kochi, Kerala',
    tag: 'Upload Custom Guides or Test Missing-Evidence Mode',
    style: 'Maritime Spice Route & Backwaters',
    budget: 'INR 28,000 • 4 Days',
    image:
      'https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?auto=format&fit=crop&w=900&q=80',
    description:
      'Explore how the policy validator refuses to fabricate hotel check-in rules or citations when local documents have not yet been uploaded.',
    isSeeded: false,
  },
];

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchDest, setSearchDest] = useState('Sample City');

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const target = searchDest.trim() || 'Sample City';
    navigate(`/wizard?destination=${encodeURIComponent(target)}`);
  };

  return (
    <div className="min-h-screen bg-[#faf8f5] text-slate-900">
      {/* Hero Section */}
      <section className="relative overflow-hidden border-b border-slate-200/80 bg-gradient-to-b from-[#faf8f5] via-white to-[#f4f1ea] py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <div className="inline-flex items-center gap-2 rounded-full border border-teal-700/20 bg-teal-50/90 px-3.5 py-1.5 text-xs font-semibold text-teal-900">
                <ShieldCheck className="h-4 w-4 text-teal-700" />
                <span>Zero-Fabrication Travel Planning & Policy Assistant</span>
              </div>

              <h1 className="mt-6 font-serif text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl lg:text-[3.25rem] lg:leading-[1.12]">
                Travel itineraries grounded in{' '}
                <span className="text-teal-800 underline decoration-teal-600/30 decoration-wavy underline-offset-8">
                  curated policy evidence
                </span>
                , not AI guesswork.
              </h1>

              <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
                TripWise AI combines destination guides, hotel check-in rules, transit baggage policies, and entry advisories using hybrid semantic + lexical retrieval. Every factual claim is linked to its document and page number—and missing, outdated, or conflicting information is explicitly flagged.
              </p>

              {/* Destination Search & Primary CTA */}
              <form
                onSubmit={handleSearchSubmit}
                className="mt-8 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-md sm:flex-row sm:items-center"
              >
                <div className="flex flex-1 items-center gap-3 px-3 py-2">
                  <Search className="h-5 w-5 shrink-0 text-teal-700" />
                  <div className="w-full">
                    <label
                      htmlFor="hero-destination-input"
                      className="block text-[10px] font-bold uppercase tracking-wider text-slate-400"
                    >
                      Destination City or Region
                    </label>
                    <input
                      id="hero-destination-input"
                      type="text"
                      value={searchDest}
                      onChange={(e) => setSearchDest(e.target.value)}
                      placeholder="Try 'Sample City' (seeded demo) or any city..."
                      className="w-full bg-transparent text-sm font-semibold text-slate-900 placeholder-slate-400 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-6 py-3.5 text-sm font-semibold text-white shadow-xs transition-all hover:bg-teal-800"
                  >
                    <span>Plan My Trip</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/dashboard')}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-100"
                  >
                    <span>Open Seeded Demo</span>
                  </button>
                </div>
              </form>

              <div className="mt-5 flex flex-wrap items-center gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-teal-700" />
                  FAISS + BM25 Hybrid Retrieval
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-teal-700" />
                  Page-Level PDF & Markdown Citations
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-teal-700" />
                  Works 100% Locally Without Paid API Keys
                </span>
              </div>
            </div>

            {/* Evidence-Backed Recommendation Live Demonstration Card */}
            <div className="lg:col-span-5">
              <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-teal-700" />
                    <span className="text-xs font-bold uppercase tracking-wider text-teal-800">
                      Evidence Traceability Preview
                    </span>
                  </div>
                  <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-900 ring-1 ring-inset ring-amber-600/20">
                    Demonstration Data
                  </span>
                </div>

                {/* Citation Example 1: Exact specification from Section 6 */}
                <div className="mt-4 rounded-xl border border-slate-200 bg-[#faf8f5] p-4">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                    <span>Accommodation Policy Statement</span>
                    <span className="rounded-md bg-teal-100/80 px-2 py-0.5 text-[11px] font-bold text-teal-900">
                      Page 2 Cited
                    </span>
                  </div>
                  <p className="mt-2 font-serif text-base font-bold text-slate-900">
                    "Check-in begins at 3:00 PM."
                  </p>
                  <p className="mt-1 text-xs text-slate-600">
                    Early arrival luggage drop-off before 10:00 AM is strictly prohibited due to ground-floor security renovations.
                  </p>
                  <div className="mt-3 rounded-lg border border-slate-200/80 bg-white p-2.5 text-xs">
                    <p className="font-semibold text-slate-800">
                      Source: Sample Accommodation Policy (Harbourview Budget Inn), page 2.
                    </p>
                    <p className="mt-0.5 text-[11px] text-amber-800 font-medium">
                      Status: Demonstration document — not a real booking policy. (Publication date: Unknown)
                    </p>
                  </div>
                </div>

                {/* Citation Example 2: Multi-Document Conflict Detection */}
                <div className="mt-3.5 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <span>Automated Multi-Source Conflict Detection</span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-700">
                    When two retrieved documents disagree, TripWise AI never silently guesses one:
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded-lg border border-amber-200/80 bg-white p-2">
                      <span className="font-bold text-slate-800">Destination Guide (p. 1):</span>
                      <p className="mt-0.5 text-slate-600">
                        National Museum entry: <strong>INR 500</strong>, closes <strong>5:00 PM</strong>.
                      </p>
                    </div>
                    <div className="rounded-lg border border-amber-200/80 bg-white p-2">
                      <span className="font-bold text-slate-800">Municipal Circular (p. 1):</span>
                      <p className="mt-0.5 text-slate-600">
                        Revised entry: <strong>INR 650</strong>, Friday close <strong>4:00 PM</strong>.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between pt-2 text-xs text-slate-500">
                  <span>Mumbai → Sample City • 2 Adults • INR 25,000</span>
                  <button
                    type="button"
                    onClick={() => navigate('/dashboard')}
                    className="font-semibold text-teal-800 hover:underline"
                  >
                    Inspect Full Demo Dashboard →
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Four-Step Workflow Explanation */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <span className="text-xs font-bold uppercase tracking-wider text-teal-800">
              Inspectable Architecture
            </span>
            <h2 className="mt-2 font-serif text-3xl font-bold text-slate-900">
              How the Multi-Step Planning & Policy Workflow Operates
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base">
              Unlike generic chat interfaces that hallucinate opening hours or visa compliance, TripWise AI executes a transparent, stage-gated pipeline over your curated document library.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                step: '01',
                icon: <Compass className="h-5 w-5 text-teal-700" />,
                title: 'Preference & Constraint Analysis',
                desc: 'Normalizes dates, traveller counts, budget, pace, and practical instructions while flagging contradictory preferences upfront.',
              },
              {
                step: '02',
                icon: <Database className="h-5 w-5 text-teal-700" />,
                title: 'Hybrid Curated Knowledge Retrieval',
                desc: 'Combines FAISS semantic vector embeddings with BM25 lexical keyword matching to retrieve page-numbered excerpts from PDF, Markdown, and TXT files.',
              },
              {
                step: '03',
                icon: <Scale className="h-5 w-5 text-teal-700" />,
                title: 'Evidence-Grounded Itinerary & Policy Checks',
                desc: 'Builds realistic daily schedules and evaluates every rule into PASS, WARNING, FAIL, or UNKNOWN—never issuing a PASS without supporting evidence.',
              },
              {
                step: '04',
                icon: <Clock className="h-5 w-5 text-teal-700" />,
                title: 'Missing-Information & Freshness Audit',
                desc: 'Surfaces undated policies, outdated advisories, conflicting sources, seasonal closures, and unverified live schedules before you travel.',
              },
            ].map((item) => (
              <div
                key={item.step}
                className="flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-6 shadow-xs transition-shadow hover:shadow-md"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50">
                      {item.icon}
                    </div>
                    <span className="font-serif text-2xl font-bold text-slate-300">
                      {item.step}
                    </span>
                  </div>
                  <h3 className="mt-4 font-serif text-lg font-bold text-slate-900">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-slate-600 sm:text-sm">
                    {item.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Built on Curated Travel Knowledge & Example Destinations */}
      <section className="border-t border-slate-200/80 bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-teal-800">
                Built on Curated Travel Knowledge
              </span>
              <h2 className="mt-2 font-serif text-3xl font-bold text-slate-900">
                Explore Example Scenarios or Upload Your Own Guides
              </h2>
            </div>
            <button
              type="button"
              onClick={() => navigate('/dashboard?tab=library')}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-[#faf8f5] px-4 py-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-100"
            >
              <FileText className="h-4 w-4 text-teal-700" />
              <span>Browse Curated Document Library (6 Seeded Files)</span>
            </button>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
            {EXAMPLE_DESTINATIONS.map((dest) => (
              <div
                key={dest.name}
                className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-[#faf8f5] shadow-xs transition-all hover:shadow-md"
              >
                <div className="relative h-48 overflow-hidden bg-slate-900">
                  <img
                    src={dest.image}
                    alt={dest.name}
                    className="h-full w-full object-cover opacity-90 transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-900/20 to-transparent" />
                  <div className="absolute top-3 left-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                        dest.isSeeded
                          ? 'bg-teal-600 text-white'
                          : 'bg-slate-900/80 text-slate-100 backdrop-blur-xs'
                      }`}
                    >
                      {dest.tag}
                    </span>
                  </div>
                  <div className="absolute bottom-3 left-3 right-3 text-white">
                    <h3 className="font-serif text-xl font-bold">{dest.name}</h3>
                    <p className="text-xs text-slate-200">
                      {dest.style} • {dest.budget}
                    </p>
                  </div>
                </div>

                <div className="flex flex-1 flex-col justify-between p-5">
                  <p className="text-xs leading-relaxed text-slate-600">
                    {dest.description}
                  </p>
                  <div className="mt-4 flex items-center gap-2 pt-3 border-t border-slate-200/80">
                    <button
                      type="button"
                      onClick={() =>
                        navigate(`/wizard?destination=${encodeURIComponent(dest.name)}`)
                      }
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-teal-800"
                    >
                      <span>Plan in Wizard</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                    {dest.isSeeded && (
                      <button
                        type="button"
                        onClick={() => navigate('/dashboard')}
                        className="rounded-xl border border-teal-700/30 bg-teal-50 px-3 py-2.5 text-xs font-semibold text-teal-900 hover:bg-teal-100"
                      >
                        View Saved Demo
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer with Project Information & Limitations */}
      <footer className="border-t border-slate-200 bg-slate-900 py-12 text-slate-300">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-12">
            <div className="md:col-span-5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600 text-white">
                  <Compass className="h-4 w-4" />
                </div>
                <span className="font-serif text-lg font-bold text-white">
                  TripWise AI — Travel Planning & Policy Assistant
                </span>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-slate-400">
                Built as a full-stack explainable AI prototype featuring FastAPI, SQLite, PyMuPDF, FAISS vector retrieval, BM25 lexical search, and React + TypeScript.
              </p>
            </div>

            <div className="md:col-span-7">
              <h4 className="text-xs font-bold uppercase tracking-wider text-teal-400">
                Core Principles, Disclaimers & System Limitations
              </h4>
              <ul className="mt-2.5 space-y-1.5 text-xs leading-relaxed text-slate-400">
                <li>
                  • <strong>No Fabricated Citations or Policies:</strong> When information is absent from the curated document collection, TripWise AI explicitly marks it as missing, unverified, or requiring official confirmation.
                </li>
                <li>
                  • <strong>Fictional Demonstration Dataset:</strong> "Sample City" and its 6 seeded documents are clearly labelled educational demonstration files—not real-world government or hotel rules.
                </li>
                <li>
                  • <strong>Informational Planning Only:</strong> This application does not issue live ticket bookings, legal immigration clearance, or real-time transit confirmations. Always verify critical requirements with official embassies and licensed providers prior to departure.
                </li>
              </ul>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
