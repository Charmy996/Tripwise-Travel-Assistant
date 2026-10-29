import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Navbar } from './layouts/Navbar';
import { LandingPage } from './pages/LandingPage';
import { TripWizardPage } from './pages/TripWizardPage';
import { DashboardPage } from './pages/DashboardPage';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen flex-col bg-[#faf8f5]">
        <Navbar />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/wizard" element={<TripWizardPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/dashboard/:tripId" element={<DashboardPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
};

export default App;
