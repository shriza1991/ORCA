import math
import json
import logging
from typing import List, Optional, Any
from shapely.geometry import Point, LineString, shape, MultiPolygon

from backend.app.agents.integrations.contracts import ToolInvocationContext
from backend.app.agents.integrations.dev2 import (
    MarineConditionsPayload,
    WeatherConditionsPayload,
    HazardBulletinPayload,
)
from backend.app.agents.integrations.dev4 import (
    RouteExposurePayload,
    EvaluatedRouteItem,
)

logger = logging.getLogger(__name__)

class DeterministicRouteExposureEngine:
    """Evaluates routes deterministically against land constraints and environmental exposures."""

    def __init__(self, coastline_geojson_path: str = "data/reference/india_coastline.geojson"):
        self.coastline_geojson_path = coastline_geojson_path
        self.land_polygon = self._load_land_polygon()
        self.nominal_speed_knots = 8.0

    def _load_land_polygon(self) -> Optional[MultiPolygon]:
        try:
            with open(self.coastline_geojson_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            # Find the geometry inside the GeoJSON (Feature or FeatureCollection)
            if data.get("type") == "FeatureCollection":
                for feature in data.get("features", []):
                    if feature.get("properties", {}).get("name") == "India":
                        return shape(feature["geometry"])
            elif data.get("type") == "Feature":
                return shape(data["geometry"])
            return None
        except Exception as e:
            logger.warning(f"Could not load land polygon from {self.coastline_geojson_path}: {e}")
            return None

    def _haversine(self, lon1: float, lat1: float, lon2: float, lat2: float) -> float:
        """Calculate the great circle distance in kilometers between two points."""
        R = 6371.0 # Earth radius in km
        dlat = math.radians(lat2 - lat1)
        dlon = math.radians(lon2 - lon1)
        a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        return R * c

    def _calculate_route_distance_km(self, waypoints: List[List[float]]) -> float:
        distance = 0.0
        for i in range(len(waypoints) - 1):
            lon1, lat1 = waypoints[i]
            lon2, lat2 = waypoints[i+1]
            distance += self._haversine(lon1, lat1, lon2, lat2)
        return distance

    def _generate_synthetic_corridors(
        self, origin: List[float], dest: List[float]
    ) -> List[List[List[float]]]:
        """Generate direct, balanced, and inshore corridor wayspoints if base_waypoints are missing."""
        origin_lng, origin_lat = origin
        target_lng, target_lat = dest
        dx = target_lng - origin_lng
        dy = target_lat - origin_lat
        dist_deg = math.hypot(dx, dy)
        if dist_deg < 0.0001:
            dx, dy, dist_deg = -0.15, -0.08, 0.17

        seaward_offset_x = -abs(0.04 * (dy / dist_deg if dist_deg else 1.0))
        seaward_offset_y = 0.02 * (dx / dist_deg if dist_deg else 0.0)

        direct_waypoints = [
            [round(origin_lng, 4), round(origin_lat, 4)],
            [round(origin_lng + 0.35 * dx, 4), round(origin_lat + 0.35 * dy, 4)],
            [round(origin_lng + 0.70 * dx, 4), round(origin_lat + 0.70 * dy, 4)],
            [round(target_lng, 4), round(target_lat, 4)],
        ]
        balanced_waypoints = [
            [round(origin_lng, 4), round(origin_lat, 4)],
            [round(origin_lng + 0.28 * dx + seaward_offset_x * 0.6, 4), round(origin_lat + 0.28 * dy + seaward_offset_y * 0.6, 4)],
            [round(origin_lng + 0.62 * dx + seaward_offset_x * 1.0, 4), round(origin_lat + 0.62 * dy + seaward_offset_y * 1.0, 4)],
            [round(origin_lng + 0.85 * dx + seaward_offset_x * 0.5, 4), round(origin_lat + 0.85 * dy + seaward_offset_y * 0.5, 4)],
            [round(target_lng, 4), round(target_lat, 4)],
        ]
        inshore_waypoints = [
            [round(origin_lng, 4), round(origin_lat, 4)],
            [round(origin_lng + 0.20 * dx, 4), round(origin_lat + 0.20 * dy - 0.015, 4)],
            [round(origin_lng + 0.45 * dx, 4), round(origin_lat + 0.45 * dy - 0.025, 4)],
            [round(origin_lng + 0.72 * dx, 4), round(origin_lat + 0.72 * dy - 0.015, 4)],
            [round(origin_lng + 0.90 * dx, 4), round(origin_lat + 0.90 * dy, 4)],
            [round(target_lng, 4), round(target_lat, 4)],
        ]
        return [direct_waypoints, balanced_waypoints, inshore_waypoints]

    def _intersects_land(self, route_line: LineString) -> bool:
        """Check if the route intersects the loaded land polygon."""
        if not self.land_polygon:
            return False
        return route_line.intersects(self.land_polygon)
        
    def _check_geofence(self, waypoints: List[List[float]], geospatial_engine: Any, context: ToolInvocationContext) -> List[str]:
        if not geospatial_engine:
            return []
            
        reasons = []
        for wp in waypoints:
            res = geospatial_engine.check_geofence_hazards(context=context, coordinates=wp)
            if getattr(res, "hard_stop", False):
                reasons.append(f"Intersects restricted NO_GO zone: {getattr(res, 'restriction_name', 'Unknown')}")
                break
        return reasons

    def evaluate_routes(
        self,
        context: ToolInvocationContext,
        marine: MarineConditionsPayload,
        destination: str,
        weather: Optional[WeatherConditionsPayload] = None,
        hazard: Optional[HazardBulletinPayload] = None,
        geospatial_engine: Optional[Any] = None,
        dest_coords: Optional[List[float]] = None,
        base_waypoints: Optional[List[List[float]]] = None,
    ) -> RouteExposurePayload:
        
        origin_coords = context.coordinates
        if not origin_coords and context.origin_harbor:
            from backend.app.domain.map_layers import _get_harbor_lon_lat
            origin_coords = _get_harbor_lon_lat(context.origin_harbor)
        origin_coords = origin_coords or [73.28, 16.99]

        target_coords = dest_coords
        if not target_coords:
            from backend.app.domain.map_layers import _get_harbor_lon_lat
            target_coords = _get_harbor_lon_lat(destination)
            if target_coords == origin_coords or target_coords == [69.60, 21.64]:
                target_coords = [round(origin_coords[0] - 0.33, 4), round(origin_coords[1] - 0.17, 4)]

        if base_waypoints and len(base_waypoints) >= 4:
            n = len(base_waypoints)
            w1 = [
                base_waypoints[0],
                base_waypoints[int(n * 0.20)],
                base_waypoints[int(n * 0.40)],
                base_waypoints[int(n * 0.60)],
                base_waypoints[int(n * 0.80)],
                base_waypoints[-1],
            ]
            w2 = [
                base_waypoints[0],
                base_waypoints[int(n * 0.25)],
                base_waypoints[int(n * 0.70)],
                base_waypoints[-1],
            ]
            w3 = [
                base_waypoints[0],
                [round(base_waypoints[int(n * 0.22)][0] - 0.015, 4), base_waypoints[int(n * 0.22)][1]],
                [round(base_waypoints[int(n * 0.50)][0] - 0.025, 4), base_waypoints[int(n * 0.50)][1]],
                [round(base_waypoints[int(n * 0.78)][0] - 0.015, 4), base_waypoints[int(n * 0.78)][1]],
                base_waypoints[-1],
            ]
            corridors = [w2, w3, w1] 
            names = ["Direct Open-Sea Channel", "Balanced Coastal Passage", "Inshore Sheltered Channel"]
            ids = ["ROUTE-B-DIRECT", "ROUTE-C-BALANCED", "ROUTE-A-INSHORE"]
            is_synthetic = False
        else:
            corridors = self._generate_synthetic_corridors(origin_coords, target_coords)
            names = ["Direct Open-Sea Channel", "Balanced Coastal Passage", "Inshore Sheltered Channel"]
            ids = ["ROUTE-B-DIRECT", "ROUTE-C-BALANCED", "ROUTE-A-INSHORE"]
            is_synthetic = True

        wave_h = marine.significant_wave_height_m if marine.significant_wave_height_m is not None else 1.0
        missing_state = None if marine.significant_wave_height_m is not None else "Missing actual wave height, defaulting to 1.0m"

        evaluated_routes = []
        for c_way, c_name, c_id in zip(corridors, names, ids):
            dist_km = self._calculate_route_distance_km(c_way)
            route_line = LineString(c_way)
            
            infeasible_reasons = []
            
            # Land intersection
            if self._intersects_land(route_line):
                infeasible_reasons.append("Route intersects land boundary.")
                
            # Geofence check
            geofence_reasons = self._check_geofence(c_way, geospatial_engine, context)
            infeasible_reasons.extend(geofence_reasons)
            
            # Exposure calculation (wave height + distance penalty)
            exposure = round(wave_h * 1.5 + (dist_km / 10.0), 2)
            
            if exposure > 6.0:
                risk_rating = "HIGH"
            elif exposure > 3.0:
                risk_rating = "MODERATE"
            else:
                risk_rating = "LOW"
            craft = context.craft_profile or 'motorized_boat'
            if craft == 'traditional_non_motorized':
                speed_knots = 3.0
                fuel_rate = 0.0
            elif craft == 'mechanized_trawler':
                speed_knots = 10.0
                fuel_rate = 20.0
            else:
                speed_knots = 8.0
                fuel_rate = 3.0
                
            eta_hours = round((dist_km / 1.852) / speed_knots, 2)
            fuel_liters = round(eta_hours * fuel_rate, 1)
            
            evaluated_routes.append(
                EvaluatedRouteItem(
                    route_id=c_id,
                    name=c_name,
                    distance_km=round(dist_km, 1),
                    max_wave_height_m=wave_h,
                    risk_rating=risk_rating,
                    exposure_score=exposure,
                    waypoints=c_way,
                    eta_hours=eta_hours,
                    eta_assumptions=f"Assumes speed {speed_knots} knots for {craft}. Currents unadjusted.",
                    fuel_estimate_liters=fuel_liters,
                    fuel_assumptions=f"Estimated at {fuel_rate} L/hr for {craft}",
                    is_feasible=len(infeasible_reasons) == 0,
                    infeasibility_reasons=infeasible_reasons,
                    is_synthetic=is_synthetic,
                    missing_data_state=missing_state,
                )
            )

        feasible_routes = [r for r in evaluated_routes if r.is_feasible]
        
        recommended_route_id = ""
        if feasible_routes:
            # Sort by lowest exposure score
            feasible_routes.sort(key=lambda r: r.exposure_score)
            recommended_route_id = feasible_routes[0].route_id

        return RouteExposurePayload(
            origin=context.origin_harbor or "Ratnagiri",
            destination=destination,
            recommended_route_id=recommended_route_id,
            routes=evaluated_routes, # Return all routes so UI can show infeasible ones too
            origin_coordinates=origin_coords,
            destination_coordinates=target_coords,
        )
