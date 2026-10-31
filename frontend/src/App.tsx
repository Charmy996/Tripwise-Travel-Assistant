import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Navbar } from './layouts/Navbar';
import { ErrorBoundary } from './components/ErrorBoundary';
import { RefreshCw } from 'lucide-react';

const LandingPage = lazy(() =>
  import('./pages/LandingPage').then((m) => ({ default: m.LandingPage }))
);
const TripWizardPage = lazy(() =>
  import('./pages/TripWizardPage').then((m) => ({ default: m.TripWizardPage }))
);
const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage }))
);

const PageLoadingFallback: React.FC = () => (
  <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 bg-[#faf8f5]">
    <RefreshCw className="h-7 w-7 animate-spin text-teal-800" />
    <span className="font-serif text-sm font-semibold text-slate-700">
      Loading TripWise AI...
    </span>
  </div>
);

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen flex-col bg-[#faf8f5]">
        <Navbar />
        <main className="flex-1">
          <ErrorBoundary fallbackTitle="An unexpected application error occurred">
            <Suspense fallback={<PageLoadingFallback />}>
              <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/wizard" element={<TripWizardPage />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/dashboard/:tripId" element={<DashboardPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </BrowserRouter>
  );
};

export default App;
