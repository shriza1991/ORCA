"""Regressions for malformed validity and canonical reference/fixture identity."""
from datetime import datetime, UTC
import json
from backend.app.domain.geo_restrictions import DeterministicGeospatialEngine


def test_duplicate_reference_fixture_zone_keeps_reference_validity():
    engine = DeterministicGeospatialEngine()
    result = engine.evaluate_location([73.25, 15.4], evaluation_time=datetime(2026, 10, 3, tzinfo=UTC))
    ids = [w.boundary_id for w in result.warnings]
    assert 'REST-NAV-GOA-01' in ids
    assert 'POLY-NAV-GOA-01' not in ids
    assert len([w for w in result.warnings if 'Foxtrot' in w.boundary_name]) == 1


def test_relevant_invalid_validity_is_unknown_but_far_invalid_zone_does_not_hide_clear(tmp_path):
    path = tmp_path / 'reference.json'
    path.write_text(json.dumps({'type': 'FeatureCollection', 'features': [{
        'type': 'Feature', 'id': 'bad-zone', 'properties': {'valid_from': '2027-01-01', 'valid_to': '2026-01-01'},
        'geometry': {'type': 'Polygon', 'coordinates': [[[73, 15], [73.2, 15], [73.2, 15.2], [73, 15.2], [73, 15]]]},
    }]}))
    engine = DeterministicGeospatialEngine(path, tmp_path / 'missing.json')
    near = engine.evaluate_location([73.1, 15.1], evaluation_time=datetime(2026, 10, 3, tzinfo=UTC))
    assert near.evaluation_state == 'UNKNOWN'
    assert near.unknown_reason == 'MALFORMED_RESTRICTION_VALIDITY'
    assert engine.evaluate_location([70, 20]).evaluation_state == 'CLEAR'
