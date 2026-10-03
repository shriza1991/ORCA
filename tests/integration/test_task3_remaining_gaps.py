"""Regressions through real contracts for the final provenance corrections."""
from datetime import timedelta
from types import SimpleNamespace

import pytest
from backend.app.agents.integrations.dev2 import PFZSourceDataPayload
from backend.app.contracts.chat import EvidenceItem
from backend.app.domain.agent_collaboration import AgentCollaborationEngine
from backend.app.services.mission_conversation import _derive_pfz_confidence, _build_retained_evidence
from backend.app.services.assessment_service import AssessmentService
from backend.app.contracts.assessment import TripAssessmentRequest
from backend.app.domain.synthetic.generator import current_demo_reference


@pytest.mark.parametrize('mode,expected', [('LIVE', 'HIGH'), ('CACHED_REAL', 'MEDIUM')])
def test_pfz_metadata_survives_actual_payload_serialization(mode, expected):
    payload = PFZSourceDataPayload(features=[], bulletin_date='2026-10-04T00:00:00Z',
        valid_to='2026-10-04T18:00:00Z', data_mode=mode, provider_name='Test provider',
        quality_flags=['official_source', 'verified_live'],
        freshness_flags={'coverage_status': 'CERTIFIED', 'is_fallback': False, 'unavailable': False})
    restored = PFZSourceDataPayload.model_validate_json(payload.model_dump_json())
    assert restored.provider_name == 'Test provider'
    selected = SimpleNamespace(pfz_candidates=[{'candidate_id': 'PFZ-1'}],
        conditions=SimpleNamespace(data_mode='HYBRID', provenance_mode='LIVE'))
    confidence = _derive_pfz_confidence(selected, {'pfz': restored.model_dump()}, '2026-10-04T06:00:00Z', 'en')
    assert confidence.level.value == expected


@pytest.mark.parametrize('mode,flags,expected', [
    ('CACHED_REAL', ['official_source', 'verified_live'], 'Partial'),
    ('LIVE', ['official_source'], 'Partial'),
    ('LIVE', ['official_source', 'verified_live'], 'Verified'),
    ('LIVE', ['official_source', 'verified_live', 'stale'], 'Limited'),
])
def test_collaboration_verification_requires_valid_uncached_verified_source(mode, flags, expected):
    evidence = EvidenceItem(source_name='Test marine forecast', metric_name='significant_wave_height',
        quality_flags=flags, data_mode=mode, valid_from='2026-10-04T00:00:00Z', valid_to='2026-10-04T18:00:00Z')
    result = AgentCollaborationEngine.derive_collaboration(observations={'significant_wave_height_m': 1},
        evidence=[evidence], risk_assessment=None, trace=[], user_profile={'departure_time': '2026-10-04T06:00:00Z'})
    assert result.agents[0].data_quality.value == expected
    assert result.agents[0].sources[0].last_updated is None


def test_retained_comparison_does_not_create_retrieval_timestamps(monkeypatch):
    from backend.app.api.v1.assessments import compare_trip
    from backend.app.contracts.assessment import TripSimulationRequest
    monkeypatch.setattr('backend.app.services.assessment_service.DB_AVAILABLE', False)
    start = current_demo_reference() + timedelta(hours=2)
    req = TripAssessmentRequest(origin_harbor='Ratnagiri', data_mode='DEMO', departure_time=start.isoformat(), return_time=(start + timedelta(hours=12)).isoformat())
    baseline = AssessmentService.assess_trip(req)
    compared = compare_trip(TripSimulationRequest(baseline=req, simulated=req, baseline_assessment_id=baseline.assessment_id))
    before = _build_retained_evidence(baseline)
    after = _build_retained_evidence(compared.simulated)
    assert [(e.source_name, e.retrieved_at, e.observed_time) for e in before] == [(e.source_name, e.retrieved_at, e.observed_time) for e in after]
    assert all(e.retrieved_at is None for e in after if e.data_mode == 'CALCULATED')
