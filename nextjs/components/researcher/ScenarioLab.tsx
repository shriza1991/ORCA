import { useState, useEffect, useMemo } from 'react';
import {
  FlaskConical,
  Play,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ChevronRight,
  BarChart3,
  RotateCcw,
  CheckSquare,
  Square,
} from 'lucide-react';
import {
  fetchScenarios,
  runScenario,
  type ScenarioMeta,
  type ScenarioRunResult,
} from '../../api/researcher-client';
import ScenarioComparisonView from './ScenarioComparisonView';

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

export default function ScenarioLab() {
  const [scenarios, setScenarios] = useState<ScenarioMeta[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedCompareIds, setSelectedCompareIds] = useState<string[]>([]);
  const [results, setResults] = useState<Record<string, ScenarioRunResult>>({});
  const [runningIds, setRunningIds] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'single' | 'compare'>('single');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadScenarios();
  }, []);

  async function loadScenarios() {
    setLoading(true);
    try {
      const s = await fetchScenarios();
      setScenarios(s);
      if (s.length > 0 && !selectedId) {
        setSelectedId(s[0].id);
        // Default comparison pre-selects first 2 scenarios
        if (s.length >= 2) {
          setSelectedCompareIds([s[0].id, s[1].id]);
        }
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleRun(scenarioId: string) {
    setRunningIds((prev) => [...prev, scenarioId]);
    try {
      const result = await runScenario(scenarioId);
      setResults((prev) => ({ ...prev, [scenarioId]: result }));
    } finally {
      setRunningIds((prev) => prev.filter((id) => id !== scenarioId));
    }
  }

  async function handleRunSelected() {
    const toRun = selectedCompareIds.length > 0 ? selectedCompareIds : scenarios.map((s) => s.id);
    for (const id of toRun) {
      setRunningIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
      try {
        const result = await runScenario(id);
        setResults((prev) => ({ ...prev, [id]: result }));
      } catch {
        /* continue */
      } finally {
        setRunningIds((prev) => prev.filter((runningId) => runningId !== id));
      }
    }
  }

  async function handleRunAll() {
    for (const s of scenarios) {
      setRunningIds((prev) => (prev.includes(s.id) ? prev : [...prev, s.id]));
      setSelectedId(s.id);
      try {
        const result = await runScenario(s.id);
        setResults((prev) => ({ ...prev, [s.id]: result }));
      } catch {
        /* continue */
      } finally {
        setRunningIds((prev) => prev.filter((id) => id !== s.id));
      }
    }
  }

  function handleToggleCompare(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setSelectedCompareIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      }
      if (prev.length >= 4) {
        return prev; // Max 4 scenarios
      }
      const updated = [...prev, id];
      if (updated.length >= 2) {
        setActiveTab('compare');
      }
      return updated;
    });
  }

  function handleClearComparison() {
    setSelectedCompareIds([]);
    setActiveTab('single');
  }

  const selected = scenarios.find((s) => s.id === selectedId);
  const selectedResult = selectedId ? results[selectedId] : undefined;
  const isSelectedRunning = selectedId ? runningIds.includes(selectedId) : false;

  const compareScenarios = useMemo(() => {
    return scenarios.filter((s) => selectedCompareIds.includes(s.id));
  }, [scenarios, selectedCompareIds]);

  if (loading) {
    return (
      <div className="researcher-loading" data-testid="scenario-lab-loading">
        <Loader2 size={20} className="researcher-spinner" />
        <span>Loading scenarios…</span>
      </div>
    );
  }

  return (
    <div className="researcher-scenario-lab" data-testid="scenario-lab">
      {/* Scenario List Panel */}
      <div className="researcher-scenario-list-panel">
        <div className="researcher-scenario-list-header">
          <div>
            <h3>
              <FlaskConical size={14} /> Evaluation Suite (S1–S8)
            </h3>
            <span className="researcher-compare-counter">
              Compare: {selectedCompareIds.length}/4 selected
            </span>
          </div>
          <button
            className="researcher-run-all-btn"
            onClick={handleRunAll}
            disabled={runningIds.length > 0}
            data-testid="run-all-scenarios-btn"
          >
            <Play size={12} />
            Run All
          </button>
        </div>

        <div className="researcher-scenario-cards">
          {scenarios.map((s) => {
            const isChecked = selectedCompareIds.includes(s.id);
            const isRunning = runningIds.includes(s.id);
            return (
              <div
                key={s.id}
                className={`researcher-scenario-card ${selectedId === s.id && activeTab === 'single' ? 'active' : ''} ${
                  results[s.id] ? 'has-result' : ''
                }`}
                onClick={() => {
                  setSelectedId(s.id);
                  setActiveTab('single');
                }}
                role="button"
                tabIndex={0}
                data-testid={`scenario-list-card-${s.id}`}
              >
                {/* Compare Checkbox */}
                <button
                  type="button"
                  className={`scenario-checkbox-btn ${isChecked ? 'checked' : ''}`}
                  onClick={(e) => handleToggleCompare(s.id, e)}
                  title={isChecked ? `Remove ${s.id} from comparison` : `Add ${s.id} to comparison (max 4)`}
                  aria-label={`Toggle ${s.id} in comparison`}
                  data-testid={`scenario-checkbox-${s.id}`}
                >
                  {isChecked ? (
                    <CheckSquare size={14} style={{ color: '#10b981' }} />
                  ) : (
                    <Square size={14} style={{ color: 'var(--color-text-dim)' }} />
                  )}
                </button>

                <div className="researcher-scenario-card-top">
                  <span className="researcher-scenario-id">{s.id}</span>
                  <span className="researcher-scenario-name">{s.name}</span>
                  {results[s.id] && <StatusBadge status={results[s.id]?.recommendation_status} />}
                  {isRunning && <Loader2 size={12} className="researcher-spinner" />}
                </div>
                <ChevronRight size={14} className="researcher-scenario-chevron" />
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail & Results Panel / Comparison View */}
      <div className="researcher-scenario-detail-panel">
        {/* View Mode Navigation Tabs */}
        <div className="scenario-lab-tabs-bar">
          <div className="scenario-view-mode-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'single'}
              className={`scenario-view-tab ${activeTab === 'single' ? 'active' : ''}`}
              onClick={() => setActiveTab('single')}
              data-testid="tab-single-inspector"
            >
              <FlaskConical size={13} />
              <span>Single Inspection</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'compare'}
              className={`scenario-view-tab ${activeTab === 'compare' ? 'active' : ''}`}
              onClick={() => setActiveTab('compare')}
              disabled={selectedCompareIds.length === 0}
              data-testid="tab-scenario-comparison"
            >
              <BarChart3 size={13} />
              <span>Scenario Comparison ({selectedCompareIds.length})</span>
            </button>
          </div>

          {selectedCompareIds.length > 0 && activeTab === 'compare' && (
            <button
              type="button"
              className="scenario-quick-reset"
              onClick={handleClearComparison}
            >
              <RotateCcw size={11} /> Clear Comparison
            </button>
          )}
        </div>

        {activeTab === 'compare' && compareScenarios.length > 0 ? (
          <ScenarioComparisonView
            selectedScenarios={compareScenarios}
            results={results}
            runningIds={runningIds}
            onRunScenario={handleRun}
            onRunAllSelected={handleRunSelected}
            onClearComparison={handleClearComparison}
          />
        ) : selected ? (
          <>
            <div className="researcher-scenario-detail-header">
              <div>
                <h3>
                  {selected.id}: {selected.name}
                </h3>
                <p className="researcher-scenario-desc">{selected.description}</p>
              </div>
              <button
                className="researcher-run-btn"
                onClick={() => handleRun(selected.id)}
                disabled={runningIds.length > 0}
                data-testid="run-single-scenario-btn"
              >
                {isSelectedRunning ? (
                  <>
                    <Loader2 size={14} className="researcher-spinner" /> Executing…
                  </>
                ) : (
                  <>
                    <Play size={14} /> Run Scenario
                  </>
                )}
              </button>
            </div>

            {/* Scenario Input */}
            <div className="researcher-scenario-input">
              <span className="researcher-input-label">Query Input</span>
              <div className="researcher-scenario-query">{selected.query}</div>
              <div className="researcher-scenario-meta-row">
                <span>
                  Intent: <strong>{selected.intent}</strong>
                </span>
                <span>
                  Expected: <StatusBadge status={selected.expected_status} />
                </span>
                {selected.harbor && (
                  <span>
                    Harbor: <strong>{selected.harbor}</strong>
                  </span>
                )}
              </div>
            </div>

            {/* Results */}
            {selectedResult && (
              <div className="researcher-scenario-results">
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <h4 className="researcher-results-title">
                    <BarChart3 size={14} />
                    Execution Results
                  </h4>
                  {selectedResult.passed !== undefined && (
                    <span
                      className={`researcher-verdict-badge ${
                        selectedResult.passed ? 'pass' : 'fail'
                      }`}
                    >
                      {selectedResult.passed ? 'PASS' : 'FAIL'}
                    </span>
                  )}
                </div>

                {selectedResult.is_error ? (
                  <div className="researcher-scenario-error-card">
                    <div className="researcher-scenario-error-header">
                      <AlertTriangle size={18} />
                      <div>
                        <strong>Scenario Execution Unavailable</strong>
                        <p>{selectedResult.answer}</p>
                      </div>
                    </div>
                    {selectedResult.warnings.length > 0 && (
                      <div className="researcher-result-warnings">
                        <span className="researcher-input-label">Error Details</span>
                        {selectedResult.warnings.map((w, i) => (
                          <div key={i} className="researcher-warning-item">
                            <AlertTriangle size={12} /> {w}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {/* KPI Row */}
                    <div className="researcher-result-kpis">
                      <div className="researcher-result-kpi">
                        <span className="researcher-kpi-label">Status</span>
                        <StatusBadge status={selectedResult?.recommendation_status} />
                      </div>
                      <div className="researcher-result-kpi">
                        <span className="researcher-kpi-label">Confidence</span>
                        <span className="researcher-kpi-value">
                          {selectedResult?.confidence_level || 'UNKNOWN'}
                        </span>
                      </div>
                      <div className="researcher-result-kpi">
                        <span className="researcher-kpi-label">Evidence</span>
                        <span className="researcher-kpi-value">
                          {selectedResult?.evidence_count ?? 0} items
                        </span>
                      </div>
                      <div className="researcher-result-kpi">
                        <span className="researcher-kpi-label">Trace</span>
                        <span className="researcher-kpi-value">
                          {selectedResult?.trace_steps ?? 0} steps
                        </span>
                      </div>
                      <div className="researcher-result-kpi">
                        <span className="researcher-kpi-label">Latency</span>
                        <span className="researcher-kpi-value">
                          {selectedResult?.execution_time_ms ?? 0}ms
                        </span>
                      </div>
                    </div>

                    {/* Answer */}
                    <div className="researcher-result-answer">
                      <span className="researcher-input-label">Response</span>
                      <p>
                        {selectedResult?.answer ||
                          'Evaluation completed successfully.'}
                      </p>
                    </div>

                    {/* Executed Tools */}
                    {selectedResult.executed_tools &&
                      selectedResult.executed_tools.length > 0 && (
                        <div className="researcher-result-tools">
                          <span className="researcher-input-label">
                            Executed Tools ({selectedResult.executed_tools.length})
                          </span>
                          <div className="researcher-tools-list">
                            {selectedResult.executed_tools.map((tool, i) => (
                              <span key={i} className="researcher-tool-tag">
                                {tool}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                    {/* Decisive Factors */}
                    {selectedResult.decisive_factors &&
                      selectedResult.decisive_factors.length > 0 && (
                        <div className="researcher-result-factors">
                          <span className="researcher-input-label">
                            Decisive Factors / Validation
                          </span>
                          <ul>
                            {selectedResult.decisive_factors.map((f, i) => (
                              <li key={i}>
                                <CheckCircle2 size={12} /> {f}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                    {/* Warnings */}
                    {(selectedResult?.warnings || []).length > 0 && (
                      <div className="researcher-result-warnings">
                        <span className="researcher-input-label">Warnings</span>
                        {(selectedResult?.warnings || []).map((w, i) => (
                          <div key={i} className="researcher-warning-item">
                            <AlertTriangle size={12} /> {w}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {!selectedResult && !isSelectedRunning && (
              <div className="researcher-empty-results">
                <FlaskConical size={24} />
                <p>
                  Click <strong>Run Scenario</strong> to execute this evaluation
                  through the SAMUDRA pipeline.
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="researcher-empty-results">
            <FlaskConical size={24} />
            <p>Select a scenario to view details and run evaluations.</p>
          </div>
        )}
      </div>
    </div>
  );
}
