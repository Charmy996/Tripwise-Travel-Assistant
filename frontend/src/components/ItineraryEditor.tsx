import React, { useState, useEffect } from 'react';
import {
  Clock,
  BookOpen,
  PlusCircle,
  Trash2,
  Edit2,
  Check,
  X,
  ChevronUp,
  ChevronDown,
  Sparkles,
  Save,
  AlertCircle,
  UserCheck,
} from 'lucide-react';
import { CitationReference, ItineraryActivity, ItineraryDay } from '../types/tripwise';

interface ItineraryEditorProps {
  days: ItineraryDay[];
  currency: string;
  tripId: string;
  onSave: (updatedDays: ItineraryDay[]) => Promise<void>;
  onSelectCitation?: (cit: CitationReference) => void;
}

export const ItineraryEditor: React.FC<ItineraryEditorProps> = ({
  days,
  currency,
  tripId,
  onSave,
  onSelectCitation,
}) => {
  const [localDays, setLocalDays] = useState<ItineraryDay[]>([]);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Activity Edit State
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<ItineraryActivity>>({});

  // Add Activity Modal State
  const [addingToSlot, setAddingToSlot] = useState<{
    dayNumber: number;
    timeSlot: 'Morning' | 'Afternoon' | 'Evening';
  } | null>(null);
  const [newActivityForm, setNewActivityForm] = useState({
    title: '',
    description: '',
    location: '',
    suggested_time: '10:00 AM',
    duration_hours: 1.5,
    transport_mode: 'walking',
    estimated_cost: 0,
    cost_note: '',
  });

  // Re-sync when incoming days change
  useEffect(() => {
    setLocalDays(JSON.parse(JSON.stringify(days)));
  }, [days]);

  // Recalculate daily and total cost helper
  const recalculateDays = (updated: ItineraryDay[]): ItineraryDay[] => {
    return updated.map((d) => {
      const allActs = [...d.morning, ...d.afternoon, ...d.evening];
      const sum = allActs.reduce((acc, act) => acc + (act.estimated_cost || 0), 0);
      return { ...d, daily_estimated_cost: roundCost(sum) };
    });
  };

  const roundCost = (num: number) => Math.round(num * 100) / 100;

  // Handle Remove Activity
  const handleRemoveActivity = (dayNumber: number, activityId: string) => {
    const next = localDays.map((d) => {
      if (d.day_number !== dayNumber) return d;
      return {
        ...d,
        morning: d.morning.filter((a) => a.activity_id !== activityId),
        afternoon: d.afternoon.filter((a) => a.activity_id !== activityId),
        evening: d.evening.filter((a) => a.activity_id !== activityId),
      };
    });
    setLocalDays(recalculateDays(next));
  };

  // Move Activity Up / Down
  const handleMoveActivity = (
    dayNumber: number,
    slot: 'Morning' | 'Afternoon' | 'Evening',
    index: number,
    direction: 'up' | 'down'
  ) => {
    const next = localDays.map((d) => {
      if (d.day_number !== dayNumber) return d;
      const slotKey = slot.toLowerCase() as 'morning' | 'afternoon' | 'evening';
      const items = [...d[slotKey]];
      const targetIdx = direction === 'up' ? index - 1 : index + 1;
      if (targetIdx < 0 || targetIdx >= items.length) return d;

      const temp = items[index];
      items[index] = items[targetIdx];
      items[targetIdx] = temp;

      return { ...d, [slotKey]: items };
    });
    setLocalDays(next);
  };

  // Start Editing Activity
  const handleStartEdit = (act: ItineraryActivity) => {
    setEditingActivityId(act.activity_id);
    setEditFormData({
      title: act.title,
      description: act.description,
      Suggested_time: act.Suggested_time,
      estimated_duration_hours: act.estimated_duration_hours,
      transport_mode: act.transport_mode,
      estimated_cost: act.estimated_cost,
      cost_note: act.cost_note,
    });
  };

  // Save Activity Edit
  const handleSaveEdit = (dayNumber: number, actId: string) => {
    const next = localDays.map((d) => {
      if (d.day_number !== dayNumber) return d;
      const updateSlot = (acts: ItineraryActivity[]) =>
        acts.map((a) => {
          if (a.activity_id !== actId) return a;
          return {
            ...a,
            ...editFormData,
            is_manually_edited: true,
            verification_label: 'Customized by user',
          };
        });

      return {
        ...d,
        morning: updateSlot(d.morning),
        afternoon: updateSlot(d.afternoon),
        evening: updateSlot(d.evening),
      };
    });
    setLocalDays(recalculateDays(next));
    setEditingActivityId(null);
  };

  // Add Activity Submit
  const handleAddActivitySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addingToSlot || !newActivityForm.title.trim()) return;

    const newAct: ItineraryActivity = {
      activity_id: `user-act-${Date.now().toString(36)}`,
      time_slot: addingToSlot.timeSlot,
      Suggested_time: newActivityForm.suggested_time,
      title: newActivityForm.title.trim(),
      description: newActivityForm.description.trim() || 'Custom user activity.',
      location: newActivityForm.location.trim() || 'City Center',
      estimated_duration_hours: Number(newActivityForm.duration_hours) || 1.0,
      transport_mode: newActivityForm.transport_mode || 'walking',
      estimated_cost: Number(newActivityForm.estimated_cost) || 0,
      currency: currency,
      cost_note: newActivityForm.cost_note.trim(),
      evidence_backed: false,
      verification_label: 'Manually added by user',
      is_manually_edited: true,
      citations: [],
      assumptions: ['User added custom schedule stop.'],
    };

    const next = localDays.map((d) => {
      if (d.day_number !== addingToSlot.dayNumber) return d;
      const slotKey = addingToSlot.timeSlot.toLowerCase() as
        | 'morning'
        | 'afternoon'
        | 'evening';
      return {
        ...d,
        [slotKey]: [...d[slotKey], newAct],
      };
    });

    setLocalDays(recalculateDays(next));
    setAddingToSlot(null);
    setNewActivityForm({
      title: '',
      description: '',
      location: '',
      suggested_time: '10:00 AM',
      duration_hours: 1.5,
      transport_mode: 'walking',
      estimated_cost: 0,
      cost_note: '',
    });
  };

  // Save full itinerary to backend
  const handleSaveToBackend = async () => {
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      await onSave(localDays);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setSaveError(err.message || 'Failed to save modified itinerary.');
    } finally {
      setIsSaving(false);
    }
  };

  const totalCost = localDays.reduce((acc, d) => acc + d.daily_estimated_cost, 0);

  return (
    <div className="space-y-6">
      {/* Top Banner & Save Action */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-teal-800">
            Dynamic Itinerary Editor
          </span>
          <h2 className="mt-0.5 font-serif text-2xl font-bold text-slate-900">
            {localDays.length}-Day Personalized Schedule
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            Customize activities, reorder timing, add personalized stops, and keep budget estimates in sync.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-[10px] uppercase font-bold text-slate-400">
              Total Ground Activities
            </span>
            <div className="font-serif text-lg font-bold text-teal-900">
              {currency} {totalCost.toLocaleString()}
            </div>
          </div>

          <button
            type="button"
            onClick={handleSaveToBackend}
            disabled={isSaving}
            className="inline-flex items-center gap-1.5 rounded-xl bg-teal-800 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-teal-900 transition-colors disabled:opacity-50"
          >
            {isSaving ? (
              <span>Saving...</span>
            ) : saveSuccess ? (
              <>
                <Check className="h-4 w-4 text-emerald-400" />
                <span>Saved Successfully!</span>
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                <span>Save Itinerary Changes</span>
              </>
            )}
          </button>
        </div>
      </div>

      {saveError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
          <span>{saveError}</span>
        </div>
      )}

      {/* Days List */}
      {localDays.map((day) => {
        const slots: {
          label: 'Morning' | 'Afternoon' | 'Evening';
          items: ItineraryActivity[];
        }[] = [
          { label: 'Morning', items: day.morning },
          { label: 'Afternoon', items: day.afternoon },
          { label: 'Evening', items: day.evening },
        ];

        return (
          <div
            key={day.day_number}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs"
          >
            {/* Day Header */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-900 px-6 py-4 text-white">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-teal-400">
                  Day {day.day_number} • {day.date}
                </span>
                <h3 className="font-serif text-lg font-bold">{day.theme}</h3>
              </div>
              <div className="rounded-lg bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-200">
                Daily Activities Cost: {currency} {day.daily_estimated_cost.toLocaleString()}
              </div>
            </div>

            {/* Time Slots */}
            <div className="divide-y divide-slate-100 p-6 space-y-6">
              {slots.map((slot) => (
                <div key={slot.label} className="pt-4 first:pt-0">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      {slot.label} Schedule ({slot.items.length})
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setAddingToSlot({
                          dayNumber: day.day_number,
                          timeSlot: slot.label,
                        })
                      }
                      className="inline-flex items-center gap-1 text-xs font-semibold text-teal-800 hover:text-teal-950 transition-colors"
                    >
                      <PlusCircle className="h-3.5 w-3.5" />
                      <span>Add {slot.label} Activity</span>
                    </button>
                  </div>

                  {slot.items.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
                      No activities planned for {slot.label.toLowerCase()}. Click &quot;Add {slot.label} Activity&quot; to add one.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {slot.items.map((act, index) => {
                        const isEditing = editingActivityId === act.activity_id;

                        return (
                          <div
                            key={act.activity_id}
                            className={`rounded-xl border p-4 transition-colors ${
                              act.is_manually_edited
                                ? 'border-indigo-200 bg-indigo-50/20'
                                : 'border-slate-200 bg-[#faf8f5]/60'
                            }`}
                          >
                            {isEditing ? (
                              /* Inline Edit Form */
                              <div className="space-y-3">
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                  <div>
                                    <label className="text-[11px] font-semibold text-slate-700">
                                      Title
                                    </label>
                                    <input
                                      type="text"
                                      value={editFormData.title || ''}
                                      onChange={(e) =>
                                        setEditFormData({ ...editFormData, title: e.target.value })
                                      }
                                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:outline-none focus:border-teal-700"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[11px] font-semibold text-slate-700">
                                      Suggested Time
                                    </label>
                                    <input
                                      type="text"
                                      value={editFormData.Suggested_time || ''}
                                      onChange={(e) =>
                                        setEditFormData({
                                          ...editFormData,
                                          Suggested_time: e.target.value,
                                        })
                                      }
                                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:outline-none focus:border-teal-700"
                                    />
                                  </div>
                                </div>

                                <div>
                                  <label className="text-[11px] font-semibold text-slate-700">
                                    Description
                                  </label>
                                  <textarea
                                    rows={2}
                                    value={editFormData.description || ''}
                                    onChange={(e) =>
                                      setEditFormData({
                                        ...editFormData,
                                        description: e.target.value,
                                      })
                                    }
                                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:outline-none focus:border-teal-700"
                                  />
                                </div>

                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                  <div>
                                    <label className="text-[11px] font-semibold text-slate-700">
                                      Estimated Cost ({currency})
                                    </label>
                                    <input
                                      type="number"
                                      value={editFormData.estimated_cost ?? 0}
                                      onChange={(e) =>
                                        setEditFormData({
                                          ...editFormData,
                                          estimated_cost: Number(e.target.value),
                                        })
                                      }
                                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:outline-none focus:border-teal-700"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[11px] font-semibold text-slate-700">
                                      Transport
                                    </label>
                                    <input
                                      type="text"
                                      value={editFormData.transport_mode || ''}
                                      onChange={(e) =>
                                        setEditFormData({
                                          ...editFormData,
                                          transport_mode: e.target.value,
                                        })
                                      }
                                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:outline-none focus:border-teal-700"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[11px] font-semibold text-slate-700">
                                      Cost Note
                                    </label>
                                    <input
                                      type="text"
                                      value={editFormData.cost_note || ''}
                                      onChange={(e) =>
                                        setEditFormData({
                                          ...editFormData,
                                          cost_note: e.target.value,
                                        })
                                      }
                                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:outline-none focus:border-teal-700"
                                    />
                                  </div>
                                </div>

                                <div className="flex justify-end gap-2 pt-2">
                                  <button
                                    type="button"
                                    onClick={() => setEditingActivityId(null)}
                                    className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleSaveEdit(day.day_number, act.activity_id)}
                                    className="rounded-lg bg-teal-800 px-3 py-1 text-xs font-semibold text-white hover:bg-teal-900"
                                  >
                                    Update Activity
                                  </button>
                                </div>
                              </div>
                            ) : (
                              /* Normal View */
                              <div>
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="rounded-md bg-teal-50 px-2.5 py-0.5 text-xs font-bold text-teal-900">
                                        {act.time_slot} • {act.Suggested_time}
                                      </span>

                                      {act.estimated_duration_hours && (
                                        <span className="flex items-center gap-1 text-xs text-slate-500">
                                          <Clock className="h-3.5 w-3.5" />
                                          {act.estimated_duration_hours} hrs
                                        </span>
                                      )}

                                      {/* Distinguish AI Recommendation vs Manually Edited */}
                                      {act.is_manually_edited ? (
                                        <span className="inline-flex items-center gap-1 rounded-full border border-indigo-300 bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold text-indigo-900">
                                          <UserCheck className="h-3 w-3 text-indigo-700" />
                                          <span>Manual User Edit</span>
                                        </span>
                                      ) : (
                                        <span
                                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                                            act.evidence_backed
                                              ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
                                              : 'border border-amber-200 bg-amber-50 text-amber-900'
                                          }`}
                                        >
                                          {act.verification_label}
                                        </span>
                                      )}
                                    </div>

                                    <h4 className="mt-2 font-serif text-lg font-bold text-slate-900">
                                      {act.title}
                                    </h4>
                                    <p className="mt-1 text-xs leading-relaxed text-slate-700 sm:text-sm">
                                      {act.description}
                                    </p>
                                  </div>

                                  {/* Right side controls: Cost & Actions */}
                                  <div className="flex flex-col items-end gap-2">
                                    <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-1.5 text-right text-xs shadow-2xs">
                                      <span className="text-[10px] font-semibold uppercase text-slate-400">
                                        Cost
                                      </span>
                                      <div className="font-serif text-sm font-bold text-slate-900">
                                        {act.estimated_cost !== null &&
                                        act.estimated_cost !== undefined
                                          ? `${act.currency} ${act.estimated_cost.toLocaleString()}`
                                          : 'Free / Unverified'}
                                      </div>
                                    </div>

                                    {/* Action buttons: Reorder, Edit, Delete */}
                                    <div className="flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleMoveActivity(
                                            day.day_number,
                                            slot.label,
                                            index,
                                            'up'
                                          )
                                        }
                                        disabled={index === 0}
                                        title="Move earlier"
                                        className="rounded-md border border-slate-200 p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                                      >
                                        <ChevronUp className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleMoveActivity(
                                            day.day_number,
                                            slot.label,
                                            index,
                                            'down'
                                          )
                                        }
                                        disabled={index === slot.items.length - 1}
                                        title="Move later"
                                        className="rounded-md border border-slate-200 p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                                      >
                                        <ChevronDown className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleStartEdit(act)}
                                        title="Edit Activity"
                                        className="rounded-md border border-slate-200 p-1 text-slate-600 hover:bg-teal-50 hover:text-teal-800"
                                      >
                                        <Edit2 className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleRemoveActivity(day.day_number, act.activity_id)
                                        }
                                        title="Remove Activity"
                                        className="rounded-md border border-slate-200 p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-700"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                </div>

                                {/* Citations */}
                                {act.citations && act.citations.length > 0 && (
                                  <div className="mt-3 flex flex-wrap items-center gap-2">
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                                      Evidence Citation:
                                    </span>
                                    {act.citations.map((cit) => (
                                      <button
                                        key={cit.chunk_id}
                                        type="button"
                                        onClick={() => onSelectCitation?.(cit)}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-teal-700/30 bg-teal-50/80 px-2.5 py-1 text-xs font-semibold text-teal-900 hover:bg-teal-100 transition-colors"
                                      >
                                        <BookOpen className="h-3.5 w-3.5 text-teal-700" />
                                        <span>
                                          {cit.document_title}, p. {cit.page_number ?? 1}
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Add Activity Modal */}
      {addingToSlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-serif text-lg font-bold text-slate-900">
                Add Activity to Day {addingToSlot.dayNumber} ({addingToSlot.timeSlot})
              </h3>
              <button
                type="button"
                onClick={() => setAddingToSlot(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAddActivitySubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Activity Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Visit Royal Botanical Gardens & Conservatory"
                  value={newActivityForm.title}
                  onChange={(e) =>
                    setNewActivityForm({ ...newActivityForm, title: e.target.value })
                  }
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-teal-700 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Details, exhibits to see, tips..."
                  value={newActivityForm.description}
                  onChange={(e) =>
                    setNewActivityForm({ ...newActivityForm, description: e.target.value })
                  }
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-teal-700 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Suggested Time
                  </label>
                  <input
                    type="text"
                    value={newActivityForm.suggested_time}
                    onChange={(e) =>
                      setNewActivityForm({
                        ...newActivityForm,
                        suggested_time: e.target.value,
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-teal-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Est. Duration (hrs)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={newActivityForm.duration_hours}
                    onChange={(e) =>
                      setNewActivityForm({
                        ...newActivityForm,
                        duration_hours: Number(e.target.value),
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-teal-700 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Est. Cost ({currency})
                  </label>
                  <input
                    type="number"
                    value={newActivityForm.estimated_cost}
                    onChange={(e) =>
                      setNewActivityForm({
                        ...newActivityForm,
                        estimated_cost: Number(e.target.value),
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-teal-700 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Transport Mode
                  </label>
                  <input
                    type="text"
                    value={newActivityForm.transport_mode}
                    onChange={(e) =>
                      setNewActivityForm({
                        ...newActivityForm,
                        transport_mode: e.target.value,
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3.5 py-2 text-sm focus:border-teal-700 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAddingToSlot(null)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-teal-800 px-4 py-2 text-xs font-bold text-white hover:bg-teal-900"
                >
                  Add to Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
