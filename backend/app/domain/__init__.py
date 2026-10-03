"""Deterministic Marine Domain Logic Package.

Owned by Dev 4 (Marine, Geo, Risk & Route Intelligence).
Responsible for:
- Deterministic Risk Evaluation Engine (rules for GO, CAUTION, NO_GO, UNKNOWN)
- Route exposure comparison models (wind, wave, and boundary risk profiles)
- Hard-stop verification against official warnings

Must NOT implement:
- FastAPI routes or endpoints
- Frontend UI components
- LLM prompts
"""

from backend.app.connectors.harbors import HARBOR_COORDINATES
from backend.app.domain.marine_dataset import (
    IN_MEMORY_MARINE_DATASET,
    get_hazard_record,
    get_marine_record,
    get_weather_record,
)
from backend.app.domain.geo_restrictions import (
    BoundaryWarning,
    DeterministicGeospatialEngine,
    LocationEvaluationResult,
)
from backend.app.domain.pfz import (
    DeterministicPFZRankingEngine,
    haversine_distance_nm,
    initial_compass_bearing_deg,
)
from backend.app.domain.risk_engine import (
    CRAFT_THRESHOLDS,
    DeterministicRiskEngine,
    evaluate_deterministic_risk,
)

__all__ = [
    "HARBOR_COORDINATES",
    "IN_MEMORY_MARINE_DATASET",
    "get_marine_record",
    "get_weather_record",
    "get_hazard_record",
    "CRAFT_THRESHOLDS",
    "DeterministicRiskEngine",
    "evaluate_deterministic_risk",
    "DeterministicPFZRankingEngine",
    "DeterministicGeospatialEngine",
    "BoundaryWarning",
    "LocationEvaluationResult",
    "haversine_distance_nm",
    "initial_compass_bearing_deg",
]


