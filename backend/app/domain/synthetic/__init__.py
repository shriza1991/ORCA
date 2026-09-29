"""Synthetic Demo Data Seeding Foundation Package.

Provides deterministic generator, geospatial validators, seeder, and dataset constants
for the ORCA prototype (ORCA_DEMO_V1).
"""

from backend.app.domain.synthetic.generator import (
    DATASET_VERSION,
    REFERENCE_TIME,
    SYNTHETIC_NAMESPACE,
    generate_synthetic_demo_dataset,
)
from backend.app.domain.synthetic.seeder import (
    reset_synthetic_demo,
    seed_synthetic_demo,
)
from backend.app.domain.synthetic.validator import (
    SyntheticValidationError,
    validate_synthetic_dataset,
)

__all__ = [
    "REFERENCE_TIME",
    "SYNTHETIC_NAMESPACE",
    "DATASET_VERSION",
    "generate_synthetic_demo_dataset",
    "validate_synthetic_dataset",
    "SyntheticValidationError",
    "seed_synthetic_demo",
    "reset_synthetic_demo",
]
