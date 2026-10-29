"""Pydantic schemas for TripWise AI."""
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field, field_validator


TravelStyleType = Literal[
    "relaxed", "adventure", "cultural", "luxury", "family", "business", "backpacking"
]
PaceType = Literal["relaxed", "balanced", "packed"]
TravelScopeType = Literal["domestic", "international"]
PolicyCheckStatus = Literal["PASS", "WARNING", "FAIL", "UNKNOWN"]
SeverityLevel = Literal["low", "medium", "high", "critical"]
VerificationLabel = Literal[
    "Verified in provided documents",
    "Document date unknown",
    "Current status not checked",
    "Requires official confirmation",
    "Missing from knowledge base",
]
WorkflowStageStatus = Literal[
    "pending", "running", "completed", "completed_with_warnings", "failed"
]
DocumentCategory = Literal[
    "destination_guide",
    "accommodation_policy",
    "transport_policy",
    "visa_and_entry_guidance",
    "safety_and_travel_restrictions",
    "accessibility_guidance",
    "other",
]


class TravellerPreferences(BaseModel):
    origin: str = Field(..., min_length=1, description="Origin city and country")
    destination: str = Field(..., min_length=1, description="Destination city or region")
    departure_date: str = Field(..., description="YYYY-MM-DD departure date")
    return_date: str = Field(..., description="YYYY-MM-DD return date")
    travellers_count: int = Field(default=2, ge=1, le=50)
    adults: int = Field(default=2, ge=1, le=50)
    children: int = Field(default=0, ge=0, le=50)
    travel_scope: TravelScopeType = Field(default="domestic")

    # Step 2: Preferences
    budget_total: float = Field(..., gt=0, description="Total trip budget")
    currency: str = Field(default="INR", min_length=3, max_length=5)
    travel_style: TravelStyleType = Field(default="cultural")
    interests: List[str] = Field(default_factory=lambda: ["food", "museums", "history"])
    accommodation_type: str = Field(default="budget_hotel")
    transport_modes: List[str] = Field(default_factory=lambda: ["public_transport", "walking"])
    dietary_requirements: Optional[str] = Field(default="")
    accessibility_needs: Optional[str] = Field(default="")
    pace: PaceType = Field(default="relaxed")

    # Step 3: Practical requirements
    visa_status_note: Optional[str] = Field(default="")
    accommodation_requirements: Optional[str] = Field(default="")
    transport_constraints: Optional[str] = Field(default="")
    safety_considerations: Optional[str] = Field(default="")
    additional_instructions: Optional[str] = Field(default="")

    @field_validator("origin", "destination")
    @classmethod
    def strip_text(cls, v: str) -> str:
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("Field cannot be empty or whitespace only.")
        return cleaned


class CitationReference(BaseModel):
    chunk_id: str
    document_id: str
    document_title: str
    category: str
    authority: str
    page_number: Optional[int] = None
    section_heading: Optional[str] = None
    excerpt: str
    publication_date: Optional[str] = None
    verification_status: VerificationLabel = "Verified in provided documents"
    is_demonstration: bool = True


class ItineraryActivity(BaseModel):
    activity_id: str
    time_slot: Literal["Morning", "Afternoon", "Evening"]
    Suggested_time: str = Field(default="09:30 AM")
    title: str
    description: str
    location: str
    estimated_duration_hours: Optional[float] = None
    transport_mode: str
    estimated_cost: Optional[float] = None
    currency: str = "INR"
    cost_note: str = ""
    meal_suggestion: Optional[str] = None
    accessibility_note: Optional[str] = None
    evidence_backed: bool = True
    verification_label: str = "Supported by retrieved document"
    citations: List[CitationReference] = Field(default_factory=list)
    assumptions: List[str] = Field(default_factory=list)


class ItineraryDay(BaseModel):
    day_number: int
    date: str
    theme: str
    is_indicative_schedule: bool = True
    morning: List[ItineraryActivity] = Field(default_factory=list)
    afternoon: List[ItineraryActivity] = Field(default_factory=list)
    evening: List[ItineraryActivity] = Field(default_factory=list)
    daily_estimated_cost: float = 0.0
    daily_notes: List[str] = Field(default_factory=list)


class RetrievedSource(BaseModel):
    chunk_id: str
    document_id: str
    document_title: str
    source_type: str
    category: str
    page_number: Optional[int] = None
    section_heading: Optional[str] = None
    excerpt: str
    publication_date: Optional[str] = None
    last_verified_date: Optional[str] = None
    authority_level: str
    retrieval_score: float = Field(..., description="Hybrid similarity score (not factual certainty)")
    semantic_score: float = 0.0
    keyword_score: float = 0.0
    verification_status: VerificationLabel
    matched_topics: List[str] = Field(default_factory=list)


class PolicyCheck(BaseModel):
    check_id: str
    category: str
    rule_checked: str
    status: PolicyCheckStatus
    explanation: str
    supporting_document_id: Optional[str] = None
    supporting_document_title: Optional[str] = None
    page_or_section: Optional[str] = None
    excerpt: Optional[str] = None
    conflicting_document_id: Optional[str] = None
    conflicting_document_title: Optional[str] = None
    conflicting_excerpt: Optional[str] = None
    recommended_action: str
    requires_manual_confirmation: bool = True


class MissingInformation(BaseModel):
    issue_id: str
    title: str
    severity: SeverityLevel
    status_label: VerificationLabel
    reason: str
    affected_item: str
    source_document_id: Optional[str] = None
    source_document_title: Optional[str] = None
    recommended_action: str
    can_proceed_provisionally: bool = True


class BudgetBreakdown(BaseModel):
    currency: str = "INR"
    total_budget: float
    accommodation_estimate: float
    transport_estimate: float
    activities_and_entry_estimate: float
    food_and_dining_estimate: float
    contingency_buffer: float
    total_estimated_cost: float
    within_budget: bool
    budget_utilization_percent: float
    basis_note: str


class LiveVerificationResult(BaseModel):
    category: str
    provider_name: str
    status: Literal["unavailable", "verified", "failed"]
    checked_at: str
    source_url: Optional[str] = None
    message: str


class WorkflowStageDetail(BaseModel):
    stage_number: int
    stage_id: str
    stage_name: str
    status: WorkflowStageStatus
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    summary: str
    details: Dict[str, Any] = Field(default_factory=dict)
    warnings: List[str] = Field(default_factory=list)
    error: Optional[str] = None


class WorkflowRun(BaseModel):
    run_id: str
    trip_id: str
    overall_status: WorkflowStageStatus
    started_at: str
    completed_at: Optional[str] = None
    generation_mode: str = "deterministic_evidence_backed"
    stages: List[WorkflowStageDetail] = Field(default_factory=list)


class NormalizedTravelProfile(BaseModel):
    origin: str
    destination: str
    departure_date: str
    return_date: str
    duration_days: int
    travellers_count: int
    adults: int
    children: int
    requires_international_checks: bool
    budget_total: float
    daily_budget_per_person: float
    currency: str
    travel_style: str
    pace: str
    interests: List[str]
    accommodation_type: str
    transport_modes: List[str]
    accessibility_needs: str
    dietary_requirements: str
    stated_constraints: List[str]
    assumptions: List[str]
    missing_fields: List[str]
    detected_conflicts: List[str]


class FinalTripPlan(BaseModel):
    trip_id: str
    title: str
    created_at: str
    updated_at: str
    verification_summary_status: str
    is_fully_verified: bool = False
    preferences: TravellerPreferences
    normalized_profile: Optional[NormalizedTravelProfile] = None
    trip_summary: str = ""
    itinerary_days: List[ItineraryDay] = Field(default_factory=list)
    budget_breakdown: Optional[BudgetBreakdown] = None
    accommodation_considerations: List[str] = Field(default_factory=list)
    transport_considerations: List[str] = Field(default_factory=list)
    retrieved_sources: List[RetrievedSource] = Field(default_factory=list)
    policy_checks: List[PolicyCheck] = Field(default_factory=list)
    missing_information: List[MissingInformation] = Field(default_factory=list)
    live_verifications: List[LiveVerificationResult] = Field(default_factory=list)
    planning_assumptions: List[str] = Field(default_factory=list)
    limitations_and_disclaimers: List[str] = Field(default_factory=list)
    how_plan_was_created: Dict[str, Any] = Field(default_factory=dict)
    workflow_run: Optional[WorkflowRun] = None


class TravelDocumentMetadata(BaseModel):
    document_id: str
    title: str
    filename: str
    file_type: str
    file_size_bytes: int
    category: DocumentCategory
    authority: str = "demonstration_source"
    publication_date: Optional[str] = None
    last_verified_date: Optional[str] = None
    destination: str = "Sample City"
    is_demonstration: bool = True
    processing_status: Literal["indexed", "processing", "failed"] = "indexed"
    chunk_count: int = 0
    page_count: int = 1
    content_hash: str = ""
    created_at: str
    summary_excerpt: str = ""


class DocumentChunkModel(BaseModel):
    chunk_id: str
    document_id: str
    document_title: str
    category: str
    authority: str
    destination: str
    page_number: Optional[int] = None
    section_heading: Optional[str] = None
    chunk_index: int
    content: str
    publication_date: Optional[str] = None
    last_verified_date: Optional[str] = None
    is_demonstration: bool = True


class TravelDocumentDetail(TravelDocumentMetadata):
    full_text: str = ""
    chunks: List[DocumentChunkModel] = Field(default_factory=list)


class KnowledgeSearchRequest(BaseModel):
    query: str = Field(..., min_length=1)
    destination: Optional[str] = None
    category: Optional[str] = None
    top_k: int = Field(default=8, ge=1, le=30)


class KnowledgeSearchResponse(BaseModel):
    query: str
    total_results: int
    retrieval_method: str
    note: str = "Retrieval scores reflect semantic and keyword similarity, not factual confidence."
    results: List[RetrievedSource]
