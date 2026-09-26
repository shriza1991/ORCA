import os
import sys
import json
from pathlib import Path

# Add backend to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__))))

import pytest

from backend.app.agents.integrations.contracts import ToolInvocationContext
from backend.app.connectors.manager import ConnectorManager
from backend.app.connectors.snapshot import SnapshotConnector
from backend.app.connectors.modes import DataMode
from backend.app.domain.risk_engine import DeterministicRiskEngine

@pytest.mark.parametrize("scenario_name", ["hero", "safe", "unsafe", "unknown"])
def test_scenario(scenario_name: str):
    print(f"\n=== Testing Scenario: {scenario_name.upper()} ===")
    
    # Configure SnapshotConnector to use the scenario directory
    snapshots_path = Path("data/source_snapshots/scenarios") / scenario_name
    snapshot_connector = SnapshotConnector(snapshots_path=str(snapshots_path))
    
    # Configure ConnectorManager in SNAPSHOT mode
    manager = ConnectorManager(
        mode=DataMode.SNAPSHOT,
        snapshot_connector=snapshot_connector,
    )
    
    ctx = ToolInvocationContext(origin_harbor="Ratnagiri", craft_profile="motorized_boat")
    
    try:
        marine = manager.get_marine_conditions(ctx)
    except Exception as e:
        print(f"  [Warning] Marine connector failed: {e}")
        marine = None
        
    try:
        weather = manager.get_weather_conditions(ctx)
    except Exception as e:
        print(f"  [Warning] Weather connector failed: {e}")
        weather = None
        
    try:
        hazard = manager.get_hazard_bulletin(ctx)
    except Exception as e:
        print(f"  [Warning] Hazard connector failed: {e}")
        hazard = None
    
    # 2. Evaluate
    res = DeterministicRiskEngine.evaluate(ctx, marine=marine, weather=weather, hazard=hazard)
    
    print(f"Status: {res.status.value}")
    print(f"Confidence: {res.confidence_level.value}")
    print("Decisive Factors:", res.decisive_factors)
    print("Warnings:", res.warnings)
    assert res.status is not None
    assert res.confidence_level is not None
    return res.status.value, res.confidence_level.value

def main():
    results = {}
    for scenario in ["hero", "safe", "unsafe", "unknown"]:
        try:
            status, conf = test_scenario(scenario)
            results[scenario] = (status, conf)
        except Exception as e:
            print(f"Error testing {scenario}: {e}")
            
    print("\n=== SUMMARY ===")
    for s, (status, conf) in results.items():
        print(f"{s.ljust(10)} | {status.ljust(10)} | {conf}")

if __name__ == "__main__":
    main()
