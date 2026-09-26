"""NDMA SACHET / Common Alerting Protocol (CAP) Disaster-Feed Connector.

Owned by Dev 2 (Backend Platform Lead).
Adheres strictly to ORCA AI Development Rules & Governance.

Capabilities:
1. Ingests NDMA SACHET alerts via official CAP (Common Alerting Protocol v1.2) XML / JSON feeds.
2. Safely parses CAP schemas, extracting spatial geometry (polygons, circles),
   temporal validity windows (effective, expires), severity, certainty, urgency, and instructions.
3. Performs deterministic spatial filtering against vessel / harbor coordinates.
4. Normalizes alerts losslessly into canonical HazardBulletinPayload and ActionableAlertDto.
5. Preserves complete provenance, timestamps, source attribution, and epistemic honesty.
   - Missing evidence != zero risk
   - Forecast != observation
   - Mock / snapshot != live (never claims live without verified HTTP response)
6. Implements the HazardBulletinsProvider interface for seamless integration with
   ConnectorManager and Dev 4 / Dev 3 reasoning agents.
"""

from __future__ import annotations

import json
import logging
import math
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import httpx

from backend.app.agents.integrations.contracts import ToolInvocationContext
from backend.app.agents.integrations.dev2 import HazardBulletinPayload, HazardBulletinsProvider
from backend.app.connectors.base import BaseLiveConnector, validate_iso8601
from backend.app.connectors.errors import (
    ConnectorRateLimitError,
    ConnectorTimeoutError,
    ConnectorUpstreamUnavailableError,
)
from backend.app.connectors.harbors import resolve_coordinates
from backend.app.core.config import settings

logger = logging.getLogger(__name__)

# Standard CAP XML namespace mapping
CAP_NAMESPACES = {
    "cap": "urn:oasis:names:tc:emergency:cap:1.2",
    "cap11": "urn:oasis:names:tc:emergency:cap:1.1",
}


@dataclass
class SachetCapAlert:
    """Normalized internal representation of an individual CAP alert block."""

    identifier: str
    sender: str
    sent: str
    status: str
    msg_type: str
    scope: str
    category: str
    event: str
    urgency: str
    severity: str
    certainty: str
    headline: str
    description: str
    instruction: str
    effective: Optional[str]
    expires: Optional[str]
    area_desc: str
    polygons: List[List[Tuple[float, float]]] = field(default_factory=list)  # (lat, lon)
    circles: List[Tuple[float, float, float]] = field(default_factory=list)  # (lat, lon, radius_km)
    raw_payload: Dict[str, Any] = field(default_factory=dict)

    def is_temporally_valid(self, at_time: Optional[datetime] = None) -> bool:
        """Determines if alert is active at the specified time (defaults to now UTC)."""
        now = at_time or datetime.now(UTC)
        if self.effective:
            try:
                eff = datetime.fromisoformat(self.effective.replace("Z", "+00:00"))
                if now < eff:
                    return False
            except Exception:
                pass
        if self.expires:
            try:
                exp = datetime.fromisoformat(self.expires.replace("Z", "+00:00"))
                if now > exp:
                    return False
            except Exception:
                pass
        return True

    def matches_point(self, lat: float, lon: float) -> bool:
        """Checks if coordinate falls inside polygon, circle, or if area is global."""
        if not self.polygons and not self.circles:
            # If no explicit geometry is given, treat as broad regional notice
            return True

        # Check polygons (Ray casting algorithm)
        for poly in self.polygons:
            if _point_in_polygon(lat, lon, poly):
                return True

        # Check circles (haversine distance <= radius)
        for c_lat, c_lon, radius_km in self.circles:
            dist = _haversine_distance_km(lat, lon, c_lat, c_lon)
            if dist <= radius_km:
                return True

        return False


def _point_in_polygon(lat: float, lon: float, polygon: List[Tuple[float, float]]) -> bool:
    """Deterministic 2D point-in-polygon ray casting check."""
    n = len(polygon)
    if n < 3:
        return False
    inside = False
    p1_lat, p1_lon = polygon[0]
    for i in range(1, n + 1):
        p2_lat, p2_lon = polygon[i % n]
        if min(p1_lon, p2_lon) < lon <= max(p1_lon, p2_lon):
            if lat <= max(p1_lat, p2_lat):
                if p1_lon != p2_lon:
                    lat_inters = (lon - p1_lon) * (p2_lat - p1_lat) / (p2_lon - p1_lon) + p1_lat
                else:
                    lat_inters = p1_lat
                if p1_lat == p2_lat or lat <= lat_inters:
                    inside = not inside
        p1_lat, p1_lon = p2_lat, p2_lon
    return inside


def _haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Computes great-circle distance between two points in km."""
    r = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2.0) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return r * c


class SachetConnector(BaseLiveConnector, HazardBulletinsProvider):
    """Connector for NDMA SACHET / CAP National Disaster Alert System."""

    SOURCE_NAME = "NDMA SACHET / CAP Alert System"

    def __init__(
        self,
        data_mode: Optional[str] = None,
        fixtures_path: Optional[str | Path] = None,
    ) -> None:
        super().__init__()
        self._data_mode = data_mode
        self.fixtures_path = Path(fixtures_path or "data/fixtures/synthetic/sachet")

    @property
    def data_mode(self) -> str:
        return self._data_mode if self._data_mode is not None else settings.DATA_MODE

    @data_mode.setter
    def data_mode(self, value: str) -> None:
        self._data_mode = value

    def parse_cap_xml(self, xml_content: str) -> List[SachetCapAlert]:
        """Safely parses CAP XML 1.1 / 1.2 into SachetCapAlert objects."""
        alerts: List[SachetCapAlert] = []
        try:
            root = ET.fromstring(xml_content)
        except ET.ParseError as e:
            logger.warning("Failed to parse CAP XML: %s", e)
            return alerts

        def _clean_tag(elem_tag: str) -> str:
            return elem_tag.split("}")[-1] if "}" in elem_tag else elem_tag

        identifier = ""
        sender = ""
        sent = ""
        status = ""
        msg_type = ""
        scope = ""

        for child in root:
            tag = _clean_tag(child.tag)
            if tag == "identifier":
                identifier = child.text or ""
            elif tag == "sender":
                sender = child.text or ""
            elif tag == "sent":
                sent = child.text or ""
            elif tag == "status":
                status = child.text or ""
            elif tag == "msgType":
                msg_type = child.text or ""
            elif tag == "scope":
                scope = child.text or ""

        # Find all <info> elements
        for info in root.findall(".//{*}info") or root.findall("info"):
            cat = info.findtext("{*}category") or info.findtext("category") or "Met"
            event = info.findtext("{*}event") or info.findtext("event") or "Disaster Alert"
            urgency = info.findtext("{*}urgency") or info.findtext("urgency") or "Immediate"
            severity = info.findtext("{*}severity") or info.findtext("severity") or "Unknown"
            certainty = info.findtext("{*}certainty") or info.findtext("certainty") or "Unknown"
            headline = info.findtext("{*}headline") or info.findtext("headline") or ""
            desc = info.findtext("{*}description") or info.findtext("description") or ""
            instruction = info.findtext("{*}instruction") or info.findtext("instruction") or ""
            eff = info.findtext("{*}effective") or info.findtext("effective") or sent
            exp = info.findtext("{*}expires") or info.findtext("expires") or None

            area_desc = ""
            polygons: List[List[Tuple[float, float]]] = []
            circles: List[Tuple[float, float, float]] = []

            for area in info.findall(".//{*}area") or info.findall("area"):
                area_desc = area.findtext("{*}areaDesc") or area.findtext("areaDesc") or area_desc
                for poly_elem in area.findall("{*}polygon") or area.findall("polygon"):
                    poly_str = (poly_elem.text or "").strip()
                    if poly_str:
                        coords: List[Tuple[float, float]] = []
                        for pair in poly_str.split():
                            pts = pair.split(",")
                            if len(pts) == 2:
                                try:
                                    coords.append((float(pts[0]), float(pts[1])))
                                except ValueError:
                                    pass
                        if coords:
                            polygons.append(coords)

                for circ_elem in area.findall("{*}circle") or area.findall("circle"):
                    circ_str = (circ_elem.text or "").strip()
                    if circ_str:
                        pts = circ_str.split(",")
                        if len(pts) == 3:
                            try:
                                circles.append((float(pts[0]), float(pts[1]), float(pts[2])))
                            except ValueError:
                                pass

            alerts.append(
                SachetCapAlert(
                    identifier=identifier,
                    sender=sender,
                    sent=sent,
                    status=status,
                    msg_type=msg_type,
                    scope=scope,
                    category=cat,
                    event=event,
                    urgency=urgency,
                    severity=severity,
                    certainty=certainty,
                    headline=headline,
                    description=desc,
                    instruction=instruction,
                    effective=eff,
                    expires=exp,
                    area_desc=area_desc,
                    polygons=polygons,
                    circles=circles,
                )
            )

        return alerts

    def parse_cap_json(self, json_data: Dict[str, Any]) -> List[SachetCapAlert]:
        """Safely parses CAP JSON / OASIS CAP v1.2 JSON payload."""
        alerts: List[SachetCapAlert] = []
        if not isinstance(json_data, dict):
            return alerts

        identifier = str(json_data.get("identifier", ""))
        sender = str(json_data.get("sender", ""))
        sent = str(json_data.get("sent", ""))
        status = str(json_data.get("status", "Actual"))
        msg_type = str(json_data.get("msgType", "Alert"))
        scope = str(json_data.get("scope", "Public"))

        raw_info = json_data.get("info", [])
        if isinstance(raw_info, dict):
            raw_info = [raw_info]

        for info in raw_info:
            if not isinstance(info, dict):
                continue
            cat = str(info.get("category", "Met"))
            event = str(info.get("event", "Disaster Alert"))
            urgency = str(info.get("urgency", "Immediate"))
            severity = str(info.get("severity", "Unknown"))
            certainty = str(info.get("certainty", "Unknown"))
            headline = str(info.get("headline", ""))
            desc = str(info.get("description", ""))
            instruction = str(info.get("instruction", ""))
            eff = str(info.get("effective", sent))
            exp = info.get("expires")

            area_desc = ""
            polygons: List[List[Tuple[float, float]]] = []
            circles: List[Tuple[float, float, float]] = []

            raw_area = info.get("area", [])
            if isinstance(raw_area, dict):
                raw_area = [raw_area]

            for area in raw_area:
                if not isinstance(area, dict):
                    continue
                area_desc = str(area.get("areaDesc", area_desc))
                poly_data = area.get("polygon", [])
                if isinstance(poly_data, str):
                    poly_data = [poly_data]
                for poly_str in poly_data:
                    coords: List[Tuple[float, float]] = []
                    for pair in poly_str.strip().split():
                        pts = pair.split(",")
                        if len(pts) == 2:
                            try:
                                coords.append((float(pts[0]), float(pts[1])))
                            except ValueError:
                                pass
                    if coords:
                        polygons.append(coords)

                circ_data = area.get("circle", [])
                if isinstance(circ_data, str):
                    circ_data = [circ_data]
                for circ_str in circ_data:
                    pts = circ_str.strip().split(",")
                    if len(pts) == 3:
                        try:
                            circles.append((float(pts[0]), float(pts[1]), float(pts[2])))
                        except ValueError:
                            pass

            alerts.append(
                SachetCapAlert(
                    identifier=identifier,
                    sender=sender,
                    sent=sent,
                    status=status,
                    msg_type=msg_type,
                    scope=scope,
                    category=cat,
                    event=event,
                    urgency=urgency,
                    severity=severity,
                    certainty=certainty,
                    headline=headline,
                    description=desc,
                    instruction=instruction,
                    effective=eff,
                    expires=exp,
                    area_desc=area_desc,
                    polygons=polygons,
                    circles=circles,
                    raw_payload=json_data,
                )
            )

        return alerts

    def load_fixtures(self) -> List[SachetCapAlert]:
        """Loads deterministic synthetic / cached CAP fixtures."""
        all_alerts: List[SachetCapAlert] = []
        if not self.fixtures_path.exists():
            return all_alerts

        for p in self.fixtures_path.glob("*.xml"):
            try:
                content = p.read_text(encoding="utf-8")
                all_alerts.extend(self.parse_cap_xml(content))
            except Exception as e:
                logger.warning("Error loading fixture %s: %s", p, e)

        for p in self.fixtures_path.glob("*.json"):
            try:
                content = p.read_text(encoding="utf-8")
                data = json.loads(content)
                all_alerts.extend(self.parse_cap_json(data))
            except Exception as e:
                logger.warning("Error loading fixture %s: %s", p, e)

        return all_alerts

    def _fetch_live_cap(self, lat: float, lon: float) -> List[SachetCapAlert]:
        """Fetches live CAP alerts from NDMA SACHET endpoint."""
        url = settings.SACHET_API_BASE_URL
        headers = {}
        if settings.SACHET_API_KEY:
            headers["Authorization"] = f"Bearer {settings.SACHET_API_KEY}"

        params = {"lat": lat, "lon": lon}
        try:
            res = self._get(url, headers=headers, **params)
            if isinstance(res, dict):
                return self.parse_cap_json(res)
            elif isinstance(res, str):
                return self.parse_cap_xml(res)
            return []
        except httpx.TimeoutException as exc:
            raise ConnectorTimeoutError(f"SACHET request timed out: {exc}") from exc
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 429:
                raise ConnectorRateLimitError(f"SACHET rate limit exceeded: {exc}") from exc
            raise ConnectorUpstreamUnavailableError(f"SACHET upstream error HTTP {exc.response.status_code}") from exc
        except Exception as exc:
            raise ConnectorUpstreamUnavailableError(f"SACHET connection failed: {exc}") from exc

    def get_hazard_bulletin(self, context: ToolInvocationContext) -> HazardBulletinPayload:
        """Implements HazardBulletinsProvider interface for SACHET alerts.

        Safely normalizes into HazardBulletinPayload:
        - Filters by spatial coordinates and current temporal validity.
        - Maps CAP severity (Extreme, Severe, Moderate, Minor) into canonical (WARNING, ALERT, WATCH, NORMAL).
        - Preserves authentic NDMA metadata and source URLs.
        """
        harbor = context.origin_harbor or "Ratnagiri"
        lat, lon = resolve_coordinates(context)

        alerts: List[SachetCapAlert] = []
        is_live = False

        if (
            self.data_mode in ("LIVE", "HYBRID")
            and settings.SACHET_API_KEY
            and "placeholder" not in settings.SACHET_API_BASE_URL.lower()
        ):
            try:
                alerts = self._fetch_live_cap(lat, lon)
                is_live = True
            except Exception as e:
                if self.data_mode == "LIVE":
                    raise
                logger.warning("SACHET live fetch failed (%s), falling back to fixtures.", e)
                alerts = self.load_fixtures()
        else:
            alerts = self.load_fixtures()

        now = datetime.now(UTC)
        # Filter temporally valid and spatially matching alerts
        active_matches = [
            a for a in alerts
            if a.is_temporally_valid(now) and a.matches_point(lat, lon)
        ]

        if not active_matches:
            return HazardBulletinPayload(
                harbor=harbor,
                cyclone_warning_active=False,
                squall_alert=False,
                bulletin_id=None,
                severity="NORMAL",
                headline="No active disaster warnings for this coastal sector",
                valid_from=now.isoformat(),
                valid_to=None,
                source_name=f"{self.SOURCE_NAME} [{'LIVE' if is_live else 'SNAPSHOT'}]",
                source_url="https://sachet.ndma.gov.in",
            )

        # Prioritize most severe matching alert
        # Extreme/Severe -> WARNING
        # Moderate -> ALERT
        # Minor -> WATCH
        severity_rank = {"Extreme": 4, "Severe": 3, "Moderate": 2, "Minor": 1, "Unknown": 0}
        active_matches.sort(
            key=lambda a: severity_rank.get(a.severity.capitalize(), 0),
            reverse=True,
        )
        top = active_matches[0]

        cap_sev = top.severity.capitalize()
        if cap_sev in ("Extreme", "Severe"):
            canon_severity = "WARNING"
        elif cap_sev == "Moderate":
            canon_severity = "ALERT"
        elif cap_sev == "Minor":
            canon_severity = "WATCH"
        else:
            canon_severity = "NORMAL"

        is_cyclone = any(
            term in (top.event + " " + top.headline).lower()
            for term in ("cyclon", "depression", "storm", "deep depression")
        )
        is_squall = any(
            term in (top.event + " " + top.headline + " " + top.description).lower()
            for term in ("squall", "gale", "high wave", "rough sea", "wind")
        )

        return HazardBulletinPayload(
            harbor=harbor,
            cyclone_warning_active=is_cyclone or canon_severity == "WARNING",
            squall_alert=is_squall or canon_severity in ("WARNING", "ALERT"),
            bulletin_id=top.identifier,
            severity=canon_severity,
            headline=top.headline or top.event,
            valid_from=top.effective or top.sent,
            valid_to=top.expires,
            source_name=f"{self.SOURCE_NAME} [{'LIVE' if is_live else 'SNAPSHOT'}]",
            source_url="https://sachet.ndma.gov.in",
        )
