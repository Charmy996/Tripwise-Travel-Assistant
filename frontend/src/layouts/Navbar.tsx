import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Compass, FileCheck2, FolderOpen, PlusCircle, LayoutDashboard, ShieldCheck } from 'lucide-react';

export const Navbar: React.FC = () => {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-[#faf8f5]/95 backdrop-blur-md no-print">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-3 group">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-800 text-white shadow-sm transition-transform group-hover:scale-105">
            <Compass className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-serif text-xl font-bold tracking-tight text-slate-900">
                TripWise AI
              </span>
              <span className="hidden rounded-full bg-teal-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-teal-800 ring-1 ring-inset ring-teal-600/20 sm:inline-block">
                Policy & Evidence Assistant
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Source-Grounded Travel Planning & Policy Validation
            </p>
          </div>
        </Link>

        <nav className="flex items-center gap-1 sm:gap-2">
          <Link
            to="/"
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              isActive('/')
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-200/60 hover:text-slate-900'
            }`}
          >
            Home
          </Link>
          <Link
            to="/dashboard"
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              location.pathname.startsWith('/dashboard') && !location.search.includes('tab=library')
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-200/60 hover:text-slate-900'
            }`}
          >
            <LayoutDashboard className="h-4 w-4" />
            <span>Dashboard</span>
          </Link>
          <Link
            to="/dashboard?tab=library"
            className={`hidden items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors md:flex ${
              location.search.includes('tab=library')
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-200/60 hover:text-slate-900'
            }`}
          >
            <FolderOpen className="h-4 w-4" />
            <span>Document Library</span>
          </Link>
          <Link
            to="/wizard"
            className="ml-1 flex items-center gap-1.5 rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-teal-800"
          >
            <PlusCircle className="h-4 w-4" />
            <span>Plan My Trip</span>
          </Link>
        </nav>
      </div>
    </header>
  );
};
