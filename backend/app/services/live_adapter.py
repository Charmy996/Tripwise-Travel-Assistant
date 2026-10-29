"""Optional Live Information Verification Adapter."""
from datetime import datetime, timezone
from typing import List
from urllib.parse import urlparse
import httpx

from app.core.config import get_settings
from app.schemas.models import LiveVerificationResult


def is_safe_external_url(url: str) -> bool:
    """Validate external URLs to prevent SSRF or invalid schemes."""
    if not url or not url.strip():
        return False
    try:
        parsed = urlparse(url.strip())
        if parsed.scheme not in ("https", "http"):
            return False
        if not parsed.netloc:
            return False
        host = parsed.hostname or ""
        if host in ("localhost", "127.0.0.1", "0.0.0.0", "::1") or host.startswith("169.254."):
            return False
        return True
    except Exception:
        return False


class LiveVerificationAdapter:
    """
    Optional live-verification adapter for checking official visa/entry advisories,
    opening hours, transport service notices, and weather.
    Never simulates success when unconfigured or when a network call fails.
    """

    def check_live_sources(self, destination: str, travel_scope: str) -> List[LiveVerificationResult]:
        settings = get_settings()
        now_iso = datetime.now(timezone.utc).isoformat()
        results: List[LiveVerificationResult] = []

        categories = [
            ("Visa & Government Travel Advisories", settings.LIVE_ADVISORY_ENDPOINT),
            ("Destination Weather & Seasonal Notices", settings.LIVE_WEATHER_ENDPOINT),
            ("Live Public Transit & Opening Hour Feed", ""),
        ]

        if not settings.LIVE_VERIFICATION_ENABLED:
            for cat_name, _ in categories:
                results.append(
                    LiveVerificationResult(
                        category=cat_name,
                        provider_name="External Live Adapter (Disabled)",
                        status="unavailable",
                        checked_at=now_iso,
                        source_url=None,
                        message=(
                            "Live verification unavailable — external live API integration is not configured "
                            "in demonstration mode. Current real-time status has not been checked."
                        ),
                    )
                )
            return results

        for cat_name, endpoint in categories:
            if not endpoint:
                results.append(
                    LiveVerificationResult(
                        category=cat_name,
                        provider_name="Unconfigured Endpoint",
                        status="unavailable",
                        checked_at=now_iso,
                        source_url=None,
                        message="Live verification unavailable — no authoritative endpoint URL configured for this check.",
                    )
                )
                continue

            if not is_safe_external_url(endpoint):
                results.append(
                    LiveVerificationResult(
                        category=cat_name,
                        provider_name="URL Validation Guard",
                        status="failed",
                        checked_at=now_iso,
                        source_url=endpoint,
                        message="Lookup rejected: configured URL failed security or scheme validation. Restriction status remains unverified.",
                    )
                )
                continue

            try:
                with httpx.Client(timeout=settings.LIVE_TIMEOUT_SECONDS) as client:
                    resp = client.get(endpoint, params={"destination": destination, "scope": travel_scope})
                    if resp.status_code == 200:
                        results.append(
                            LiveVerificationResult(
                                category=cat_name,
                                provider_name="Configured Authoritative Feed",
                                status="verified",
                                checked_at=now_iso,
                                source_url=endpoint,
                                message=f"Live feed responded (HTTP 200) for {destination}. Verify details directly with official notices.",
                            )
                        )
                    else:
                        results.append(
                            LiveVerificationResult(
                                category=cat_name,
                                provider_name="Configured Authoritative Feed",
                                status="failed",
                                checked_at=now_iso,
                                source_url=endpoint,
                                message=(
                                    f"Live lookup failed with HTTP {resp.status_code}. "
                                    "A failed lookup does NOT prove that travel restrictions are absent."
                                ),
                            )
                        )
            except Exception as exc:
                results.append(
                    LiveVerificationResult(
                        category=cat_name,
                        provider_name="Configured Authoritative Feed",
                        status="failed",
                        checked_at=now_iso,
                        source_url=endpoint,
                        message=(
                            f"Live lookup error ({type(exc).__name__}). "
                            "Do not assume compliance; verify manually with official sources."
                        ),
                    )
                )

        return results
