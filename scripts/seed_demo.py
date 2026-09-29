#!/usr/bin/env python3
"""CLI utility to seed the ORCA synthetic demo dataset.

Usage:
    python scripts/seed_demo.py [--reset] [--dry-run] [--verbose] [--namespace ORCA_DEMO_V1]
"""

from __future__ import annotations

import argparse
import logging
import pathlib
import sys
import time
from datetime import datetime

# Ensure project root is in sys.path
_project_root = pathlib.Path(__file__).resolve().parent.parent
if str(_project_root) not in sys.path:
    sys.path.insert(0, str(_project_root))

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("seed_demo")

from backend.app.core.config import settings
from backend.app.db.session import SessionLocal
from backend.app.domain.synthetic.seeder import seed_synthetic_demo


def format_table(rows: list[tuple[str, str, int]], headers: tuple[str, str, str]) -> str:
    """Helper to format a clean ASCII summary table."""
    col1_w = max(len(headers[0]), max(len(r[0]) for r in rows)) + 2
    col2_w = max(len(headers[1]), max(len(r[1]) for r in rows)) + 2
    col3_w = max(len(headers[2]), max(len(str(r[2])) for r in rows)) + 2

    sep_line = f"+{'-' * col1_w}+{'-' * col2_w}+{'-' * col3_w}+"
    header_line = f"| {headers[0].ljust(col1_w - 1)}| {headers[1].ljust(col2_w - 1)}| {str(headers[2]).rjust(col3_w - 1)}|"

    lines = [sep_line, header_line, sep_line]
    for cat, model, count in rows:
        lines.append(f"| {cat.ljust(col1_w - 1)}| {model.ljust(col2_w - 1)}| {str(count).rjust(col3_w - 1)}|")
    lines.append(sep_line)
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Seed ORCA synthetic demo data into the backend database."
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Purge existing records in the target namespace before seeding.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate generated synthetic records without committing to the database.",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Enable detailed debug logging during generation and insertion.",
    )
    parser.add_argument(
        "--namespace",
        type=str,
        default="ORCA_DEMO_V1",
        help="Dataset namespace key (default: ORCA_DEMO_V1).",
    )

    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    print("=" * 70)
    print("=== ORCA Synthetic Demo Data Seeder ===")
    print("=" * 70)
    print(f"Target Namespace : {args.namespace}")
    print(f"Reset Existing   : {args.reset}")
    print(f"Dry Run Mode     : {args.dry_run}")
    print(f"Database Engine  : {settings.DATABASE_URL.split('://')[0] if hasattr(settings, 'DATABASE_URL') else 'SQLite/Postgres'}")
    print("=" * 70)

    start_time = time.perf_counter()

    with SessionLocal() as session:
        try:
            results = seed_synthetic_demo(
                session=session,
                reset_first=args.reset,
                dry_run=args.dry_run,
                namespace=args.namespace,
            )
        except Exception as exc:
            logger.exception("Failed to seed synthetic demo dataset: %s", exc)
            print(f"\n[ERROR] Seeding failed with error: {exc}", file=sys.stderr)
            return 1

    elapsed = time.perf_counter() - start_time

    counts = results.get("simulated_counts" if args.dry_run else "seeded_counts", {})

    # Group counts into categories for display
    table_rows = [
        ("Core Identity", "Stakeholders (DemoStakeholder)", counts.get("stakeholders", 0)),
        ("Core Geography", "Harbors (DemoHarbor)", counts.get("harbors", 0)),
        ("Core Operations", "Fishers (DemoFisher)", counts.get("fishers", 0)),
        ("Core Operations", "Vessels (DemoVessel)", counts.get("vessels", 0)),
        ("Core Operations", "Trips (DemoTrip)", counts.get("trips", 0)),
        ("Source Observations", "Marine Observations (INCOIS OSF / IMD)", counts.get("marine_observations", 0)),
        ("Source Observations", "EO Grid Cells (MOSDAC OceanSat/INSAT)", counts.get("eo_grid_cells", 0)),
        ("Domain Advisories", "PFZ Candidates (INCOIS PFZ)", counts.get("pfz_candidates", 0)),
        ("Spatial Boundaries", "Geofences (Restricted / Marine Park)", counts.get("geofences", 0)),
        ("Maritime Routing", "Route Nodes (Safe Waypoints)", counts.get("route_nodes", 0)),
        ("Maritime Routing", "Route Edges (Coastal Graph)", counts.get("route_edges", 0)),
        ("Marine Hazards", "Hazard Events (IMD Weather Alerts)", counts.get("hazards", 0)),
        ("Notifications", "Linked Notifications (Multi-role)", counts.get("notifications", 0)),
        ("Vessel Tracking", "Vessel Replay Positions (Tracks)", counts.get("vessel_replay_positions" if "vessel_replay_positions" in counts else "replay_positions", 0)),
    ]

    total_records = sum(r[2] for r in table_rows)

    print("\nSummary of Generated & Seeded Records:")
    print(format_table(table_rows, ("Category", "Model / Dataset", "Count")))
    print(f"\nTotal Records: {total_records}")
    print(f"Elapsed Time : {elapsed:.2f}s")
    if args.dry_run:
        print("\n[INFO] Dry run completed successfully (no database records were written).")
    else:
        print("\n[SUCCESS] Synthetic demo data seeding completed successfully!")
    print("=" * 70)

    return 0


if __name__ == "__main__":
    sys.exit(main())
