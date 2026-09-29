"""Utility to export deterministic synthetic fixtures to JSON files.

Exports source-partitioned fixtures under data/fixtures/synthetic/
for developer inspection and offline test pipelines.
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from backend.app.domain.synthetic.generator import generate_synthetic_demo_dataset


def _json_serializer(obj):
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Type {type(obj)} not serializable")


def dump_synthetic_fixtures(output_root: str = "data/fixtures/synthetic") -> None:
    """Exports all 14 entity collections into source-partitioned JSON files."""
    root = Path(output_root)
    root.mkdir(parents=True, exist_ok=True)

    dataset = generate_synthetic_demo_dataset()

    # Incois directory
    incois_dir = root / "incois"
    incois_dir.mkdir(parents=True, exist_ok=True)
    with open(incois_dir / "osf_hourly_observations.json", "w", encoding="utf-8") as f:
        json.dump(dataset["marine_observations"], f, indent=2, default=_json_serializer)
    with open(incois_dir / "pfz_advisories.json", "w", encoding="utf-8") as f:
        json.dump(dataset["pfz_candidates"], f, indent=2, default=_json_serializer)

    # IMD directory
    imd_dir = root / "imd"
    imd_dir.mkdir(parents=True, exist_ok=True)
    with open(imd_dir / "coastal_weather_bulletins.json", "w", encoding="utf-8") as f:
        json.dump(dataset["marine_observations"], f, indent=2, default=_json_serializer)
    with open(imd_dir / "marine_hazard_bulletins.json", "w", encoding="utf-8") as f:
        json.dump(dataset["hazards"], f, indent=2, default=_json_serializer)

    # MOSDAC directory
    mosdac_dir = root / "mosdac"
    mosdac_dir.mkdir(parents=True, exist_ok=True)
    with open(mosdac_dir / "satellite_eo_grid.json", "w", encoding="utf-8") as f:
        json.dump(dataset["eo_grid_cells"], f, indent=2, default=_json_serializer)

    # ORCA directory
    orca_dir = root / "orca"
    orca_dir.mkdir(parents=True, exist_ok=True)
    with open(orca_dir / "stakeholders.json", "w", encoding="utf-8") as f:
        json.dump(dataset["stakeholders"], f, indent=2, default=_json_serializer)
    with open(orca_dir / "harbors.json", "w", encoding="utf-8") as f:
        json.dump(dataset["harbors"], f, indent=2, default=_json_serializer)
    with open(orca_dir / "fishers.json", "w", encoding="utf-8") as f:
        json.dump(dataset["fishers"], f, indent=2, default=_json_serializer)
    with open(orca_dir / "vessels.json", "w", encoding="utf-8") as f:
        json.dump(dataset["vessels"], f, indent=2, default=_json_serializer)
    with open(orca_dir / "trips.json", "w", encoding="utf-8") as f:
        json.dump(dataset["trips"], f, indent=2, default=_json_serializer)
    with open(orca_dir / "geofences.json", "w", encoding="utf-8") as f:
        json.dump(dataset["geofences"], f, indent=2, default=_json_serializer)
    with open(orca_dir / "route_nodes.json", "w", encoding="utf-8") as f:
        json.dump(dataset["route_nodes"], f, indent=2, default=_json_serializer)
    with open(orca_dir / "route_edges.json", "w", encoding="utf-8") as f:
        json.dump(dataset["route_edges"], f, indent=2, default=_json_serializer)
    with open(orca_dir / "notifications.json", "w", encoding="utf-8") as f:
        json.dump(dataset["notifications"], f, indent=2, default=_json_serializer)
    with open(orca_dir / "replay_positions.json", "w", encoding="utf-8") as f:
        json.dump(dataset["replay_positions"], f, indent=2, default=_json_serializer)
    with open(orca_dir / "sectors.json", "w", encoding="utf-8") as f:
        json.dump(dataset["sectors"], f, indent=2, default=_json_serializer)


if __name__ == "__main__":
    dump_synthetic_fixtures()
