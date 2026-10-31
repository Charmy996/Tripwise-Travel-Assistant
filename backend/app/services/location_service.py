"""Location provider service with OpenStreetMap Nominatim adapter, in-memory caching, rate-limiting, and offline fallback."""
import asyncio
import logging
import time
from typing import Dict, List, Optional, Tuple
import httpx

from app.core.config import get_settings
from app.schemas.models import LocationModel, LocationSearchResponse

logger = logging.getLogger(__name__)

# Fallback dataset covering major travel destinations (India, Global hubs, popular tourism spots)
FALLBACK_CITIES: List[Dict[str, any]] = [
    {"id": "fb-mum-1", "name": "Mumbai", "admin_area": "Maharashtra", "country": "India", "country_code": "IN", "latitude": 19.0760, "longitude": 72.8777, "display_name": "Mumbai, Maharashtra, India", "type": "city"},
    {"id": "fb-mum-2", "name": "Mumbai Airport", "admin_area": "Maharashtra", "country": "India", "country_code": "IN", "latitude": 19.0896, "longitude": 72.8656, "display_name": "Chhatrapati Shivaji Maharaj International Airport (BOM), Mumbai, India", "type": "aerodrome"},
    {"id": "fb-del-1", "name": "New Delhi", "admin_area": "Delhi", "country": "India", "country_code": "IN", "latitude": 28.6139, "longitude": 77.2090, "display_name": "New Delhi, Delhi, India", "type": "city"},
    {"id": "fb-del-2", "name": "Delhi", "admin_area": "Delhi", "country": "India", "country_code": "IN", "latitude": 28.7041, "longitude": 77.1025, "display_name": "Delhi, India", "type": "city"},
    {"id": "fb-blr-1", "name": "Bengaluru", "admin_area": "Karnataka", "country": "India", "country_code": "IN", "latitude": 12.9716, "longitude": 77.5946, "display_name": "Bengaluru, Karnataka, India", "type": "city"},
    {"id": "fb-hyd-1", "name": "Hyderabad", "admin_area": "Telangana", "country": "India", "country_code": "IN", "latitude": 17.3850, "longitude": 78.4867, "display_name": "Hyderabad, Telangana, India", "type": "city"},
    {"id": "fb-maa-1", "name": "Chennai", "admin_area": "Tamil Nadu", "country": "India", "country_code": "IN", "latitude": 13.0827, "longitude": 80.2707, "display_name": "Chennai, Tamil Nadu, India", "type": "city"},
    {"id": "fb-ccu-1", "name": "Kolkata", "admin_area": "West Bengal", "country": "India", "country_code": "IN", "latitude": 22.5726, "longitude": 88.3639, "display_name": "Kolkata, West Bengal, India", "type": "city"},
    {"id": "fb-pun-1", "name": "Pune", "admin_area": "Maharashtra", "country": "India", "country_code": "IN", "latitude": 18.5204, "longitude": 73.8567, "display_name": "Pune, Maharashtra, India", "type": "city"},
    {"id": "fb-jai-1", "name": "Jaipur", "admin_area": "Rajasthan", "country": "India", "country_code": "IN", "latitude": 26.9124, "longitude": 75.7873, "display_name": "Jaipur, Rajasthan, India", "type": "city"},
    {"id": "fb-agr-1", "name": "Agra", "admin_area": "Uttar Pradesh", "country": "India", "country_code": "IN", "latitude": 27.1767, "longitude": 78.0081, "display_name": "Agra, Uttar Pradesh, India", "type": "city"},
    {"id": "fb-var-1", "name": "Varanasi", "admin_area": "Uttar Pradesh", "country": "India", "country_code": "IN", "latitude": 25.3176, "longitude": 82.9739, "display_name": "Varanasi, Uttar Pradesh, India", "type": "city"},
    {"id": "fb-goa-1", "name": "Goa (Panaji)", "admin_area": "Goa", "country": "India", "country_code": "IN", "latitude": 15.4909, "longitude": 73.8278, "display_name": "Panaji, Goa, India", "type": "city"},
    {"id": "fb-koc-1", "name": "Kochi", "admin_area": "Kerala", "country": "India", "country_code": "IN", "latitude": 9.9312, "longitude": 76.2673, "display_name": "Kochi, Kerala, India", "type": "city"},
    {"id": "fb-ahm-1", "name": "Ahmedabad", "admin_area": "Gujarat", "country": "India", "country_code": "IN", "latitude": 23.0225, "longitude": 72.5714, "display_name": "Ahmedabad, Gujarat, India", "type": "city"},
    {"id": "fb-amr-1", "name": "Amritsar", "admin_area": "Punjab", "country": "India", "country_code": "IN", "latitude": 31.6340, "longitude": 74.8723, "display_name": "Amritsar, Punjab, India", "type": "city"},
    {"id": "fb-sri-1", "name": "Srinagar", "admin_area": "Jammu and Kashmir", "country": "India", "country_code": "IN", "latitude": 34.0837, "longitude": 74.7973, "display_name": "Srinagar, Jammu and Kashmir, India", "type": "city"},
    {"id": "fb-uda-1", "name": "Udaipur", "admin_area": "Rajasthan", "country": "India", "country_code": "IN", "latitude": 24.5854, "longitude": 73.7125, "display_name": "Udaipur, Rajasthan, India", "type": "city"},
    {"id": "fb-mys-1", "name": "Mysuru", "admin_area": "Karnataka", "country": "India", "country_code": "IN", "latitude": 12.2958, "longitude": 76.6394, "display_name": "Mysuru, Karnataka, India", "type": "city"},
    {"id": "fb-sc-1",  "name": "Sample City", "admin_area": "Demo State", "country": "Demo Country", "country_code": "DM", "latitude": 18.9220, "longitude": 72.8347, "display_name": "Sample City (Demo Knowledge Base Reference)", "type": "city"},

    # Global destinations
    {"id": "fb-lon-1", "name": "London", "admin_area": "Greater London", "country": "United Kingdom", "country_code": "GB", "latitude": 51.5074, "longitude": -0.1278, "display_name": "London, Greater London, United Kingdom", "type": "city"},
    {"id": "fb-lon-2", "name": "Long Beach", "admin_area": "California", "country": "United States", "country_code": "US", "latitude": 33.7701, "longitude": -118.1937, "display_name": "Long Beach, California, United States", "type": "city"},
    {"id": "fb-nyc-1", "name": "New York", "admin_area": "New York", "country": "United States", "country_code": "US", "latitude": 40.7128, "longitude": -74.0060, "display_name": "New York, New York, United States", "type": "city"},
    {"id": "fb-new-2", "name": "Newcastle upon Tyne", "admin_area": "Tyne and Wear", "country": "United Kingdom", "country_code": "GB", "latitude": 54.9783, "longitude": -1.6178, "display_name": "Newcastle upon Tyne, United Kingdom", "type": "city"},
    {"id": "fb-par-1", "name": "Paris", "admin_area": "Île-de-France", "country": "France", "country_code": "FR", "latitude": 48.8566, "longitude": 2.3522, "display_name": "Paris, Île-de-France, France", "type": "city"},
    {"id": "fb-tyo-1", "name": "Tokyo", "admin_area": "Tokyo", "country": "Japan", "country_code": "JP", "latitude": 35.6762, "longitude": 139.6503, "display_name": "Tokyo, Japan", "type": "city"},
    {"id": "fb-dxb-1", "name": "Dubai", "admin_area": "Dubai", "country": "United Arab Emirates", "country_code": "AE", "latitude": 25.2048, "longitude": 55.2708, "display_name": "Dubai, United Arab Emirates", "type": "city"},
    {"id": "fb-sin-1", "name": "Singapore", "admin_area": "Central Singapore", "country": "Singapore", "country_code": "SG", "latitude": 1.3521, "longitude": 103.8198, "display_name": "Singapore, Singapore", "type": "city"},
    {"id": "fb-rom-1", "name": "Rome", "admin_area": "Lazio", "country": "Italy", "country_code": "IT", "latitude": 41.9028, "longitude": 12.4964, "display_name": "Rome, Lazio, Italy", "type": "city"},
    {"id": "fb-syd-1", "name": "Sydney", "admin_area": "New South Wales", "country": "Australia", "country_code": "AU", "latitude": -33.8688, "longitude": 151.2093, "display_name": "Sydney, New South Wales, Australia", "type": "city"},
    {"id": "fb-bcn-1", "name": "Barcelona", "admin_area": "Catalonia", "country": "Spain", "country_code": "ES", "latitude": 41.3851, "longitude": 2.1734, "display_name": "Barcelona, Catalonia, Spain", "type": "city"},
    {"id": "fb-bkk-1", "name": "Bangkok", "admin_area": "Bangkok", "country": "Thailand", "country_code": "TH", "latitude": 13.7563, "longitude": 100.5018, "display_name": "Bangkok, Thailand", "type": "city"},
    {"id": "fb-ams-1", "name": "Amsterdam", "admin_area": "North Holland", "country": "Netherlands", "country_code": "NL", "latitude": 52.3676, "longitude": 4.9041, "display_name": "Amsterdam, North Holland, Netherlands", "type": "city"},
    {"id": "fb-ber-1", "name": "Berlin", "admin_area": "Berlin", "country": "Germany", "country_code": "DE", "latitude": 52.5200, "longitude": 13.4050, "display_name": "Berlin, Germany", "type": "city"},
    {"id": "fb-lax-1", "name": "Los Angeles", "admin_area": "California", "country": "United States", "country_code": "US", "latitude": 34.0522, "longitude": -118.2437, "display_name": "Los Angeles, California, United States", "type": "city"},
    {"id": "fb-sfo-1", "name": "San Francisco", "admin_area": "California", "country": "United States", "country_code": "US", "latitude": 37.7749, "longitude": -122.4194, "display_name": "San Francisco, California, United States", "type": "city"},
    {"id": "fb-cai-1", "name": "Cairo", "admin_area": "Cairo Governorate", "country": "Egypt", "country_code": "EG", "latitude": 30.0444, "longitude": 31.2357, "display_name": "Cairo, Egypt", "type": "city"},
    {"id": "fb-ist-1", "name": "Istanbul", "admin_area": "Istanbul", "country": "Turkey", "country_code": "TR", "latitude": 41.0082, "longitude": 28.9784, "display_name": "Istanbul, Turkey", "type": "city"},
    {"id": "fb-cpt-1", "name": "Cape Town", "admin_area": "Western Cape", "country": "South Africa", "country_code": "ZA", "latitude": -33.9249, "longitude": 18.4241, "display_name": "Cape Town, Western Cape, South Africa", "type": "city"},
    {"id": "fb-tor-1", "name": "Toronto", "admin_area": "Ontario", "country": "Canada", "country_code": "CA", "latitude": 43.6532, "longitude": -79.3832, "display_name": "Toronto, Ontario, Canada", "type": "city"},
]


class LocationService:
    def __init__(self):
        self._cache: Dict[str, Tuple[float, List[LocationModel]]] = {}
        self._last_nominatim_request_time: float = 0.0
        self._rate_limit_lock = asyncio.Lock()

    def _query_local_fallback(self, query: str, limit: int = 8) -> List[LocationModel]:
        q_norm = query.strip().lower()
        if not q_norm:
            return []

        exact_prefix_matches = []
        word_prefix_matches = []
        substring_matches = []

        for item in FALLBACK_CITIES:
            name_lower = item["name"].lower()
            disp_lower = item["display_name"].lower()
            model = LocationModel(**item)

            if name_lower.startswith(q_norm):
                exact_prefix_matches.append(model)
            elif any(w.startswith(q_norm) for w in name_lower.split() + disp_lower.split()):
                word_prefix_matches.append(model)
            elif q_norm in disp_lower:
                substring_matches.append(model)

        combined = exact_prefix_matches + word_prefix_matches + substring_matches
        # Deduplicate preserving order
        seen_ids = set()
        deduped = []
        for loc in combined:
            if loc.id not in seen_ids:
                seen_ids.add(loc.id)
                deduped.append(loc)
            if len(deduped) >= limit:
                break
        return deduped

    async def search_locations(self, query: str, limit: int = 8) -> LocationSearchResponse:
        settings = get_settings()
        clean_q = query.strip()
        if len(clean_q) < 2:
            return LocationSearchResponse(
                query=clean_q,
                total=0,
                provider="none",
                cached=False,
                attribution="Search requires at least 2 characters",
                results=[],
            )

        cache_key = clean_q.lower()
        now = time.time()

        # Check Cache
        if cache_key in self._cache:
            ts, cached_results = self._cache[cache_key]
            if now - ts < settings.LOCATION_CACHE_TTL:
                return LocationSearchResponse(
                    query=clean_q,
                    total=len(cached_results),
                    provider=f"{settings.LOCATION_PROVIDER} (cached)",
                    cached=True,
                    attribution="Data © OpenStreetMap contributors",
                    results=cached_results[:limit],
                )

        # Curated high-priority prefix matches from local travel dataset
        local_matches = self._query_local_fallback(clean_q, limit=limit) if settings.LOCATION_FALLBACK_ENABLED else []

        provider_name = settings.LOCATION_PROVIDER.lower()
        remote_results: List[LocationModel] = []

        if provider_name == "nominatim":
            try:
                remote_results = await self._search_nominatim(clean_q, limit=limit)
            except Exception as exc:
                logger.warning(f"Nominatim lookup failed ({exc}); relying on fallback dataset.")
                remote_results = []

        # Combine results: curated prefix matches first, followed by external geocoder matches
        combined: List[LocationModel] = []
        seen_keys = set()

        for loc in local_matches + remote_results:
            # Clean name if empty
            if not loc.name.strip():
                loc.name = loc.display_name.split(",")[0].strip() or "Location"
            norm_key = (loc.name.strip().lower(), loc.country.strip().lower())
            if norm_key not in seen_keys:
                seen_keys.add(norm_key)
                combined.append(loc)
            if len(combined) >= limit:
                break

        results = combined

        # Cache results if we got any
        if results:
            self._cache[cache_key] = (now, results)

        active_provider = f"{provider_name}+fallback" if (remote_results and local_matches) else (provider_name if remote_results else "local_fallback")

        return LocationSearchResponse(
            query=clean_q,
            total=len(results),
            provider=active_provider,
            cached=False,
            attribution="Data © OpenStreetMap contributors",
            results=results[:limit],
        )

    async def _search_nominatim(self, query: str, limit: int = 8) -> List[LocationModel]:
        settings = get_settings()

        # Nominatim usage policy: rate-limit to ~1 request per second
        async with self._rate_limit_lock:
            elapsed = time.time() - self._last_nominatim_request_time
            if elapsed < 1.0:
                await asyncio.sleep(1.0 - elapsed)
            self._last_nominatim_request_time = time.time()

        url = "https://nominatim.openstreetmap.org/search"
        params = {
            "q": query,
            "format": "jsonv2",
            "addressdetails": 1,
            "limit": limit,
        }
        headers = {
            "User-Agent": "TripWise-AI/1.0 (Travel Planning Assistant; edu demo)"
        }

        async with httpx.AsyncClient(timeout=settings.LOCATION_API_TIMEOUT) as client:
            resp = await client.get(url, params=params, headers=headers)
            if resp.status_code != 200:
                raise RuntimeError(f"Nominatim returned HTTP {resp.status_code}")
            data = resp.json()

        results: List[LocationModel] = []
        for item in data:
            addr = item.get("address", {})
            name = (
                addr.get("city")
                or addr.get("town")
                or addr.get("municipality")
                or addr.get("village")
                or addr.get("state_district")
                or item.get("name")
                or item.get("display_name", "").split(",")[0].strip()
            )
            admin_area = addr.get("state") or addr.get("county") or addr.get("region") or ""
            country = addr.get("country") or ""
            country_code = (addr.get("country_code") or "").upper()

            # Construct clean display name: "City, State, Country"
            parts = [p for p in [name, admin_area, country] if p and p.strip()]
            display_name = ", ".join(parts) if parts else item.get("display_name", "")

            loc_id = f"osm-{item.get('place_id') or item.get('osm_id') or abs(hash(display_name))}"
            try:
                lat = float(item["lat"]) if "lat" in item else None
                lon = float(item["lon"]) if "lon" in item else None
            except (ValueError, TypeError):
                lat, lon = None, None

            results.append(
                LocationModel(
                    id=str(loc_id),
                    name=name,
                    admin_area=admin_area,
                    country=country,
                    country_code=country_code,
                    latitude=lat,
                    longitude=lon,
                    display_name=display_name,
                    type=item.get("type", "city"),
                )
            )

        return results


# Singleton instance
_location_service: Optional[LocationService] = None


def get_location_service() -> LocationService:
    global _location_service
    if _location_service is None:
        _location_service = LocationService()
    return _location_service
