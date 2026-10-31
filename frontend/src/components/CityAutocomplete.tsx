import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, Loader2, X, Check, Globe } from 'lucide-react';
import { api } from '../services/api';
import { LocationModel } from '../types/tripwise';

interface CityAutocompleteProps {
  label: string;
  placeholder: string;
  value: string;
  selectedLocation?: LocationModel | null;
  onChange: (location: LocationModel | null, textValue: string) => void;
  disabled?: boolean;
  error?: string | null;
  required?: boolean;
  id?: string;
}

export const CityAutocomplete: React.FC<CityAutocompleteProps> = ({
  label,
  placeholder,
  value,
  selectedLocation,
  onChange,
  disabled = false,
  error,
  required = false,
  id,
}) => {
  const [inputValue, setInputValue] = useState<string>(value);
  const [suggestions, setSuggestions] = useState<LocationModel[]>([]);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [attribution, setAttribution] = useState<string>('Data © OpenStreetMap contributors');

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const inputId = id || `city-autocomplete-${label.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
  const listboxId = `${inputId}-listbox`;

  // Sync internal input value if external value changes
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Click outside listener to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  // Fetch suggestions with debounce and cancellation
  const fetchSuggestions = useCallback((query: string) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setIsLoading(false);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);

    debounceTimerRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const res = await api.searchLocations(trimmed, 8, controller.signal);
        setSuggestions(res.results || []);
        if (res.attribution) setAttribution(res.attribution);
        setIsOpen(true);
        setHighlightedIndex(-1);
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          setSuggestions([]);
        }
      } finally {
        setIsLoading(false);
      }
    }, 350);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);
    // Invalidate previous structured selection if user edits text
    onChange(null, val);
    fetchSuggestions(val);
  };

  const handleSelectLocation = (loc: LocationModel) => {
    const displayStr = loc.display_name || `${loc.name}, ${loc.country}`;
    setInputValue(displayStr);
    onChange(loc, displayStr);
    setIsOpen(false);
    setSuggestions([]);
    setHighlightedIndex(-1);
    inputRef.current?.focus();
  };

  const handleClear = () => {
    setInputValue('');
    onChange(null, '');
    setSuggestions([]);
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && suggestions.length > 0) {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
          handleSelectLocation(suggestions[highlightedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        break;
      case 'Tab':
        setIsOpen(false);
        break;
      default:
        break;
    }
  };

  // Highlight matched text helper
  const renderHighlighted = (text: string, query: string) => {
    if (!query.trim()) return text;
    const qLower = query.trim().toLowerCase();
    const idx = text.toLowerCase().indexOf(qLower);
    if (idx === -1) return text;

    const before = text.slice(0, idx);
    const match = text.slice(idx, idx + qLower.length);
    const after = text.slice(idx + qLower.length);

    return (
      <>
        {before}
        <span className="font-extrabold text-teal-900 bg-teal-100/70 rounded-xs px-0.5">{match}</span>
        {after}
      </>
    );
  };

  const isStructuredSelected = Boolean(selectedLocation);

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="flex items-center justify-between">
        <label htmlFor={inputId} className="block text-xs font-semibold text-slate-700">
          {label} {required && <span className="text-rose-600">*</span>}
        </label>
        {isStructuredSelected && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
            <Check className="h-3 w-3 text-emerald-600" />
            <span>Verified Location</span>
          </span>
        )}
      </div>

      <div className="relative mt-1.5">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
          <MapPin className={`h-4 w-4 ${isStructuredSelected ? 'text-teal-700' : 'text-slate-400'}`} />
        </div>

        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-activedescendant={
            highlightedIndex >= 0 ? `${inputId}-opt-${highlightedIndex}` : undefined
          }
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true);
            else if (inputValue.trim().length >= 2) fetchSuggestions(inputValue);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className={`w-full rounded-xl border bg-white py-2.5 pl-9 pr-16 text-sm text-slate-900 shadow-xs transition-colors placeholder:text-slate-400 focus:outline-none ${
            error
              ? 'border-rose-400 focus:border-rose-600 focus:ring-1 focus:ring-rose-500'
              : isStructuredSelected
              ? 'border-teal-600/70 ring-1 ring-teal-600/20'
              : 'border-slate-300 focus:border-teal-700 focus:ring-1 focus:ring-teal-700'
          } ${disabled ? 'cursor-not-allowed bg-slate-100 text-slate-500' : ''}`}
        />

        <div className="absolute inset-y-0 right-0 flex items-center pr-2.5 gap-1">
          {isLoading && <Loader2 className="h-4 w-4 animate-spin text-teal-700" />}

          {inputValue && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              aria-label={`Clear ${label}`}
              className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {error && <p className="mt-1 text-xs text-rose-600 font-medium">{error}</p>}

      {/* Dropdown Suggestions Listbox */}
      {isOpen && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1.5 shadow-lg ring-1 ring-black/5"
        >
          {suggestions.length > 0 ? (
            <>
              {suggestions.map((loc, idx) => {
                const isHighlighted = idx === highlightedIndex;
                const isSelected = selectedLocation?.id === loc.id;
                return (
                  <div
                    key={loc.id || `${loc.name}-${idx}`}
                    id={`${inputId}-opt-${idx}`}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelectLocation(loc)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={`flex cursor-pointer items-start gap-2.5 px-3.5 py-2.5 text-xs transition-colors ${
                      isHighlighted ? 'bg-teal-50/80 text-teal-950' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <MapPin
                      className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                        isHighlighted ? 'text-teal-700' : 'text-slate-400'
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-slate-900 truncate">
                        {renderHighlighted(loc.name, inputValue)}
                        {loc.country && (
                          <span className="ml-1.5 font-normal text-slate-500">
                            ({loc.country})
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate mt-0.5">
                        {loc.display_name}
                      </div>
                    </div>
                    {isSelected && (
                      <Check className="h-4 w-4 shrink-0 text-teal-700" />
                    )}
                  </div>
                );
              })}
              <div className="border-t border-slate-100 mt-1 px-3 py-1 flex items-center justify-between text-[10px] text-slate-400 bg-slate-50/60">
                <span className="flex items-center gap-1">
                  <Globe className="h-3 w-3" />
                  {attribution}
                </span>
                <span>Use ↑↓ to navigate, Enter to select</span>
              </div>
            </>
          ) : (
            !isLoading && (
              <div className="px-4 py-3 text-center text-xs text-slate-500">
                No matching cities found for &quot;{inputValue}&quot;.
                <p className="mt-0.5 text-[11px] text-slate-400">
                  Try typing Mumbai, London, New York, Delhi, Paris, etc.
                </p>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
};
