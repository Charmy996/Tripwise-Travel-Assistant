"""Seed service for creating sample demonstration documents and running the initial demo scenario."""
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional
import pymupdf as fitz  # PyMuPDF

from app.core.config import get_settings
from app.db.database import DatabaseManager
from app.retrieval.document_processor import process_document_bytes
from app.retrieval.hybrid_retriever import HybridRetriever
from app.schemas.models import DocumentCategory, TravellerPreferences
from app.workflow.pipeline import TripPlanningWorkflow


def _build_accommodation_pdf_bytes() -> bytes:
    """Create a real 2-page PDF document for the Sample Accommodation Policy using PyMuPDF."""
    doc = fitz.open()

    # Page 1
    p1 = doc.new_page(width=595, height=842)
    p1_text = (
        "SAMPLE ACCOMMODATION POLICY — HARBOURVIEW BUDGET INN (DEMONSTRATION)\n"
        "Document ID: sample-accommodation-001 | Category: Accommodation Policy\n"
        "Notice: Fictional educational demonstration document — not a real booking policy.\n\n"
        "Section 1: Property Overview & Standard Room Tariffs\n"
        "Harbourview Budget Inn is a curated budget hotel located in Sample City (Zone 1, 300m from Harbour Metro Station).\n"
        "Standard Double Room Tariff (up to 2 Adults): INR 3,200 per night, inclusive of complimentary morning breakfast and municipal taxes.\n"
        "Extra bed or third guest is not permitted in Standard Double rooms.\n\n"
        "Section 2: Guest Age & Identification Requirements\n"
        "Minimum age for primary check-in is 18 years. All adult guests must present a valid, original government-issued photo identification "
        "(Aadhaar Card, Passport, Voter ID, or Driving Licence) upon registration at the front desk. Digital photocopies without original cards are not accepted."
    )
    p1.insert_textbox(fitz.Rect(50, 50, 545, 780), p1_text, fontsize=11, fontname="helv")

    # Page 2
    p2 = doc.new_page(width=595, height=842)
    p2_text = (
        "SAMPLE ACCOMMODATION POLICY — HARBOURVIEW BUDGET INN (PAGE 2)\n"
        "Notice: Demonstration document — not a real booking policy.\n\n"
        "Section 3: Check-In, Check-Out & Early Arrival Restrictions\n"
        "Check-in begins at 3:00 PM (15:00) local time. Standard check-out is strictly by 11:00 AM.\n"
        "Early check-in before 12:00 PM is not permitted under the standard budget hotel tariff unless the room is reserved from the previous night.\n"
        "IMPORTANT RENOVATION RESTRICTION: Due to ongoing ground-floor security renovations, early arrival luggage drop-off or baggage storage before 10:00 AM is strictly prohibited. "
        "Guests arriving in Sample City before 10:00 AM must use municipal left-luggage lockers at Central Metro Station.\n\n"
        "Section 4: Cancellation, Refund & Quiet Hours Policy\n"
        "Free cancellation and full refund are available up to 48 hours prior to the scheduled check-in date. "
        "Cancellations made less than 48 hours before check-in or no-shows incur a 1-night room tariff penalty (INR 3,200).\n"
        "Quiet hours are enforced between 10:00 PM and 6:00 AM. Unregistered visitors are not permitted inside guest rooms after 9:00 PM."
    )
    p2.insert_textbox(fitz.Rect(50, 50, 545, 780), p2_text, fontsize=11, fontname="helv")

    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


SAMPLE_DOCUMENTS_SPEC: List[Dict] = [
    {
        "document_id": "sample-destination-001",
        "title": "Sample Destination Travel Guide — Sample City Cultural & Sightseeing Handbook",
        "filename": "sample_city_destination_guide.md",
        "category": "destination_guide",
        "authority": "demonstration_source",
        "publication_date": "2026-01-15",
        "last_verified_date": "2026-02-01",
        "destination": "Sample City",
        "content": """# Sample Destination Travel Guide — Sample City (Demonstration)

> **Status:** Clearly labelled fictional demonstration content for academic evaluation — not real-world travel advice.

## Section 1: Historic Core & Cultural Highlights

Sample City is a coastal heritage destination celebrated for its walkable historic quarter, maritime history, botanical gardens, and vibrant street food culture. A 3-day relaxed cultural itinerary comfortably covers the city's primary districts via public Metro and city buses.

- **Old Quarter Heritage Walk:** Recommended visit duration is 2.5 hours (morning). Entry to the public plazas is free, though visitors must register online for the mandatory Old Quarter Digital Eco-Pass 24 hours prior to entry.
- **Sample City National Museum:** Located on Metro Line 1 (Museum Precinct). Recommended visit duration is 3 hours. According to this guidebook edition, adult admission is INR 500 per person, open Tuesday through Sunday from 10:00 AM to 5:00 PM (closed on Mondays). Exhibits feature royal textiles, regional bronzes, and coastal archaeology.
- **Spice Harbour Street Food Market:** Recommended evening visit duration is 2 hours. Approximate meal and tasting cost is INR 600 per person. Travellers should dine at municipal vendor stalls displaying the inspected "Green Hygiene Seal".

--- PAGE 2 ---

## Section 2: Gardens, Maritime Heritage & Artisan Quarters

- **Citadel Botanical Gardens & Conservatory:** Recommended morning visit duration is 2 hours. Entry tariff is INR 300 per adult. **Seasonal Maintenance Note:** The historic North Watchtower inside Citadel Botanical Gardens is currently subject to seasonal structural maintenance closures, though all main botanical lawns and glasshouses remain open.
- **Maritime History Gallery & Old Dockyard:** Recommended afternoon visit duration is 2 hours. Entry tariff is INR 400 per adult. Features historic navigation instruments, port maps, and restored merchant vessels.
- **Riverfront Cultural Promenade & Traditional Thali Dinner:** Recommended evening visit duration is 2.5 hours. Walking the promenade is free; a traditional regional sit-down Thali dinner at heritage riverfront restaurants costs approximately INR 800 per person.
- **Artisans Craft Bazaar & Handloom Textile Museum:** Located in Zone 2. Recommended morning visit duration is 2.5 hours. Textile Museum admission is INR 350 per adult, featuring live block-printing and weaving demonstrations.
- **Old Town Cafe District & Sunset Viewpoint Pavilion:** Recommended afternoon cafe break (1.5 hours, approx. INR 500 per person for lunch) followed by the free Sunset Viewpoint Pavilion (1.5 hours) overlooking the harbour.
""",
    },
    {
        "document_id": "sample-accommodation-001",
        "title": "Sample Accommodation Policy — Harbourview Budget Inn",
        "filename": "sample_accommodation_policy.pdf",
        "category": "accommodation_policy",
        "authority": "demonstration_source",
        "publication_date": None,  # Intentionally undated to demonstrate missing publication date detection
        "last_verified_date": None,
        "destination": "Sample City",
        "is_pdf": True,
    },
    {
        "document_id": "sample-transport-001",
        "title": "Sample Transport Policy — Sample City Metro & Public Transit Rider Rules",
        "filename": "sample_transport_policy.md",
        "category": "transport_policy",
        "authority": "demonstration_source",
        "publication_date": "2025-11-10",
        "last_verified_date": "2026-01-10",
        "destination": "Sample City",
        "content": """# Sample City Metro & Public Transit Rider Policy (Demonstration)

> **Status:** Demonstration document — fictional municipal transit policy for TripWise AI evaluation.

## Section 1: Tourist Passes, Fares & Operating Hours

The Sample City Integrated Public Transport Network operates Metro Lines 1 & 2 and electric city feeder buses across Zones 1 to 3 (connecting Central Station, Old Quarter, Museum Precinct, Citadel Gardens, Dockyard, and Artisans Quarter).

- **3-Day Unlimited Tourist Transit Pass:** Costs INR 450 per adult for 3 consecutive days of unlimited Metro and city bus travel within Zones 1–3. Single-journey tokens cost INR 40 to INR 70.
- **Operating Window:** Trains and city buses operate daily from 6:00 AM to 10:30 PM.
- **Schedule Limitation:** Exact live train headways, holiday service alterations, and intercity rail/flight schedules from origin cities (such as Mumbai) are not included in this static policy manual and must be checked at station terminals.

--- PAGE 2 ---

## Section 2: Luggage, Baggage & Peak-Hour Boarding Restrictions

To prevent overcrowding on public transit commuters must comply with the following baggage regulations:

- **Peak-Hour Luggage Rule:** During designated weekday and weekend peak hours (**8:00 AM – 10:30 AM** and **5:30 PM – 8:00 PM**), each passenger may carry at most **1 cabin-sized bag** not exceeding **55 x 40 x 20 cm** and **15 kg** in weight.
- **Oversized Suitcases:** Large check-in suitcases exceeding 55 cm or 15 kg are strictly prohibited on Metro trains and city buses during peak hours. Travellers arriving or departing with heavy baggage during peak windows must use licensed station taxis or travel outside peak hours.
- **Prohibited Items:** Flammable liquids, unsealed paint cans, and commercial cargo are prohibited across all public transit vehicles.
""",
    },
    {
        "document_id": "sample-entry-001",
        "title": "Sample Entry & Travel Restriction Guidance — Sample City Regional Permits",
        "filename": "sample_entry_guidance.txt",
        "category": "visa_and_entry_guidance",
        "authority": "demonstration_source",
        "publication_date": "2024-06-01",  # Intentionally dated 2024 to demonstrate outdated document freshness warning
        "last_verified_date": "2024-06-01",
        "destination": "Sample City",
        "content": """SAMPLE CITY REGIONAL ENTRY, PERMIT & ADVISORY GUIDELINES (DEMONSTRATION)
Document ID: sample-entry-001 | Publication Date: 2024-06-01
Notice: Fictional educational demonstration document — not official government immigration advice.

Section 1: Domestic & International Entry Requirements
1. Domestic Travellers (Originating within India, e.g., Mumbai, Delhi, Bengaluru):
   Domestic visitors do not require a visa to enter Sample City. However, all adult travellers must carry a valid original government-issued photo identification document (Aadhaar, Passport, Voter ID, or Driving Licence) for hotel registration and heritage zone checkpoints.

2. International Travellers:
   Foreign nationals must hold a valid passport with at least 6 months remaining validity and an approved visa prior to boarding. Because this guidance document was last updated in June 2024, international travellers must verify current visa-on-arrival or e-visa rules with an official embassy before travel.

Section 2: Mandatory Old Quarter Digital Eco-Pass (24-Hour Advance Rule)
To manage pedestrian footfall in the historic conservation core, all visitors entering the Old Quarter Heritage Zone must register online for a free "Digital Eco-Pass" at least 24 hours prior to their planned morning walk. Same-day walk-up passes at the heritage gate are subject to daily quota exhaustion.
""",
    },
    {
        "document_id": "sample-safety-001",
        "title": "Sample Accessibility & Safety Guidance — Sample City Traveller Handbook",
        "filename": "sample_safety_accessibility.md",
        "category": "accessibility_guidance",
        "authority": "demonstration_source",
        "publication_date": "2026-01-20",
        "last_verified_date": "2026-01-20",
        "destination": "Sample City",
        "content": """# Sample City Accessibility, Health & Safety Guidance (Demonstration)

> **Status:** Demonstration document — fictional safety and accessibility reference for TripWise AI.

## Section 1: Accessibility & Mobility Infrastructure

- **Step-Free Venues:** The Sample City National Museum, Maritime History Gallery, and all Metro Line 1 & Line 2 stations are equipped with step-free elevators, wheelchair ramps, accessible restrooms, and tactile platform paving.
- **Limited Accessibility Zones:** The historic Old Quarter features uneven 18th-century cobblestone alleys, and the upper terrace of the Sunset Viewpoint Pavilion is reached via 65 steep stone steps without an elevator (a road-accessible lower viewing deck is available).

## Section 2: Food Hygiene, Drone Restrictions & Emergency Contacts

- **Culinary & Water Safety:** Travellers should consume bottled or filtered water. When dining at the Spice Harbour Street Food Market, choose stalls displaying the municipal **"Green Hygiene Seal"** indicating inspected water and cold-chain compliance.
- **Prohibited Activities (Drone Ban):** Operating recreational or commercial drones (UAVs) is strictly prohibited within 2 km of the Citadel Botanical Gardens and the Maritime Port Zone without prior municipal aviation clearance.
- **Emergency Helpline:** Dial 112 (demonstration emergency number) for tourist police or medical assistance.
""",
    },
    {
        "document_id": "sample-annex-006",
        "title": "Sample Municipal Heritage Circular — Revised National Museum Tariff & Friday Hours",
        "filename": "sample_museum_tariff_circular.txt",
        "category": "safety_and_travel_restrictions",
        "authority": "demonstration_source",
        "publication_date": "2026-02-10",
        "last_verified_date": "2026-02-10",
        "destination": "Sample City",
        "content": """SAMPLE CITY MUNICIPAL HERITAGE CIRCULAR — REVISED TARIFF NOTICE (DEMONSTRATION)
Document ID: sample-annex-006 | Publication Date: 2026-02-10
Notice: Fictional demonstration circular created to test multi-document conflict detection.

Section 1: Revision to Sample City National Museum Entry Tariff & Friday Closing Time
Effective February 2026, the Sample City Department of Culture announces the following updates to the Sample City National Museum:
1. Revised Adult Admission Tariff: The standard adult entry fee for the Sample City National Museum has been revised to INR 650 per adult (superseding the earlier INR 500 tariff printed in older tourist guidebooks).
2. Friday Conservation Closing Hours: On Fridays, the Sample City National Museum closes early at 4:00 PM (16:00) instead of 5:00 PM for weekly conservation maintenance. Last ticket entry on Fridays is at 3:00 PM.
""",
    },
]


DEMO_TRIP_ID = "trip-demo-sample-city"


def get_default_demo_preferences() -> TravellerPreferences:
    """Return the deterministic demonstration scenario specified in Section 12."""
    return TravellerPreferences(
        origin="Mumbai, India",
        destination="Sample City",
        departure_date="2026-11-10",
        return_date="2026-11-12",
        travellers_count=2,
        adults=2,
        children=0,
        travel_scope="domestic",
        budget_total=25000.0,
        currency="INR",
        travel_style="cultural",
        interests=["food", "sightseeing", "museums", "history"],
        accommodation_type="budget_hotel",
        transport_modes=["public_transport", "walking"],
        dietary_requirements="Prefer hygienic local vegetarian and coastal dishes (Green Hygiene Seal stalls)",
        accessibility_needs="Step-free access preferred where practical",
        pace="relaxed",
        visa_status_note="Domestic travel within India; carrying original Aadhaar and Voter ID cards",
        accommodation_requirements="Arriving at 8:30 AM on Day 1; requesting early check-in or lobby luggage drop-off at 8:30 AM at budget hotel",
        transport_constraints="Using public Metro & City Bus pass; carrying 1 cabin bag per person",
        safety_considerations="Follow municipal food hygiene guidance and restricted zone notices",
        additional_instructions="Ensure all museum tariffs and check-in rules are verified against curated documents.",
    )


def ensure_seeded(
    db: DatabaseManager,
    retriever: HybridRetriever,
    force_reseed: bool = False,
) -> Dict[str, int]:
    """
    Ensure all sample demonstration documents exist on disk, are indexed in SQLite & FAISS,
    and that the seeded demonstration trip is generated through the real workflow pipeline.
    """
    settings = get_settings()
    settings.SAMPLE_DOCS_DIR.mkdir(parents=True, exist_ok=True)
    now_iso = datetime.now(timezone.utc).isoformat()

    existing_docs = {d.document_id for d in db.list_documents()}
    indexed_count = 0

    for spec in SAMPLE_DOCUMENTS_SPEC:
        doc_id = spec["document_id"]
        file_path = settings.SAMPLE_DOCS_DIR / spec["filename"]

        if spec.get("is_pdf"):
            content_bytes = _build_accommodation_pdf_bytes()
            if not file_path.exists() or force_reseed:
                file_path.write_bytes(content_bytes)
        else:
            content_bytes = spec["content"].encode("utf-8")
            if not file_path.exists() or force_reseed:
                file_path.write_bytes(content_bytes)

        if force_reseed or doc_id not in existing_docs:
            doc_detail, chunks = process_document_bytes(
                document_id=doc_id,
                title=spec["title"],
                filename=spec["filename"],
                content_bytes=content_bytes,
                category=spec["category"],
                authority=spec["authority"],
                destination=spec["destination"],
                publication_date=spec["publication_date"],
                last_verified_date=spec["last_verified_date"],
                is_demonstration=True,
                created_at=now_iso,
            )
            db.upsert_document(doc_detail, chunks)
            indexed_count += 1

    # Rebuild FAISS + BM25 index from all stored chunks
    all_chunks = db.get_all_chunks()
    retriever.rebuild_index(all_chunks)

    # Ensure the default demo trip exists and was generated via the real workflow pipeline
    existing_demo = db.get_trip(DEMO_TRIP_ID)
    if force_reseed or existing_demo is None:
        workflow = TripPlanningWorkflow(retriever)
        demo_prefs = get_default_demo_preferences()
        demo_plan = workflow.execute(
            trip_id=DEMO_TRIP_ID,
            preferences=demo_prefs,
            created_at=now_iso,
        )
        db.save_trip(demo_plan)

    return {
        "total_documents": len(db.list_documents()),
        "total_chunks": len(all_chunks),
        "newly_indexed_documents": indexed_count,
    }
