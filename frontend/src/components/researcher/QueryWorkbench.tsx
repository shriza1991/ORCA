import { useState, useRef, useEffect } from 'react';
import {
  Send,
  Bot,
  User,
  FileText,
  Layers,
  Lightbulb,
  Loader2,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  MapPin,
  Clock,
  Shield,
  ShieldAlert,
  Database,
  ChevronDown,
  ChevronUp,
  Sparkles,
  HelpCircle,
  Compass,
  Fish,
  Waves,
  Eye,
} from 'lucide-react';
import { useChat, type ChatMessage } from '../../hooks/useChat';
import DeckGLMapFoundation from '../map/DeckGLMapFoundation';
import { GeoJsonLayer } from '@deck.gl/layers';
import type { MapLayer, AgentTraceItem } from '../../types/contracts';
import { CANONICAL_DATA_MODE_LABEL, CANONICAL_DATA_MODE_TOOLTIP } from '../../api/researcher-client';
import { useTranslation } from "react-i18next";
import AgentCollaborationPanel from '../collaboration/AgentCollaborationPanel';

function parseHexOrRgb(colorStr?: string, defaultAlpha = 200): [number, number, number, number] {
  if (!colorStr) return [56, 189, 248, defaultAlpha];
  if (colorStr.startsWith('#')) {
    const hex = colorStr.replace('#', '');
    if (hex.length === 6) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
        defaultAlpha,
      ];
    }
  }
  return [56, 189, 248, defaultAlpha];
}

function QueryResponseDeckGLMap({ layers }: { layers: MapLayer[] }) {
  const deckLayers = (layers || []).map((l, idx) => {
    const color = parseHexOrRgb(l.style?.color, 230);
    const fillColor = parseHexOrRgb(l.style?.color, Math.round((l.style?.opacity ?? 0.25) * 255));
    return new GeoJsonLayer({
      id: `query-response-layer-${l.layer_id || idx}`,
      data: l.geojson as any,
      pickable: true,
      stroked: true,
      filled: true,
      lineWidthMinPixels: l.style?.line_width ?? 2,
      pointRadiusMinPixels: l.style?.circle_radius ?? 6,
      getLineColor: color,
      getFillColor: fillColor,
      getLineWidth: l.style?.line_width ?? 2,
    });
  });

  return (
    <div style={{ position: 'relative', width: '100%', height: '320px', borderRadius: '6px', overflow: 'hidden' }}>
      <DeckGLMapFoundation
        layers={deckLayers}
        initialCenter={[73.28, 16.99]}
        initialZoom={7.8}
        showCameraPresets={true}
      />
    </div>
  );
}

export const RESEARCH_PROMPTS = [
  {
    category: 'Marine State',
    icon: Waves,
    label: 'Ocean Conditions',
    query: 'Summarize current marine conditions and wave forecast near Ratnagiri.',
  },
  {
    category: 'Safety & Directives',
    icon: Compass,
    label: 'Departure Safety',
    query: 'Is it safe to depart from Ratnagiri today? Evaluate decisive risk factors.',
  },
  {
    category: 'Fisheries',
    icon: Fish,
    label: 'PFZ Thermal Gradient',
    query: 'Where is the nearest Potential Fishing Zone and what is the observed SST gradient?',
  },
  {
    category: 'Advisories',
    icon: AlertTriangle,
    label: 'Active Hazards',
    query: 'List all active hazard bulletins and squall advisories affecting the Konkan coast.',
  },
  {
    category: 'Evidence & Trust',
    icon: Shield,
    label: 'Evidence Grounding',
    query: 'Explain the strongest observation evidence and quality flags behind the recommendation.',
  },
  {
    category: 'Uncertainty',
    icon: HelpCircle,
    label: 'Data Gaps & Uncertainty',
    query: 'What marine observations are currently degraded, missing, or have high uncertainty?',
  },
  {
    category: 'Spatial Context',
    icon: MapPin,
    label: 'Spatial Vector Layers',
    query: 'Show the relevant spatial vector layers and maritime geofences for this area.',
  },
];

/** Helper to extract unique tool names executed in trace */
export function extractExecutedTools(trace?: AgentTraceItem[]): string[] {
  if (!trace || !Array.isArray(trace) || trace.length === 0) return [];
  const tools = new Set<string>();
  for (const step of trace) {
    if (step.tool_name) {
      tools.add(step.tool_name);
    } else if (step.node && step.node !== 'agent' && step.node !== 'supervisor' && step.node !== 'specialist_tools_node') {
      tools.add(step.node);
    }
  }
  return Array.from(tools);
}

/** Format timestamp for client interaction */
function formatInteractionTime(d?: Date): string {
  if (!d) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function QueryWorkbench() {
    const { t } = useTranslation();
  const chat = useChat();
  const [inputValue, setInputValue] = useState('');
  const [expandedEvidence, setExpandedEvidence] = useState<Record<string, boolean>>({});
  const [expandedTrace, setExpandedTrace] = useState<Record<string, boolean>>({});
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});
  const [expandedCollaboration, setExpandedCollaboration] = useState<Record<string, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom of conversation
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat.messages]);

  function handleSend() {
    const text = inputValue.trim();
    if (!text || chat.isLoading) return;
    setInputValue('');
    chat.send(text);
  }

  function handlePromptClick(query: string) {
    if (chat.isLoading) return;
    setInputValue('');
    chat.send(query);
  }

  function handleClear() {
    chat.clearChat();
    setExpandedEvidence({});
    setExpandedTrace({});
    setExpandedMap({});
    setExpandedCollaboration({});
    inputRef.current?.focus();
  }

  function toggleEvidence(msgId: string) {
    setExpandedEvidence(prev => ({ ...prev, [msgId]: !prev[msgId] }));
  }

  function toggleTrace(msgId: string) {
    setExpandedTrace(prev => ({ ...prev, [msgId]: !prev[msgId] }));
  }

  function toggleMap(msgId: string) {
    setExpandedMap(prev => ({ ...prev, [msgId]: prev[msgId] === undefined ? false : !prev[msgId] }));
  }

  function toggleCollaboration(msgId: string) {
    setExpandedCollaboration(prev => ({ ...prev, [msgId]: !prev[msgId] }));
  }

  return (
    <div className="researcher-query-workbench" data-testid="researcher-query-workbench">
      {/* Top Header Command Bar */}
      <div className="query-workbench-header">
        <div className="query-header-left">
          <div className="query-header-title-wrap">
            <span className="query-header-title">Analytical Query Workbench</span>
            <span className="query-session-count">
              {chat.messages.length > 0 ? `${Math.ceil(chat.messages.length / 2)} queries in session` : 'Idle session'}
            </span>
          </div>
          <div
            className="researcher-data-mode-badge"
            title={CANONICAL_DATA_MODE_TOOLTIP}
            aria-label={CANONICAL_DATA_MODE_LABEL}
          >
            <Database size={11} />
            <span>{CANONICAL_DATA_MODE_LABEL}</span>
          </div>
        </div>

        <div className="query-header-actions">
          {chat.messages.length > 0 && (
            <button
              className="query-reset-btn"
              onClick={handleClear}
              title="Clear conversation history and start fresh analysis"
              data-testid="query-clear-btn"
            >
              <RotateCcw size={13} />
              <span>New Analysis</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Conversation Stream */}
      <div className="researcher-messages-area">
        {chat.messages.length === 0 ? (
          <div className="researcher-welcome" data-testid="query-welcome-state">
            <div className="welcome-hero-icon-wrap">
              <Bot size={36} className="researcher-welcome-icon" />
              <Sparkles size={16} className="welcome-sparkle-icon" />
            </div>
            <h3>Marine Analytical Query Workbench</h3>
            <p>
              Directly query the deterministic ORCA reasoning engine and LangGraph specialist pipeline.
              Every answer is synthesized against verifiable marine observations, hazard bulletins,
              potential fishing zones, and safety thresholds with full inline evidence, reasoning trace,
              and spatial vector layers.
            </p>

            <div className="researcher-prompt-section">
              <div className="prompt-section-header">
                <Compass size={13} />
                <span>Structured Research Inquiries</span>
              </div>
              <div className="researcher-prompt-grid">
                {RESEARCH_PROMPTS.map(p => {
                  const Icon = p.icon;
                  return (
                    <button
                      key={p.label}
                      className="researcher-prompt-chip"
                      onClick={() => handlePromptClick(p.query)}
                      data-testid={`prompt-chip-${p.label.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      <div className="prompt-chip-top">
                        <Icon size={13} className="prompt-chip-icon" />
                        <span className="prompt-chip-category">{p.category}</span>
                      </div>
                      <span className="prompt-chip-label">{p.label}</span>
                      <span className="prompt-chip-query">{p.query}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="welcome-footer-notice">
              <Shield size={12} />
              <span>Analysis operates strictly on canonical synthetic demo snapshots. No live operational feeds.</span>
            </div>
          </div>
        ) : (
          <div className="researcher-message-list">
            {chat.messages.map((msg: ChatMessage) => {
              const isAssistant = msg.role === 'assistant';
              const resp = msg.response;
              const hasEvidence = resp?.evidence && resp.evidence.length > 0;
              const hasTrace = resp?.trace && resp.trace.length > 0;
              const hasLayers = resp?.map_layers && resp.map_layers.length > 0;
              const executedTools = extractExecutedTools(resp?.trace);
              const isEvidenceOpen = expandedEvidence[msg.id] ?? false;
              const isTraceOpen = expandedTrace[msg.id] ?? false;
              const isMapOpen = expandedMap[msg.id] ?? true; // Default open if layers exist
              const isCollaborationOpen = expandedCollaboration[msg.id] ?? false;
              const isUnknownConfidence = resp?.confidence?.level === 'UNKNOWN' || resp?.recommendation?.status === 'UNKNOWN';

              return (
                <div
                  key={msg.id}
                  className={`researcher-message ${msg.role} ${msg.error ? 'has-error' : ''}`}
                  data-testid={`chat-message-${msg.role}`}
                >
                  <div className="researcher-message-avatar">
                    {msg.role === 'user' ? <User size={15} /> : <Bot size={15} />}
                  </div>

                  <div className="researcher-message-content">
                    {/* Header line with role & timestamp */}
                    <div className="message-meta-header">
                      <span className="message-sender-name">
                        {msg.role === 'user' ? 'Marine Researcher' : 'SAMUDRA Reasoning Pipeline'}
                      </span>
                      <span className="message-timestamp">
                        <Clock size={11} />
                        {formatInteractionTime(msg.timestamp)}
                      </span>
                      {resp?.intent && (
                        <span className="message-intent-pill">
                          Intent: <strong>{resp.intent}</strong>
                        </span>
                      )}
                    </div>

                    {/* User Prompt Text */}
                    {!isAssistant && (
                      <div className="researcher-user-query-text">{msg.content}</div>
                    )}

                    {/* Loading State */}
                    {msg.isLoading && (
                      <div className="researcher-message-loading" data-testid="query-loading-state">
                        <Loader2 size={16} className="researcher-spinner" />
                        <div className="loading-text-wrap">
                          <span className="loading-main-text">Analyzing marine observations & executing specialist pipeline…</span>
                          <span className="loading-sub-text">Evaluating wave heights, weather bulletins, and deterministic safety bounds</span>
                        </div>
                      </div>
                    )}

                    {/* Explicit Error State */}
                    {msg.error && (
                      <div className="researcher-query-error-card" data-testid="query-error-card">
                        <div className="error-card-header">
                          <AlertTriangle size={16} className="error-icon" />
                          <strong>Analysis Execution Failed</strong>
                        </div>
                        <p className="error-card-msg">{msg.error}</p>
                        <div className="error-card-footer">
                          <span>The reasoning pipeline could not return a valid result. Check backend connection or try a different inquiry.</span>
                        </div>
                      </div>
                    )}

                    {/* Assistant Response Breakdown */}
                    {isAssistant && !msg.isLoading && !msg.error && resp && (
                      <div className="researcher-analytical-response">
                        {/* Analytical KPIs Strip */}
                        <div className="response-kpi-strip">
                          {/* Recommendation Verdict */}
                          {resp.recommendation && (
                            <div className={`kpi-badge rec-status-${resp.recommendation.status.toLowerCase().replace('_', '-')}`}>
                              <span className="kpi-label">Recommendation:</span>
                              <span className="kpi-val">{resp.recommendation.status.replace('_', ' ')}</span>
                            </div>
                          )}

                          {/* Confidence Rating */}
                          {resp.confidence && (
                            <div className={`kpi-badge confidence-${(resp.confidence.level || 'UNKNOWN').toLowerCase()}`}>
                              <span className="kpi-label">Confidence:</span>
                              <span className="kpi-val">{resp.confidence.level || 'UNKNOWN'}</span>
                            </div>
                          )}

                          {/* Decision Authority Badge */}
                          {resp.agent_collaboration && (
                            <div
                              className="kpi-badge collaboration-badge"
                              style={{
                                background: '#f0fdf4',
                                borderColor: '#86efac',
                                color: '#166534',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                              onClick={() => toggleCollaboration(msg.id)}
                              title="Inspect Multi-Agent Decision Authority & Reasoning"
                              data-testid="kpi-collaboration-badge"
                            >
                              <Shield size={12} />
                              <span>Decision Authority: {resp.agent_collaboration.arbitration?.winning_decision || resp.recommendation?.status} ({resp.agent_collaboration.agents.length} Agents)</span>
                            </div>
                          )}

                          {/* Evidence Count & Grounding */}
                          <div className="kpi-badge evidence-badge">
                            <FileText size={12} />
                            <span>{resp.evidence?.length ?? 0} Evidence Items</span>
                            <span className="grounded-tag">✓ Grounded</span>
                          </div>

                          {/* Map Layers Count */}
                          {hasLayers && (
                            <div className="kpi-badge map-layers-badge">
                              <Layers size={12} />
                              <span>{resp.map_layers.length} Spatial Layers</span>
                            </div>
                          )}
                        </div>

                        {/* Uncertainty or Degraded Warning Callout */}
                        {(isUnknownConfidence || (resp.warnings && resp.warnings.length > 0)) && (
                          <div className="researcher-uncertainty-callout" data-testid="query-uncertainty-callout">
                            <div className="uncertainty-header">
                              <ShieldAlert size={15} className="uncertainty-icon" />
                              <strong>Operational Uncertainty & Quality Notice</strong>
                            </div>
                            {resp.confidence?.reasons && resp.confidence.reasons.length > 0 && (
                              <div className="uncertainty-reasons">
                                {resp.confidence.reasons.map((r, i) => (
                                  <span key={i} className="uncertainty-reason-item">• {r}</span>
                                ))}
                              </div>
                            )}
                            {resp.warnings && resp.warnings.length > 0 && (
                              <div className="uncertainty-warnings">
                                {resp.warnings.map((w, i) => (
                                  <span key={i} className="warning-chip">⚠️ {w}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Executive Synthesis Answer */}
                        <div className="response-answer-block" data-testid="response-answer-text">
                          <p className="answer-text">{resp.answer}</p>
                        </div>

                        {/* Recommendation & Decisive Factors */}
                        {resp.recommendation && (
                          <div className={`response-recommendation-card status-${resp.recommendation.status.toLowerCase().replace('_', '-')}`}>
                            <div className="rec-card-header">
                              <div className="rec-badge-group">
                                <span className={`status-pill ${resp.recommendation.status.toLowerCase().replace('_', '-')}`}>
                                  {resp.recommendation.status}
                                </span>
                                <span className="rec-summary-title">{resp.recommendation.summary}</span>
                              </div>
                            </div>

                            {/* Direct Action Directive */}
                            {resp.recommendation.next_action && (
                              <div className="rec-directive">
                                <strong>Operational Directive:</strong>
                                <span>{resp.recommendation.next_action}</span>
                              </div>
                            )}

                            {/* Decisive Factors */}
                            {resp.recommendation.decisive_factors && resp.recommendation.decisive_factors.length > 0 && (
                              <div className="rec-factors-section">
                                <span className="factors-label">Decisive Drivers:</span>
                                <ul className="factors-list">
                                  {resp.recommendation.decisive_factors.map((f, i) => (
                                    <li key={i}>
                                      <CheckCircle2 size={12} className="factor-bullet-icon" />
                                      <span>{f}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {/* Non-Decisive Factors */}
                            {resp.recommendation.non_decisive_factors && resp.recommendation.non_decisive_factors.length > 0 && (
                              <div className="rec-non-decisive-section">
                                <span className="factors-label">Safe / Nominal Baseline Context:</span>
                                <ul className="factors-list nominal">
                                  {resp.recommendation.non_decisive_factors.map((f, i) => (
                                    <li key={i}>
                                      <span className="nominal-bullet">•</span>
                                      <span>{f}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {/* Structured Threshold Comparisons */}
                            {resp.recommendation.threshold_comparisons && resp.recommendation.threshold_comparisons.length > 0 && (
                              <div className="threshold-comparisons-table-wrap">
                                <span className="factors-label">Evaluated Threshold Safety Bounds:</span>
                                <table className="researcher-table researcher-table-compact">
                                  <thead>
                                    <tr>
                                      <th>Metric</th>
                                      <th>Observed</th>
                                      <th>Operator</th>
                                      <th>Safety Threshold</th>
                                      <th>Exceeded</th>
                                      <th>Impact</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {resp.recommendation.threshold_comparisons.map((tc, idx) => (
                                      <tr key={idx} className={tc.exceeded ? 'row-exceeded' : 'row-nominal'}>
                                        <td className="cell-metric">{tc.metric_name}</td>
                                        <td className="cell-val">{String(tc.observed_value)} {tc.unit || ''}</td>
                                        <td className="cell-operator">{tc.operator}</td>
                                        <td className="cell-threshold">{String(tc.threshold_value)} {tc.unit || ''}</td>
                                        <td>
                                          <span className={`exceeded-badge ${tc.exceeded ? 'yes' : 'no'}`}>
                                            {tc.exceeded ? 'EXCEEDED' : 'WITHIN LIMIT'}
                                          </span>
                                        </td>
                                        <td className="cell-impact">{tc.impact || tc.description || '—'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Decision Authority & Multi-Agent Collaboration (Collapsible) */}
                        {resp.agent_collaboration && (
                          <div className="response-collapsible-section collaboration-section" data-testid="query-collaboration-section">
                            <button
                              className="section-toggle-btn"
                              onClick={() => toggleCollaboration(msg.id)}
                              aria-expanded={isCollaborationOpen}
                              style={{
                                background: isCollaborationOpen ? '#f0fdf4' : undefined,
                                borderColor: isCollaborationOpen ? '#86efac' : undefined,
                              }}
                            >
                              <div className="toggle-btn-left">
                                <Shield size={14} className="section-icon" color="#16a34a" />
                                <span className="section-title">
                                  Decision Authority & Multi-Agent Reasoning ({resp.agent_collaboration.agents.length} Agents)
                                </span>
                                <span
                                  className="grounded-badge"
                                  style={{
                                    background: resp.agent_collaboration.arbitration?.conflict_detected ? '#fef3c7' : '#dcfce7',
                                    color: resp.agent_collaboration.arbitration?.conflict_detected ? '#92400e' : '#166534',
                                    fontWeight: 600,
                                  }}
                                >
                                  {resp.agent_collaboration.arbitration?.conflict_detected ? 'Arbitrated Conflict' : 'Consensus Verdict'}
                                </span>
                              </div>
                              {isCollaborationOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>

                            {isCollaborationOpen && (
                              <div className="section-body" style={{ padding: '14px', background: '#f8fafc', borderRadius: '0 0 8px 8px', border: '1px solid #e2e8f0', borderTop: 'none' }}>
                                <AgentCollaborationPanel collaboration={resp.agent_collaboration} defaultRole="researcher" />
                              </div>
                            )}
                          </div>
                        )}

                        {/* Evidence Panel (Collapsible) */}
                        {hasEvidence && (
                          <div className="response-collapsible-section evidence-section" data-testid="query-evidence-section">
                            <button
                              className="section-toggle-btn"
                              onClick={() => toggleEvidence(msg.id)}
                              aria-expanded={isEvidenceOpen}
                            >
                              <div className="toggle-btn-left">
                                <FileText size={14} className="section-icon" />
                                <span className="section-title">Verified Supporting Evidence ({resp.evidence.length} items)</span>
                                <span className="grounded-badge">✓ Grounded</span>
                              </div>
                              {isEvidenceOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>

                            {isEvidenceOpen && (
                              <div className="section-body">
                                <div className="researcher-evidence-table-wrap">
                                  <table className="researcher-table researcher-table-compact">
                                    <thead>
                                      <tr>
                                        <th>Issuing Authority / Source</th>
                                        <th>Metric / Observation</th>
                                        <th>Observed Value</th>
                                        <th>Unit</th>
                                        <th>QC & Quality Badges</th>
                                        <th>Observation / Validity Window</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {resp.evidence.map((ev, i) => (
                                        <tr key={i}>
                                          <td className="cell-source">
                                            <strong>{ev.source_name}</strong>
                                            {ev.source_url && (
                                              <span className="source-sub-url">{ev.source_url}</span>
                                            )}
                                          </td>
                                          <td className="cell-metric">{ev.metric_name ?? 'Observation Record'}</td>
                                          <td className="researcher-cell-mono">
                                            {typeof ev.metric_value === 'object'
                                              ? JSON.stringify(ev.metric_value)
                                              : String(ev.metric_value ?? '—')}
                                          </td>
                                          <td>{ev.metric_unit ?? '—'}</td>
                                          <td>
                                            <div className="quality-flags-wrap">
                                              {ev.quality_flags && ev.quality_flags.length > 0 ? (
                                                ev.quality_flags.map((f: string) => (
                                                  <span key={f} className="researcher-quality-flag">{f}</span>
                                                ))
                                              ) : (
                                                <span className="researcher-quality-flag-none">No flags</span>
                                              )}
                                            </div>
                                          </td>
                                          <td className="cell-time">
                                            {ev.observed_time && (
                                              <div>{t('QueryWorkbench.obsval', { val: new Date(ev.observed_time).toLocaleString() })}</div>
                                            )}
                                            {ev.valid_to && (
                                              <div className="valid-to-time">{t('QueryWorkbench.validtoval', { val: new Date(ev.valid_to).toLocaleString() })}</div>
                                            )}
                                            {!ev.observed_time && !ev.valid_to && (
                                              <span className="text-dim">Retrieved snapshot</span>
                                            )}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Execution Trace Panel (Collapsible) */}
                        {hasTrace && (
                          <div className="response-collapsible-section trace-section" data-testid="query-trace-section">
                            <button
                              className="section-toggle-btn"
                              onClick={() => toggleTrace(msg.id)}
                              aria-expanded={isTraceOpen}
                            >
                              <div className="toggle-btn-left">
                                <Layers size={14} className="section-icon" />
                                <span className="section-title">ORCA Reasoning Trace ({resp.trace.length} steps)</span>
                                {executedTools.length > 0 && (
                                  <span className="tools-summary-tag">
                                                                                          {t('QueryWorkbench.toolsval', { val: executedTools.join(', ') })}
                                                                                        </span>
                                )}
                              </div>
                              {isTraceOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>

                            {isTraceOpen && (
                              <div className="section-body">
                                {executedTools.length > 0 && (
                                  <div className="executed-tools-strip">
                                    <span className="tools-label">Specialist Tools Invoked:</span>
                                    <div className="tools-tags">
                                      {executedTools.map(t => (
                                        <span key={t} className="tool-tag">✓ {t}</span>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                <div className="researcher-trace-timeline">
                                  {resp.trace.map((traceItem, i) => (
                                    <div key={i} className={`researcher-trace-step status-${traceItem.status}`}>
                                      <span className="researcher-trace-num">#{traceItem.step}</span>
                                      <span className="researcher-trace-node">{traceItem.node}</span>
                                      {traceItem.agent && <span className="researcher-trace-agent">[{traceItem.agent}]</span>}
                                      <span className="researcher-trace-action">{traceItem.action}</span>
                                      {traceItem.duration_ms !== undefined && (
                                        <span className="researcher-trace-duration">{t('QueryWorkbench.valms', { val: traceItem.duration_ms })}</span>
                                      )}
                                      <span className={`researcher-trace-status ${traceItem.status}`}>{traceItem.status}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Spatial Map Layers Section */}
                        {hasLayers ? (
                          <div className="response-collapsible-section map-section" data-testid="query-map-section">
                            <button
                              className="section-toggle-btn"
                              onClick={() => toggleMap(msg.id)}
                              aria-expanded={isMapOpen}
                            >
                              <div className="toggle-btn-left">
                                <MapPin size={14} className="section-icon" />
                                <span className="section-title">Returned Spatial Vector Layers ({resp.map_layers.length} layers)</span>
                              </div>
                              {isMapOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            </button>

                            {isMapOpen && (
                              <div className="section-body">
                                <div className="map-layers-legend-strip">
                                  {resp.map_layers.map((l: MapLayer) => (
                                    <div key={l.layer_id} className="map-layer-item-chip">
                                      <span
                                        className="layer-color-dot"
                                        style={{ backgroundColor: l.style?.color || '#38bdf8' }}
                                      />
                                      <span className="layer-name">{l.name}</span>
                                    </div>
                                  ))}
                                </div>

                                <div className="query-map-view-container">
                                  <QueryResponseDeckGLMap layers={resp.map_layers} />
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="no-spatial-layers-note">
                            <Eye size={12} className="text-dim" />
                            <span>No spatial vector layers returned for this inquiry.</span>
                          </div>
                        )}

                        {/* Suggested Follow-up Prompts */}
                        {resp.suggested_followups && resp.suggested_followups.length > 0 && (
                          <div className="researcher-followups-section">
                            <div className="followups-header">
                              <Lightbulb size={13} className="followups-icon" />
                              <span>Follow-up Exploratory Inquiries</span>
                            </div>
                            <div className="followups-chips">
                              {resp.suggested_followups.map((f, i) => (
                                <button
                                  key={i}
                                  className="researcher-followup-chip"
                                  onClick={() => handlePromptClick(f)}
                                  disabled={chat.isLoading}
                                >
                                  <span>{f}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Bar */}
      <div className="researcher-input-bar">
        <div className="input-wrap">
          <input
            ref={inputRef}
            type="text"
            className="researcher-input"
            placeholder="Ask a marine-data inquiry (e.g. conditions, hazards, evidence, thresholds, or route safety)…"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={chat.isLoading}
            data-testid="query-input"
          />
          <button
            className="researcher-send-btn"
            onClick={handleSend}
            disabled={!inputValue.trim() || chat.isLoading}
            aria-label="Send analytical inquiry"
            data-testid="query-send-btn"
          >
            {chat.isLoading ? (
              <Loader2 size={16} className="researcher-spinner" />
            ) : (
              <Send size={16} />
            )}
          </button>
        </div>

        <div className="input-footer-disclosure">
          <span>{CANONICAL_DATA_MODE_LABEL}</span>
          <span>·</span>
          <span>Queries evaluate deterministic synthetic fixtures & ORCA agent reasoning.</span>
        </div>
      </div>
    </div>
  );
}
