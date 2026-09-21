import { useState, useEffect, useMemo, useCallback } from 'react';
import { ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import type { PickingInfo } from '@deck.gl/core';
import {
  Satellite,
  Calendar,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Activity,
  X,
  Layers,
  ChevronDown,
} from 'lucide-react';
import DeckGLMapFoundation from '../map/DeckGLMapFoundation';
import type { EOGridCell } from '../../api/researcher-client';

export type EOMetricKey = 'sst_celsius' | 'chlorophyll_a_mg_m3' | 'cloud_cover_pct';

export interface EOMetricOption {
  key: EOMetricKey;
  label: string;
  shortName: string;
  unit: string;
  decimals: number;
  description: string;
  minRange: number;
  maxRange: number;
}

export const EO_SPATIAL_METRICS: EOMetricOption[] = [
  {
    key: 'sst_celsius',
    label: 'Sea Surface Temperature',
    shortName: 'SST',
    unit: '°C',
    decimals: 1,
    description: 'Absolute Sea Surface Temperature from thermal infrared sensors (INSAT-3D/Oceansat)',
    minRange: 26.0,
    maxRange: 32.0,
  },
  {
    key: 'chlorophyll_a_mg_m3',
    label: 'Chlorophyll-a',
    shortName: 'Chl-a',
    unit: 'mg/m³',
    decimals: 2,
    description: 'Surface Chlorophyll-a concentration from ocean color radiometry (Oceansat-3 OCM)',
    minRange: 0.2,
    maxRange: 3.0,
  },
  {
    key: 'cloud_cover_pct',
    label: 'Cloud Cover',
    shortName: 'Cloud Cover',
    unit: '%',
    decimals: 0,
    description: 'Pixel cloud fraction percentage across 5×5 satellite grid cells',
    minRange: 0,
    maxRange: 100,
  },
];

export interface EOSpatialStats {
  validCount: number;
  totalCount: number;
  min: number | null;
  max: number | null;
  mean: number | null;
  cloudObscuredCount: number;
  degradedCount: number;
}

/**
 * Pure helper: Computes spatial statistics (min, max, arithmetic mean across valid cells)
 * strictly ignoring null, NaN, and cloud-obscured/invalid observations.
 */
export function calculateEOSpatialStats(
  cells: EOGridCell[],
  metricKey: EOMetricKey,
): EOSpatialStats {
  let validCount = 0;
  let cloudObscuredCount = 0;
  let degradedCount = 0;
  const values: number[] = [];

  for (const c of cells || []) {
    const qc = c.qc_status || 'VALID';
    if (qc === 'CLOUD_OBSCURED') {
      cloudObscuredCount++;
    } else if (qc === 'DEGRADED_QC_WARNING' || qc === 'SUSPECT') {
      degradedCount++;
    }

    const val = c[metricKey];
    if (typeof val === 'number' && !isNaN(val) && qc === 'VALID') {
      values.push(val);
      validCount++;
    }
  }

  const totalCount = (cells || []).length;
  if (values.length === 0) {
    return {
      validCount: 0,
      totalCount,
      min: null,
      max: null,
      mean: null,
      cloudObscuredCount,
      degradedCount,
    };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = +(sum / values.length).toFixed(2);

  return {
    validCount,
    totalCount,
    min,
    max,
    mean,
    cloudObscuredCount,
    degradedCount,
  };
}

/**
 * Pure helper: Computes continuous deterministic color scale for a given metric and value.
 */
export function getEOCellColor(
  metricKey: EOMetricKey,
  value: number | null | undefined,
  qcStatus: string | undefined,
  minBound: number,
  maxBound: number,
): string {
  if (qcStatus === 'CLOUD_OBSCURED') {
    return '#64748b'; // Translucent/cloud slate
  }
  if (qcStatus === 'DEGRADED_QC_WARNING' || qcStatus === 'SUSPECT') {
    return '#f59e0b'; // Degraded amber
  }
  if (value === null || value === undefined || isNaN(value)) {
    return '#334155'; // Dark slate for NO_DATA
  }

  const span = Math.max(maxBound - minBound, 0.001);
  const t = Math.max(0, Math.min(1, (value - minBound) / span));

  if (metricKey === 'sst_celsius') {
    if (t < 0.5) {
      const factor = t / 0.5;
      const r = Math.round(59 + (245 - 59) * factor);
      const g = Math.round(130 + (158 - 130) * factor);
      const b = Math.round(246 + (11 - 246) * factor);
      return `rgb(${r}, ${g}, ${b})`;
    } else {
      const factor = (t - 0.5) / 0.5;
      const r = Math.round(245 + (239 - 245) * factor);
      const g = Math.round(158 + (68 - 158) * factor);
      const b = Math.round(11 + (68 - 11) * factor);
      return `rgb(${r}, ${g}, ${b})`;
    }
  }

  if (metricKey === 'chlorophyll_a_mg_m3') {
    if (t < 0.5) {
      const factor = t / 0.5;
      const r = Math.round(6 + (16 - 6) * factor);
      const g = Math.round(95 + (185 - 95) * factor);
      const b = Math.round(70 + (129 - 70) * factor);
      return `rgb(${r}, ${g}, ${b})`;
    } else {
      const factor = (t - 0.5) / 0.5;
      const r = Math.round(16 + (52 - 16) * factor);
      const g = Math.round(185 + (211 - 185) * factor);
      const b = Math.round(129 + (153 - 129) * factor);
      return `rgb(${r}, ${g}, ${b})`;
    }
  }

  const r = Math.round(2 + (203 - 2) * t);
  const g = Math.round(132 + (213 - 132) * t);
  const b = Math.round(199 + (225 - 199) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Pure data transformation: Converts an array of EO grid cell records for a single date
 * into a GeoJSON FeatureCollection with rich styling and metric attributes.
 */
export function buildEOGridGeoJSON(
  cells: EOGridCell[],
  metricKey: EOMetricKey,
  selectedCellId?: string | null,
): GeoJSON.FeatureCollection {
  const metricConfig = EO_SPATIAL_METRICS.find((m) => m.key === metricKey) || EO_SPATIAL_METRICS[0];

  const validVals = (cells || [])
    .filter((c) => c.qc_status === 'VALID' && typeof c[metricKey] === 'number')
    .map((c) => c[metricKey] as number);

  const minBound = validVals.length > 0 ? Math.min(...validVals) : metricConfig.minRange;
  const maxBound = validVals.length > 0 ? Math.max(...validVals) : metricConfig.maxRange;

  const validFeatures = (cells || [])
    .filter(
      (c) =>
        typeof c.center_lat === 'number' &&
        typeof c.center_lon === 'number' &&
        !isNaN(c.center_lat) &&
        !isNaN(c.center_lon) &&
        (c.center_lat !== 0 || c.center_lon !== 0) &&
        c.center_lat >= -90 &&
        c.center_lat <= 90 &&
        c.center_lon >= -180 &&
        c.center_lon <= 180,
    )
    .map((c) => {
      const val = c[metricKey];
      const isSelected = !!selectedCellId && (c.cell_id === selectedCellId || c.public_id === selectedCellId);
      const color = getEOCellColor(metricKey, val, c.qc_status, minBound, maxBound);

      let formattedValue = '—';
      if (typeof val === 'number') {
        formattedValue = `${val.toFixed(metricConfig.decimals)} ${metricConfig.unit}`;
      } else if (c.qc_status === 'CLOUD_OBSCURED') {
        formattedValue = 'Cloud Obscured';
      }

      return {
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [c.center_lon, c.center_lat],
        },
        properties: {
          public_id: c.public_id || c.cell_id,
          cell_id: c.cell_id,
          center_lat: c.center_lat,
          center_lon: c.center_lon,
          pass_time: c.pass_time,
          sst_celsius: c.sst_celsius,
          chlorophyll_a_mg_m3: c.chlorophyll_a_mg_m3,
          cloud_cover_pct: c.cloud_cover_pct,
          cloud_fraction: c.cloud_fraction,
          uncertainty: c.uncertainty,
          qc_status: c.qc_status || 'VALID',
          satellite: c.satellite,
          resolution_m: c.resolution_m,
          source: c.source,
          metric_key: metricKey,
          metric_value: val,
          formatted_value: formattedValue,
          color,
          is_selected: isSelected,
          label: typeof val === 'number' ? val.toFixed(metricConfig.decimals === 0 ? 0 : 1) : '',
        },
      };
    });

  return {
    type: 'FeatureCollection',
    features: validFeatures,
  };
}

export interface EOGridSpatialMapProps {
  records: EOGridCell[];
  loading?: boolean;
}

export default function EOGridSpatialMap({
  records,
  loading = false,
}: EOGridSpatialMapProps) {
  const availableDates = useMemo(() => {
    const dates = new Set<string>();
    for (const r of records || []) {
      if (r && r.pass_time) {
        const d = r.pass_time.slice(0, 10);
        if (d && d.length === 10) dates.add(d);
      }
    }
    return Array.from(dates).sort();
  }, [records]);

  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedMetric, setSelectedMetric] = useState<EOMetricKey>('sst_celsius');
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);

  useEffect(() => {
    if (availableDates.length > 0 && (!selectedDate || !availableDates.includes(selectedDate))) {
      setSelectedDate(availableDates[availableDates.length - 1]);
    }
  }, [availableDates, selectedDate]);

  const dateCells = useMemo(() => {
    if (!selectedDate) return [];
    return (records || []).filter(
      (r) => r && r.pass_time && r.pass_time.startsWith(selectedDate),
    );
  }, [records, selectedDate]);

  const spatialStats = useMemo(
    () => calculateEOSpatialStats(dateCells, selectedMetric),
    [dateCells, selectedMetric],
  );

  const selectedCellRecord = useMemo(() => {
    if (!selectedCellId) return null;
    return dateCells.find((c) => c.cell_id === selectedCellId || c.public_id === selectedCellId) || null;
  }, [dateCells, selectedCellId]);

  const activeMetricConfig = useMemo(
    () => EO_SPATIAL_METRICS.find((m) => m.key === selectedMetric) || EO_SPATIAL_METRICS[0],
    [selectedMetric],
  );

  // Deck.gl Grid Cell Data Points
  const gridData = useMemo(() => {
    const validVals = dateCells
      .filter((c) => c.qc_status === 'VALID' && typeof c[selectedMetric] === 'number')
      .map((c) => c[selectedMetric] as number);

    const minBound = validVals.length > 0 ? Math.min(...validVals) : activeMetricConfig.minRange;
    const maxBound = validVals.length > 0 ? Math.max(...validVals) : activeMetricConfig.maxRange;

    return dateCells
      .filter(
        (c) =>
          typeof c.center_lat === 'number' &&
          typeof c.center_lon === 'number' &&
          !isNaN(c.center_lat) &&
          !isNaN(c.center_lon),
      )
      .map((c) => {
        const val = c[selectedMetric];
        const isSelected = !!selectedCellId && (c.cell_id === selectedCellId || c.public_id === selectedCellId);
        const colorHex = getEOCellColor(selectedMetric, val, c.qc_status, minBound, maxBound);

        // Parse RGB from hex/rgb
        let rgb = [56, 189, 248];
        if (colorHex.startsWith('rgb(')) {
          const parts = colorHex.replace('rgb(', '').replace(')', '').split(',').map((p) => parseInt(p.trim(), 10));
          if (parts.length === 3) rgb = parts;
        } else if (colorHex.startsWith('#')) {
          const hex = colorHex.replace('#', '');
          rgb = [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
        }

        const label = typeof val === 'number' ? val.toFixed(activeMetricConfig.decimals === 0 ? 0 : 1) : '';

        return {
          ...c,
          position: [c.center_lon, c.center_lat] as [number, number],
          val,
          label,
          colorRgb: rgb,
          isSelected,
        };
      });
  }, [dateCells, selectedMetric, selectedCellId, activeMetricConfig]);

  // Deck.gl Layers
  const layers = useMemo(() => {
    if (gridData.length === 0) return [];

    const result: any[] = [];

    // Selected cell halo
    const selectedCells = gridData.filter((c) => c.isSelected);
    if (selectedCells.length > 0) {
      result.push(
        new ScatterplotLayer({
          id: 'eo-grid-selected-halo',
          data: selectedCells,
          pickable: false,
          getPosition: (d: any) => d.position,
          getRadius: 4500,
          getFillColor: [56, 189, 248, 50],
          getLineColor: [255, 255, 255, 255],
          stroked: true,
          lineWidthMinPixels: 2.5,
          radiusMinPixels: 20,
          radiusMaxPixels: 45,
        }),
      );
    }

    // Grid Cell Circles
    result.push(
      new ScatterplotLayer({
        id: 'eo-grid-cells-circle',
        data: gridData,
        pickable: true,
        getPosition: (d: any) => d.position,
        getRadius: 3200,
        getFillColor: (d: any) => [d.colorRgb[0], d.colorRgb[1], d.colorRgb[2], d.isSelected ? 255 : 230],
        getLineColor: (d: any) => (d.isSelected ? [255, 255, 255, 255] : [15, 23, 42, 220]),
        stroked: true,
        lineWidthMinPixels: 2,
        radiusMinPixels: 14,
        radiusMaxPixels: 32,
      }),
    );

    // Grid Cell Value Labels
    result.push(
      new TextLayer({
        id: 'eo-grid-cells-text',
        data: gridData,
        pickable: false,
        getPosition: (d: any) => d.position,
        getText: (d: any) => d.label,
        getSize: 11,
        getColor: [255, 255, 255, 255],
        getTextAnchor: 'middle',
        getAlignmentBaseline: 'center',
        fontFamily: 'ui-sans-serif, system-ui, -apple-system',
        fontWeight: 'bold',
        outlineWidth: 3,
        outlineColor: [15, 23, 42, 240],
      }),
    );

    return result;
  }, [gridData]);

  // Tooltip
  const getTooltip = useCallback((info: PickingInfo) => {
    if (!info.picked || !info.object) return null;
    const p = info.object;
    const sstStr = typeof p.sst_celsius === 'number' ? `${p.sst_celsius.toFixed(1)} °C` : '—';
    const chlaStr = typeof p.chlorophyll_a_mg_m3 === 'number' ? `${p.chlorophyll_a_mg_m3.toFixed(2)} mg/m³` : '—';
    const cloudStr = typeof p.cloud_cover_pct === 'number' ? `${p.cloud_cover_pct}%` : '—';

    return {
      html: `
        <div style="padding: 8px 12px; font-family: ui-sans-serif, system-ui; background: rgba(15, 23, 42, 0.96); border: 1px solid #38bdf8; border-radius: 6px; color: #f8fafc; font-size: 12px; line-height: 1.4; box-shadow: 0 4px 14px rgba(0,0,0,0.6);">
          <div style="font-weight: 700; color: #38bdf8; margin-bottom: 2px;">
            🛰️ EO Grid Cell ${p.cell_id} <span style="font-size: 10px; font-weight: normal; color: #94a3b8;">(${p.qc_status || 'VALID'})</span>
          </div>
          <div style="color: #cbd5e1; font-size: 11px;">Coord: ${p.center_lat?.toFixed(2)}°N, ${p.center_lon?.toFixed(2)}°E</div>
          <div style="color: #cbd5e1; font-size: 11px; margin-top: 3px;">
            SST: <strong>${sstStr}</strong> · Chl-a: <strong>${chlaStr}</strong> · Cloud: <strong>${cloudStr}</strong>
          </div>
          <div style="color: #94a3b8; font-size: 10px; margin-top: 3px;">Satellite: ${p.satellite || 'Oceansat-3'} · Res: ${p.resolution_m || 360}m</div>
        </div>
      `,
      style: { zIndex: '1000' },
    };
  }, []);

  const handleClick = useCallback((info: PickingInfo) => {
    if (info.picked && info.object?.cell_id) {
      const cid = info.object.cell_id;
      setSelectedCellId((prev) => (prev === cid ? null : cid));
    }
  }, []);

  const currentIndex = availableDates.indexOf(selectedDate);
  const handlePrevDate = () => {
    if (currentIndex > 0) setSelectedDate(availableDates[currentIndex - 1]);
  };
  const handleNextDate = () => {
    if (currentIndex < availableDates.length - 1) setSelectedDate(availableDates[currentIndex + 1]);
  };

  if (loading) {
    return (
      <div className="ocean-chart-card loading" data-testid="eo-spatial-loading">
        <div className="ocean-chart-header">
          <div className="ocean-chart-title">
            <Satellite size={16} className="ocean-chart-icon" style={{ color: '#0284c7' }} />
            <span>Earth Observation 5×5 Spatial Grid</span>
          </div>
        </div>
        <div className="ocean-chart-empty">
          <Activity size={24} className="researcher-spinner" />
          <p>Loading Earth Observation satellite grid telemetry...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ocean-chart-card eo-spatial-card" data-testid="eo-spatial-container">
      {/* Header with Metric Selector and Date Controls */}
      <div className="ocean-chart-header eo-spatial-header">
        <div className="ocean-chart-title">
          <Satellite size={16} className="ocean-chart-icon" style={{ color: '#0284c7' }} />
          <span>Earth Observation 5×5 Spatial Grid</span>
          <span className="researcher-badge info" style={{ marginLeft: 8 }}>
            5×5 Centroid
          </span>
        </div>

        {/* Date Navigator */}
        {availableDates.length > 0 && (
          <div className="eo-date-navigator" data-testid="eo-date-navigator">
            <button
              type="button"
              className="eo-date-nav-btn"
              onClick={handlePrevDate}
              disabled={currentIndex <= 0}
              aria-label="Previous snapshot date"
              title="Previous date"
            >
              <ChevronLeft size={14} />
            </button>
            <div className="eo-date-current">
              <Calendar size={13} />
              <span>{selectedDate || 'Select date'}</span>
            </div>
            <button
              type="button"
              className="eo-date-nav-btn"
              onClick={handleNextDate}
              disabled={currentIndex >= availableDates.length - 1}
              aria-label="Next snapshot date"
              title="Next date"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}

        {/* Metric Selector Dropdown */}
        <div className="eo-metric-dropdown-container" data-testid="eo-metric-dropdown-container" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label htmlFor="eo-metric-select" style={{ fontSize: '11px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
            <Layers size={13} style={{ color: '#0284c7' }} />
            <span>Metric:</span>
          </label>
          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
            <select
              id="eo-metric-select"
              value={selectedMetric}
              onChange={(e) => setSelectedMetric(e.target.value as EOMetricKey)}
              className="eo-metric-select"
              aria-label="Select spatial observation metric"
              style={{
                appearance: 'none',
                WebkitAppearance: 'none',
                background: 'rgba(15, 23, 42, 0.95)',
                color: '#f8fafc',
                border: '1px solid rgba(2, 132, 199, 0.6)',
                borderRadius: '6px',
                padding: '5px 28px 5px 10px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                outline: 'none',
                boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
              }}
            >
              {EO_SPATIAL_METRICS.map((m) => (
                <option key={m.key} value={m.key} style={{ background: '#0f172a', color: '#f8fafc' }}>
                  {m.label} ({m.shortName} · {m.unit})
                </option>
              ))}
            </select>
            <ChevronDown
              size={13}
              style={{
                position: 'absolute',
                right: '8px',
                pointerEvents: 'none',
                color: '#38bdf8',
              }}
            />
          </div>
        </div>
      </div>

      {/* Spatial Summary Statistics Bar */}
      <div className="eo-spatial-stats-strip" data-testid="eo-spatial-stats-strip">
        <div className="eo-stat-chip">
          <span className="eo-stat-label">Valid Cells:</span>
          <span className="eo-stat-val">{spatialStats.validCount} / {spatialStats.totalCount}</span>
        </div>
        <div className="eo-stat-chip">
          <span className="eo-stat-label">Min:</span>
          <span className="eo-stat-val">
            {spatialStats.min != null ? `${spatialStats.min.toFixed(activeMetricConfig.decimals)} ${activeMetricConfig.unit}` : '—'}
          </span>
        </div>
        <div className="eo-stat-chip">
          <span className="eo-stat-label">Mean:</span>
          <span className="eo-stat-val highlight">
            {spatialStats.mean != null ? `${spatialStats.mean.toFixed(activeMetricConfig.decimals)} ${activeMetricConfig.unit}` : '—'}
          </span>
        </div>
        <div className="eo-stat-chip">
          <span className="eo-stat-label">Max:</span>
          <span className="eo-stat-val">
            {spatialStats.max != null ? `${spatialStats.max.toFixed(activeMetricConfig.decimals)} ${activeMetricConfig.unit}` : '—'}
          </span>
        </div>
        {spatialStats.cloudObscuredCount > 0 && (
          <div className="eo-stat-chip warning">
            <AlertTriangle size={12} />
            <span className="eo-stat-label">Cloud:</span>
            <span className="eo-stat-val">{spatialStats.cloudObscuredCount}</span>
          </div>
        )}
      </div>

      {/* Map Canvas */}
      <div className="eo-spatial-map-wrapper" style={{ height: '380px', position: 'relative' }}>
        <DeckGLMapFoundation
          layers={layers}
          initialCenter={[72.20, 16.60]}
          initialZoom={7.9}
          getTooltip={getTooltip}
          onClick={handleClick}
          bottomOverlay={
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                background: 'rgba(15, 23, 42, 0.92)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(51, 65, 85, 0.6)',
                borderRadius: '6px',
                padding: '5px 12px',
                color: '#cbd5e1',
                fontSize: '11px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontWeight: 600, color: '#f8fafc' }}>
                  {activeMetricConfig.shortName} Scale:
                </span>
                {selectedMetric === 'sst_celsius' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ color: '#3b82f6', fontSize: '10px' }}>26°C (Cool)</span>
                    <span style={{ width: '45px', height: '6px', borderRadius: '3px', background: 'linear-gradient(to right, #3b82f6, #f59e0b, #ef4444)', display: 'inline-block' }} />
                    <span style={{ color: '#ef4444', fontSize: '10px' }}>32°C (Warm)</span>
                  </div>
                )}
                {selectedMetric === 'chlorophyll_a_mg_m3' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ color: '#065f46', fontSize: '10px' }}>0.2 (Low)</span>
                    <span style={{ width: '45px', height: '6px', borderRadius: '3px', background: 'linear-gradient(to right, #065f46, #10b981, #6ee7b7)', display: 'inline-block' }} />
                    <span style={{ color: '#34d399', fontSize: '10px' }}>3.0+ (High)</span>
                  </div>
                )}
                {selectedMetric === 'cloud_cover_pct' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ color: '#0284c7', fontSize: '10px' }}>0% (Clear)</span>
                    <span style={{ width: '45px', height: '6px', borderRadius: '3px', background: 'linear-gradient(to right, #0284c7, #64748b, #94a3b8)', display: 'inline-block' }} />
                    <span style={{ color: '#94a3b8', fontSize: '10px' }}>100% (Overcast)</span>
                  </div>
                )}
              </div>
              <div style={{ borderLeft: '1px solid #334155', paddingLeft: '8px', color: '#94a3b8', fontSize: '10px' }}>
                Open Arabian Sea 5×5 Offshore Grid
              </div>
            </div>
          }
        />

        {/* Selected Cell Inspect Drawer */}
        {selectedCellRecord && (
          <div className="eo-cell-inspect-drawer" data-testid="eo-cell-inspect-drawer">
            <div className="eo-inspect-header">
              <div className="eo-inspect-title">
                <Satellite size={14} style={{ color: '#0284c7' }} />
                <strong>Cell {selectedCellRecord.cell_id}</strong>
                <span className={`eo-inspect-qc ${selectedCellRecord.qc_status?.toLowerCase()}`}>
                  {selectedCellRecord.qc_status || 'VALID'}
                </span>
              </div>
              <button
                type="button"
                className="eo-inspect-close"
                onClick={() => setSelectedCellId(null)}
                aria-label="Close details"
              >
                <X size={14} />
              </button>
            </div>
            <div className="eo-inspect-grid">
              <div className="eo-inspect-item">
                <span className="lbl">Coordinates:</span>
                <span className="val">{selectedCellRecord.center_lat?.toFixed(3)}°N, {selectedCellRecord.center_lon?.toFixed(3)}°E</span>
              </div>
              <div className="eo-inspect-item">
                <span className="lbl">SST:</span>
                <span className="val">{selectedCellRecord.sst_celsius != null ? `${selectedCellRecord.sst_celsius.toFixed(1)} °C` : '—'}</span>
              </div>
              <div className="eo-inspect-item">
                <span className="lbl">Chlorophyll-a:</span>
                <span className="val">{selectedCellRecord.chlorophyll_a_mg_m3 != null ? `${selectedCellRecord.chlorophyll_a_mg_m3.toFixed(2)} mg/m³` : '—'}</span>
              </div>
              <div className="eo-inspect-item">
                <span className="lbl">Cloud Cover:</span>
                <span className="val">{selectedCellRecord.cloud_cover_pct != null ? `${selectedCellRecord.cloud_cover_pct}%` : '—'}</span>
              </div>
              <div className="eo-inspect-item">
                <span className="lbl">Satellite / Sensor:</span>
                <span className="val">{selectedCellRecord.satellite || 'Oceansat-3'} ({selectedCellRecord.resolution_m || 360}m)</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
