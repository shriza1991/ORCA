import { useState, useMemo } from 'react';
import { Waves, Calendar, Info, AlertTriangle, ArrowUpRight, ArrowDownRight, Activity } from 'lucide-react';
import type { MarineObservation } from '../../api/researcher-client';

export interface TideTimeSeriesChartProps {
  observations: MarineObservation[];
  harborName: string;
  loading?: boolean;
}

// Phase styling definitions
const PHASE_COLORS: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  FLOOD: {
    bg: 'rgba(2, 132, 199, 0.12)',
    text: '#0284c7',
    dot: '#0284c7',
    label: 'FLOOD (Rising)',
  },
  EBB: {
    bg: 'rgba(245, 158, 11, 0.12)',
    text: '#d97706',
    dot: '#f59e0b',
    label: 'EBB (Falling)',
  },
  HIGH: {
    bg: 'rgba(16, 185, 129, 0.12)',
    text: '#059669',
    dot: '#10b981',
    label: 'HIGH (Peak)',
  },
  LOW: {
    bg: 'rgba(100, 116, 139, 0.12)',
    text: '#475569',
    dot: '#64748b',
    label: 'LOW (Trough)',
  },
};

const DEFAULT_PHASE = {
  bg: 'rgba(148, 163, 184, 0.12)',
  text: '#64748b',
  dot: '#94a3b8',
  label: 'UNKNOWN',
};

export default function TideTimeSeriesChart({
  observations,
  harborName,
  loading = false,
}: TideTimeSeriesChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Chronologically sort observations by observation_time ascending
  const sortedObs = useMemo(() => {
    return [...observations].sort((a, b) => {
      const ta = new Date(a.observation_time).getTime();
      const tb = new Date(b.observation_time).getTime();
      return ta - tb;
    });
  }, [observations]);

  // Derive valid tide records and summary metrics
  const {
    validCount,
    totalCount,
    minLevel,
    maxLevel,
    tidalRange,
    phaseBreakdown,
    latestObs,
    datum,
  } = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    let valid = 0;
    const phases: Record<string, number> = {};
    let activeDatum = 'LAT';

    for (const obs of sortedObs) {
      if (obs.tide_datum) {
        activeDatum = obs.tide_datum;
      }
      if (obs.tide_phase) {
        phases[obs.tide_phase] = (phases[obs.tide_phase] || 0) + 1;
      }
      if (typeof obs.tide_level_m === 'number' && !isNaN(obs.tide_level_m)) {
        valid++;
        if (obs.tide_level_m < min) min = obs.tide_level_m;
        if (obs.tide_level_m > max) max = obs.tide_level_m;
      }
    }

    const latest = sortedObs.length > 0 ? sortedObs[sortedObs.length - 1] : null;

    return {
      validCount: valid,
      totalCount: sortedObs.length,
      minLevel: min !== Infinity ? min : null,
      maxLevel: max !== -Infinity ? max : null,
      tidalRange: min !== Infinity && max !== -Infinity ? +(max - min).toFixed(2) : null,
      phaseBreakdown: phases,
      latestObs: latest,
      datum: activeDatum,
    };
  }, [sortedObs]);

  // Chart layout dimensions
  const svgWidth = 840;
  const svgHeight = 260;
  const margin = { top: 25, right: 35, bottom: 45, left: 65 };
  const plotWidth = svgWidth - margin.left - margin.right;
  const plotHeight = svgHeight - margin.top - margin.bottom;

  // Format helpers
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

  // Determine x-axis ticks
  const xTicks = useMemo(() => {
    if (sortedObs.length === 0) return [];
    if (sortedObs.length <= 6) {
      return sortedObs.map((obs, idx) => ({ idx, obs }));
    }
    const step = Math.max(1, Math.floor((sortedObs.length - 1) / 5));
    const ticks: { idx: number; obs: MarineObservation }[] = [];
    for (let i = 0; i < sortedObs.length; i += step) {
      ticks.push({ idx: i, obs: sortedObs[i] });
    }
    const lastIdx = sortedObs.length - 1;
    if (ticks[ticks.length - 1]?.idx !== lastIdx) {
      ticks.push({ idx: lastIdx, obs: sortedObs[lastIdx] });
    }
    return ticks;
  }, [sortedObs]);

  // Compute Y-scale (meters)
  const yScale = useMemo(() => {
    if (minLevel === null || maxLevel === null) {
      return {
        min: 0,
        max: 3,
        getY: () => plotHeight / 2,
        ticks: [0, 1, 2, 3],
      };
    }

    const range = maxLevel - minLevel;
    const padding = Math.max(0.3, range * 0.15);
    const yMin = Math.max(0, +(minLevel - padding).toFixed(1));
    const yMax = +(maxLevel + padding).toFixed(1);
    const span = yMax - yMin || 1;

    const getY = (val: number | null): number => {
      if (val === null || isNaN(val)) return margin.top + plotHeight;
      const clamped = Math.min(yMax, Math.max(yMin, val));
      const ratio = (clamped - yMin) / span;
      return margin.top + plotHeight - ratio * plotHeight;
    };

    // 4 evenly spaced Y ticks
    const step = span / 4;
    const ticks: number[] = [];
    for (let i = 0; i <= 4; i++) {
      ticks.push(+(yMin + i * step).toFixed(2));
    }

    return { min: yMin, max: yMax, getY, ticks };
  }, [minLevel, maxLevel, plotHeight, margin.top]);

  // Coordinate mapper for X
  const getX = (index: number) => {
    if (sortedObs.length <= 1) return margin.left + plotWidth / 2;
    return margin.left + (index / (sortedObs.length - 1)) * plotWidth;
  };

  // Generate SVG path segments (respecting null gaps)
  const pathSegments = useMemo(() => {
    const segments: { dLine: string; dArea: string }[] = [];
    let currentLine = '';
    let currentAreaStart = '';
    let lastValidX = 0;
    let inSegment = false;
    const baselineY = margin.top + plotHeight;

    sortedObs.forEach((obs, idx) => {
      const val = obs.tide_level_m;
      if (val !== null && typeof val === 'number' && !isNaN(val)) {
        const x = getX(idx);
        const y = yScale.getY(val);

        if (!inSegment) {
          currentLine = `M ${x.toFixed(1)} ${y.toFixed(1)}`;
          currentAreaStart = `M ${x.toFixed(1)} ${baselineY.toFixed(1)} L ${x.toFixed(1)} ${y.toFixed(1)}`;
          inSegment = true;
        } else {
          currentLine += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
          currentAreaStart += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
        }
        lastValidX = x;
      } else {
        if (inSegment) {
          const dArea = `${currentAreaStart} L ${lastValidX.toFixed(1)} ${baselineY.toFixed(1)} Z`;
          segments.push({ dLine: currentLine, dArea });
          currentLine = '';
          currentAreaStart = '';
          inSegment = false;
        }
      }
    });

    if (inSegment) {
      const dArea = `${currentAreaStart} L ${lastValidX.toFixed(1)} ${baselineY.toFixed(1)} Z`;
      segments.push({ dLine: currentLine, dArea });
    }

    return segments;
  }, [sortedObs, yScale, margin.top, plotHeight]);

  // Active hovered observation details
  const activeObs = hoveredIndex !== null && sortedObs[hoveredIndex] ? sortedObs[hoveredIndex] : null;

  if (loading) {
    return (
      <div className="ocean-chart-card loading" data-testid="tide-chart-loading">
        <div className="ocean-chart-header">
          <div className="ocean-chart-title">
            <Waves size={16} className="ocean-chart-icon" style={{ color: '#0284c7' }} />
            <span>Tide Temporal Analysis — {harborName}</span>
          </div>
        </div>
        <div className="ocean-chart-empty">
          <Activity size={24} className="researcher-spinner" />
          <span>Loading tide observations…</span>
        </div>
      </div>
    );
  }

  if (sortedObs.length === 0 || validCount === 0) {
    return (
      <div className="ocean-chart-card empty" data-testid="tide-chart-empty">
        <div className="ocean-chart-header">
          <div className="ocean-chart-title">
            <Waves size={16} className="ocean-chart-icon" style={{ color: '#0284c7' }} />
            <span>Tide Temporal Analysis — {harborName}</span>
          </div>
        </div>
        <div className="ocean-chart-empty">
          <AlertTriangle size={24} style={{ color: '#f59e0b' }} />
          <span>No tide observations available for {harborName}.</span>
          <p className="ocean-chart-caption" style={{ marginTop: 6 }}>
            The synthetic marine snapshot does not contain recorded tide gauge or model levels for this selection.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="ocean-chart-card" data-testid="tide-temporal-chart">
      {/* Header */}
      <div className="ocean-chart-header">
        <div className="ocean-chart-title">
          <Waves size={16} className="ocean-chart-icon" style={{ color: '#0284c7' }} />
          <span>Tide Temporal Analysis — {harborName}</span>
          <span className="ocean-chart-badge">48-Hour Snapshot</span>
        </div>
        <div className="ocean-chart-meta">
          <Calendar size={13} />
          <span>Datum: {datum} (Chart Datum)</span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="tide-kpi-grid">
        <div className="tide-kpi-card">
          <span className="tide-kpi-label">Latest Tide Level</span>
          <div className="tide-kpi-value-row">
            <span className="tide-kpi-value">
              {latestObs?.tide_level_m !== null && latestObs?.tide_level_m !== undefined
                ? latestObs.tide_level_m.toFixed(2)
                : '—'}
              <small> m</small>
            </span>
            {latestObs?.tide_phase && (
              <span
                className="tide-phase-pill"
                style={{
                  background: (PHASE_COLORS[latestObs.tide_phase] || DEFAULT_PHASE).bg,
                  color: (PHASE_COLORS[latestObs.tide_phase] || DEFAULT_PHASE).text,
                }}
              >
                {latestObs.tide_phase === 'FLOOD' && <ArrowUpRight size={12} />}
                {latestObs.tide_phase === 'EBB' && <ArrowDownRight size={12} />}
                {latestObs.tide_phase}
              </span>
            )}
          </div>
          <span className="tide-kpi-sub">
            {latestObs ? formatUtcTimestamp(latestObs.observation_time) : '—'}
          </span>
        </div>

        <div className="tide-kpi-card">
          <span className="tide-kpi-label">Tidal Range (48h)</span>
          <div className="tide-kpi-value-row">
            <span className="tide-kpi-value">
              {tidalRange !== null ? `${tidalRange.toFixed(2)}` : '—'}
              <small> m</small>
            </span>
          </div>
          <span className="tide-kpi-sub">
            Min: {minLevel?.toFixed(2) ?? '—'} m · Max: {maxLevel?.toFixed(2) ?? '—'} m
          </span>
        </div>

        <div className="tide-kpi-card">
          <span className="tide-kpi-label">Observation Coverage</span>
          <div className="tide-kpi-value-row">
            <span className="tide-kpi-value">
              {validCount} / {totalCount}
              <small> valid</small>
            </span>
          </div>
          <span className="tide-kpi-sub">
            {totalCount > 0 ? `${Math.round((validCount / totalCount) * 100)}% complete` : '—'}
          </span>
        </div>

        <div className="tide-kpi-card">
          <span className="tide-kpi-label">Tidal Flow Breakdown</span>
          <div className="tide-kpi-phase-breakdown">
            {Object.entries(phaseBreakdown).map(([phase, count]) => {
              const style = PHASE_COLORS[phase] || DEFAULT_PHASE;
              return (
                <span
                  key={phase}
                  className="tide-mini-phase-badge"
                  style={{ background: style.bg, color: style.text }}
                >
                  {phase}: {count}
                </span>
              );
            })}
          </div>
          <span className="tide-kpi-sub">Reference Datum: {datum}</span>
        </div>
      </div>

      {/* SVG Time Series Curve */}
      <div className="ocean-svg-wrap">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="ocean-svg-element"
          onMouseLeave={() => setHoveredIndex(null)}
          role="img"
          aria-label={`48-hour tide level time-series chart for ${harborName}`}
        >
          <defs>
            <linearGradient id="tideAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0284c7" stopOpacity="0.32" />
              <stop offset="85%" stopColor="#0284c7" stopOpacity="0.04" />
              <stop offset="100%" stopColor="#0284c7" stopOpacity="0.00" />
            </linearGradient>
            <linearGradient id="tideLineGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#0284c7" />
              <stop offset="100%" stopColor="#38bdf8" />
            </linearGradient>
          </defs>

          {/* Plot Background */}
          <rect
            x={margin.left}
            y={margin.top}
            width={plotWidth}
            height={plotHeight}
            fill="var(--color-bg-secondary, #0f172a)"
            rx="4"
            opacity="0.4"
          />

          {/* Horizontal Gridlines & Y-Axis Labels */}
          {yScale.ticks.map((tickVal) => {
            const y = yScale.getY(tickVal);
            return (
              <g key={tickVal} className="ocean-y-grid-group">
                <line
                  x1={margin.left}
                  y1={y}
                  x2={margin.left + plotWidth}
                  y2={y}
                  stroke="var(--color-border, #334155)"
                  strokeDasharray="3 3"
                  strokeWidth="1"
                  opacity="0.4"
                />
                <text
                  x={margin.left - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="ocean-axis-label"
                  fill="var(--color-text-dim, #94a3b8)"
                  fontSize="10"
                  fontFamily="monospace"
                >
                  {tickVal.toFixed(2)}
                </text>
              </g>
            );
          })}

          {/* Y-Axis Title */}
          <text
            x={-(margin.top + plotHeight / 2)}
            y={16}
            transform="rotate(-90)"
            textAnchor="middle"
            className="ocean-axis-title"
            fill="var(--color-text-muted, #cbd5e1)"
            fontSize="11"
            fontWeight="600"
          >
            Tide Level (m above {datum})
          </text>

          {/* Area Fill */}
          {pathSegments.map((seg, i) => (
            <path
              key={`area-${i}`}
              d={seg.dArea}
              fill="url(#tideAreaGrad)"
            />
          ))}

          {/* Line Stroke */}
          {pathSegments.map((seg, i) => (
            <path
              key={`line-${i}`}
              d={seg.dLine}
              fill="none"
              stroke="url(#tideLineGrad)"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

          {/* Observation Nodes & Phase Indicators */}
          {sortedObs.map((obs, idx) => {
            if (obs.tide_level_m === null || typeof obs.tide_level_m !== 'number' || isNaN(obs.tide_level_m)) {
              return null;
            }
            const x = getX(idx);
            const y = yScale.getY(obs.tide_level_m);
            const isHovered = hoveredIndex === idx;
            const phaseStyle = PHASE_COLORS[obs.tide_phase || ''] || DEFAULT_PHASE;
            const isDegraded = obs.qc_status && obs.qc_status !== 'VALID';

            return (
              <g key={obs.public_id || idx} className="ocean-node-group">
                {isHovered && (
                  <circle
                    cx={x}
                    cy={y}
                    r={7}
                    fill="none"
                    stroke={phaseStyle.dot}
                    strokeWidth="2"
                    opacity="0.6"
                  />
                )}
                <circle
                  cx={x}
                  cy={y}
                  r={isHovered ? 4.5 : 3.0}
                  fill={phaseStyle.dot}
                  stroke={isDegraded ? '#ef4444' : '#ffffff'}
                  strokeWidth={isDegraded ? 1.8 : 1.0}
                />
              </g>
            );
          })}

          {/* Hover Crosshair */}
          {hoveredIndex !== null && (
            <line
              x1={getX(hoveredIndex)}
              y1={margin.top}
              x2={getX(hoveredIndex)}
              y2={margin.top + plotHeight}
              stroke="#0ea5e9"
              strokeDasharray="3 3"
              strokeWidth="1.2"
              opacity="0.8"
            />
          )}

          {/* X-Axis Ticks & Labels */}
          {xTicks.map((t) => {
            const x = getX(t.idx);
            const yBottom = margin.top + plotHeight;
            return (
              <g key={`xtick-${t.idx}`} className="ocean-x-tick-group">
                <line
                  x1={x}
                  y1={yBottom}
                  x2={x}
                  y2={yBottom + 5}
                  stroke="var(--color-border, #334155)"
                  strokeWidth="1"
                />
                <text
                  x={x}
                  y={yBottom + 18}
                  textAnchor="middle"
                  className="ocean-axis-label"
                  fill="var(--color-text-dim, #94a3b8)"
                  fontSize="10"
                  fontFamily="monospace"
                >
                  {formatShortTick(t.obs.observation_time)}
                </text>
              </g>
            );
          })}

          {/* Invisible Interactive Overlay for Hover Detection */}
          {sortedObs.map((obs, idx) => {
            const segWidth = plotWidth / (sortedObs.length || 1);
            const xLeft = getX(idx) - segWidth / 2;
            return (
              <rect
                key={`hover-rect-${obs.public_id || idx}`}
                x={Math.max(margin.left, xLeft)}
                y={margin.top}
                width={segWidth}
                height={plotHeight}
                fill="transparent"
                style={{ cursor: 'crosshair' }}
                onMouseEnter={() => setHoveredIndex(idx)}
              />
            );
          })}
        </svg>
      </div>

      {/* Floating / Interactive Tooltip Summary */}
      {activeObs && (
        <div className="tide-tooltip-box" data-testid="tide-tooltip">
          <div className="tide-tooltip-row">
            <span className="tide-tooltip-time">
              {formatUtcTimestamp(activeObs.observation_time)}
            </span>
            <span
              className={`ocean-tooltip-qc ${
                activeObs.qc_status === 'VALID' || !activeObs.qc_status ? 'valid' : 'suspect'
              }`}
            >
              {activeObs.qc_status || 'VALID'}
            </span>
          </div>
          <div className="tide-tooltip-metrics">
            <div className="tide-tooltip-metric">
              <span className="tide-tooltip-metric-label">Tide Level:</span>
              <span className="tide-tooltip-metric-value">
                {activeObs.tide_level_m !== null && activeObs.tide_level_m !== undefined
                  ? `${activeObs.tide_level_m.toFixed(2)} m (${datum})`
                  : 'Missing / No Data'}
              </span>
            </div>
            <div className="tide-tooltip-metric">
              <span className="tide-tooltip-metric-label">Tidal Phase:</span>
              <span
                className="tide-tooltip-phase-badge"
                style={{
                  background: (PHASE_COLORS[activeObs.tide_phase || ''] || DEFAULT_PHASE).bg,
                  color: (PHASE_COLORS[activeObs.tide_phase || ''] || DEFAULT_PHASE).text,
                }}
              >
                {activeObs.tide_phase || 'UNKNOWN'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Phase Legend & Scientific Semantics Note */}
      <div className="tide-chart-footer">
        <div className="tide-phase-legend">
          <span className="tide-legend-title">Categorical Phase Legend:</span>
          {Object.entries(PHASE_COLORS).map(([key, item]) => (
            <div key={key} className="tide-legend-item">
              <span className="tide-legend-dot" style={{ background: item.dot }} />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
        <p className="ocean-chart-caption">
          <Info size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: -1 }} />
          Tide level and phase from the synthetic marine observation snapshot. Values reflect the source observation records; no astronomical tide forecast is generated.
        </p>
      </div>
    </div>
  );
}
