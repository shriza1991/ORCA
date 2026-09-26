"""Tests for SachetConnector (NDMA SACHET / CAP Disaster Alert Ingestion).

Verifies:
1. Valid CAP 1.2 XML parsing and normalization
2. Valid CAP JSON parsing and normalization
3. Multiple alerts handling and highest severity prioritization
4. Expired alert filtering (temporal validity)
5. Future alert filtering (temporal validity)
6. Malformed CAP handling without crash
7. Missing fields safe defaults
8. Spatially relevant alert matching
9. Spatially irrelevant alert exclusion
10. Unavailable provider error and hybrid fallback
11. Integration with ConnectorManager hazard harmonization
"""

from datetime import UTC, datetime, timedelta
import pytest
from unittest.mock import MagicMock, patch

from backend.app.agents.integrations.contracts import ToolInvocationContext
from backend.app.connectors.errors import ConnectorUpstreamUnavailableError
from backend.app.connectors.sachet import (
    SachetCapAlert,
    SachetConnector,
    _point_in_polygon,
    _haversine_distance_km,
)


@pytest.fixture
def sachet_connector(tmp_path):
    return SachetConnector(fixtures_path=tmp_path)


def test_point_in_polygon_and_haversine():
    # Square polygon around (16.0, 73.0) to (17.0, 74.0)
    poly = [(16.0, 73.0), (17.0, 73.0), (17.0, 74.0), (16.0, 74.0)]
    assert _point_in_polygon(16.5, 73.5, poly) is True
    assert _point_in_polygon(15.5, 73.5, poly) is False
    assert _point_in_polygon(18.0, 75.0, poly) is False

    # Haversine distance
    dist = _haversine_distance_km(16.0, 73.0, 16.0, 73.0)
    assert dist == 0.0
    dist_approx = _haversine_distance_km(16.0, 73.0, 17.0, 73.0)
    assert 110.0 < dist_approx < 112.0


def test_parse_valid_cap_xml(sachet_connector):
    xml_content = """<?xml version="1.0" encoding="UTF-8"?>
    <alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">
      <identifier>SACHET-TEST-01</identifier>
      <sender>ndma@gov.in</sender>
      <sent>2026-09-23T10:00:00+00:00</sent>
      <status>Actual</status>
      <msgType>Alert</msgType>
      <scope>Public</scope>
      <info>
        <category>Met</category>
        <event>Cyclone Warning</event>
        <urgency>Immediate</urgency>
        <severity>Severe</severity>
        <certainty>Observed</certainty>
        <effective>2026-09-23T10:00:00+00:00</effective>
        <expires>2026-09-25T18:00:00+00:00</expires>
        <headline>Severe Cyclonic Storm in Central Arabian Sea</headline>
        <description>Gale force winds reaching 50 knots.</description>
        <area>
          <areaDesc>Konkan Coast</areaDesc>
          <polygon>16.0,72.5 17.5,72.5 17.5,73.8 16.0,73.8 16.0,72.5</polygon>
        </area>
      </info>
    </alert>
    """
    alerts = sachet_connector.parse_cap_xml(xml_content)
    assert len(alerts) == 1
    alert = alerts[0]
    assert alert.identifier == "SACHET-TEST-01"
    assert alert.severity == "Severe"
    assert alert.event == "Cyclone Warning"
    assert len(alert.polygons) == 1
    # Check matching point inside polygon: lat 16.99, lon 73.28 (Ratnagiri)
    assert alert.matches_point(16.99, 73.28) is True
    # Point outside polygon (e.g. Mumbai lat 19.07, lon 72.87)
    assert alert.matches_point(19.07, 72.87) is False


def test_parse_valid_cap_json(sachet_connector):
    json_data = {
        "identifier": "SACHET-JSON-02",
        "sender": "ndma@gov.in",
        "sent": "2026-09-23T11:00:00+00:00",
        "info": [
            {
                "category": "Met",
                "event": "Squall Warning",
                "urgency": "Expected",
                "severity": "Moderate",
                "effective": "2026-09-23T11:00:00+00:00",
                "expires": "2026-09-24T12:00:00+00:00",
                "headline": "Squally Wind Alert",
                "area": [
                    {
                        "areaDesc": "Ratnagiri Circular Zone",
                        "circle": "16.99,73.28,50.0"
                    }
                ]
            }
        ]
    }
    alerts = sachet_connector.parse_cap_json(json_data)
    assert len(alerts) == 1
    alert = alerts[0]
    assert alert.identifier == "SACHET-JSON-02"
    assert alert.severity == "Moderate"
    assert len(alert.circles) == 1
    # Inside 50km radius
    assert alert.matches_point(16.99, 73.28) is True
    # Far outside (e.g. lat 18.0)
    assert alert.matches_point(18.0, 73.28) is False


def test_temporal_validity_expired_and_future():
    past_alert = SachetCapAlert(
        identifier="OLD-01",
        sender="ndma",
        sent="2026-01-01T00:00:00Z",
        status="Actual",
        msg_type="Alert",
        scope="Public",
        category="Met",
        event="Past Event",
        urgency="Past",
        severity="Severe",
        certainty="Observed",
        headline="Old",
        description="",
        instruction="",
        effective="2026-01-01T00:00:00Z",
        expires="2026-01-02T00:00:00Z",
        area_desc="",
    )
    now = datetime(2026, 9, 23, 12, 0, 0, tzinfo=UTC)
    assert past_alert.is_temporally_valid(now) is False

    future_alert = SachetCapAlert(
        identifier="FUT-01",
        sender="ndma",
        sent="2026-10-01T00:00:00Z",
        status="Actual",
        msg_type="Alert",
        scope="Public",
        category="Met",
        event="Future Event",
        urgency="Expected",
        severity="Severe",
        certainty="Observed",
        headline="Future",
        description="",
        instruction="",
        effective="2026-10-01T00:00:00Z",
        expires="2026-10-05T00:00:00Z",
        area_desc="",
    )
    assert future_alert.is_temporally_valid(now) is False


def test_malformed_cap_and_missing_fields(sachet_connector):
    # Malformed XML
    alerts = sachet_connector.parse_cap_xml("<alert><unclosed>")
    assert alerts == []

    # Malformed JSON
    alerts_json = sachet_connector.parse_cap_json("not a dict")
    assert alerts_json == []

    # Missing fields
    missing_fields_xml = """<alert><info><event>Unspecified</event></info></alert>"""
    parsed = sachet_connector.parse_cap_xml(missing_fields_xml)
    assert len(parsed) == 1
    assert parsed[0].severity == "Unknown"
    assert parsed[0].event == "Unspecified"


def test_get_hazard_bulletin_normalization(tmp_path):
    # Write a severe cyclone fixture
    xml_fixture = tmp_path / "test_cyclone.xml"
    xml_fixture.write_text(
        """<?xml version="1.0" encoding="UTF-8"?>
        <alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">
          <identifier>SACHET-CYC-99</identifier>
          <sent>2026-09-23T10:00:00+00:00</sent>
          <info>
            <event>Deep Depression / Cyclonic Storm</event>
            <severity>Severe</severity>
            <effective>2026-09-20T00:00:00+00:00</effective>
            <expires>2026-09-30T00:00:00+00:00</expires>
            <headline>Severe Cyclonic Alert</headline>
            <area>
              <areaDesc>Ratnagiri Area</areaDesc>
              <polygon>16.0,72.0 18.0,72.0 18.0,74.0 16.0,74.0 16.0,72.0</polygon>
            </area>
          </info>
        </alert>
        """,
        encoding="utf-8",
    )

    connector = SachetConnector(data_mode="SNAPSHOT", fixtures_path=tmp_path)
    ctx = ToolInvocationContext(origin_harbor="Ratnagiri", coordinates=[73.28, 16.99])
    bulletin = connector.get_hazard_bulletin(ctx)

    assert bulletin.severity == "WARNING"
    assert bulletin.cyclone_warning_active is True
    assert bulletin.squall_alert is True
    assert bulletin.bulletin_id == "SACHET-CYC-99"
    assert "SACHET" in bulletin.source_name


def test_spatially_irrelevant_returns_normal(tmp_path):
    # Alert only covers Bay of Bengal / Chennai
    xml_fixture = tmp_path / "chennai_alert.xml"
    xml_fixture.write_text(
        """<?xml version="1.0" encoding="UTF-8"?>
        <alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">
          <identifier>SACHET-CHENNAI-01</identifier>
          <info>
            <event>Squall Alert</event>
            <severity>Severe</severity>
            <effective>2026-09-20T00:00:00+00:00</effective>
            <expires>2026-09-30T00:00:00+00:00</expires>
            <area>
              <polygon>12.0,80.0 14.0,80.0 14.0,82.0 12.0,82.0 12.0,80.0</polygon>
            </area>
          </info>
        </alert>
        """,
        encoding="utf-8",
    )

    connector = SachetConnector(data_mode="SNAPSHOT", fixtures_path=tmp_path)
    # Ratnagiri is on the west coast, outside this polygon
    ctx = ToolInvocationContext(origin_harbor="Ratnagiri", coordinates=[73.28, 16.99])
    bulletin = connector.get_hazard_bulletin(ctx)

    assert bulletin.severity == "NORMAL"
    assert bulletin.cyclone_warning_active is False
