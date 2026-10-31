"""Automated tests for Location Autocomplete, Dashboard Summary, Itinerary Editing, and Document Pagination."""
import io
import time
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from app.api.routes import set_test_dependencies
from app.db.database import DatabaseManager
from app.main import app
from app.retrieval.hybrid_retriever import HybridRetriever
from app.schemas.models import (
    ItineraryActivity,
    ItineraryDay,
    ItineraryUpdateRequest,
    TravellerPreferences,
)
from app.services.location_service import get_location_service
from app.services.seed_service import DEMO_TRIP_ID, ensure_seeded, get_default_demo_preferences


@pytest.fixture()
def test_env(tmp_path: Path):
    db_file = tmp_path / "test_opt_tripwise.db"
    db = DatabaseManager(db_path=db_file)
    retriever = HybridRetriever()
    ensure_seeded(db, retriever, force_reseed=True)
    set_test_dependencies(db, retriever)
    client = TestClient(app)
    return db, retriever, client


def test_location_autocomplete_mumbai(test_env):
    _, _, client = test_env
    resp = client.get("/api/locations/search?q=Mum")
    assert resp.status_code == 200
    data = resp.json()
    assert data["query"] == "Mum"
    assert data["total"] >= 1
    # Check that Mumbai is present with structured fields
    mumbai_matches = [r for r in data["results"] if "mumbai" in r["name"].lower()]
    assert len(mumbai_matches) >= 1
    m = mumbai_matches[0]
    assert m["name"] == "Mumbai"
    assert m["country"] == "India"
    assert m["latitude"] is not None
    assert m["longitude"] is not None
    assert "Mumbai" in m["display_name"]


def test_location_autocomplete_london_and_new_york(test_env):
    _, _, client = test_env
    # London
    resp_lon = client.get("/api/locations/search?q=Lon")
    assert resp_lon.status_code == 200
    data_lon = resp_lon.json()
    assert any("london" in r["name"].lower() for r in data_lon["results"])

    # New York / New Delhi
    resp_new = client.get("/api/locations/search?q=New")
    assert resp_new.status_code == 200
    data_new = resp_new.json()
    names = [r["name"].lower() for r in data_new["results"]]
    assert any("new york" in n or "new delhi" in n or "newcastle" in n for n in names)


def test_location_autocomplete_short_and_empty_queries(test_env):
    _, _, client = test_env
    # Single character query should return 0 results
    resp = client.get("/api/locations/search?q=M")
    assert resp.status_code == 200
    assert resp.json()["total"] == 0
    assert resp.json()["results"] == []

    # Non-matching query
    resp_none = client.get("/api/locations/search?q=ZzZzZzZzNonExistent")
    assert resp_none.status_code == 200
    assert resp_none.json()["total"] == 0


def test_location_result_caching(test_env):
    _, _, client = test_env
    # First request
    resp1 = client.get("/api/locations/search?q=Mum")
    assert resp1.status_code == 200
    # Second request should be served from cache
    resp2 = client.get("/api/locations/search?q=Mum")
    assert resp2.status_code == 200
    assert resp2.json()["cached"] is True
    assert len(resp2.json()["results"]) == len(resp1.json()["results"])


def test_dashboard_summary_endpoint(test_env):
    _, _, client = test_env
    resp = client.get("/api/dashboard/summary")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_trips"] >= 1
    assert data["total_documents"] >= 6
    assert data["total_chunks"] >= 20
    assert isinstance(data["recent_trips"], list)
    assert len(data["recent_trips"]) >= 1
    assert isinstance(data["recent_documents"], list)
    assert "policy_warning_summary" in data


def test_recent_trips_endpoint(test_env):
    _, _, client = test_env
    resp = client.get("/api/trips/recent?limit=3")
    assert resp.status_code == 200
    trips = resp.json()
    assert isinstance(trips, list)
    assert len(trips) >= 1
    # Verify lightweight summary fields
    t = trips[0]
    assert "trip_id" in t
    assert "title" in t
    assert "destination" in t
    assert "duration_days" in t
    # Ensure full nested itinerary_days is NOT leaked in recent trips
    assert "itinerary_days" not in t


def test_document_pagination_and_filtering(test_env):
    _, _, client = test_env
    # Paginated query
    resp = client.get("/api/documents?page=1&limit=3")
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert "total" in data
    assert data["total"] >= 6
    assert len(data["items"]) == 3
    assert data["page"] == 1
    assert data["limit"] == 3
    assert data["total_pages"] >= 2

    # Category filter
    resp_cat = client.get("/api/documents?page=1&limit=10&category=accommodation_policy")
    assert resp_cat.status_code == 200
    for doc in resp_cat.json()["items"]:
        assert doc["category"] == "accommodation_policy"

    # Search filter
    resp_search = client.get("/api/documents?page=1&limit=10&search=Museum")
    assert resp_search.status_code == 200
    assert any("museum" in d["title"].lower() or "museum" in d["filename"].lower() for d in resp_search.json()["items"])


def test_itinerary_editing_and_recalculation(test_env):
    db, _, client = test_env
    trip = db.get_trip(DEMO_TRIP_ID)
    assert trip is not None
    original_days = trip.itinerary_days
    assert len(original_days) >= 1

    # Modify an activity description, add a new user activity, recalculate costs
    modified_days = [day.model_copy(deep=True) for day in original_days]
    first_day = modified_days[0]

    # Add a manually edited activity
    new_activity = ItineraryActivity(
        activity_id="user-act-001",
        time_slot="Evening",
        Suggested_time="07:30 PM",
        title="Dinner at Authentic Cultural Restaurant",
        description="User-customized dining reservation at verified restaurant.",
        location="Sample City Heritage Lane",
        estimated_duration_hours=2.0,
        transport_mode="walking",
        estimated_cost=1500.0,
        currency="INR",
        cost_note="INR 750 per person for 2 adults",
        is_manually_edited=True,
        evidence_backed=False,
        verification_label="Manually added by user",
    )
    first_day.evening.append(new_activity)

    update_payload = {
        "itinerary_days": [d.model_dump() for d in modified_days],
        "recalculate_budget": True,
    }

    resp = client.put(f"/api/trips/{DEMO_TRIP_ID}/itinerary", json=update_payload)
    assert resp.status_code == 200
    updated_trip = resp.json()

    # Verify updated activity is saved
    day1_evening_acts = updated_trip["itinerary_days"][0]["evening"]
    assert any(a["activity_id"] == "user-act-001" and a["is_manually_edited"] is True for a in day1_evening_acts)
    # Verify daily estimated cost was updated
    assert updated_trip["itinerary_days"][0]["daily_estimated_cost"] > 0
