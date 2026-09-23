"""India MarineWatch Foundation API Contracts (§213, §214, §215).

Provides the 10 core national marine endpoints inspired by BarentsWatch:
1.  GET  /api/v1/forecast/point          - Single-point conditions, tide, hazards & sources
2.  GET  /api/v1/forecast/route          - Passage forecast along route waypoints
3.  GET  /api/v1/hazards/active          - Real-time IMD & INCOIS active bulletins & signals
4.  GET  /api/v1/fisheries/pfz           - Potential Fishing Zone advisories with SST/Chl-a
5.  GET  /api/v1/ports/nearby            - CMFRI landing centres & ports by proximity
6.  GET  /api/v1/aquaculture/sites/nearby - CAA registered coastal aquaculture farms
7.  GET  /api/v1/coast/profile           - GEBCO bathymetry, shelf zone, and MPA check
8.  GET  /api/v1/datasets                - Full 30-dataset catalogue (§212) with provenance
9.  GET  /api/v1/search                  - Spatial search across marine features & zones
10. POST /api/v1/spatial/query           - Unified "What is here?" composite query (§215)
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

from backend.app.domain.data_catalogue import get_all_datasets, get_dataset_by_id
from backend.app.services.marinewatch_service import marine_watch_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["India MarineWatch"])


# ---------------------------------------------------------------------------
# Pydantic Request / Response Models
# ---------------------------------------------------------------------------

class SpatialQueryRequest(BaseModel):
    lat: float = Field(..., ge=-90.0, le=90.0, description="Latitude in decimal degrees")
    lon: float = Field(..., ge=-180.0, le=180.0, description="Longitude in decimal degrees")
    radius_km: float = Field(default=50.0, ge=1.0, le=500.0, description="Proximity search radius")
    include_layers: Optional[List[str]] = Field(
        default=None,
        description="Filter specific layers: ['forecast', 'tide', 'bathymetry', 'hazards', 'ports', 'aquaculture', 'pfz']"
    )


class RouteForecastRequest(BaseModel):
    waypoints: List[List[float]] = Field(
        ...,
        min_length=2,
        description="List of [latitude, longitude] pairs along the planned passage",
    )
    craft_profile: str = Field(
        default="MOTORIZED_FIBERGLASS",
        description="Vessel craft profile (e.g. NON_MOTORIZED_CANOE, MOTORIZED_FIBERGLASS, MECHANIZED_TRAWLER)",
    )


# ---------------------------------------------------------------------------
# 1. Single Point Marine Forecast (§214)
# ---------------------------------------------------------------------------

@router.get(
    "/forecast/point",
    summary="Single-Point Marine Intelligence (§214)",
    description="Returns high-resolution marine forecast, tide, hazards, bathymetry, and nearby infrastructure for a coordinate.",
)
def get_point_forecast(
    lat: float = Query(..., ge=-90.0, le=90.0, description="Latitude in decimal degrees"),
    lon: float = Query(..., ge=-180.0, le=180.0, description="Longitude in decimal degrees"),
    timestamp: Optional[str] = Query(None, description="ISO-8601 target evaluation timestamp (defaults to current UTC)"),
) -> Dict[str, Any]:
    target_dt = None
    if timestamp:
        try:
            target_dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid ISO-8601 timestamp format: {timestamp}",
            )

    return marine_watch_service.get_point_forecast(lat=lat, lon=lon, dt=target_dt)


# ---------------------------------------------------------------------------
# 2. Passage Route Forecast (§213)
# ---------------------------------------------------------------------------

@router.get(
    "/forecast/route",
    summary="Route Passage Forecast (§213)",
    description="Evaluates passage conditions along waypoints (origin to destination) with safety rating and restriction checks.",
)
def get_route_forecast(
    waypoints: str = Query(
        ...,
        description="Comma/semicolon delimited lat,lon waypoints: '16.99,73.28;16.82,72.95'",
    ),
    craft_profile: str = Query("MOTORIZED_FIBERGLASS", description="Vessel craft profile"),
) -> Dict[str, Any]:
    try:
        parsed_waypoints: List[tuple[float, float]] = []
        for pair in waypoints.split(";"):
            parts = pair.split(",")
            if len(parts) == 2:
                parsed_waypoints.append((float(parts[0].strip()), float(parts[1].strip())))
        if len(parsed_waypoints) < 2:
            raise ValueError("At least 2 waypoints required")
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid waypoints parameter format. Expected 'lat1,lon1;lat2,lon2': {exc}",
        )

    return marine_watch_service.get_route_forecast(parsed_waypoints, craft_profile=craft_profile)


# ---------------------------------------------------------------------------
# 3. Active Marine Hazards & Bulletins (§213)
# ---------------------------------------------------------------------------

@router.get(
    "/hazards/active",
    summary="Active Marine Hazards (§213)",
    description="Returns active official IMD coastal bulletins, INCOIS high wave / swell surge alerts, and port signals.",
)
def get_active_hazards(
    sector: Optional[str] = Query(None, description="Optional sector filter (e.g. Maharashtra, Goa)"),
) -> Dict[str, Any]:
    hazards = marine_watch_service.get_active_hazards(sector=sector)
    return {
        "count": len(hazards),
        "hazards": hazards,
        "freshness": "REAL_TIME",
        "official_sources": ["India Meteorological Department (IMD)", "INCOIS Ocean State Forecast"],
    }


@router.get(
    "/hazards/geojson",
    summary="Active Marine Hazard Zones GeoJSON (§213)",
    description="Returns GeoJSON polygons for active IMD squally corridors, Bay of Bengal depressions, and INCOIS swell surge warning belts.",
)
def get_hazards_geojson() -> Dict[str, Any]:
    return marine_watch_service.get_hazards_geojson()


# ---------------------------------------------------------------------------
# 4. INCOIS Potential Fishing Zones (PFZ) (§213)
# ---------------------------------------------------------------------------

@router.get(
    "/fisheries/pfz",
    summary="Potential Fishing Zones (PFZ) Advisories (§213)",
    description="Returns active INCOIS Potential Fishing Zone advisories with SST fronts, chlorophyll-a, and species guidance.",
)
def get_pfz_advisories(
    sector: str = Query("Maharashtra", description="Coastal sector name (e.g. Maharashtra, Goa)"),
) -> Dict[str, Any]:
    pfz_list = marine_watch_service.get_pfz_advisories(sector=sector)
    return {
        "sector": sector,
        "advisories_count": len(pfz_list),
        "advisories": pfz_list,
        "source": "INCOIS PFZ Mission / ISRO Oceansat-3",
        "disclaimer": "PFZ advisories are operational guidance indicators and do not guarantee fish catch.",
    }


# ---------------------------------------------------------------------------
# 5. Nearby Ports & CMFRI Landing Centres (§213)
# ---------------------------------------------------------------------------

@router.get(
    "/ports/nearby",
    summary="Nearby Landing Centres & Harbours (§213)",
    description="Finds registered CMFRI fish landing centres and major ports within radius, sorted by proximity.",
)
def get_nearby_ports(
    lat: float = Query(..., ge=-90.0, le=90.0, description="Latitude in decimal degrees"),
    lon: float = Query(..., ge=-180.0, le=180.0, description="Longitude in decimal degrees"),
    radius_km: float = Query(100.0, ge=1.0, le=5000.0, description="Search radius in kilometers"),
    limit: int = Query(10, ge=1, le=100, description="Maximum number of ports to return"),
) -> Dict[str, Any]:
    ports = marine_watch_service.get_nearby_ports(lat=lat, lon=lon, radius_km=radius_km, limit=limit)
    return {
        "count": len(ports),
        "search_origin": {"lat": lat, "lon": lon},
        "radius_km": radius_km,
        "ports": ports,
        "source": "CMFRI Marine Fisheries Census 2020 & State Fisheries Departments",
    }


@router.get(
    "/ports",
    summary="All CMFRI Landing Centres (§213)",
    description="Returns full nationwide catalogue of registered CMFRI fish landing centres, optionally filtered by state.",
)
def get_all_ports(
    state: Optional[str] = Query(None, description="Optional coastal state filter"),
) -> Dict[str, Any]:
    ports = marine_watch_service.get_all_ports(state=state)
    return {
        "count": len(ports),
        "state": state,
        "ports": ports,
        "source": "CMFRI Marine Fisheries Census 2020 & State Fisheries Departments",
    }


# ---------------------------------------------------------------------------
# 6. Nearby CAA Registered Aquaculture Sites (§213)
# ---------------------------------------------------------------------------

@router.get(
    "/aquaculture/sites/nearby",
    summary="Nearby Coastal Aquaculture Sites (§213)",
    description="Finds statutory Coastal Aquaculture Authority registered shrimp/fish farms within radius.",
)
def get_nearby_aquaculture(
    lat: float = Query(..., ge=-90.0, le=90.0, description="Latitude in decimal degrees"),
    lon: float = Query(..., ge=-180.0, le=180.0, description="Longitude in decimal degrees"),
    radius_km: float = Query(80.0, ge=1.0, le=5000.0, description="Search radius in kilometers"),
    limit: int = Query(10, ge=1, le=100, description="Maximum number of farms to return"),
) -> Dict[str, Any]:
    farms = marine_watch_service.get_nearby_aquaculture(lat=lat, lon=lon, radius_km=radius_km, limit=limit)
    return {
        "count": len(farms),
        "search_origin": {"lat": lat, "lon": lon},
        "radius_km": radius_km,
        "aquaculture_sites": farms,
        "source": "Coastal Aquaculture Authority (CAA) Statutory Registry",
    }


@router.get(
    "/aquaculture/sites",
    summary="All CAA Registered Aquaculture Sites (§213)",
    description="Returns full nationwide catalogue of statutory Coastal Aquaculture Authority registered farms, optionally filtered by state.",
)
def get_all_aquaculture(
    state: Optional[str] = Query(None, description="Optional coastal state filter"),
) -> Dict[str, Any]:
    farms = marine_watch_service.get_all_aquaculture(state=state)
    return {
        "count": len(farms),
        "state": state,
        "aquaculture_sites": farms,
        "source": "Coastal Aquaculture Authority (CAA) Statutory Registry",
    }


# ---------------------------------------------------------------------------
# 7. DGLL Coastal Lighthouses & Navigational Aids
# ---------------------------------------------------------------------------

@router.get(
    "/lighthouses/nearby",
    summary="Nearby DGLL Lighthouses (§213)",
    description="Finds Directorate General of Lighthouses and Lightships (DGLL) navigational aids within radius.",
)
def get_nearby_lighthouses(
    lat: float = Query(..., ge=-90.0, le=90.0, description="Latitude in decimal degrees"),
    lon: float = Query(..., ge=-180.0, le=180.0, description="Longitude in decimal degrees"),
    radius_km: float = Query(200.0, ge=1.0, le=5000.0, description="Search radius in kilometers"),
    limit: int = Query(8, ge=1, le=100, description="Maximum number of lighthouses to return"),
) -> Dict[str, Any]:
    lighthouses = marine_watch_service.get_nearby_lighthouses(lat=lat, lon=lon, radius_km=radius_km, limit=limit)
    return {
        "count": len(lighthouses),
        "search_origin": {"lat": lat, "lon": lon},
        "radius_km": radius_km,
        "lighthouses": lighthouses,
        "source": "Directorate General of Lighthouses and Lightships (DGLL), MoPSW",
    }


@router.get(
    "/lighthouses",
    summary="All Indian Coastal Lighthouses",
    description="Returns full nationwide catalogue of primary coastal lighthouses and landfall beacons.",
)
def get_all_lighthouses() -> Dict[str, Any]:
    lighthouses = marine_watch_service.get_all_lighthouses()
    return {
        "count": len(lighthouses),
        "lighthouses": lighthouses,
        "source": "DGLL National Aids to Navigation Register",
    }


# ---------------------------------------------------------------------------
# 8. National Maritime Boundaries & Protected Areas GeoJSON
# ---------------------------------------------------------------------------

@router.get(
    "/boundaries",
    summary="India Maritime Boundaries & MPAs GeoJSON",
    description="Returns 12nm Territorial Waters, 24nm Contiguous Zones, 200nm EEZ, MPAs, and GEBCO bathymetric contours.",
)
def get_maritime_boundaries() -> Dict[str, Any]:
    return marine_watch_service.get_boundaries_geojson()


# ---------------------------------------------------------------------------
# 9. Coastal Profile & GEBCO Bathymetry (§213)
# ---------------------------------------------------------------------------

@router.get(
    "/coast/profile",
    summary="Coast Profile & Bathymetry (§213)",
    description="Returns GEBCO bathymetric depth, continental shelf classification, and marine protected area checks.",
)
def get_coast_profile(
    lat: float = Query(..., ge=-90.0, le=90.0, description="Latitude in decimal degrees"),
    lon: float = Query(..., ge=-180.0, le=180.0, description="Longitude in decimal degrees"),
) -> Dict[str, Any]:
    return marine_watch_service.get_coast_profile(lat=lat, lon=lon)


# ---------------------------------------------------------------------------
# 10. Data Catalogue (§212, §213)
# ---------------------------------------------------------------------------

@router.get(
    "/datasets",
    summary="India MarineWatch Data Catalogue (§212, §213)",
    description="Lists the canonical 30 marine datasets and services with provenance, licensing, and update cadence.",
)
def list_datasets(
    category: Optional[str] = Query(None, description="Optional category filter (e.g. Ocean, Fisheries, Hazards)"),
    provider: Optional[str] = Query(None, description="Optional provider filter (e.g. INCOIS, IMD, GEBCO, CMFRI)"),
) -> Dict[str, Any]:
    datasets = get_all_datasets(category=category, provider=provider)
    return {
        "total_datasets": len(datasets),
        "datasets": datasets,
        "governance": {
            "policy": "Open Marine Intelligence with Official Attribution (§216-§218)",
            "sovereignty": "Indian EEZ & Territorial Waters Framework",
        },
    }


@router.get(
    "/datasets/{dataset_id}",
    summary="Dataset Details by ID",
    description="Returns metadata, license, and provenance specifications for a specific dataset ID (e.g. DS-01).",
)
def get_dataset(dataset_id: str) -> Dict[str, Any]:
    ds = get_dataset_by_id(dataset_id)
    if not ds:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dataset with ID '{dataset_id}' not found in canonical catalogue",
        )
    return ds


# ---------------------------------------------------------------------------
# 11. Unified Spatial Search (§213)
# ---------------------------------------------------------------------------

@router.get(
    "/search",
    summary="Unified Spatial Search (§213)",
    description="Searches across ports, landing centres, aquaculture sites, PFZ sectors, and restricted marine areas.",
)
def search_marine_features(
    q: str = Query(..., min_length=2, description="Search query string"),
) -> Dict[str, Any]:
    results = marine_watch_service.search(query=q)
    return {
        "query": q,
        "count": len(results),
        "results": results,
    }


# ---------------------------------------------------------------------------
# 12. Unified Spatial Query ("What is here?") (§215)
# ---------------------------------------------------------------------------

@router.post(
    "/spatial/query",
    summary="Unified 'What is Here?' Spatial Query (§215)",
    description="Cross-references ocean forecast, bathymetry, tides, hazards, nearby landing centres, and regulatory restrictions for a location.",
)
def execute_spatial_query(request: SpatialQueryRequest) -> Dict[str, Any]:
    point_data = marine_watch_service.get_point_forecast(lat=request.lat, lon=request.lon)
    nearby_ports = marine_watch_service.get_nearby_ports(lat=request.lat, lon=request.lon, radius_km=request.radius_km)
    nearby_aqua = marine_watch_service.get_nearby_aquaculture(lat=request.lat, lon=request.lon, radius_km=request.radius_km)
    nearby_lighthouses = marine_watch_service.get_nearby_lighthouses(lat=request.lat, lon=request.lon, radius_km=request.radius_km)

    return {
        "query_point": {"lat": request.lat, "lon": request.lon},
        "search_radius_km": request.radius_km,
        "ocean_state": point_data["forecast"],
        "bathymetry_and_shelf": point_data["profile"],
        "astronomical_tide": point_data["tide"],
        "active_hazards": point_data["hazards"],
        "nearby_landing_centres": nearby_ports,
        "nearby_aquaculture_sites": nearby_aqua,
        "nearby_lighthouses": nearby_lighthouses,
        "sources": point_data["sources"],
    }
