import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { LandingPage } from '../pages/LandingPage';
import { TripWizardPage } from '../pages/TripWizardPage';
import { WorkflowTracker } from '../components/WorkflowTracker';
import { SourceEvidenceModal } from '../components/SourceEvidenceModal';
import { WorkflowRun, CitationReference } from '../types/tripwise';

describe('TripWise AI Frontend Components & Validation', () => {
  it('renders LandingPage hero, evidence traceability preview, and 4-step workflow', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );
    expect(
      screen.getByText(/Zero-Fabrication Travel Planning & Policy Assistant/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/"Check-in begins at 3:00 PM."/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Source: Sample Accommodation Policy \(Harbourview Budget Inn\), page 2/i)
    ).toBeInTheDocument();
  });

  it('validates that return date cannot precede departure date in TripWizardPage', () => {
    render(
      <MemoryRouter>
        <TripWizardPage />
      </MemoryRouter>
    );

    const depInput = screen.getByLabelText(/Departure Date/i);
    const retInput = screen.getByLabelText(/Return Date/i);
    fireEvent.change(depInput, { target: { value: '2026-11-20' } });
    fireEvent.change(retInput, { target: { value: '2026-11-10' } });

    const nextBtn = screen.getByRole('button', { name: /Continue to Step 2/i });
    fireEvent.click(nextBtn);

    expect(screen.getByRole('alert')).toHaveTextContent(
      /Return date cannot precede departure date/i
    );
  });

  it('renders the 6-stage WorkflowTracker and opens stage output inspection', () => {
    const mockRun: WorkflowRun = {
      run_id: 'run-test-123',
      trip_id: 'trip-demo-sample-city',
      overall_status: 'completed_with_warnings',
      started_at: '2026-10-28T10:00:00Z',
      completed_at: '2026-10-28T10:00:02Z',
      generation_mode: 'local_deterministic_evidence_backed',
      stages: [
        {
          stage_number: 1,
          stage_id: 'preference_analysis',
          stage_name: 'Preference Analysis',
          status: 'completed',
          summary: 'Normalized 3-day cultural trip to Sample City.',
          details: { duration_days: 3 },
          warnings: [],
        },
        {
          stage_number: 2,
          stage_id: 'knowledge_retrieval',
          stage_name: 'Knowledge Retrieval',
          status: 'completed_with_warnings',
          summary: 'Retrieved 12 chunks across 6 documents.',
          details: { retrieved_chunk_count: 12 },
          warnings: ['2 chunks originate from undated documents.'],
        },
      ],
    };

    render(<WorkflowTracker workflowRun={mockRun} howCreated={{ generation_mode: 'local' }} />);
    expect(
      screen.getByText(/6-Stage Evidence & Policy Verification Tracker/i)
    ).toBeInTheDocument();
    expect(screen.getByText('Preference Analysis')).toBeInTheDocument();
    expect(screen.getByText('Knowledge Retrieval')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Knowledge Retrieval'));
    expect(screen.getByText(/Stage 2 Inspection/i)).toBeInTheDocument();
  });

  it('renders SourceEvidenceModal with exact citation page number and demonstration disclaimer', () => {
    const sampleCitation: CitationReference = {
      chunk_id: 'sample-accommodation-001-chunk-002',
      document_id: 'sample-accommodation-001',
      document_title: 'Sample Accommodation Policy — Harbourview Budget Inn',
      category: 'accommodation_policy',
      authority: 'demonstration_source',
      page_number: 2,
      section_heading: 'Section 3: Check-In Rules',
      excerpt: 'Check-in begins at 3:00 PM (15:00) local time.',
      publication_date: null,
      verification_status: 'Document date unknown',
      is_demonstration: true,
    };

    render(<SourceEvidenceModal citation={sampleCitation} onClose={() => {}} />);
    expect(screen.getByText(/Traceable Source Citation/i)).toBeInTheDocument();
    expect(screen.getByText(/Page 2/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Demonstration document — fictional educational policy/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Check-in begins at 3:00 PM \(15:00\) local time/i)
    ).toBeInTheDocument();
  });
});
