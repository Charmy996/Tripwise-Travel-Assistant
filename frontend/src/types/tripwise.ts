export type TravelStyleType =
  | 'relaxed'
  | 'adventure'
  | 'cultural'
  | 'luxury'
  | 'family'
  | 'business'
  | 'backpacking';

export type PaceType = 'relaxed' | 'balanced' | 'packed';
export type TravelScopeType = 'domestic' | 'international';
export type PolicyCheckStatus = 'PASS' | 'WARNING' | 'FAIL' | 'UNKNOWN';
export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical';
export type VerificationLabel =
  | 'Verified in provided documents'
  | 'Document date unknown'
  | 'Current status not checked'
  | 'Requires official confirmation'
  | 'Missing from knowledge base';

export type WorkflowStageStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'completed_with_warnings'
  | 'failed';

export type DocumentCategory =
  | 'destination_guide'
  | 'accommodation_policy'
  | 'transport_policy'
  | 'visa_and_entry_guidance'
  | 'safety_and_travel_restrictions'
  | 'accessibility_guidance'
  | 'other';

export type DocumentProcessingStatus =
  | 'uploaded'
  | 'queued'
  | 'extracting'
  | 'chunking'
  | 'generating_embeddings'
  | 'indexing'
  | 'completed'
  | 'indexed'
  | 'failed'
  | 'processing';

export interface LocationModel {
  id: string;
  name: string;
  admin_area?: string;
  country: string;
  country_code?: string;
  latitude?: number | null;
  longitude?: number | null;
  display_name: string;
  type?: string;
}

export interface LocationSearchResponse {
  query: string;
  total: number;
  provider: string;
  cached: boolean;
  attribution: string;
  results: LocationModel[];
}

export interface TravellerPreferences {
  origin: string;
  destination: string;
  origin_location?: LocationModel | null;
  destination_location?: LocationModel | null;
  departure_date: string;
  return_date: string;
  travellers_count: number;
  adults: number;
  children: number;
  travel_scope: TravelScopeType;

  budget_total: number;
  currency: string;
  travel_style: TravelStyleType;
  interests: string[];
  accommodation_type: string;
  transport_modes: string[];
  dietary_requirements?: string;
  accessibility_needs?: string;
  pace: PaceType;

  visa_status_note?: string;
  accommodation_requirements?: string;
  transport_constraints?: string;
  safety_considerations?: string;
  additional_instructions?: string;
}

export interface CitationReference {
  chunk_id: string;
  document_id: string;
  document_title: string;
  category: string;
  authority: string;
  page_number?: number | null;
  section_heading?: string | null;
  excerpt: string;
  publication_date?: string | null;
  verification_status: VerificationLabel;
  is_demonstration: boolean;
}

export interface ItineraryActivity {
  activity_id: string;
  time_slot: 'Morning' | 'Afternoon' | 'Evening';
  Suggested_time: string;
  title: string;
  description: string;
  location: string;
  estimated_duration_hours?: number | null;
  transport_mode: string;
  estimated_cost?: number | null;
  currency: string;
  cost_note: string;
  meal_suggestion?: string | null;
  accessibility_note?: string | null;
  evidence_backed: boolean;
  verification_label: string;
  is_manually_edited?: boolean;
  citations: CitationReference[];
  assumptions: string[];
}

export interface ItineraryDay {
  day_number: number;
  date: string;
  theme: string;
  is_indicative_schedule: boolean;
  morning: ItineraryActivity[];
  afternoon: ItineraryActivity[];
  evening: ItineraryActivity[];
  daily_estimated_cost: number;
  daily_notes: string[];
}

export interface RetrievedSource {
  chunk_id: string;
  document_id: string;
  document_title: string;
  source_type: string;
  category: string;
  page_number?: number | null;
  section_heading?: string | null;
  excerpt: string;
  publication_date?: string | null;
  last_verified_date?: string | null;
  authority_level: string;
  retrieval_score: number;
  semantic_score: number;
  keyword_score: number;
  verification_status: VerificationLabel;
  matched_topics: string[];
}

export interface PolicyCheck {
  check_id: string;
  category: string;
  rule_checked: string;
  status: PolicyCheckStatus;
  explanation: string;
  supporting_document_id?: string | null;
  supporting_document_title?: string | null;
  page_or_section?: string | null;
  excerpt?: string | null;
  conflicting_document_id?: string | null;
  conflicting_document_title?: string | null;
  conflicting_excerpt?: string | null;
  recommended_action: string;
  requires_manual_confirmation: boolean;
}

export interface MissingInformation {
  issue_id: string;
  title: string;
  severity: SeverityLevel;
  status_label: VerificationLabel;
  reason: string;
  affected_item: string;
  source_document_id?: string | null;
  source_document_title?: string | null;
  recommended_action: string;
  can_proceed_provisionally: boolean;
}

export interface BudgetBreakdown {
  currency: string;
  total_budget: number;
  accommodation_estimate: number;
  transport_estimate: number;
  activities_and_entry_estimate: number;
  food_and_dining_estimate: number;
  contingency_buffer: number;
  total_estimated_cost: number;
  within_budget: boolean;
  budget_utilization_percent: number;
  basis_note: string;
}

export interface LiveVerificationResult {
  category: string;
  provider_name: string;
  status: 'unavailable' | 'verified' | 'failed';
  checked_at: string;
  source_url?: string | null;
  message: string;
}

export interface WorkflowStageDetail {
  stage_number: number;
  stage_id: string;
  stage_name: string;
  status: WorkflowStageStatus;
  started_at?: string | null;
  completed_at?: string | null;
  summary: string;
  details: Record<string, any>;
  warnings: string[];
  error?: string | null;
}

export interface WorkflowRun {
  run_id: string;
  trip_id: string;
  overall_status: WorkflowStageStatus;
  started_at: string;
  completed_at?: string | null;
  generation_mode: string;
  stages: WorkflowStageDetail[];
}

export interface NormalizedTravelProfile {
  origin: string;
  destination: string;
  departure_date: string;
  return_date: string;
  duration_days: number;
  travellers_count: number;
  adults: number;
  children: number;
  requires_international_checks: boolean;
  budget_total: number;
  daily_budget_per_person: number;
  currency: string;
  travel_style: string;
  pace: string;
  interests: string[];
  accommodation_type: string;
  transport_modes: string[];
  accessibility_needs: string;
  dietary_requirements: string;
  stated_constraints: string[];
  assumptions: string[];
  missing_fields: string[];
  detected_conflicts: string[];
}

export interface FinalTripPlan {
  trip_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  verification_summary_status: string;
  is_fully_verified: boolean;
  preferences: TravellerPreferences;
  normalized_profile?: NormalizedTravelProfile | null;
  trip_summary: string;
  itinerary_days: ItineraryDay[];
  budget_breakdown?: BudgetBreakdown | null;
  accommodation_considerations: string[];
  transport_considerations: string[];
  retrieved_sources: RetrievedSource[];
  policy_checks: PolicyCheck[];
  missing_information: MissingInformation[];
  live_verifications: LiveVerificationResult[];
  planning_assumptions: string[];
  limitations_and_disclaimers: string[];
  how_plan_was_created: Record<string, any>;
  workflow_run?: WorkflowRun | null;
}

export interface TravelDocumentMetadata {
  document_id: string;
  title: string;
  filename: string;
  file_type: string;
  file_size_bytes: number;
  category: DocumentCategory;
  authority: string;
  publication_date?: string | null;
  last_verified_date?: string | null;
  destination: string;
  is_demonstration: boolean;
  processing_status: DocumentProcessingStatus;
  processing_error?: string | null;
  chunk_count: number;
  page_count: number;
  content_hash: string;
  created_at: string;
  summary_excerpt: string;
}

export interface DocumentChunkModel {
  chunk_id: string;
  document_id: string;
  document_title: string;
  category: string;
  authority: string;
  destination: string;
  page_number?: number | null;
  section_heading?: string | null;
  chunk_index: number;
  content: string;
  publication_date?: string | null;
  last_verified_date?: string | null;
  is_demonstration: boolean;
}

export interface TravelDocumentDetail extends TravelDocumentMetadata {
  full_text: string;
  chunks: DocumentChunkModel[];
}

export interface KnowledgeSearchResponse {
  query: string;
  total_results: number;
  retrieval_method: string;
  note: string;
  results: RetrievedSource[];
}

export interface SystemSettingsStatus {
  app_name: string;
  version: string;
  llm_provider: string;
  llm_model: string;
  llm_configured: boolean;
  llm_mode_description: string;
  embedding_backend: string;
  vector_store: string;
  indexed_documents_count: number;
  indexed_chunks_count: number;
  live_verification_enabled: boolean;
  live_advisory_configured: boolean;
  live_weather_configured: boolean;
  max_upload_size_mb: number;
  allowed_extensions: string[];
  location_provider?: string;
}

export interface TripSummary {
  trip_id: string;
  title: string;
  destination: string;
  origin?: string;
  created_at: string;
  updated_at: string;
  duration_days: number;
  travel_style: string;
  budget_total: number;
  currency: string;
  verification_summary_status: string;
  is_fully_verified: boolean;
}

export interface DashboardSummary {
  total_trips: number;
  total_documents: number;
  total_chunks: number;
  total_workflows: number;
  pending_tasks: number;
  recent_trips: TripSummary[];
  recent_documents: TravelDocumentMetadata[];
  policy_warning_summary: Record<string, number>;
}

export interface DocumentListResponse {
  items: TravelDocumentMetadata[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}
