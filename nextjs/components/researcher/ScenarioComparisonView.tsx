import { useState } from 'react';
import {
  BarChart3,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  Loader2,
  X,
  Layers,
  Clock,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { ScenarioMeta, ScenarioRunResult } from '../../api/researcher-client';

export interface ScenarioComparisonViewProps {
  selectedScenarios: ScenarioMeta[];
  results: Record<string, ScenarioRunResult>;
  runningIds: string[];
  onRunScenario: (scenarioId: string) => Promise<void>;
  onRunAllSelected: () => Promise<void>;
  onClearComparison: () => void;
}

function StatusBadge({ status }: { status?: string }) {
  const safeStatus = status || 'UNKNOWN';
  const cls =
    safeStatus === 'GO'
      ? 'go'
      : safeStatus === 'NO_GO'
      ? 'no-go'
      : safeStatus === 'CAUTION'
      ? 'caution'
      : 'unknown';
  return (
    <span className={`researcher-status-badge ${cls}`}>
      {safeStatus.replace('_', ' ')}
    </span>
  );
}

function OutcomeBadge({ result, isRunning }: { result?: ScenarioRunResult; isRunning?: boolean }) {
  if (isRunning) {
    return (
      <span className="researcher-verdict-badge running">
        <Loader2 size={10} className="researcher-spinner" /> RUNNING
      </span>
    );
  }
  if (!result) {
    return <span className="researcher-verdict-badge idle">NOT RUN</span>;
  }
  if (result.is_error) {
    return (
      <span className="researcher-verdict-badge error">
        <AlertTriangle size={10} /> ERROR
      </span>
    );
  }
  if (result.passed === true) {
    return (
      <span className="researcher-verdict-badge pass">
        <CheckCircle2 size={10} /> PASS
      </span>
    );
  }
  if (result.passed === false) {
    return (
      <span className="researcher-verdict-badge fail">
        <X size={10} /> FAIL
      </span>
    );
  }
  return <span className="researcher-verdict-badge completed">COMPLETED</span>;
}

export default function ScenarioComparisonView({
  selectedScenarios,
  results,
  runningIds,
  onRunScenario,
  onRunAllSelected,
  onClearComparison,
}: ScenarioComparisonViewProps) {
  const [expandedDetails, setExpandedDetails] = useState(true);

  const isAnyRunning = runningIds.length > 0;
  const executedCount = selectedScenarios.filter((s) => !!results[s.id]).length;

  return (
    <div className="scenario-comparison-view" data-testid="scenario-comparison-view">
      {/* Header & Batch Controls */}
      <div className="scenario-comparison-header">
        <div className="scenario-comparison-title-group">
          <div className="scenario-comparison-title">
            <BarChart3 size={16} style={{ color: '#10b981' }} />
            <span>Scenario Comparative Analysis ({selectedScenarios.length} Selected)</span>
          </div>
          <span className="scenario-comparison-sub">
            {executedCount} of {selectedScenarios.length} executed
          </span>
        </div>

        <div className="scenario-comparison-actions">
          <button
            type="button"
            className="researcher-run-all-btn"
            onClick={onRunAllSelected}
            disabled={isAnyRunning}
            data-testid="run-selected-scenarios-btn"
          >
            {isAnyRunning ? (
              <>
                <Loader2 size={12} className="researcher-spinner" /> Executing Selected…
              </>
            ) : (
              <>
                <Play size={12} /> Run Selected ({selectedScenarios.length})
              </>
            )}
          </button>
          <button
            type="button"
            className="scenario-clear-btn"
            onClick={onClearComparison}
            title="Reset scenario selection and comparison view"
            data-testid="clear-comparison-btn"
          >
            <RotateCcw size={12} /> Reset
          </button>
        </div>
      </div>

      {/* Comparison Matrix Table */}
      <div className="scenario-comparison-table-wrap">
        <table className="scenario-comparison-table" data-testid="scenario-comparison-table">
          <thead>
            <tr>
              <th className="dimension-col">Analytical Dimension</th>
              {selectedScenarios.map((s) => {
                const res = results[s.id];
                const isRunning = runningIds.includes(s.id);
                return (
                  <th key={s.id} className="scenario-col" data-testid={`comparison-col-${s.id}`}>
                    <div className="scenario-col-header">
                      <div className="scenario-col-top">
                        <span className="scenario-col-id">{s.id}</span>
                        <OutcomeBadge result={res} isRunning={isRunning} />
                      </div>
                      <span className="scenario-col-name">{s.name}</span>
                      <button
                        type="button"
                        className="scenario-col-rerun-btn"
                        onClick={() => onRunScenario(s.id)}
                        disabled={isRunning || isAnyRunning}
                        title={`Rerun scenario ${s.id}`}
                        data-testid={`rerun-scenario-btn-${s.id}`}
                      >
                        {isRunning ? <Loader2 size={10} className="researcher-spinner" /> : <Play size={10} />}
                        <span>Rerun</span>
                      </button>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {/* Row 1: Query Input */}
            <tr>
              <td className="dimension-label">Query Prompt</td>
              {selectedScenarios.map((s) => (
                <td key={s.id} className="scenario-cell mono-cell">
                  <div className="scenario-query-box">{s.query}</div>
                </td>
              ))}
            </tr>

            {/* Row 2: Expected vs Actual Intent */}
            <tr>
              <td className="dimension-label">Intent Classification</td>
              {selectedScenarios.map((s) => {
                const res = results[s.id];
                if (!res) {
                  return (
                    <td key={s.id} className="scenario-cell">
                      <span className="expected-intent">Expected: {s.intent}</span>
                      <span className="text-muted">—</span>
                    </td>
                  );
                }
                if (res.is_error) {
                  return (
                    <td key={s.id} className="scenario-cell error-cell">
                      <span className="expected-intent">Expected: {s.intent}</span>
                      <span className="actual-intent error">ERROR</span>
                    </td>
                  );
                }
                const actualIntent = res.actual_intent || res.status;
                const isMatch = actualIntent === s.intent;
                return (
                  <td key={s.id} className="scenario-cell">
                    <div className="intent-comparison-wrap">
                      <span className="expected-intent">Expected: {s.intent}</span>
                      <div className="actual-intent-row">
                        <span className="actual-intent-val">{actualIntent || 'UNKNOWN'}</span>
                        <span className={`intent-match-pill ${isMatch ? 'match' : 'mismatch'}`}>
                          {isMatch ? 'MATCH' : 'MISMATCH'}
                        </span>
                      </div>
                    </div>
                  </td>
                );
              })}
            </tr>

            {/* Row 3: Recommendation Status */}
            <tr>
              <td className="dimension-label">Recommendation Status</td>
              {selectedScenarios.map((s) => {
                const res = results[s.id];
                return (
                  <td key={s.id} className="scenario-cell">
                    <div className="status-comparison-wrap">
                      <div className="status-row">
                        <small>Expected:</small>
                        <StatusBadge status={s.expected_status} />
                      </div>
                      <div className="status-row">
                        <small>Actual:</small>
                        <StatusBadge status={res?.recommendation_status} />
                      </div>
                    </div>
                  </td>
                );
              })}
            </tr>

            {/* Row 4: Confidence Level */}
            <tr>
              <td className="dimension-label">Confidence Rating</td>
              {selectedScenarios.map((s) => {
                const res = results[s.id];
                const conf = res?.confidence_level || '—';
                const cls = conf === 'HIGH' ? 'high' : conf === 'MEDIUM' ? 'medium' : 'unknown';
                return (
                  <td key={s.id} className="scenario-cell">
                    {res ? (
                      <span className={`confidence-pill ${cls}`}>{conf}</span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                );
              })}
            </tr>

            {/* Row 5: Verified Evidence Items */}
            <tr>
              <td className="dimension-label">Verified Evidence Items</td>
              {selectedScenarios.map((s) => {
                const res = results[s.id];
                if (!res) return <td key={s.id} className="scenario-cell text-muted">—</td>;
                if (res.is_error) return <td key={s.id} className="scenario-cell error-cell">0 (Error)</td>;
                return (
                  <td key={s.id} className="scenario-cell">
                    <div className="evidence-summary-val">
                      <strong>{res.evidence_count ?? 0}</strong>
                      <span>items</span>
                      {res.evidence_grounded !== false && (
                        <span className="grounded-pill">Grounded</span>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>

            {/* Row 6: Executed Domain Tools */}
            <tr>
              <td className="dimension-label">Executed Domain Tools</td>
              {selectedScenarios.map((s) => {
                const res = results[s.id];
                if (!res) return <td key={s.id} className="scenario-cell text-muted">—</td>;
                const tools = res.executed_tools || [];
                if (tools.length === 0) {
                  return (
                    <td key={s.id} className="scenario-cell text-muted">
                      {res.is_error ? 'None (Execution Failed)' : 'No tools recorded'}
                    </td>
                  );
                }
                return (
                  <td key={s.id} className="scenario-cell">
                    <div className="scenario-tools-badges">
                      {tools.map((t, idx) => (
                        <span key={idx} className="scenario-tool-pill">
                          {t}
                        </span>
                      ))}
                    </div>
                  </td>
                );
              })}
            </tr>

            {/* Row 7: Execution Latency */}
            <tr>
              <td className="dimension-label">Execution Latency</td>
              {selectedScenarios.map((s) => {
                const res = results[s.id];
                if (!res) return <td key={s.id} className="scenario-cell text-muted">—</td>;
                const ms = res.execution_time_ms;
                const displayLatency = ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms} ms`;
                return (
                  <td key={s.id} className="scenario-cell mono-cell">
                    <div className="latency-val">
                      <Clock size={11} />
                      <span>{displayLatency}</span>
                    </div>
                  </td>
                );
              })}
            </tr>

            {/* Row 8: Trace Events */}
            <tr>
              <td className="dimension-label">Graph Trace Steps</td>
              {selectedScenarios.map((s) => {
                const res = results[s.id];
                if (!res) return <td key={s.id} className="scenario-cell text-muted">—</td>;
                return (
                  <td key={s.id} className="scenario-cell mono-cell">
                    {res.trace_steps ?? 0} steps
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Side-by-Side Detailed Inspection Cards */}
      <div className="scenario-details-section">
        <div
          className="scenario-details-toggle"
          onClick={() => setExpandedDetails(!expandedDetails)}
          role="button"
          tabIndex={0}
        >
          <div className="toggle-left">
            <Layers size={14} style={{ color: '#38bdf8' }} />
            <span>Side-by-Side Reasoning & Validation Details</span>
          </div>
          {expandedDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>

        {expandedDetails && (
          <div className="scenario-cards-side-by-side">
            {selectedScenarios.map((s) => {
              const res = results[s.id];
              return (
                <div key={s.id} className="scenario-detail-card" data-testid={`scenario-detail-card-${s.id}`}>
                  <div className="scenario-card-header">
                    <div className="scenario-card-title">
                      <span className="card-id">{s.id}</span>
                      <span className="card-name">{s.name}</span>
                    </div>
                    <OutcomeBadge result={res} isRunning={runningIds.includes(s.id)} />
                  </div>

                  {res ? (
                    res.is_error ? (
                      <div className="scenario-card-error">
                        <AlertTriangle size={16} />
                        <div>
                          <strong>Execution Failed</strong>
                          <p>{res.answer}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="scenario-card-body">
                        {/* Mariner Synthesis Answer */}
                        <div className="scenario-card-section">
                          <span className="section-label">Mariner Synthesis</span>
                          <p className="card-answer-text">{res.answer}</p>
                        </div>

                        {/* Decisive Factors */}
                        {res.decisive_factors && res.decisive_factors.length > 0 && (
                          <div className="scenario-card-section">
                            <span className="section-label">Decisive Factors</span>
                            <ul className="factors-list">
                              {res.decisive_factors.map((f, i) => (
                                <li key={i}>
                                  <CheckCircle2 size={11} className="factor-icon" />
                                  <span>{f}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Validation Notes */}
                        {res.validation_notes && res.validation_notes.length > 0 && (
                          <div className="scenario-card-section">
                            <span className="section-label">Validation Breakdown</span>
                            <ul className="validation-notes-list">
                              {res.validation_notes.map((vn, i) => (
                                <li key={i}>{vn}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Warnings */}
                        {res.warnings && res.warnings.length > 0 && (
                          <div className="scenario-card-section warnings">
                            <span className="section-label">Warnings</span>
                            <ul className="warnings-list">
                              {res.warnings.map((w, i) => (
                                <li key={i}>
                                  <AlertTriangle size={11} /> {w}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )
                  ) : (
                    <div className="scenario-card-empty">
                      <p>Not yet executed in this comparison session.</p>
                      <button
                        type="button"
                        className="card-run-btn"
                        onClick={() => onRunScenario(s.id)}
                        disabled={runningIds.includes(s.id) || isAnyRunning}
                      >
                        <Play size={11} /> Run {s.id}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Synthetic Disclosure Caption */}
      <div className="scenario-comparison-footer-caption">
        <span>
          Scenario Benchmark Runner (S1–S8) · Deterministic ORCA Graph Execution · Results evaluated on synthetic marine snapshot context.
        </span>
      </div>
    </div>
  );
}
