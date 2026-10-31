import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CityAutocomplete } from '../components/CityAutocomplete';
import { ItineraryEditor } from '../components/ItineraryEditor';
import { LocationModel, ItineraryDay } from '../types/tripwise';
import * as apiModule from '../services/api';

describe('CityAutocomplete Component', () => {
  it('renders input with label, placeholder, and ARIA combobox attributes', () => {
    render(
      <CityAutocomplete
        label="Origin City"
        placeholder="Search origin..."
        value=""
        onChange={() => {}}
        required
      />
    );

    const input = screen.getByRole('combobox', { name: /Origin City/i });
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-autocomplete', 'list');
    expect(input).toHaveAttribute('placeholder', 'Search origin...');
  });

  it('queries location API and displays suggestions with keyboard navigation', async () => {
    const mockLocation: LocationModel = {
      id: 'fb-mum-1',
      name: 'Mumbai',
      admin_area: 'Maharashtra',
      country: 'India',
      country_code: 'IN',
      latitude: 19.076,
      longitude: 72.8777,
      display_name: 'Mumbai, Maharashtra, India',
      type: 'city',
    };

    vi.spyOn(apiModule.api, 'searchLocations').mockResolvedValueOnce({
      query: 'Mum',
      total: 1,
      provider: 'nominatim',
      cached: false,
      attribution: 'Data © OpenStreetMap contributors',
      results: [mockLocation],
    });

    const handleChange = vi.fn();

    render(
      <CityAutocomplete
        label="Origin City"
        placeholder="Type Mum..."
        value=""
        onChange={handleChange}
      />
    );

    const input = screen.getByRole('combobox', { name: /Origin City/i });
    fireEvent.change(input, { target: { value: 'Mum' } });

    // Wait for debounced search and suggestions dropdown
    await waitFor(
      () => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      },
      { timeout: 1000 }
    );

    expect(screen.getByText(/Mumbai/i)).toBeInTheDocument();
    expect(screen.getByText(/Maharashtra, India/i)).toBeInTheDocument();

    // Keyboard ArrowDown to highlight, Enter to select
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(handleChange).toHaveBeenCalledWith(mockLocation, 'Mumbai, Maharashtra, India');
  });

  it('clears selection when clear button is clicked', () => {
    const handleChange = vi.fn();
    render(
      <CityAutocomplete
        label="Destination City"
        placeholder="Destination..."
        value="London, United Kingdom"
        onChange={handleChange}
      />
    );

    const clearBtn = screen.getByRole('button', { name: /Clear Destination City/i });
    fireEvent.click(clearBtn);

    expect(handleChange).toHaveBeenCalledWith(null, '');
  });
});

describe('ItineraryEditor Component', () => {
  const sampleDays: ItineraryDay[] = [
    {
      day_number: 1,
      date: '2026-11-10',
      theme: 'Arrival & Cultural Introduction',
      is_indicative_schedule: true,
      daily_estimated_cost: 600,
      daily_notes: [],
      morning: [
        {
          activity_id: 'act-001',
          time_slot: 'Morning',
          Suggested_time: '10:00 AM',
          title: 'Central Heritage Museum Visit',
          description: 'Guided tour of the regional textile and archaeological exhibits.',
          location: 'Museum Square',
          estimated_duration_hours: 2.5,
          transport_mode: 'public_transport',
          estimated_cost: 600,
          currency: 'INR',
          cost_note: 'INR 300 per ticket for 2 adults',
          evidence_backed: true,
          verification_label: 'Supported by retrieved document',
          citations: [],
          assumptions: [],
        },
      ],
      afternoon: [],
      evening: [],
    },
  ];

  it('renders days, theme, activities, and daily costs', () => {
    render(
      <ItineraryEditor
        days={sampleDays}
        currency="INR"
        tripId="trip-test-123"
        onSave={async () => {}}
      />
    );

    expect(screen.getByText('Day 1 • 2026-11-10')).toBeInTheDocument();
    expect(screen.getByText('Arrival & Cultural Introduction')).toBeInTheDocument();
    expect(screen.getByText('Central Heritage Museum Visit')).toBeInTheDocument();
    expect(screen.getAllByText(/600/).length).toBeGreaterThanOrEqual(1);
  });

  it('allows adding a new activity to afternoon slot', async () => {
    render(
      <ItineraryEditor
        days={sampleDays}
        currency="INR"
        tripId="trip-test-123"
        onSave={async () => {}}
      />
    );

    const addBtn = screen.getByRole('button', { name: /Add Afternoon Activity/i });
    fireEvent.click(addBtn);

    expect(screen.getByText(/Add Activity to Day 1 \(Afternoon\)/i)).toBeInTheDocument();

    const titleInput = screen.getByPlaceholderText(/e.g., Visit Royal Botanical Gardens/i);
    fireEvent.change(titleInput, { target: { value: 'Old Town Walking Tour' } });

    const submitBtn = screen.getByRole('button', { name: /Add to Schedule/i });
    fireEvent.click(submitBtn);

    expect(screen.getByText('Old Town Walking Tour')).toBeInTheDocument();
    expect(screen.getByText(/Manual User Edit/i)).toBeInTheDocument();
  });
});
