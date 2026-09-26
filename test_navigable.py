import json
from shapely.geometry import Point
from backend.app.domain.route_engine import DeterministicRouteExposureEngine

engine = DeterministicRouteExposureEngine()
p = Point(72.87, 18.92)
if engine.land_polygon:
    print("Intersects land:", p.intersects(engine.land_polygon))
else:
    print("No land polygon")
