import { useState, useMemo } from 'react';
import { Satellite, Info, Calendar, AlertTriangle, Layers } from 'lucide-react';
import type { EOGridCell } from '../../api/researcher-client';

export type EOMetricKey = 'sst_celsius' | 'chlorophyll_a_mg_m3' | 'cloud_cover_pct';

export interface EOMetricConfig {
  key: EOMetricKey;
  label: string;
  shortName: string;
  unit: string;
  color: string;
  gradientId: string;
  decimals: number;
  description: string;
}

export const EO_METRICS: EOMetricConfig[] = [
  {
    key: 'sst_celsius',
    label: 'Sea Surface Temperature (SST)',
    shortName: 'SST',
    unit: '°C',
    color: '#f59e0b', // Amber
    gradientId: 'eoSstGrad',
    decimals: 2,
    description: 'Absolute Sea Surface Temperature from thermal infrared satellite sensors (INSAT-3D/Oceansat)',
  },
  {
    key: 'chlorophyll_a_mg_m3',
    label: 'Chlorophyll-a Concentration',
    shortName: 'Chl-a',
    unit: 'mg/m³',
    color: '#10b981', // Emerald
    gradientId: 'eoChlaGrad',
    decimals: 2,
    description: 'Ocean color sensor surface Chlorophyll-a pigment concentration (Oceansat-3 OCM)',
  },
  {
    key: 'cloud_cover_pct',
    label: 'Cloud Fraction / Cover',
    shortName: 'Cloud Cover',
    unit: '%',
    color: '#38bdf8', // Sky Cyan
    gradientId: 'eoCloudGrad',
    decimals: 0,
    description: 'Pixel cloud fraction percentage across 5×5 satellite grid cells',
  },
];

export interface EODailyAggregate {
  date: string; // YYYY-MM-DD
  displayDate: string; // e.g. "Aug 30"
  mean: number | null;
  min: number | null;
  max: number | null;
  validCount: number;
  totalCount: number;
  meanUncertainty: number | null;
  qcCounts: Record<string, number>;
}

/**
 * Pure data transformation: aggregates spatially gridded multi-day EO cell records
 * into a chronological daily spatial mean time-series.
 *
 * Rules:
 * 1. Groups records strictly by ISO date (YYYY-MM-DD).
 * 2. Excludes null, undefined, NaN values from mean and range calculations.
 * 3. Never treats null/missing values as zero.
 * 4. If all cells on a date are missing, mean is null (producing a chart gap).
 * 5. Calculates valid cell count and mean uncertainty where available.
 * 6. Returns chronologically sorted array by date ascending.
 */
export function aggregateEOTemporalSeries(
  records: EOGridCell[],
  metricKey: EOMetricKey
): EODailyAggregate[] {
  const dateMap = new Map<string, {
    values: number[];
    uncertainties: number[];
    totalCount: number;
    qcCounts: Record<string, number>;
  }>();

  for (const r of records || []) {
    if (!r || !r.pass_time) continue;

    const dateStr = r.pass_time.slice(0, 10);
    if (!dateStr || dateStr.length < 10) continue;

    if (!dateMap.has(dateStr)) {
      dateMap.set(dateStr, {
        values: [],
        uncertainties: [],
        totalCount: 0,
        qcCounts: {},
      });
    }

    const group = dateMap.get(dateStr)!;
    group.totalCount += 1;

    // Track QC status
    const qc = r.qc_status || 'VALID';
    group.qcCounts[qc] = (group.qcCounts[qc] || 0) + 1;

    // Extract metric value
    const rawVal = r[metricKey];
    if (typeof rawVal === 'number' && !isNaN(rawVal)) {
      group.values.push(rawVal);
    }

    // Extract uncertainty if present
    if (typeof r.uncertainty === 'number' && !isNaN(r.uncertainty)) {
      group.uncertainties.push(r.uncertainty);
    }
  }

  // Sort dates chronologically ascending
  const sortedDates = Array.from(dateMap.keys()).sort();

  return sortedDates.map((dateStr) => {
    const group = dateMap.get(dateStr)!;
    const validCount = group.values.length;

    let mean: number | null = null;
    let min: number | null = null;
    let max: number | null = null;
    let meanUncertainty: number | null = null;

    if (validCount > 0) {
      const sum = group.values.reduce((acc, v) => acc + v, 0);
      mean = +(sum / validCount).toFixed(4);
      min = Math.min(...group.values);
      max = Math.max(...group.values);
    }

    if (group.uncertainties.length > 0) {
      const sumUnc = group.uncertainties.reduce((acc, u) => acc + u, 0);
      meanUncertainty = +(sumUnc / group.uncertainties.length).toFixed(3);
    }

    // Format display date: "2026-08-30" -> "Aug 30"
    let displayDate = dateStr;
    try {
      const [, m, d] = dateStr.split('-').map(Number);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      displayDate = `${months[m - 1]} ${d.toString().padStart(2, '0')}`;
    } catch {
      displayDate = dateStr;
    }

    return {
      date: dateStr,
      displayDate,
      mean,
      min,
      max,
      validCount,
      totalCount: group.totalCount,
      meanUncertainty,
      qcCounts: group.qcCounts,
    };
  });
}

interface EOTemporalAnalysisChartProps {
  records: EOGridCell[];
  loading?: boolean;
}

export default function EOTemporalAnalysisChart({
  records,
  loading = false,
}: EOTemporalAnalysisChartProps) {
  const [selectedMetric, setSelectedMetric] = useState<EOMetricKey>('sst_celsius');
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const activeConfig = useMemo(() => {
    return EO_METRICS.find((m) => m.key === selectedMetric) || EO_METRICS[0];
  }, [selectedMetric]);

  // Compute daily aggregates
  const dailySeries = useMemo(() => {
    return aggregateEOTemporalSeries(records, selectedMetric);
  }, [records, selectedMetric]);

  const hasData = dailySeries.length > 0 && dailySeries.some((d) => d.mean !== null);

  // Calculate high-level summary statistics
  const summaryStats = useMemo(() => {
    if (!hasData) return null;

    const validMeans = dailySeries.map((d) => d.mean).filter((m): m is number => m !== null);
    if (validMeans.length === 0) return null;

    const overallMean = +(validMeans.reduce((acc, v) => acc + v, 0) / validMeans.length).toFixed(
      activeConfig.decimals
    );
    const overallMin = +Math.min(...validMeans).toFixed(activeConfig.decimals);
    const overallMax = +Math.max(...validMeans).toFixed(activeConfig.decimals);

    const totalValid = dailySeries.reduce((acc, d) => acc + d.validCount, 0);
    const totalCells = dailySeries.reduce((acc, d) => acc + d.totalCount, 0);
    const coveragePct = totalCells > 0 ? Math.round((totalValid / totalCells) * 100) : 0;

    return {
      overallMean,
      overallMin,
      overallMax,
      totalValid,
      totalCells,
      coveragePct,
      daysCount: dailySeries.length,
    };
  }, [dailySeries, hasData, activeConfig]);

  // Chart dimensions
  const svgWidth = 840;
  const svgHeight = 280;
  const margin = { top: 25, right: 35, bottom: 40, left: 60 };
  const plotWidth = svgWidth - margin.left - margin.right;
  const plotHeight = svgHeight - margin.top - margin.bottom;

  // Calibrated scale calculation
  const { yMin, yMax, yTicks } = useMemo(() => {
    if (!hasData) return { yMin: 0, yMax: 10, yTicks: [0, 5, 10] };

    const allValues: number[] = [];
    dailySeries.forEach((d) => {
      if (d.min !== null) allValues.push(d.min);
      if (d.max !== null) allValues.push(d.max);
      if (d.mean !== null) allValues.push(d.mean);
    });

    if (allValues.length === 0) return { yMin: 0, yMax: 10, yTicks: [0, 5, 10] };

    let rawMin = Math.min(...allValues);
    let rawMax = Math.max(...allValues);

    // Add 10% padding
    let range = rawMax - rawMin;
    if (range === 0) range = rawMin > 0 ? rawMin * 0.2 : 1;

    let min = Math.max(0, rawMin - range * 0.12);
    let max = rawMax + range * 0.12;

    if (activeConfig.key === 'cloud_cover_pct') {
      min = 0;
      max = Math.max(100, Math.ceil(rawMax / 10) * 10);
    }

    const step = (max - min) / 4;
    const ticks = [0, 1, 2, 3, 4].map((i) => +(min + step * i).toFixed(activeConfig.decimals));

    return { yMin: min, yMax: max, yTicks: ticks };
  }, [dailySeries, hasData, activeConfig]);

  // Coordinates mapping
  const numDays = dailySeries.length;
  const getX = (idx: number) => {
    if (numDays <= 1) return margin.left + plotWidth / 2;
    return margin.left + (idx / (numDays - 1)) * plotWidth;
  };

  const getY = (val: number | null) => {
    if (val === null) return null;
    const norm = (val - yMin) / (yMax - yMin || 1);
    return margin.top + plotHeight - norm * plotHeight;
  };

  // SVG Paths generation
  // 1. Mean Line path (with gaps on nulls)
  const linePath = useMemo(() => {
    if (!hasData) return '';
    let path = '';
    let inSegment = false;

    dailySeries.forEach((d, idx) => {
      const x = getX(idx);
      const y = getY(d.mean);

      if (y !== null) {
        if (!inSegment) {
          path += `M ${x.toFixed(1)} ${y.toFixed(1)}`;
          inSegment = true;
        } else {
          path += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
        }
      } else {
        inSegment = false;
      }
    });

    return path;
  }, [dailySeries, hasData, yMin, yMax]);

  // 2. Area gradient under mean line
  const areaPath = useMemo(() => {
    if (!hasData) return '';
    let path = '';
    let segmentStartIdx = -1;
    const yBottom = margin.top + plotHeight;

    dailySeries.forEach((d, idx) => {
      const x = getX(idx);
      const y = getY(d.mean);

      if (y !== null) {
        if (segmentStartIdx === -1) {
          segmentStartIdx = idx;
          path += `M ${x.toFixed(1)} ${yBottom} L ${x.toFixed(1)} ${y.toFixed(1)}`;
        } else {
          path += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
        }
      } else if (segmentStartIdx !== -1) {
        const prevX = getX(idx - 1);
        path += ` L ${prevX.toFixed(1)} ${yBottom} Z `;
        segmentStartIdx = -1;
      }
    });

    if (segmentStartIdx !== -1) {
      const lastX = getX(dailySeries.length - 1);
      path += ` L ${lastX.toFixed(1)} ${yBottom} Z`;
    }

    return path;
  }, [dailySeries, hasData, yMin, yMax]);

  // 3. Min-Max Spatial Spread Ribbon
  const spreadRibbonPath = useMemo(() => {
    if (!hasData) return '';
    let path = '';
    const topPoints: string[] = [];
    const bottomPoints: string[] = [];

    dailySeries.forEach((d, idx) => {
      if (d.min !== null && d.max !== null) {
        const x = getX(idx);
        const yTop = getY(d.max)!;
        const yBottom = getY(d.min)!;
        topPoints.push(`${x.toFixed(1)},${yTop.toFixed(1)}`);
        bottomPoints.unshift(`${x.toFixed(1)},${yBottom.toFixed(1)}`);
      }
    });

    if (topPoints.length > 1) {
      path = `M ${topPoints[0]} ` +
        topPoints.slice(1).map((p) => `L ${p}`).join(' ') +
        ' ' +
        bottomPoints.map((p) => `L ${p}`).join(' ') +
        ' Z';
    }

    return path;
  }, [dailySeries, hasData, yMin, yMax]);

  // Active hover point
  const hoveredPoint = hoveredIndex !== null ? dailySeries[hoveredIndex] : null;

  return (
    <div className="researcher-eo-temporal-wrapper" data-testid="eo-temporal-chart">
      {/* Header */}
      <div className="researcher-eo-temporal-header">
        <div className="researcher-eo-temporal-title-group">
          <div className="researcher-eo-temporal-title">
            <Satellite size={16} className="researcher-eo-icon" />
            <span>Earth Observation 14-Day Temporal Trend</span>
            <span className="researcher-eo-badge">{dailySeries.length}-Day Snapshot</span>
          </div>
          <span className="researcher-eo-subtitle">
            Daily Spatial Mean across 5×5 Grid (25 Cells) · {activeConfig.label}
          </span>
        </div>

        {/* Metric Selector Pills */}
        <div className="researcher-eo-metric-pills" role="tablist" aria-label="Select EO Metric">
          {EO_METRICS.map((m) => {
            const isActive = m.key === selectedMetric;
            return (
              <button
                key={m.key}
                type="button"
                className={`researcher-eo-metric-btn ${isActive ? 'active' : ''}`}
                style={{
                  borderColor: isActive ? m.color : undefined,
                  color: isActive ? '#ffffff' : undefined,
                }}
                onClick={() => {
                  setSelectedMetric(m.key);
                  setHoveredIndex(null);
                }}
                role="tab"
                aria-selected={isActive}
              >
                <span className="eo-metric-dot" style={{ backgroundColor: m.color }} />
                <span>{m.shortName}</span>
                <span className="eo-metric-unit">{m.unit}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Summary KPI Cards */}
      {summaryStats && (
        <div className="researcher-eo-summary-grid">
          <div className="researcher-eo-summary-card">
            <span className="eo-summary-label">14-Day Mean</span>
            <span className="eo-summary-val" style={{ color: activeConfig.color }}>
              {summaryStats.overallMean} <small>{activeConfig.unit}</small>
            </span>
            <span className="eo-summary-sub">Spatial average across all days</span>
          </div>
          <div className="researcher-eo-summary-card">
            <span className="eo-summary-label">Spatial Variance (Min — Max)</span>
            <span className="eo-summary-val mono">
              {summaryStats.overallMin} — {summaryStats.overallMax} <small>{activeConfig.unit}</small>
            </span>
            <span className="eo-summary-sub">14-day observed range</span>
          </div>
          <div className="researcher-eo-summary-card">
            <span className="eo-summary-label">Valid Grid Cell Coverage</span>
            <span className="eo-summary-val" style={{ color: summaryStats.coveragePct > 80 ? '#10b981' : '#f59e0b' }}>
              {summaryStats.coveragePct}% <small>({summaryStats.totalValid}/{summaryStats.totalCells} cells)</small>
            </span>
            <span className="eo-summary-sub">Cloud-clear valid pixels</span>
          </div>
        </div>
      )}

      {/* SVG Plot Canvas */}
      <div className="researcher-eo-canvas-wrap">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="researcher-eo-svg"
          onMouseLeave={() => setHoveredIndex(null)}
        >
          <defs>
            <linearGradient id={activeConfig.gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={activeConfig.color} stopOpacity="0.32" />
              <stop offset="100%" stopColor={activeConfig.color} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Background Grid Lines & Y Ticks */}
          {yTicks.map((tickVal) => {
            const y = getY(tickVal);
            if (y === null) return null;
            return (
              <g key={tickVal} className="eo-grid-line-group">
                <line
                  x1={margin.left}
                  y1={y}
                  x2={margin.left + plotWidth}
                  y2={y}
                  stroke="rgba(51, 65, 85, 0.45)"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
                <text
                  x={margin.left - 10}
                  y={y + 4}
                  textAnchor="end"
                  className="eo-axis-tick"
                >
                  {tickVal} {activeConfig.unit}
                </text>
              </g>
            );
          })}

          {/* X Axis & Date Ticks */}
          <line
            x1={margin.left}
            y1={margin.top + plotHeight}
            x2={margin.left + plotWidth}
            y2={margin.top + plotHeight}
            stroke="rgba(100, 116, 139, 0.6)"
            strokeWidth="1"
          />
          {dailySeries.map((d, idx) => {
            const x = getX(idx);
            // Render every 2nd tick if dense, plus first and last
            const shouldRenderLabel = idx % 2 === 0 || idx === numDays - 1;
            return (
              <g key={d.date} className="eo-x-tick-group">
                <line
                  x1={x}
                  y1={margin.top + plotHeight}
                  x2={x}
                  y2={margin.top + plotHeight + 5}
                  stroke="rgba(100, 116, 139, 0.6)"
                  strokeWidth="1"
                />
                {shouldRenderLabel && (
                  <text
                    x={x}
                    y={margin.top + plotHeight + 20}
                    textAnchor="middle"
                    className="eo-axis-tick"
                  >
                    {d.displayDate}
                  </text>
                )}
              </g>
            );
          })}

          {/* Min-Max Spatial Spread Ribbon (Shaded variability area) */}
          {spreadRibbonPath && (
            <path
              d={spreadRibbonPath}
              fill={activeConfig.color}
              fillOpacity="0.10"
              stroke="none"
            />
          )}

          {/* Area under Mean Line */}
          {areaPath && (
            <path
              d={areaPath}
              fill={`url(#${activeConfig.gradientId})`}
              stroke="none"
            />
          )}

          {/* Mean Line */}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke={activeConfig.color}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Data Points on Mean Line */}
          {dailySeries.map((d, idx) => {
            const x = getX(idx);
            const y = getY(d.mean);
            if (y === null) return null;
            const isHovered = hoveredIndex === idx;

            return (
              <g key={d.date}>
                <circle
                  cx={x}
                  cy={y}
                  r={isHovered ? 6 : 3.5}
                  fill={activeConfig.color}
                  stroke="#0f172a"
                  strokeWidth={isHovered ? 2.5 : 1.5}
                />
                {/* Invisible hover hotspot */}
                <rect
                  x={x - (plotWidth / numDays) / 2}
                  y={margin.top}
                  width={plotWidth / numDays}
                  height={plotHeight}
                  fill="transparent"
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setHoveredIndex(idx)}
                />
              </g>
            );
          })}

          {/* Hover Crosshair */}
          {hoveredIndex !== null && hoveredPoint && hoveredPoint.mean !== null && (
            <g className="eo-hover-cursor">
              <line
                x1={getX(hoveredIndex)}
                y1={margin.top}
                x2={getX(hoveredIndex)}
                y2={margin.top + plotHeight}
                stroke="#ffffff"
                strokeWidth="1.2"
                strokeDasharray="3 3"
                opacity="0.8"
              />
              <circle
                cx={getX(hoveredIndex)}
                cy={getY(hoveredPoint.mean)!}
                r={7}
                fill="none"
                stroke="#ffffff"
                strokeWidth="2"
              />
            </g>
          )}
        </svg>

        {/* Rich Hover Tooltip Overlay */}
        {hoveredIndex !== null && hoveredPoint && (
          <div
            className="researcher-eo-tooltip"
            style={{
              left: `${(getX(hoveredIndex) / svgWidth) * 100}%`,
              top: `${((getY(hoveredPoint.mean) ?? margin.top + 50) / svgHeight) * 100}%`,
            }}
          >
            <div className="eo-tooltip-header">
              <Calendar size={12} />
              <strong>{hoveredPoint.displayDate} ({hoveredPoint.date})</strong>
            </div>
            <div className="eo-tooltip-metric">
              <span className="eo-tooltip-label">Spatial Mean</span>
              <span className="eo-tooltip-val" style={{ color: activeConfig.color }}>
                {hoveredPoint.mean !== null ? `${hoveredPoint.mean.toFixed(activeConfig.decimals)} ${activeConfig.unit}` : 'NO DATA'}
              </span>
            </div>
            {hoveredPoint.min !== null && hoveredPoint.max !== null && (
              <div className="eo-tooltip-row">
                <span>Spatial Spread (Min — Max):</span>
                <span className="mono">{hoveredPoint.min.toFixed(activeConfig.decimals)} — {hoveredPoint.max.toFixed(activeConfig.decimals)} {activeConfig.unit}</span>
              </div>
            )}
            <div className="eo-tooltip-row">
              <span>Valid Data Coverage:</span>
              <span className="mono">{hoveredPoint.validCount} / {hoveredPoint.totalCount} cells ({Math.round((hoveredPoint.validCount / hoveredPoint.totalCount) * 100)}%)</span>
            </div>
            {hoveredPoint.meanUncertainty !== null && (
              <div className="eo-tooltip-row">
                <span>Mean Pixel Uncertainty:</span>
                <span className="mono">±{hoveredPoint.meanUncertainty}</span>
              </div>
            )}
            {Object.keys(hoveredPoint.qcCounts).length > 0 && (
              <div className="eo-tooltip-qc-list">
                {Object.entries(hoveredPoint.qcCounts).map(([status, count]) => (
                  <span
                    key={status}
                    className={`eo-tooltip-qc-badge ${status.toLowerCase()}`}
                  >
                    {status}: {count}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Empty State Overlay */}
        {!loading && !hasData && (
          <div className="researcher-eo-empty-overlay">
            <AlertTriangle size={20} className="eo-empty-icon" />
            <span>No multi-day Earth Observation grid data available for temporal analysis.</span>
          </div>
        )}

        {/* Loading Overlay */}
        {loading && (
          <div className="researcher-eo-empty-overlay">
            <Layers size={20} className="researcher-spinner" />
            <span>Loading 14-day Earth Observation grid snapshot…</span>
          </div>
        )}
      </div>

      {/* Footer Provenance */}
      <div className="researcher-eo-temporal-footer">
        <Info size={12} />
        <span>
          MOSDAC/EO-style daily observations · 14-day synthetic snapshot · Spatial mean across valid grid cells
        </span>
      </div>
    </div>
  );
}
