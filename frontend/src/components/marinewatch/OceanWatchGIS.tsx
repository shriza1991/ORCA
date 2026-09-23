import { useState, useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  Compass,
  Layers,
  Search,
  Clock,
  Waves,
  Thermometer,
  Wind,
  Anchor,
  AlertTriangle,
  MapPin,
  List,
  Map as MapIcon,
  X,
  RefreshCw,
} from 'lucide-react';
import {
  fetchAllPorts,
  fetchAllAquacultureSites,
  fetchAllLighthouses,
  fetchPFZAdvisories,
  fetchActiveHazards,
  fetchMaritimeBoundaries,
  executeSpatialQuery,
  searchMarineFeatures,
  type LandingCentre,
  type AquacultureSite,
  type Lighthouse,
  type PFZAdvisory,
  type UnifiedSpatialQueryResponse,
  type SpatialSearchResult,
} from '../../api/marinewatch-client';

const TIME_STEPS = [
  { label: 'Now', hours: 0 },
  { label: '+3h', hours: 3 },
  { label: '+6h', hours: 6 },
  { label: '+12h', hours: 12 },
  { label: '+24h', hours: 24 },
  { label: '+48h', hours: 48 },
];

const QUICK_BOOKMARKS = [
  { name: 'Ratnagiri (MH)', lat: 16.9942, lon: 73.2847, zoom: 10 },
  { name: 'Angria Bank Atoll', lat: 16.5000, lon: 72.1000, zoom: 9 },
  { name: 'Mumbai (MH)', lat: 18.9158, lon: 72.8258, zoom: 10 },
  { name: 'Goa / Mormugao', lat: 15.4125, lon: 73.8056, zoom: 10 },
  { name: 'Kochi (Kerala)', lat: 9.9667, lon: 76.2400, zoom: 10 },
  { name: 'Gulf of Mannar (TN)', lat: 9.1500, lon: 79.1000, zoom: 9 },
  { name: 'Chennai (TN)', lat: 13.0827, lon: 80.2989, zoom: 10 },
  { name: 'Visakhapatnam (AP)', lat: 17.6868, lon: 83.2185, zoom: 10 },
  { name: 'Gahirmatha / Paradip (OD)', lat: 20.4500, lon: 86.8500, zoom: 9 },
  { name: 'Sundarbans (WB)', lat: 21.6500, lon: 88.0500, zoom: 9 },
  { name: 'Port Blair (A&N)', lat: 11.6667, lon: 92.7333, zoom: 9 },
  { name: 'Lakshadweep / Minicoy', lat: 8.2717, lon: 73.0539, zoom: 10 },
  { name: 'Dwarka / Kutch (GJ)', lat: 22.2389, lon: 68.9556, zoom: 10 },
];

export interface SelectedFeatureInfo {
  title: string;
  category: string;
  badge: string;
  authority?: string;
  description?: string;
  regulations?: string;
  stats?: Record<string, string | number>;
  coordinates?: [number, number];
}

interface OceanWatchGISProps {
  theme?: 'light' | 'dark';
}

export default function OceanWatchGIS({ theme = 'light' }: OceanWatchGISProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  // Real-time status & auto-refresh
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [autoRefreshActive, setAutoRefreshActive] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // View state
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');
  const [listCategory, setListCategory] = useState<'ports' | 'lighthouses' | 'pfzs' | 'farms'>('ports');
  const [selectedTimeStep, setSelectedTimeStep] = useState<number>(0);
  const [pointData, setPointData] = useState<UnifiedSpatialQueryResponse | null>(null);
  const [inspectingPoint, setInspectingPoint] = useState<boolean>(false);
  const [pointCoordinates, setPointCoordinates] = useState<[number, number]>([16.9942, 73.2847]);

  // Selected interactive entity / polygon highlight
  const [selectedFeature, setSelectedFeature] = useState<SelectedFeatureInfo | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<SpatialSearchResult[]>([]);

  // Layers state
  const [visibleLayers, setVisibleLayers] = useState({
    waves: true,
    pfz: true,
    ports: true,
    lighthouses: true,
    aquaculture: true,
    boundaries: true,
    bathymetry: true,
    hazards: true,
  });

  // Loaded Data
  const [ports, setPorts] = useState<LandingCentre[]>([]);
  const [farms, setFarms] = useState<AquacultureSite[]>([]);
  const [pfzs, setPfzs] = useState<PFZAdvisory[]>([]);
  const [lighthouses, setLighthouses] = useState<Lighthouse[]>([]);
  const [boundariesGeoJson, setBoundariesGeoJson] = useState<any>(null);

  // Initial Data Load (Whole India) using Promise.allSettled for maximum fault-tolerance
  useEffect(() => {
    async function loadAllData() {
      try {
        const [portsRes, aquaRes, pfzRes, lhRes, boundsRes] = await Promise.allSettled([
          fetchAllPorts(),
          fetchAllAquacultureSites(),
          fetchPFZAdvisories('All'),
          fetchAllLighthouses(),
          fetchMaritimeBoundaries(),
        ]);
        if (portsRes.status === 'fulfilled') setPorts(portsRes.value.ports || []);
        if (aquaRes.status === 'fulfilled') setFarms(aquaRes.value.aquaculture_sites || []);
        if (pfzRes.status === 'fulfilled') setPfzs(pfzRes.value.advisories || []);
        if (lhRes.status === 'fulfilled') setLighthouses(lhRes.value.lighthouses || []);
        if (boundsRes.status === 'fulfilled') setBoundariesGeoJson(boundsRes.value);

        // Initial default point query for Ratnagiri
        const ratnagiriPoint = await executeSpatialQuery(16.9942, 73.2847);
        setPointData(ratnagiriPoint);
        setLastUpdated(new Date());
      } catch (err) {
        console.error('Error loading initial MarineWatch GIS data:', err);
      }
    }
    loadAllData();
  }, []);

  // Real-time live data refresh (updates automatically without site reload)
  const refreshLiveTelemetry = async () => {
    setRefreshing(true);
    try {
      const [pfzRes] = await Promise.allSettled([
        fetchPFZAdvisories('All'),
        fetchActiveHazards(),
      ]);
      if (pfzRes.status === 'fulfilled') setPfzs(pfzRes.value.advisories || []);

      if (pointCoordinates) {
        const pt = await executeSpatialQuery(pointCoordinates[0], pointCoordinates[1]);
        setPointData(pt);
      }
      setLastUpdated(new Date());
    } catch (e) {
      console.warn('Real-time telemetry update failed:', e);
    } finally {
      setRefreshing(false);
    }
  };

  // 30-second recurring background interval for real-time automatic telemetry updates
  useEffect(() => {
    if (!autoRefreshActive) return;
    const timer = setInterval(() => {
      refreshLiveTelemetry();
    }, 30000);
    return () => clearInterval(timer);
  }, [autoRefreshActive, pointCoordinates]);

  // MapLibre Initialization
  useEffect(() => {
    if (!mapContainer.current) return;

    const styleUrl =
      theme === 'dark'
        ? 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
        : 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: styleUrl,
      center: [78.5, 18.0],
      zoom: 5.0,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
    mapRef.current = map;

    const resizeObserver = new ResizeObserver(() => {
      map.resize();
    });
    resizeObserver.observe(mapContainer.current);

    map.on('load', () => {
      setMapReady(true);
    });

    // General map click handler
    map.on('click', async (e) => {
      // If a feature click was already processed, do not clear
      const lat = parseFloat(e.lngLat.lat.toFixed(4));
      const lon = parseFloat(e.lngLat.lng.toFixed(4));
      setPointCoordinates([lat, lon]);
      setInspectingPoint(true);
      try {
        const res = await executeSpatialQuery(lat, lon);
        setPointData(res);
      } catch (err) {
        console.error('Point inspection failed:', err);
      } finally {
        setInspectingPoint(false);
      }
    });

    return () => {
      resizeObserver.disconnect();
      setMapReady(false);
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [theme]);

  // Add and update GeoJSON Boundaries & MPAs layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !boundariesGeoJson) return;

    function setupLayers() {
      if (!map) return;
      if (map.getSource('india-boundaries')) {
        const src = map.getSource('india-boundaries') as maplibregl.GeoJSONSource;
        src.setData(boundariesGeoJson);
        return;
      }

      map.addSource('india-boundaries', {
        type: 'geojson',
        data: boundariesGeoJson,
      });

      // 1. Exclusive Economic Zone (EEZ) Polygons
      map.addLayer({
        id: 'eez-fill',
        type: 'fill',
        source: 'india-boundaries',
        filter: ['==', ['get', 'type'], 'EXCLUSIVE_ECONOMIC_ZONE'],
        paint: {
          'fill-color': '#0284c7',
          'fill-opacity': 0.06,
        },
      });
      map.addLayer({
        id: 'eez-line',
        type: 'line',
        source: 'india-boundaries',
        filter: ['==', ['get', 'type'], 'EXCLUSIVE_ECONOMIC_ZONE'],
        paint: {
          'line-color': '#0284c7',
          'line-width': 1.5,
          'line-dasharray': [4, 4],
        },
      });

      // 2. National Marine Protected Areas (MPAs) & Atolls
      map.addLayer({
        id: 'mpas-fill',
        type: 'fill',
        source: 'india-boundaries',
        filter: [
          'in',
          ['get', 'type'],
          ['literal', ['MARINE_PROTECTED_AREA', 'ECOLOGICALLY_SENSITIVE_MARINE_AREA']],
        ],
        paint: {
          'fill-color': '#10b981',
          'fill-opacity': 0.32,
        },
      });
      map.addLayer({
        id: 'mpas-line',
        type: 'line',
        source: 'india-boundaries',
        filter: [
          'in',
          ['get', 'type'],
          ['literal', ['MARINE_PROTECTED_AREA', 'ECOLOGICALLY_SENSITIVE_MARINE_AREA']],
        ],
        paint: {
          'line-color': '#059669',
          'line-width': 2.5,
        },
      });

      // 3. 12nm Sovereign Territorial Waters Line
      map.addLayer({
        id: 'territorial-12nm-line',
        type: 'line',
        source: 'india-boundaries',
        filter: ['==', ['get', 'type'], 'TERRITORIAL_WATERS'],
        paint: {
          'line-color': '#2563eb',
          'line-width': 2.5,
        },
      });

      // 4. 24nm Contiguous Enforcement Zone Line
      map.addLayer({
        id: 'contiguous-24nm-line',
        type: 'line',
        source: 'india-boundaries',
        filter: ['==', ['get', 'type'], 'CONTIGUOUS_ZONE'],
        paint: {
          'line-color': '#8b5cf6',
          'line-width': 2.0,
          'line-dasharray': [4, 4],
        },
      });

      // 5. GEBCO Bathymetric Depth Contours (50m, 100m, 200m)
      map.addLayer({
        id: 'bathymetry-contours-line',
        type: 'line',
        source: 'india-boundaries',
        filter: ['==', ['get', 'type'], 'BATHYMETRIC_CONTOUR'],
        paint: {
          'line-color': [
            'case',
            ['==', ['get', 'depth_m'], 50],
            '#38bdf8',
            ['==', ['get', 'depth_m'], 100],
            '#0284c7',
            '#1e3a8a',
          ],
          'line-width': [
            'case',
            ['==', ['get', 'depth_m'], 50],
            1.2,
            ['==', ['get', 'depth_m'], 100],
            1.8,
            2.5,
          ],
        },
      });

      // Interactive Click & Hover Handlers for Polygons and Lines
      const interactiveLayerIds = [
        'mpas-fill',
        'territorial-12nm-line',
        'contiguous-24nm-line',
        'eez-fill',
        'bathymetry-contours-line',
      ];

      interactiveLayerIds.forEach((id) => {
        map.on('mouseenter', id, () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', id, () => {
          map.getCanvas().style.cursor = '';
        });
      });

      // Click on MPA polygon
      map.on('click', 'mpas-fill', (e) => {
        if (!e.features || e.features.length === 0) return;
        const feat = e.features[0];
        const props = (feat.properties as Record<string, any>) || {};
        const lat = parseFloat(e.lngLat.lat.toFixed(4));
        const lon = parseFloat(e.lngLat.lng.toFixed(4));

        setSelectedFeature({
          title: props.name || 'Marine Protected Area',
          category: props.type || 'MARINE_PROTECTED_AREA',
          badge: 'NATIONAL MARINE PROTECTED AREA',
          authority: props.authority,
          description: props.description,
          regulations: props.regulations,
          stats: {
            State: props.state || 'National Reserve',
            'Depth Range': props.depth_range_m || 'Coastal Waters',
            Legislation: 'Wildlife Protection Act, 1972 / MoEFCC',
          },
          coordinates: [lat, lon],
        });
        setPointCoordinates([lat, lon]);
        executeSpatialQuery(lat, lon).then(setPointData);
      });

      // Click on 12nm Territorial Waters Line
      map.on('click', 'territorial-12nm-line', (e) => {
        if (!e.features || e.features.length === 0) return;
        const feat = e.features[0];
        const props = (feat.properties as Record<string, any>) || {};
        const lat = parseFloat(e.lngLat.lat.toFixed(4));
        const lon = parseFloat(e.lngLat.lng.toFixed(4));

        setSelectedFeature({
          title: props.name || '12nm Territorial Sovereign Waters',
          category: 'TERRITORIAL_WATERS',
          badge: 'SOVEREIGN MARITIME BOUNDARY',
          authority: props.authority || 'Ministry of External Affairs / Indian Navy',
          description: props.jurisdiction || 'Sovereign Coastal Territorial Sea (12 Nautical Miles)',
          regulations: props.legislation || 'Maritime Zones Act, 1976 / UNCLOS III',
          stats: {
            Status: 'Sovereign State Waters (12nm)',
            Enforcement: 'Indian Coast Guard & State Marine Police',
          },
          coordinates: [lat, lon],
        });
        setPointCoordinates([lat, lon]);
        executeSpatialQuery(lat, lon).then(setPointData);
      });

      // Click on 200nm EEZ Area
      map.on('click', 'eez-fill', (e) => {
        if (!e.features || e.features.length === 0) return;
        const feat = e.features[0];
        const props = (feat.properties as Record<string, any>) || {};
        const lat = parseFloat(e.lngLat.lat.toFixed(4));
        const lon = parseFloat(e.lngLat.lng.toFixed(4));

        setSelectedFeature({
          title: props.name || 'India Exclusive Economic Zone (200nm)',
          category: 'EXCLUSIVE_ECONOMIC_ZONE',
          badge: 'EXCLUSIVE ECONOMIC ZONE (200nm)',
          authority: props.authority || 'Republic of India',
          description: props.jurisdiction || 'Sovereign Rights for exploring, exploiting, and managing resources',
          regulations: props.legislation || 'UNCLOS III / Territorial Waters, Continental Shelf, EEZ Act, 1976',
          stats: {
            'EEZ Area': '2.02 Million Sq Km',
            Jurisdiction: 'UNCLOS Delimited Sovereign Resource Exploration',
          },
          coordinates: [lat, lon],
        });
        setPointCoordinates([lat, lon]);
        executeSpatialQuery(lat, lon).then(setPointData);
      });

      // Click on GEBCO Bathymetric Contour Line
      map.on('click', 'bathymetry-contours-line', (e) => {
        if (!e.features || e.features.length === 0) return;
        const feat = e.features[0];
        const props = (feat.properties as Record<string, any>) || {};
        const lat = parseFloat(e.lngLat.lat.toFixed(4));
        const lon = parseFloat(e.lngLat.lng.toFixed(4));

        setSelectedFeature({
          title: props.name || `${props.depth_m}m Bathymetric Contour`,
          category: 'BATHYMETRIC_CONTOUR',
          badge: 'GEBCO BATHYMETRIC CONTOUR',
          authority: props.dataset || 'GEBCO Global Bathymetric Grid',
          description: `Isobath marking ${props.depth_m}m below Chart Datum (CD). Represents the continental shelf edge & slope break.`,
          stats: {
            'Contour Depth': `${props.depth_m} meters`,
            Grid: props.dataset || 'GEBCO_2024 Grid',
          },
          coordinates: [lat, lon],
        });
        setPointCoordinates([lat, lon]);
        executeSpatialQuery(lat, lon).then(setPointData);
      });
    }

    if (mapReady) {
      setupLayers();
    }
  }, [mapReady, boundariesGeoJson]);

  // Update layer visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (map.getLayer('mpas-fill')) {
      map.setLayoutProperty('mpas-fill', 'visibility', visibleLayers.boundaries ? 'visible' : 'none');
      map.setLayoutProperty('mpas-line', 'visibility', visibleLayers.boundaries ? 'visible' : 'none');
    }
    if (map.getLayer('eez-fill')) {
      map.setLayoutProperty('eez-fill', 'visibility', visibleLayers.boundaries ? 'visible' : 'none');
      map.setLayoutProperty('eez-line', 'visibility', visibleLayers.boundaries ? 'visible' : 'none');
    }
    if (map.getLayer('territorial-12nm-line')) {
      map.setLayoutProperty('territorial-12nm-line', 'visibility', visibleLayers.boundaries ? 'visible' : 'none');
    }
    if (map.getLayer('contiguous-24nm-line')) {
      map.setLayoutProperty('contiguous-24nm-line', 'visibility', visibleLayers.boundaries ? 'visible' : 'none');
    }
    if (map.getLayer('bathymetry-contours-line')) {
      map.setLayoutProperty('bathymetry-contours-line', 'visibility', visibleLayers.bathymetry ? 'visible' : 'none');
    }
  }, [mapReady, visibleLayers]);

  // Sync Markers to Map (Whole India: Ports, Lighthouses, PFZs, Aquaculture)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    // Remove existing markers tracked in markersRef
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    // Also remove any existing custom markers from DOM
    const existingMarkers = document.querySelectorAll('.marinewatch-custom-marker');
    existingMarkers.forEach((m) => m.remove());

    // 1. Add CMFRI Landing Centres Markers (⚓)
    if (visibleLayers.ports) {
      ports.forEach((p) => {
        const el = document.createElement('div');
        el.className = 'marinewatch-custom-marker port-marker';
        el.innerHTML = `<span style="font-size: 15px; cursor: pointer; filter: drop-shadow(0 0 4px #3b82f6);">⚓</span>`;
        el.title = `${p.name} (${p.craft_count?.total || 0} craft · VHF Ch ${p.vhf_channel || 16})`;
        el.onclick = (e) => {
          e.stopPropagation();
          map.flyTo({ center: [p.longitude, p.latitude], zoom: 11 });
          setSelectedFeature({
            title: p.name,
            category: 'PORT_LANDING_CENTRE',
            badge: 'CMFRI FISHING HARBOUR',
            authority: 'Central Marine Fisheries Research Institute (CMFRI)',
            description: `${p.type} located in ${p.district}, ${p.state}. Major gears: ${(p.major_gears || []).join(', ')}. Facilities: ${(p.facilities || []).join(', ')}.`,
            stats: {
              'Fleet Size': `${p.craft_count?.total || 0} registered craft`,
              Mechanized: p.craft_count?.mechanized ?? 0,
              Motorized: p.craft_count?.motorized ?? 0,
              'VHF Radio': `Channel ${p.vhf_channel || 16}`,
            },
            coordinates: [p.latitude, p.longitude],
          });
          setPointCoordinates([p.latitude, p.longitude]);
          executeSpatialQuery(p.latitude, p.longitude).then(setPointData);
        };
        const m = new maplibregl.Marker({ element: el }).setLngLat([p.longitude, p.latitude]).addTo(map);
        markersRef.current.push(m);
      });
    }

    // 2. Add DGLL Coastal Lighthouses Markers (🗼)
    if (visibleLayers.lighthouses) {
      lighthouses.forEach((lh) => {
        const el = document.createElement('div');
        el.className = 'marinewatch-custom-marker lighthouse-marker';
        el.innerHTML = `<span style="font-size: 16px; cursor: pointer; filter: drop-shadow(0 0 6px #eab308);">🗼</span>`;
        el.title = `${lh.name} (Range: ${lh.range_nm}nm · Focal Ht: ${lh.focal_height_m}m)`;
        el.onclick = (e) => {
          e.stopPropagation();
          map.flyTo({ center: [lh.longitude, lh.latitude], zoom: 12 });
          setSelectedFeature({
            title: lh.name,
            category: 'LIGHTHOUSE_NAV_AID',
            badge: 'DGLL COASTAL LIGHTHOUSE',
            authority: lh.authority,
            description: `${lh.description} Built in ${lh.year_built}. Structure: ${lh.structure}.`,
            stats: {
              'Optical Range': `${lh.range_nm} Nautical Miles`,
              'Focal Plane Height': `${lh.focal_height_m} meters above MSL`,
              'Light Characteristic': lh.light_character,
              Location: `${lh.district}, ${lh.state}`,
            },
            coordinates: [lh.latitude, lh.longitude],
          });
          setPointCoordinates([lh.latitude, lh.longitude]);
          executeSpatialQuery(lh.latitude, lh.longitude).then(setPointData);
        };
        const m = new maplibregl.Marker({ element: el }).setLngLat([lh.longitude, lh.latitude]).addTo(map);
        markersRef.current.push(m);
      });
    }

    // 3. Add PFZ Advisory Markers (🐟)
    if (visibleLayers.pfz) {
      pfzs.forEach((z) => {
        const el = document.createElement('div');
        el.className = 'marinewatch-custom-marker pfz-marker';
        el.innerHTML = `<span style="font-size: 15px; cursor: pointer; filter: drop-shadow(0 0 5px #10b981);">🐟</span>`;
        el.title = `${z.location_name} (SST ${z.sst_celsius}°C · Chl ${z.chlorophyll_mg_m3} mg/m³)`;
        el.onclick = (e) => {
          e.stopPropagation();
          map.flyTo({ center: [z.longitude, z.latitude], zoom: 10 });
          setSelectedFeature({
            title: z.location_name,
            category: 'POTENTIAL_FISHING_ZONE',
            badge: 'INCOIS PFZ ADVISORY',
            authority: z.source,
            description: `Target species: ${(z.target_species || []).join(', ')}. Recommended gears: ${(z.gear_recommended || []).join(', ')}. Valid until: ${new Date(z.valid_to).toLocaleDateString('en-IN')}.`,
            stats: {
              'Sea Surface Temp': `${z.sst_celsius}°C`,
              'Chlorophyll-a': `${z.chlorophyll_mg_m3} mg/m³`,
              'Water Depth': z.depth_range_m,
              Bearing: `${z.bearing_deg}° from shore`,
            },
            coordinates: [z.latitude, z.longitude],
          });
          setPointCoordinates([z.latitude, z.longitude]);
          executeSpatialQuery(z.latitude, z.longitude).then(setPointData);
        };
        const m = new maplibregl.Marker({ element: el }).setLngLat([z.longitude, z.latitude]).addTo(map);
        markersRef.current.push(m);
      });
    }

    // 4. Add CAA Aquaculture Markers (🦐)
    if (visibleLayers.aquaculture) {
      farms.forEach((f) => {
        const el = document.createElement('div');
        el.className = 'marinewatch-custom-marker aqua-marker';
        el.innerHTML = `<span style="font-size: 14px; cursor: pointer; filter: drop-shadow(0 0 4px #f97316);">🦐</span>`;
        el.title = `${f.farm_name} (${f.cultured_species} · ${f.water_spread_area_ha} ha)`;
        el.onclick = (e) => {
          e.stopPropagation();
          map.flyTo({ center: [f.longitude, f.latitude], zoom: 12 });
          setSelectedFeature({
            title: f.farm_name,
            category: 'AQUACULTURE_FARM',
            badge: 'CAA CERTIFIED AQUACULTURE',
            authority: 'Coastal Aquaculture Authority (CAA), Govt. of India',
            description: `Statutory farm ${f.farm_code} culturing ${f.cultured_species}. Water source: ${f.water_source}. Salinity: ${f.water_salinity_ppt} ppt.`,
            stats: {
              'CAA Reg No': f.caa_registration_number,
              'Water Spread': `${f.water_spread_area_ha} hectares`,
              'Ponds Count': f.ponds_count,
              Status: f.caa_status,
            },
            coordinates: [f.latitude, f.longitude],
          });
          setPointCoordinates([f.latitude, f.longitude]);
          executeSpatialQuery(f.latitude, f.longitude).then(setPointData);
        };
        const m = new maplibregl.Marker({ element: el }).setLngLat([f.longitude, f.latitude]).addTo(map);
        markersRef.current.push(m);
      });
    }
  }, [mapReady, ports, farms, pfzs, lighthouses, visibleLayers]);

  // Search handler
  async function handleSearch(val: string) {
    setSearchQuery(val);
    if (val.trim().length >= 2) {
      try {
        const res = await searchMarineFeatures(val);
        setSearchResults(res.results);
      } catch (err) {
        console.error('Search error:', err);
      }
    } else {
      setSearchResults([]);
    }
  }

  function handleSelectSearchResult(item: SpatialSearchResult) {
    setSearchResults([]);
    setSearchQuery(item.name);
    setPointCoordinates([item.latitude, item.longitude]);
    if (mapRef.current) {
      mapRef.current.flyTo({ center: [item.longitude, item.latitude], zoom: 10 });
    }
    setSelectedFeature({
      title: item.name,
      category: item.category,
      badge: item.category.replace(/_/g, ' '),
      description: item.subtitle,
      stats: {
        State: item.state,
        Jurisdiction: item.district,
      },
      coordinates: [item.latitude, item.longitude],
    });
    executeSpatialQuery(item.latitude, item.longitude).then(setPointData);
  }

  function handleBookmark(bm: (typeof QUICK_BOOKMARKS)[0]) {
    setPointCoordinates([bm.lat, bm.lon]);
    setSelectedFeature(null);
    if (mapRef.current) {
      mapRef.current.flyTo({ center: [bm.lon, bm.lat], zoom: bm.zoom });
    }
    executeSpatialQuery(bm.lat, bm.lon).then(setPointData);
  }

  return (
    <div className="oceanwatch-gis-workspace">
      {/* Top Controls Toolbar */}
      <div className="oceanwatch-top-toolbar">
        {/* Search Bar */}
        <div className="oceanwatch-search-container">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Search all India harbours, lighthouses, PFZs, MPAs, aquaculture…"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
          />
          {searchResults.length > 0 && (
            <div className="oceanwatch-search-dropdown">
              {searchResults.map((r) => (
                <div
                  key={r.id}
                  className="search-dropdown-item"
                  onClick={() => handleSelectSearchResult(r)}
                >
                  <div className="font-semibold text-sm">{r.name}</div>
                  <div className="text-xs text-muted-foreground">{r.subtitle}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Geographic Bookmarks (Whole India) */}
        <div className="oceanwatch-bookmarks">
          {QUICK_BOOKMARKS.map((bm) => (
            <button
              key={bm.name}
              type="button"
              className="bookmark-chip"
              onClick={() => handleBookmark(bm)}
            >
              <MapPin size={12} />
              <span>{bm.name}</span>
            </button>
          ))}
        </div>
        {/* Live Telemetry Auto-Update Indicator */}
        <div className="oceanwatch-live-telemetry-badge" title="Real-time telemetry auto-refreshes every 30s without page reload">
          <span
            className="live-pulse-dot"
            style={{ backgroundColor: autoRefreshActive ? '#22c55e' : '#94a3b8', cursor: 'pointer' }}
            onClick={() => setAutoRefreshActive(!autoRefreshActive)}
            title={autoRefreshActive ? 'Auto-refresh active (30s) — click to pause' : 'Auto-refresh paused — click to resume'}
          />
          <span
            className="live-telemetry-label"
            style={{ color: autoRefreshActive ? '#22c55e' : '#94a3b8', cursor: 'pointer' }}
            onClick={() => setAutoRefreshActive(!autoRefreshActive)}
            title={autoRefreshActive ? 'Auto-refresh active (30s) — click to pause' : 'Auto-refresh paused — click to resume'}
          >
            {autoRefreshActive ? 'LIVE TELEMETRY' : 'PAUSED'}
          </span>
          <span className="live-telemetry-time">{lastUpdated.toLocaleTimeString()}</span>
          <button
            type="button"
            onClick={refreshLiveTelemetry}
            title="Refresh real-time data now"
            className={`live-refresh-btn ${refreshing ? 'spinning' : ''}`}
          >
            <RefreshCw size={12} />
          </button>
        </div>

        {/* View Mode Toggle: Map vs List */}
        <div className="view-mode-toggle">
          <button
            className={`toggle-btn ${viewMode === 'map' ? 'active' : ''}`}
            onClick={() => setViewMode('map')}
            title="Map View"
          >
            <MapIcon size={14} />
            <span>Map</span>
          </button>
          <button
            className={`toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => setViewMode('list')}
            title="List View"
          >
            <List size={14} />
            <span>List</span>
          </button>
        </div>
      </div>

      {/* Main Workspace Area */}
      <div className="oceanwatch-main-area">
        {viewMode === 'map' ? (
          <div className="oceanwatch-map-wrapper">
            {/* Map Container */}
            <div ref={mapContainer} className="maplibre-full-map" />

            {/* Time Scrubber / Slider (BarentsWatch Pattern) */}
            <div className="oceanwatch-time-scrubber">
              <div className="scrubber-header">
                <Clock size={14} />
                <span>Forecast Horizon: <strong>{TIME_STEPS[selectedTimeStep].label}</strong></span>
              </div>
              <div className="scrubber-steps">
                {TIME_STEPS.map((step, idx) => (
                  <button
                    key={step.label}
                    className={`step-btn ${selectedTimeStep === idx ? 'active' : ''}`}
                    onClick={() => setSelectedTimeStep(idx)}
                  >
                    {step.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Floating Layer Switcher Panel */}
            <div className="oceanwatch-layer-panel">
              <div className="layer-panel-header">
                <Layers size={14} />
                <span>Layer Registry (All India)</span>
              </div>
              <div className="layer-toggle-list">
                <label className="layer-item">
                  <input
                    type="checkbox"
                    checked={visibleLayers.waves}
                    onChange={(e) =>
                      setVisibleLayers((prev) => ({ ...prev, waves: e.target.checked }))
                    }
                  />
                  <span>🌊 Wave & Swell (INCOIS)</span>
                </label>
                <label className="layer-item">
                  <input
                    type="checkbox"
                    checked={visibleLayers.pfz}
                    onChange={(e) =>
                      setVisibleLayers((prev) => ({ ...prev, pfz: e.target.checked }))
                    }
                  />
                  <span>🐟 Potential Fishing Zones</span>
                </label>
                <label className="layer-item">
                  <input
                    type="checkbox"
                    checked={visibleLayers.ports}
                    onChange={(e) =>
                      setVisibleLayers((prev) => ({ ...prev, ports: e.target.checked }))
                    }
                  />
                  <span>⚓ CMFRI Landing Centres ({ports.length})</span>
                </label>
                <label className="layer-item">
                  <input
                    type="checkbox"
                    checked={visibleLayers.lighthouses}
                    onChange={(e) =>
                      setVisibleLayers((prev) => ({ ...prev, lighthouses: e.target.checked }))
                    }
                  />
                  <span>🗼 DGLL Lighthouses ({lighthouses.length})</span>
                </label>
                <label className="layer-item">
                  <input
                    type="checkbox"
                    checked={visibleLayers.aquaculture}
                    onChange={(e) =>
                      setVisibleLayers((prev) => ({ ...prev, aquaculture: e.target.checked }))
                    }
                  />
                  <span>🦐 CAA Coastal Aquaculture ({farms.length})</span>
                </label>
                <label className="layer-item">
                  <input
                    type="checkbox"
                    checked={visibleLayers.boundaries}
                    onChange={(e) =>
                      setVisibleLayers((prev) => ({ ...prev, boundaries: e.target.checked }))
                    }
                  />
                  <span>📏 12nm / 200nm & Marine Parks</span>
                </label>
                <label className="layer-item">
                  <input
                    type="checkbox"
                    checked={visibleLayers.bathymetry}
                    onChange={(e) =>
                      setVisibleLayers((prev) => ({ ...prev, bathymetry: e.target.checked }))
                    }
                  />
                  <span>🏔️ GEBCO Depth Contours</span>
                </label>
              </div>
            </div>
          </div>
        ) : (
          /* Dual List View (BarentsWatch Pattern) */
          <div className="oceanwatch-list-view-container">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-xl font-bold">National Maritime Registry & Catalog</h3>
                <p className="text-xs text-muted-foreground">
                  Sovereign Indian EEZ coverage across all 9 coastal states & island territories.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md ${
                    listCategory === 'ports' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                  }`}
                  onClick={() => setListCategory('ports')}
                >
                  ⚓ Harbours ({ports.length})
                </button>
                <button
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md ${
                    listCategory === 'lighthouses' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                  }`}
                  onClick={() => setListCategory('lighthouses')}
                >
                  🗼 Lighthouses ({lighthouses.length})
                </button>
                <button
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md ${
                    listCategory === 'pfzs' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                  }`}
                  onClick={() => setListCategory('pfzs')}
                >
                  🐟 PFZs ({pfzs.length})
                </button>
                <button
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md ${
                    listCategory === 'farms' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                  }`}
                  onClick={() => setListCategory('farms')}
                >
                  🦐 Aquaculture ({farms.length})
                </button>
              </div>
            </div>

            <div className="list-view-grid">
              {listCategory === 'ports' && (
                <div className="list-view-card" style={{ gridColumn: '1 / -1' }}>
                  <h4>CMFRI Fishing Harbours & Landing Centres Across India</h4>
                  <div className="list-table-wrap">
                    <table className="oceanwatch-table">
                      <thead>
                        <tr>
                          <th>Harbour / Landing Centre</th>
                          <th>District / State</th>
                          <th>Total Fleet</th>
                          <th>Mechanized</th>
                          <th>Motorized</th>
                          <th>Major Fishing Gears</th>
                          <th>VHF</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ports.map((p) => (
                          <tr key={p.id}>
                            <td className="font-semibold">{p.name}</td>
                            <td>{p.district}, {p.state}</td>
                            <td><strong>{p.craft_count.total}</strong> craft</td>
                            <td>{p.craft_count.mechanized}</td>
                            <td>{p.craft_count.motorized}</td>
                            <td>{p.major_gears.join(', ')}</td>
                            <td>Ch {p.vhf_channel}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {listCategory === 'lighthouses' && (
                <div className="list-view-card" style={{ gridColumn: '1 / -1' }}>
                  <h4>DGLL Coastal Lighthouses & Navigational Landfall Beacons</h4>
                  <div className="list-table-wrap">
                    <table className="oceanwatch-table">
                      <thead>
                        <tr>
                          <th>Lighthouse</th>
                          <th>State / Coast</th>
                          <th>Optical Range</th>
                          <th>Focal Plane</th>
                          <th>Light Characteristic</th>
                          <th>Built</th>
                          <th>Authority</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lighthouses.map((lh) => (
                          <tr key={lh.id}>
                            <td className="font-semibold">{lh.name}</td>
                            <td>{lh.state}</td>
                            <td><strong>{lh.range_nm} nm</strong></td>
                            <td>{lh.focal_height_m} m</td>
                            <td><span className="font-mono text-xs">{lh.light_character}</span></td>
                            <td>{lh.year_built}</td>
                            <td className="text-xs text-muted-foreground">{lh.authority}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {listCategory === 'pfzs' && (
                <div className="list-view-card" style={{ gridColumn: '1 / -1' }}>
                  <h4>INCOIS Potential Fishing Zone (PFZ) Advisories</h4>
                  <div className="list-table-wrap">
                    <table className="oceanwatch-table">
                      <thead>
                        <tr>
                          <th>Sector / Location</th>
                          <th>Coordinates</th>
                          <th>SST (°C)</th>
                          <th>Chl-a (mg/m³)</th>
                          <th>Target Species</th>
                          <th>Recommended Gears</th>
                          <th>Validity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pfzs.map((z) => (
                          <tr key={z.advisory_id}>
                            <td className="font-semibold">{z.location_name}</td>
                            <td>{z.latitude.toFixed(2)}°N, {z.longitude.toFixed(2)}°E</td>
                            <td>{z.sst_celsius}°C</td>
                            <td>{z.chlorophyll_mg_m3} mg/m³</td>
                            <td>{z.target_species.join(', ')}</td>
                            <td>{z.gear_recommended.join(', ')}</td>
                            <td>{new Date(z.valid_to).toLocaleDateString('en-IN')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {listCategory === 'farms' && (
                <div className="list-view-card" style={{ gridColumn: '1 / -1' }}>
                  <h4>CAA Registered Coastal Aquaculture & Mariculture Facilities</h4>
                  <div className="list-table-wrap">
                    <table className="oceanwatch-table">
                      <thead>
                        <tr>
                          <th>Farm Name</th>
                          <th>District / State</th>
                          <th>Cultured Species</th>
                          <th>Water Spread</th>
                          <th>Ponds</th>
                          <th>Salinity</th>
                          <th>CAA Registration</th>
                        </tr>
                      </thead>
                      <tbody>
                        {farms.map((f) => (
                          <tr key={f.id}>
                            <td className="font-semibold">{f.farm_name}</td>
                            <td>{f.district}, {f.state}</td>
                            <td>{f.cultured_species}</td>
                            <td>{f.water_spread_area_ha} ha</td>
                            <td>{f.ponds_count}</td>
                            <td>{f.water_salinity_ppt} ppt</td>
                            <td><span className="font-mono text-xs">{f.caa_registration_number}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Right Point Inspection Side Panel ("What is Here?" - §214/§215) */}
        <aside className="oceanwatch-point-panel">
          <div className="point-panel-header">
            <div>
              <span className="point-panel-eyebrow">UNIFIED MARITIME INTELLIGENCE</span>
              <h3>
                {pointCoordinates[0].toFixed(3)}°N, {pointCoordinates[1].toFixed(3)}°E
              </h3>
            </div>
            {inspectingPoint && <span className="text-xs text-primary animate-pulse">Querying…</span>}
          </div>

          <div className="point-panel-content">
            {/* Interactive Selected Feature Highlight Card */}
            {selectedFeature && (
              <div className="point-info-card" style={{ borderLeft: '3px solid #10b981', background: 'rgba(16, 185, 129, 0.05)' }}>
                <div className="flex items-center justify-between">
                  <div className="card-badge" style={{ color: '#059669', borderColor: '#10b981' }}>
                    {selectedFeature.badge}
                  </div>
                  <button
                    className="text-muted-foreground hover:text-foreground text-xs"
                    onClick={() => setSelectedFeature(null)}
                    title="Close selection"
                  >
                    <X size={14} />
                  </button>
                </div>
                <h4 className="text-base font-bold mt-1.5">{selectedFeature.title}</h4>
                {selectedFeature.authority && (
                  <div className="text-xs text-muted-foreground mt-0.5 font-medium">
                    {selectedFeature.authority}
                  </div>
                )}
                {selectedFeature.description && (
                  <p className="text-xs mt-2 leading-relaxed text-foreground/90">
                    {selectedFeature.description}
                  </p>
                )}
                {selectedFeature.regulations && (
                  <div className="mt-2 p-2 rounded bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-700 dark:text-amber-300">
                    <strong>Regulations:</strong> {selectedFeature.regulations}
                  </div>
                )}
                {selectedFeature.stats && (
                  <div className="grid grid-cols-2 gap-2 mt-3 pt-2 border-t border-border/40">
                    {Object.entries(selectedFeature.stats).map(([k, v]) => (
                      <div key={k} className="text-xs">
                        <span className="text-muted-foreground block text-[10px] uppercase font-semibold">{k}</span>
                        <span className="font-semibold">{v}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {pointData ? (
              <>
                {/* Bathymetry & Continental Shelf Card */}
                <div className="point-info-card">
                  <div className="card-badge">GEBCO BATHYMETRY & SHELF</div>
                  <div className="depth-big-value">
                    {pointData.bathymetry_and_shelf.bathymetry_depth_m} <small>m depth</small>
                  </div>
                  <div className="text-xs font-semibold text-primary mt-1">
                    {pointData.bathymetry_and_shelf.shelf_zone}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Distance to coast: <strong>{pointData.bathymetry_and_shelf.distance_to_shore_km} km</strong>
                    {pointData.bathymetry_and_shelf.nearest_landing_centre && (
                      <span> (nearest: {pointData.bathymetry_and_shelf.nearest_landing_centre})</span>
                    )}
                  </div>
                </div>

                {/* Astronomical Tide Card */}
                <div className="point-info-card">
                  <div className="card-badge">INCOIS PREDICTED TIDE (PAT)</div>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs text-muted-foreground">Elevation Above Chart Datum</span>
                      <div className="text-lg font-bold">
                        {pointData.astronomical_tide.current_height_m} m
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        Station: {pointData.astronomical_tide.station_name}
                      </span>
                    </div>
                    <span className={`tide-phase-pill ${pointData.astronomical_tide.phase.toLowerCase()}`}>
                      {pointData.astronomical_tide.phase}
                    </span>
                  </div>
                  <div className="tide-extrema-row">
                    <div className="extrema-box">
                      <span className="extrema-label">Next High Water</span>
                      <span className="extrema-val">{pointData.astronomical_tide.next_high.height_m} m</span>
                    </div>
                    <div className="extrema-box">
                      <span className="extrema-label">Next Low Water</span>
                      <span className="extrema-val">{pointData.astronomical_tide.next_low.height_m} m</span>
                    </div>
                  </div>
                </div>

                {/* Sea Conditions Card */}
                <div className="point-info-card">
                  <div className="card-badge">INCOIS OSF / HIGH-RES MARINE</div>
                  <div className="conditions-grid">
                    <div className="condition-item">
                      <Waves size={16} className="text-blue-500" />
                      <div>
                        <span className="condition-label">Wave Height</span>
                        <span className="condition-val">{pointData.ocean_state.wave_height_m} m</span>
                      </div>
                    </div>
                    <div className="condition-item">
                      <Thermometer size={16} className="text-rose-500" />
                      <div>
                        <span className="condition-label">SST</span>
                        <span className="condition-val">{pointData.ocean_state.sst_c}°C</span>
                      </div>
                    </div>
                    <div className="condition-item">
                      <Wind size={16} className="text-sky-500" />
                      <div>
                        <span className="condition-label">Wind Speed</span>
                        <span className="condition-val">{pointData.ocean_state.wind_speed_kn} kn</span>
                      </div>
                    </div>
                    <div className="condition-item">
                      <Compass size={16} className="text-indigo-500" />
                      <div>
                        <span className="condition-label">Swell Period</span>
                        <span className="condition-val">{pointData.ocean_state.swell_period_s} s</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Nearby DGLL Lighthouses */}
                {pointData.nearby_lighthouses && pointData.nearby_lighthouses.length > 0 && (
                  <div className="point-info-card">
                    <div className="card-badge">NEARBY DGLL LIGHTHOUSES</div>
                    <div className="nearby-list">
                      {pointData.nearby_lighthouses.slice(0, 3).map((lh) => (
                        <div key={lh.id} className="nearby-item">
                          <span style={{ fontSize: '15px' }}>🗼</span>
                          <div>
                            <div className="text-sm font-semibold">{lh.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {lh.distance_km} km away · Range {lh.range_nm} nm · {lh.light_character}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Nearby Harbours */}
                {pointData.nearby_landing_centres.length > 0 && (
                  <div className="point-info-card">
                    <div className="card-badge">NEARBY CMFRI HARBOURS</div>
                    <div className="nearby-list">
                      {pointData.nearby_landing_centres.slice(0, 3).map((p) => (
                        <div key={p.id} className="nearby-item">
                          <Anchor size={14} className="text-primary mt-0.5" />
                          <div>
                            <div className="text-sm font-semibold">{p.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {p.distance_km} km away · VHF Ch {p.vhf_channel}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Active Warnings */}
                {pointData.active_hazards.length > 0 && (
                  <div className="point-info-card warning-card">
                    <div className="card-badge">IMD & INCOIS WARNINGS</div>
                    {pointData.active_hazards.map((h) => (
                      <div key={h.hazard_id} className="hazard-snippet">
                        <AlertTriangle size={14} className="text-amber-500 mt-0.5" />
                        <div>
                          <div className="text-xs font-semibold">{h.headline}</div>
                          <div className="text-[11px] text-muted-foreground">{h.source}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Provenance Footnote */}
                <div className="provenance-footer">
                  <span>Official Sources: INCOIS, IMD, GEBCO 2024, CMFRI, DGLL, CAA</span>
                </div>
              </>
            ) : (
              <div className="point-empty-state">
                <MapPin size={24} className="text-muted-foreground" />
                <p>Click anywhere on the Indian Ocean, Arabian Sea, or Bay of Bengal to inspect conditions, bathymetry, and tide.</p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
