import { useState, useMemo, useEffect } from 'react';
import {
  Activity,
  AlertTriangle,
  Anchor,
  Building2,
  FileCheck2,
  FlaskConical,
  RadioTower,
  Ship,
  ShieldCheck,
  Bookmark,
} from 'lucide-react';
import ChatPanel from '../components/chat/ChatPanel';
import AuthorityDeckGLMap from '../components/authority/AuthorityDeckGLMap';
import EvidenceCard from '../components/evidence/EvidenceCard';
import AgentTimeline from '../components/trace/AgentTimeline';
import ScenarioBenchmarkDeck from '../components/authority/ScenarioBenchmarkDeck';
import FleetTrackingDeck from '../components/authority/FleetTrackingDeck';
import AgentCollaborationPanel from '../components/collaboration/AgentCollaborationPanel';
import PortWatchRegistry from '../components/authority/PortWatchRegistry';
import AquaWatchRegistry from '../components/authority/AquaWatchRegistry';
import type { useChat } from '../hooks/useChat';
import type { MapLayer } from '../types/contracts';
import {
  getDemoSectors,
  getDemoSectorHazards,
  getDemoSectorHazardAssociations,
  getDemoSectorSituation,
  getDemoRouteAlternatives,
  getDemoVessels,
  type DemoSector,
  type DemoVessel,
  type SectorHazard,
  type VesselHazardAssociation,
  type VesselHazardOperationalAlert,
  type SectorSituation,
} from '../api/client';
import {
  createAuthorityRouteLayers,
  FALLBACK_DEMO_SECTORS,
  fetchAndFormatBaseLayers,
  NATIONAL_COASTAL_BOOKMARKS,
} from '../utils/geo';
import { translateText } from '../i18n/translations';

export interface AuthorityPageProps {
  chat: ReturnType<typeof useChat>;
  theme: 'light' | 'dark';
  mobileView: 'chat' | 'map';
  onOpenEvidence: () => void;
  onBack: () => void;
}

export type AuthorityTab = 'terminal' | 'fleet' | 'ports' | 'aquaculture' | 'benchmarks' | 'audit';

/**
 * Authority Command Deck Page
 *
 * Tailored for port authorities, fisheries departments, disaster management teams,
 * and maritime enforcement officers.
 * Reuses ChatPanel, MapView, EvidenceCard, AgentTimeline, FleetTrackingDeck, and ScenarioBenchmarkDeck.
 */
export default function AuthorityPage({
  chat,
  theme: _theme,
  mobileView,
  onOpenEvidence,
  onBack,
}: AuthorityPageProps) {
  const [sectors, setSectors] = useState<DemoSector[]>(FALLBACK_DEMO_SECTORS);
  const [selectedSector, setSelectedSector] = useState<string>(FALLBACK_DEMO_SECTORS[0].public_id);
  const [authorityTab, setAuthorityTab] = useState<AuthorityTab>('terminal');
  const [selectedVesselId, setSelectedVesselId] = useState<string | null>(null);
  const [replayLayer, setReplayLayer] = useState<MapLayer | null>(null);
  const [trajectoryLayer, setTrajectoryLayer] = useState<MapLayer | null>(null);
  const [baseLayers, setBaseLayers] = useState<MapLayer[]>([]);

  const [sectorSituation, setSectorSituation] = useState<SectorSituation | null>(null);
  const [situationLoading, setSituationLoading] = useState<boolean>(false);
  const [situationError, setSituationError] = useState<string | null>(null);
  const [sectorHazards, setSectorHazards] = useState<SectorHazard[]>([]);
  const [hazardError, setHazardError] = useState<string | null>(null);
  const [hazardAssociations, setHazardAssociations] = useState<VesselHazardAssociation[]>([]);
  const [sectorRouteLayers, setSectorRouteLayers] = useState<MapLayer[]>([]);
  const [selectedOperationalAlert, setSelectedOperationalAlert] = useState<VesselHazardOperationalAlert | null>(null);
  const [sectorVessels, setSectorVessels] = useState<DemoVessel[]>([]);

  useEffect(() => {
    fetchAndFormatBaseLayers().then(setBaseLayers);
    getDemoSectors()
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setSectors(data);
        }
      })
      .catch(() => {
        // Backend offline: FALLBACK_DEMO_SECTORS retained for dropdown continuity only
      });
  }, []);

  const activeSector = useMemo(() => {
    return sectors.find((s) => s.public_id === selectedSector) || sectors[0];
  }, [sectors, selectedSector]);

  // Chat history is retained across sector changes, but current-sector UI must
  // never present an earlier sector's response as the active response.
  const authorityActiveResponse = useMemo(() => {
    for (let index = chat.messages.length - 1; index >= 0; index -= 1) {
      const message = chat.messages[index];
      if (message.role === 'assistant' && message.sectorId === activeSector.public_id && message.response) {
        return message.response;
      }
    }
    return null;
  }, [activeSector.public_id, chat.messages]);

  useEffect(() => {
    let isCurrent = true;
    setSituationLoading(true);
    setSituationError(null);
    // Crucial: immediately clear previous sector's situation to avoid stale state leakage
    setSectorSituation(null);

    const sectorKey = activeSector.public_id || activeSector.name;
    getDemoSectorSituation(sectorKey)
      .then((data) => {
        if (isCurrent) {
          setSectorSituation(data);
          setSituationLoading(false);
        }
      })
      .catch(() => {
        if (isCurrent) {
          setSituationError('Situation Unavailable');
          setSituationLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [activeSector]);

  useEffect(() => {
    let isCurrent = true;
    // Alert inspection is scoped to a single Authority sector and must never
    // survive a sector switch while its replacement data is loading.
    setSelectedOperationalAlert(null);
    if (authorityTab === 'audit') setAuthorityTab('terminal');
    setSectorHazards([]);
    setHazardError(null);

    getDemoSectorHazards(activeSector.public_id)
      .then((data) => {
        if (isCurrent) setSectorHazards(data.hazards);
      })
      .catch(() => {
        if (isCurrent) setHazardError('Hazard data unavailable');
      });

    getDemoVessels(activeSector.public_id)
      .then((data) => {
        if (isCurrent) setSectorVessels(data);
      })
      .catch(() => {
        if (isCurrent) setSectorVessels([]);
      });

    return () => {
      isCurrent = false;
    };
  }, [activeSector.public_id]);

  useEffect(() => {
    let isCurrent = true;
    setHazardAssociations([]);
    getDemoSectorHazardAssociations(activeSector.public_id)
      .then((data) => { if (isCurrent) setHazardAssociations(data.associations); })
      .catch(() => { if (isCurrent) setHazardAssociations([]); });
    return () => { isCurrent = false; };
  }, [activeSector.public_id]);

  // Route alternatives are contextual to the active vessel's mission
  useEffect(() => {
    let isCurrent = true;
    const controller = new AbortController();
    setSectorRouteLayers([]);

    // When in Fleet tab or general Authority mode, only render routes if a vessel is active
    if (!selectedVesselId) {
      return () => {
        isCurrent = false;
        controller.abort();
      };
    }

    getDemoRouteAlternatives(
      { sector_id: activeSector.public_id, vessel_id: selectedVesselId },
      controller.signal,
    )
      .then((data) => {
        if (!isCurrent) return;
        if (data && data.status === 'AVAILABLE' && Array.isArray(data.routes) && data.routes.length > 0) {
          setSectorRouteLayers(
            createAuthorityRouteLayers(data.routes, data.recommended_route_id, data.origin, data.destination),
          );
        } else {
          setSectorRouteLayers([]);
        }
      })
      .catch(() => {
        if (isCurrent) setSectorRouteLayers([]);
      });

    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, [activeSector.public_id, selectedVesselId]);

  const evidenceList = useMemo(() => {
    if (authorityActiveResponse?.evidence && authorityActiveResponse.evidence.length > 0) {
      return authorityActiveResponse.evidence;
    }
    return sectorSituation?.evidence ?? [];
  }, [authorityActiveResponse?.evidence, sectorSituation?.evidence]);

  const traceList = authorityActiveResponse?.trace ?? [];
  const selectedAlertAssociation = selectedOperationalAlert
    ? hazardAssociations.find((item) => item.vessel_id === selectedOperationalAlert.vessel_id && item.hazard_id === selectedOperationalAlert.hazard_id)
    : null;
  const selectedAlertHazard = selectedOperationalAlert
    ? sectorHazards.find((item) => item.hazard_id === selectedOperationalAlert.hazard_id)
    : null;
  const auditEvidenceList = selectedOperationalAlert ? sectorSituation?.evidence ?? [] : evidenceList;
  const auditTraceList = selectedOperationalAlert ? [] : traceList;

  const warningsList = useMemo(() => {
    if (authorityActiveResponse?.warnings && authorityActiveResponse.warnings.length > 0) {
      return authorityActiveResponse.warnings;
    }
    return sectorSituation?.warnings ?? [];
  }, [authorityActiveResponse?.warnings, sectorSituation?.warnings]);

  return (
    <div className={`authority-page view-${mobileView}`} role="region" aria-label="Authority Command Deck">
      {/* Single Unified Authority Command Bar */}
      <section className="authority-command-bar" aria-label="Operational Command Bar">
        <div className="authority-bar-left">
          <div className="authority-title-row">
            <Building2 size={15} className="authority-brand-icon" />
            <span className="authority-title">{translateText('Authority Command Deck', chat.language)}</span>
          </div>

          <label className="authority-sector-selector">
            <select
              value={selectedSector}
              onChange={(e) => {
                setSelectedSector(e.target.value);
                setSelectedVesselId(null);
                setReplayLayer(null);
                setTrajectoryLayer(null);
                setSectorRouteLayers([]);
              }}
              className="authority-sector-select"
              aria-label={translateText('Sector:', chat.language)}
            >
              {sectors.map((s) => (
                <option key={s.public_id || s.name} value={s.public_id}>{s.name}</option>
              ))}
            </select>
          </label>

          <label className="authority-sector-selector" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Bookmark size={13} className="text-muted-foreground shrink-0" />
            <select
              value=""
              onChange={(e) => {
                const b = NATIONAL_COASTAL_BOOKMARKS.find((item) => item.name === e.target.value);
                if (b) {
                  const matchedSector = sectors.find(
                    (s) => s.name.toLowerCase().includes(b.name.split(' ')[0].toLowerCase()) || (b.harbor && s.harbor_id?.includes(b.harbor.toLowerCase()))
                  );
                  if (matchedSector) {
                    setSelectedSector(matchedSector.public_id);
                  }
                }
              }}
              className="authority-sector-select"
              aria-label="National Coastal Landmark Jump"
            >
              <option value="" disabled>Jump to Coast…</option>
              {NATIONAL_COASTAL_BOOKMARKS.map((b) => (
                <option key={b.name} value={b.name}>{b.name}</option>
              ))}
            </select>
          </label>
        </div>

        {/* Center: Sleek Segmented Switcher Pill */}
        <nav className="authority-nav-segmented" role="tablist" aria-label="Authority views">
          <button
            type="button"
            className={`authority-segment-btn ${authorityTab === 'terminal' ? 'active' : ''}`}
            onClick={() => setAuthorityTab('terminal')}
            role="tab"
            aria-selected={authorityTab === 'terminal'}
          >
            <RadioTower size={13} />
            <span>{translateText('Audit Terminal', chat.language)}</span>
          </button>
          <button
            type="button"
            className={`authority-segment-btn ${authorityTab === 'fleet' ? 'active' : ''}`}
            onClick={() => setAuthorityTab('fleet')}
            role="tab"
            aria-selected={authorityTab === 'fleet'}
          >
            <Ship size={13} />
            <span>{translateText('Fleet Surveillance', chat.language)}</span>
          </button>
          <button
            type="button"
            className={`authority-segment-btn ${authorityTab === 'ports' ? 'active' : ''}`}
            onClick={() => setAuthorityTab('ports')}
            role="tab"
            aria-selected={authorityTab === 'ports'}
          >
            <Anchor size={13} />
            <span>{translateText('Port Census', chat.language)}</span>
          </button>
          <button
            type="button"
            className={`authority-segment-btn ${authorityTab === 'aquaculture' ? 'active' : ''}`}
            onClick={() => setAuthorityTab('aquaculture')}
            role="tab"
            aria-selected={authorityTab === 'aquaculture'}
          >
            <ShieldCheck size={13} />
            <span>{translateText('Aquaculture', chat.language)}</span>
          </button>
          <button
            type="button"
            className={`authority-segment-btn ${authorityTab === 'benchmarks' ? 'active' : ''}`}
            onClick={() => setAuthorityTab('benchmarks')}
            role="tab"
            aria-selected={authorityTab === 'benchmarks'}
          >
            <FlaskConical size={13} />
            <span>{translateText('Benchmark Runner', chat.language)}</span>
          </button>
        </nav>

        {/* Right: Live KPIs & Verified Sources */}
        <div className="authority-bar-right">
          {/* Situation Verdict */}
          <div className="authority-kpi-chip" data-testid="kpi-verdict">
            <span className="chip-label">{translateText('Verdict:', chat.language)}</span>
            {situationError ? (
              <span className="status-pill status-unknown">
                {translateText('UNAVAILABLE', chat.language)}
              </span>
            ) : situationLoading ? (
              <span className="status-pill status-ready">...</span>
            ) : (
              <span
                className={`status-pill status-${(sectorSituation?.situation_status || 'UNKNOWN').toLowerCase().replace('_', '-')}`}
              >
                {sectorSituation?.situation_status.replace('_', '-') || 'UNKNOWN'}
              </span>
            )}
          </div>

          {/* Dynamic Fleet Count */}
          <div className="authority-kpi-chip" data-testid="kpi-fleet">
            <Ship size={13} />
            <span>
              <strong>
                {situationError ? '—' : situationLoading ? '...' : (sectorSituation?.fleet_count ?? '—')}
              </strong>{' '}
              {translateText('Fleet', chat.language)}
            </span>
          </div>

          {/* Active Hazards Count */}
          <div className="authority-kpi-chip" data-testid="kpi-hazards">
            <AlertTriangle
              size={13}
              className={(sectorSituation?.active_hazard_count ?? 0) > 0 ? 'status-no-go' : ''}
            />
            <span>
              <strong>
                {situationError ? '—' : situationLoading ? '...' : (sectorSituation?.active_hazard_count ?? '—')}
              </strong>{' '}
              {translateText('Hazards', chat.language)}
            </span>
          </div>

          {/* Decision Authority Button */}
          {authorityActiveResponse?.agent_collaboration && (
            <button
              type="button"
              className={`authority-kpi-chip authority-evidence-btn ${authorityTab === 'audit' ? 'active' : ''}`}
              onClick={() => setAuthorityTab('audit')}
              title={translateText('Inspect Decision Authority & Multi-Agent Arbitration', chat.language)}
              data-testid="kpi-decision-authority"
              style={{ borderColor: '#86efac', background: '#f0fdf4', color: '#166534' }}
            >
              <ShieldCheck size={13} className="status-accent" />
              <span>
                <strong>{authorityActiveResponse.agent_collaboration.arbitration?.winning_decision || 'AUDITED'}</strong> ({authorityActiveResponse.agent_collaboration.agents.length} Agents)
              </span>
            </button>
          )}

          {/* Grounded Evidence Button */}
          {evidenceList.length > 0 && (
            <button
              type="button"
              className={`authority-kpi-chip authority-evidence-btn ${authorityTab === 'audit' ? 'active' : ''}`}
              onClick={() => setAuthorityTab(authorityTab === 'audit' ? 'terminal' : 'audit')}
              title={translateText('Inspect verified evidence & execution trace', chat.language)}
              data-testid="kpi-evidence"
            >
              <FileCheck2 size={13} className="status-accent" />
              <span>
                <strong>{evidenceList.length}</strong> {translateText('Evidence', chat.language)}
              </span>
            </button>
          )}
        </div>
      </section>

      {/* Workspace Body */}
      <div className="authority-body">
        {authorityTab === 'terminal' && (
          <div className="authority-workspace-grid">
            {/* Left: Reused ChatPanel in Official Dispatch Terminal Mode */}
            <aside className="authority-terminal-pane" aria-label="Terminal Pane">
              <ChatPanel
                language={chat.language}
                messages={chat.messages}
                activeResponse={authorityActiveResponse}
                isLoading={chat.isLoading}
                onSend={(text, languageOverride) => chat.send(text, languageOverride, {
                  sector_id: activeSector.public_id,
                })}
                onBack={onBack}
                onReset={chat.clearChat}
                onEvidenceClick={onOpenEvidence}
              />
            </aside>

            {/* Right: Authority 3D Operational Command Map */}
            <div className="authority-map-pane">
              {hazardError && <p className="authority-empty-note" role="status">{hazardError}</p>}
              <AuthorityDeckGLMap
                activeSector={activeSector}
                sectors={sectors}
                baseLayers={baseLayers}
                sectorHazards={sectorHazards}
                hazardAssociations={hazardAssociations}
                selectedOperationalAlert={selectedOperationalAlert}
                vessels={sectorVessels}
                selectedVesselId={selectedVesselId}
                onSelectVessel={setSelectedVesselId}
                replayLayer={replayLayer}
                trajectoryLayer={trajectoryLayer}
                sectorRouteLayers={sectorRouteLayers}
                language={chat.language}
              />
            </div>
          </div>
        )}

        {authorityTab === 'fleet' && (
          <div className="authority-workspace-grid authority-fleet-grid">
            <aside className="authority-fleet-pane" aria-label="Fleet Surveillance Pane">
              <FleetTrackingDeck
                selectedSector={selectedSector}
                onVesselSelect={setSelectedVesselId}
                onReplayUpdate={setReplayLayer}
                onTrajectoryUpdate={setTrajectoryLayer}
                onAlertSelectionChange={(alert) => {
                  // The alert endpoint is sector-scoped; still enforce the
                  // boundary at the UI hand-off so stale async UI state cannot
                  // highlight a different sector.
                  setSelectedOperationalAlert(alert?.sector_id === activeSector.public_id ? alert : null);
                }}
                onAlertWhy={(alert) => {
                  if (alert.sector_id !== activeSector.public_id) return;
                  setSelectedOperationalAlert(alert);
                  setAuthorityTab('audit');
                }}
                language={chat.language}
              />
            </aside>
            <div className="authority-map-pane">
              <AuthorityDeckGLMap
                activeSector={activeSector}
                sectors={sectors}
                baseLayers={baseLayers}
                sectorHazards={sectorHazards}
                hazardAssociations={hazardAssociations}
                selectedOperationalAlert={selectedOperationalAlert}
                vessels={sectorVessels}
                selectedVesselId={selectedVesselId}
                onSelectVessel={setSelectedVesselId}
                replayLayer={replayLayer}
                trajectoryLayer={trajectoryLayer}
                sectorRouteLayers={sectorRouteLayers}
                language={chat.language}
              />
            </div>
          </div>
        )}

        {authorityTab === 'ports' && (
          <div className="authority-benchmarks-container" style={{ background: 'var(--background)' }}>
            <PortWatchRegistry />
          </div>
        )}

        {authorityTab === 'aquaculture' && (
          <div className="authority-benchmarks-container" style={{ background: 'var(--background)' }}>
            <AquaWatchRegistry />
          </div>
        )}

        {authorityTab === 'benchmarks' && (
          <div className="authority-benchmarks-container">
            <ScenarioBenchmarkDeck language={chat.language} />
          </div>
        )}

        {authorityTab === 'audit' && (
          /* Audit View: Direct In-Page Evidence & Agent Trace Logs */
          <div className="authority-audit-view">
            {authorityActiveResponse?.agent_collaboration && (
              <div className="authority-collaboration-audit-section" style={{ gridColumn: '1 / -1', marginBottom: '20px' }} data-testid="authority-collaboration-section">
                <div className="audit-section-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ShieldCheck size={18} color="#0284c7" />
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>
                      {translateText('Statutory Decision Authority & Multi-Agent Arbitration Audit', chat.language)}
                    </h3>
                  </div>
                  <span
                    style={{
                      fontSize: '0.8rem',
                      padding: '4px 10px',
                      borderRadius: '9999px',
                      background: authorityActiveResponse.agent_collaboration.arbitration?.conflict_detected ? '#fef3c7' : '#dcfce7',
                      color: authorityActiveResponse.agent_collaboration.arbitration?.conflict_detected ? '#92400e' : '#166534',
                      fontWeight: 700,
                    }}
                  >
                    {authorityActiveResponse.agent_collaboration.arbitration?.conflict_detected
                      ? translateText('Protocol D010 Invoked', chat.language)
                      : translateText('Full Consensus', chat.language)}
                  </span>
                </div>
                <AgentCollaborationPanel
                  collaboration={authorityActiveResponse.agent_collaboration}
                  defaultRole="authority"
                />
              </div>
            )}

            <div className="authority-audit-column">
              {selectedOperationalAlert && (
                <section className="fleet-alert-inspection" aria-label="Alert evidence" style={{ marginBottom: '14px', padding: '12px', border: '1px solid rgba(250, 204, 21, 0.5)', borderRadius: '8px' }}>
                  <div className="audit-section-header"><AlertTriangle size={16} /><h3>{translateText('Alert Evidence', chat.language)}</h3></div>
                  <p className="authority-empty-note">{translateText('Canonical containment observation; this is not a risk prediction.', chat.language)}</p>
                  <div className="alert-card-footer"><span>Sector: {selectedOperationalAlert.sector_id}</span><span>Vessel: {selectedOperationalAlert.vessel_id}</span></div>
                  <div className="alert-card-footer"><span>Hazard: {selectedOperationalAlert.hazard_id}</span><span>Association: IN_HAZARD_AREA</span></div>
                  <div className="alert-card-footer"><span>Position observed: {selectedAlertAssociation?.evaluated_at ?? 'Unavailable'}</span><span>Hazard status: {selectedAlertHazard?.status ?? 'Unavailable'}</span></div>
                  <div className="alert-card-footer"><span>Hazard validity: {selectedAlertHazard?.valid_to ?? 'Unavailable'}</span><span>Severity: {selectedOperationalAlert.severity}</span></div>
                </section>
              )}
              <div className="audit-section-header">
                <FileCheck2 size={16} />
                <h3>{translateText(selectedOperationalAlert ? 'Sector Situation Evidence' : 'Verified Official Evidence', chat.language)} ({auditEvidenceList.length})</h3>
              </div>
              {auditEvidenceList.length > 0 ? (
                <div className="authority-evidence-grid">
                  {auditEvidenceList.map((ev, idx) => (
                    <EvidenceCard key={idx} evidence={ev} />
                  ))}
                </div>
              ) : (
                <p className="authority-empty-note">
                  {translateText(selectedOperationalAlert ? 'Sector situation evidence unavailable for this alert.' : 'No active evidence items. Run an advisory query to inspect official telemetry.', chat.language)}
                </p>
              )}

              {warningsList.length > 0 && (
                <div className="authority-warnings-box">
                  <h4>{translateText('Active System Warnings & Fallbacks', chat.language)}</h4>
                  <ul>
                    {warningsList.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="authority-audit-column">
              <div className="audit-section-header">
                <Activity size={16} />
                <h3>{translateText('Autonomous Agent Execution Trail', chat.language)} ({auditTraceList.length} {translateText('Steps', chat.language)})</h3>
              </div>
              {auditTraceList.length > 0 ? (
                <div className="authority-timeline-card">
                  <AgentTimeline trace={auditTraceList} />
                </div>
              ) : (
                <p className="authority-empty-note">
                  {translateText(selectedOperationalAlert ? 'Agent reasoning trace unavailable for this alert.' : 'No trace recorded. Queries processed by the cognitive graph will log execution steps here.', chat.language)}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
