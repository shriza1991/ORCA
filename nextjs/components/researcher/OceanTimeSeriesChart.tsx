import React, { useState, useMemo } from 'react';
import { Activity, Info, Calendar } from 'lucide-react';
import type { MarineObservation } from '../../api/researcher-client';

interface OceanTimeSeriesChartProps {
  observations: MarineObservation[];
  harborName: string;
  loading?: boolean;
}

interface MetricConfig {
  key: keyof MarineObservation;
  label: string;
  shortName: string;
  unit: string;
  color: string;
  gradientId: string;
  cautionThreshold?: number;
  cautionLabel?: string;
  fixedMin?: number;
  fixedMax?: number;
}

const METRICS: MetricConfig[] = [
  {
    key: 'wave_height_m',
    label: 'Significant Wave Height (SWH)',
    shortName: 'SWH',
    unit: 'm',
    color: '#06b6d4', // Cyan
    gradientId: 'swhGrad',
    cautionThreshold: 2.0,
    cautionLabel: 'Caution Threshold (2.0 m)',
    fixedMin: 0,
  },
  {
    key: 'sst_celsius',
    label: 'Sea Surface Temperature (SST)',
    shortName: 'SST',
    unit: '°C',
    color: '#f59e0b', // Amber
    gradientId: 'sstGrad',
  },
  {
    key: 'wind_speed_kn',
    label: 'Wind Speed',
    shortName: 'Wind',
    unit: 'kn',
    color: '#8b5cf6', // Violet/Indigo
    gradientId: 'windGrad',
    cautionThreshold: 20.0,
    cautionLabel: 'Caution Threshold (20 kn)',
    fixedMin: 0,
  },
];

export default function OceanTimeSeriesChart({
  observations,
  harborName,
  loading = false,
}: OceanTimeSeriesChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Chronologically sort observations by observation_time ascending
  const sortedObs = useMemo(() => {
    return [...observations].sort((a, b) => {
      const ta = new Date(a.observation_time).getTime();
      const tb = new Date(b.observation_time).getTime();
      return ta - tb;
    });
  }, [observations]);

  // Dimensions
  const svgWidth = 840;
  const svgHeight = 420;
  const margin = { top: 20, right: 35, bottom: 45, left: 65 };
  const plotWidth = svgWidth - margin.left - margin.right;
  const panelHeight = 92;
  const panelGap = 28;

  // Formatting helpers
  const formatUtcTimestamp = (iso: string) => {
    try {
      const d = new Date(iso);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const mon = months[d.getUTCMonth()];
      const day = d.getUTCDate().toString().padStart(2, '0');
      const hrs = d.getUTCHours().toString().padStart(2, '0');
      const min = d.getUTCMinutes().toString().padStart(2, '0');
      return `${mon} ${day} ${hrs}:${min} UTC`;
    } catch {
      return iso;
    }
  };

  const formatShortTick = (iso: string) => {
    try {
      const d = new Date(iso);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const mon = months[d.getUTCMonth()];
      const day = d.getUTCDate();
      const hrs = d.getUTCHours().toString().padStart(2, '0');
      return `${mon} ${day} ${hrs}:00`;
    } catch {
      return iso;
    }
  };

  // Determine tick intervals for x-axis
  const xTicks = useMemo(() => {
    if (sortedObs.length === 0) return [];
    if (sortedObs.length <= 6) {
      return sortedObs.map((obs, idx) => ({ idx, obs }));
    }
    // Pick approximately 5-7 evenly spaced ticks
    const step = Math.max(1, Math.floor((sortedObs.length - 1) / 5));
    const ticks: { idx: number; obs: MarineObservation }[] = [];
    for (let i = 0; i < sortedObs.length; i += step) {
      ticks.push({ idx: i, obs: sortedObs[i] });
    }
    if (ticks[ticks.length - 1].idx !== sortedObs.length - 1) {
      ticks.push({ idx: sortedObs.length - 1, obs: sortedObs[sortedObs.length - 1] });
    }
    return ticks;
  }, [sortedObs]);

  // Compute Scales and Path Segments for each metric
  const panelData = useMemo(() => {
    if (sortedObs.length === 0) return [];

    return METRICS.map((metric, metricIdx) => {
      const panelTop = margin.top + metricIdx * (panelHeight + panelGap);
      const panelBottom = panelTop + panelHeight;

      // Extract valid numbers
      const validVals: number[] = [];
      sortedObs.forEach(obs => {
        const val = obs[metric.key];
        if (typeof val === 'number' && !isNaN(val)) {
          validVals.push(val);
        }
      });

      let minVal = metric.fixedMin !== undefined ? metric.fixedMin : (validVals.length > 0 ? Math.min(...validVals) : 0);
      let maxVal = metric.fixedMax !== undefined ? metric.fixedMax : (validVals.length > 0 ? Math.max(...validVals) : 10);

      // Adjust min/max for visual padding
      if (metric.key === 'sst_celsius') {
        const padding = 0.5;
        minVal = Math.floor((validVals.length > 0 ? Math.min(...validVals) : 26) - padding);
        maxVal = Math.ceil((validVals.length > 0 ? Math.max(...validVals) : 31) + padding);
      } else if (metric.key === 'wave_height_m') {
        maxVal = Math.max(3.0, Math.ceil(maxVal * 1.25 * 10) / 10);
      } else if (metric.key === 'wind_speed_kn') {
        maxVal = Math.max(25, Math.ceil(maxVal * 1.2 / 5) * 5);
      }

      if (minVal === maxVal) {
        minVal -= 1;
        maxVal += 1;
      }

      const getY = (val: number | null) => {
        if (val === null || isNaN(val)) return null;
        const normalized = (val - minVal) / (maxVal - minVal);
        return panelBottom - normalized * panelHeight;
      };

      const getX = (idx: number) => {
        if (sortedObs.length <= 1) return margin.left + plotWidth / 2;
        return margin.left + (idx / (sortedObs.length - 1)) * plotWidth;
      };

      // Split into contiguous non-null segments (CRITICAL: never convert null to 0!)
      const segments: { points: { x: number; y: number; obs: MarineObservation; idx: number }[] }[] = [];
      let currentSegment: { x: number; y: number; obs: MarineObservation; idx: number }[] = [];

      sortedObs.forEach((obs, idx) => {
        const val = obs[metric.key];
        if (typeof val === 'number' && !isNaN(val)) {
          const y = getY(val);
          if (y !== null) {
            currentSegment.push({ x: getX(idx), y, obs, idx });
          }
        } else {
          if (currentSegment.length > 0) {
            segments.push({ points: currentSegment });
            currentSegment = [];
          }
        }
      });
      if (currentSegment.length > 0) {
        segments.push({ points: currentSegment });
      }

      // Generate SVG path string for each segment
      const paths = segments.map(seg => {
        if (seg.points.length === 0) return '';
        if (seg.points.length === 1) return `M ${seg.points[0].x} ${seg.points[0].y} h 0.1`;
        return seg.points.reduce((acc, pt, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`, '');
      });

      // Generate Area path string for each segment
      const areaPaths = segments.map(seg => {
        if (seg.points.length < 2) return '';
        const line = seg.points.reduce((acc, pt, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`, '');
        const lastPt = seg.points[seg.points.length - 1];
        const firstPt = seg.points[0];
        return `${line} L ${lastPt.x.toFixed(1)} ${panelBottom} L ${firstPt.x.toFixed(1)} ${panelBottom} Z`;
      });

      // Caution threshold y position
      const cautionY = metric.cautionThreshold !== undefined ? getY(metric.cautionThreshold) : null;

      // Y-axis grid ticks (3 ticks per panel: min, mid, max)
      const midVal = (minVal + maxVal) / 2;
      const yTicks = [
        { val: maxVal, y: panelTop, label: maxVal.toFixed(metric.key === 'wind_speed_kn' ? 0 : 1) },
        { val: midVal, y: panelTop + panelHeight / 2, label: midVal.toFixed(metric.key === 'wind_speed_kn' ? 0 : 1) },
        { val: minVal, y: panelBottom, label: minVal.toFixed(metric.key === 'wind_speed_kn' ? 0 : 1) },
      ];

      return {
        metric,
        panelTop,
        panelBottom,
        minVal,
        maxVal,
        getY,
        getX,
        segments,
        paths,
        areaPaths,
        cautionY,
        yTicks,
      };
    });
  }, [sortedObs, margin.top, margin.left, plotWidth, panelHeight, panelGap]);

  // Handle Mouse Hover
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (sortedObs.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * svgWidth;
    const plotX = svgX - margin.left;

    if (plotX < 0 || plotX > plotWidth) {
      setHoveredIndex(null);
      return;
    }

    const ratio = plotX / plotWidth;
    const idx = Math.round(ratio * (sortedObs.length - 1));
    const clamped = Math.max(0, Math.min(sortedObs.length - 1, idx));
    setHoveredIndex(clamped);
  };

  const handleMouseLeave = () => {
    setHoveredIndex(null);
  };

  const hoveredObs = hoveredIndex !== null && sortedObs[hoveredIndex] ? sortedObs[hoveredIndex] : null;
  const hoveredX = hoveredIndex !== null && sortedObs.length > 1
    ? margin.left + (hoveredIndex / (sortedObs.length - 1)) * plotWidth
    : null;

  if (loading) {
    return (
      <div className="ocean-chart-empty-state">
        <Activity size={24} className="researcher-spinner" />
        <span>Loading 48-hour marine time series…</span>
      </div>
    );
  }

  if (sortedObs.length === 0) {
    return (
      <div className="ocean-chart-empty-state">
        <Info size={24} />
        <span>No observation time-series data available for {harborName}.</span>
      </div>
    );
  }

  const timeRangeStart = formatUtcTimestamp(sortedObs[0].observation_time);
  const timeRangeEnd = formatUtcTimestamp(sortedObs[sortedObs.length - 1].observation_time);

  return (
    <div className="ocean-time-series-container" data-testid="ocean-time-series-chart">
      {/* Header & Meta Bar */}
      <div className="ocean-chart-header">
        <div className="ocean-chart-title-area">
          <div className="ocean-chart-title">
            <Activity size={16} className="ocean-chart-icon" />
            <span>48-Hour Marine Observation Time Series — {harborName}</span>
          </div>
          <div className="ocean-chart-coverage">
            <Calendar size={13} />
            <span>{timeRangeStart} → {timeRangeEnd} ({sortedObs.length} hourly observations)</span>
          </div>
        </div>

        {/* Legend */}
        <div className="ocean-chart-legend">
          <span className="ocean-legend-item">
            <span className="ocean-legend-dot valid" /> Valid Observation
          </span>
          <span className="ocean-legend-item">
            <span className="ocean-legend-dot suspect" /> QC Flagged
          </span>
          <span className="ocean-legend-item">
            <span className="ocean-legend-line gap" /> Missing / Gap
          </span>
        </div>
      </div>

      {/* Interactive SVG Chart */}
      <div className="ocean-svg-wrapper">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="ocean-timeseries-svg"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            {/* Area Gradients */}
            <linearGradient id="swhGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id="sstGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id="windGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Background Grid Lines & Panels */}
          {panelData.map(p => (
            <g key={p.metric.key} className="ocean-panel-group">
              {/* Panel Background Track */}
              <rect
                x={margin.left}
                y={p.panelTop}
                width={plotWidth}
                height={panelHeight}
                fill="rgba(15, 23, 42, 0.45)"
                stroke="rgba(51, 65, 85, 0.4)"
                rx="4"
              />

              {/* Panel Label & Unit */}
              <text
                x={margin.left + 8}
                y={p.panelTop + 14}
                className="ocean-panel-title"
                fill={p.metric.color}
              >
                {p.metric.label} ({p.metric.unit})
              </text>

              {/* Y-axis Grid Lines & Labels */}
              {p.yTicks.map((tick, tIdx) => (
                <g key={tIdx} className="ocean-grid-row">
                  <line
                    x1={margin.left}
                    y1={tick.y}
                    x2={margin.left + plotWidth}
                    y2={tick.y}
                    stroke="rgba(51, 65, 85, 0.3)"
                    strokeDasharray={tIdx === 1 ? '3 3' : undefined}
                  />
                  <text
                    x={margin.left - 8}
                    y={tick.y + 3}
                    textAnchor="end"
                    className="ocean-axis-label"
                  >
                    {tick.label}
                  </text>
                </g>
              ))}

              {/* Caution Threshold Reference Line (if defined) */}
              {p.cautionY !== null && p.cautionY >= p.panelTop && p.cautionY <= p.panelBottom && (
                <g className="ocean-caution-line-group">
                  <line
                    x1={margin.left}
                    y1={p.cautionY}
                    x2={margin.left + plotWidth}
                    y2={p.cautionY}
                    stroke="#ef4444"
                    strokeDasharray="4 4"
                    strokeWidth="1.2"
                  />
                  <text
                    x={margin.left + plotWidth - 6}
                    y={p.cautionY - 4}
                    textAnchor="end"
                    className="ocean-caution-label"
                    fill="#ef4444"
                  >
                    {p.metric.cautionLabel}
                  </text>
                </g>
              )}

              {/* Area Gradients for segments */}
              {p.areaPaths.map((d, dIdx) => (
                <path key={`area-${dIdx}`} d={d} fill={`url(#${p.metric.gradientId})`} />
              ))}

              {/* Continuous Segments Path (breaks on null) */}
              {p.paths.map((d, dIdx) => (
                <path
                  key={`path-${dIdx}`}
                  d={d}
                  fill="none"
                  stroke={p.metric.color}
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}

              {/* Points: distinguishing Valid vs QC Flagged vs Missing */}
              {sortedObs.map((obs, idx) => {
                const val = obs[p.metric.key];
                if (typeof val !== 'number' || isNaN(val)) {
                  // Render subtle gap indicator at bottom of panel
                  const x = p.getX(idx);
                  return (
                    <line
                      key={`gap-${idx}`}
                      x1={x}
                      y1={p.panelBottom - 3}
                      x2={x}
                      y2={p.panelBottom}
                      stroke="#ef4444"
                      strokeWidth="1.5"
                      opacity="0.6"
                    />
                  );
                }

                const y = p.getY(val);
                if (y === null) return null;
                const x = p.getX(idx);
                const isQcFlagged = obs.qc_status !== 'VALID' && obs.qc_status !== undefined;
                const isHovered = hoveredIndex === idx;

                if (isQcFlagged) {
                  return (
                    <g key={`point-${idx}`}>
                      <circle
                        cx={x}
                        cy={y}
                        r={isHovered ? 6 : 4}
                        fill="#f59e0b"
                        stroke="#78350f"
                        strokeWidth="1.5"
                      />
                    </g>
                  );
                }

                return (
                  <circle
                    key={`point-${idx}`}
                    cx={x}
                    cy={y}
                    r={isHovered ? 5.5 : 2.5}
                    fill={isHovered ? '#ffffff' : p.metric.color}
                    stroke={isHovered ? p.metric.color : '#0f172a'}
                    strokeWidth={isHovered ? 2 : 1}
                  />
                );
              })}
            </g>
          ))}

          {/* Shared X-Axis (Timestamps) */}
          <g className="ocean-x-axis-group">
            <line
              x1={margin.left}
              y1={svgHeight - margin.bottom + 8}
              x2={margin.left + plotWidth}
              y2={svgHeight - margin.bottom + 8}
              stroke="rgba(51, 65, 85, 0.6)"
            />
            {xTicks.map((tick, tIdx) => {
              const x = margin.left + (tick.idx / (sortedObs.length - 1)) * plotWidth;
              return (
                <g key={tIdx} className="ocean-x-tick">
                  <line
                    x1={x}
                    y1={margin.top}
                    x2={x}
                    y2={svgHeight - margin.bottom + 8}
                    stroke="rgba(51, 65, 85, 0.25)"
                    strokeDasharray="3 3"
                  />
                  <line
                    x1={x}
                    y1={svgHeight - margin.bottom + 8}
                    x2={x}
                    y2={svgHeight - margin.bottom + 14}
                    stroke="rgba(148, 163, 184, 0.6)"
                  />
                  <text
                    x={x}
                    y={svgHeight - margin.bottom + 26}
                    textAnchor="middle"
                    className="ocean-x-label"
                  >
                    {formatShortTick(tick.obs.observation_time)}
                  </text>
                </g>
              );
            })}
          </g>

          {/* Synchronized Vertical Crosshair Hairline */}
          {hoveredX !== null && (
            <line
              x1={hoveredX}
              y1={margin.top}
              x2={hoveredX}
              y2={svgHeight - margin.bottom + 8}
              stroke="rgba(255, 255, 255, 0.7)"
              strokeWidth="1.2"
              strokeDasharray="3 3"
              className="ocean-crosshair-line"
              pointerEvents="none"
            />
          )}
        </svg>

        {/* Rich Scientific Tooltip Overlay */}
        {hoveredObs && hoveredX !== null && (
          <div
            className="ocean-chart-tooltip"
            style={{
              left: `${(hoveredX / svgWidth) * 100}%`,
              transform: hoveredX > svgWidth * 0.65 ? 'translateX(-105%)' : 'translateX(5%)',
            }}
          >
            <div className="ocean-tooltip-header">
              <Calendar size={12} />
              <span>{formatUtcTimestamp(hoveredObs.observation_time)}</span>
            </div>
            <div className="ocean-tooltip-content">
              <div className="ocean-tooltip-metric" style={{ color: '#06b6d4' }}>
                <span className="ocean-tooltip-name">Wave Height (SWH):</span>
                <span className="ocean-tooltip-value">
                  {hoveredObs.wave_height_m !== null ? `${hoveredObs.wave_height_m.toFixed(2)} m` : 'MISSING'}
                </span>
                <span className={`ocean-tooltip-qc ${hoveredObs.qc_status === 'VALID' || !hoveredObs.qc_status ? 'valid' : 'suspect'}`}>
                  {hoveredObs.qc_status || 'VALID'}
                </span>
              </div>

              <div className="ocean-tooltip-metric" style={{ color: '#f59e0b' }}>
                <span className="ocean-tooltip-name">Sea Surface Temp (SST):</span>
                <span className="ocean-tooltip-value">
                  {hoveredObs.sst_celsius !== null ? `${hoveredObs.sst_celsius.toFixed(1)} °C` : 'MISSING'}
                </span>
                <span className={`ocean-tooltip-qc ${hoveredObs.qc_status === 'VALID' || !hoveredObs.qc_status ? 'valid' : 'suspect'}`}>
                  {hoveredObs.qc_status || 'VALID'}
                </span>
              </div>

              <div className="ocean-tooltip-metric" style={{ color: '#8b5cf6' }}>
                <span className="ocean-tooltip-name">Wind Speed:</span>
                <span className="ocean-tooltip-value">
                  {hoveredObs.wind_speed_kn !== null ? `${hoveredObs.wind_speed_kn.toFixed(1)} kn` : 'MISSING'}
                  {hoveredObs.wind_direction_deg !== null ? ` (${hoveredObs.wind_direction_deg}°)` : ''}
                </span>
                <span className={`ocean-tooltip-qc ${hoveredObs.qc_status === 'VALID' || !hoveredObs.qc_status ? 'valid' : 'suspect'}`}>
                  {hoveredObs.qc_status || 'VALID'}
                </span>
              </div>

              {hoveredObs.swell_period_s !== null && (
                <div className="ocean-tooltip-sub">
                  <span>Swell Period: {hoveredObs.swell_period_s.toFixed(1)} s</span>
                  {hoveredObs.current_speed_kn !== null && (
                    <span> · Current: {hoveredObs.current_speed_kn.toFixed(1)} kn</span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Provenance & Source Faithful Disclosure */}
      <div className="ocean-chart-footer">
        <Info size={12} className="ocean-footer-icon" />
        <span>INCOIS OSF-style hourly observations · 48-hour synthetic snapshot</span>
      </div>
    </div>
  );
}
