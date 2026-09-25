import { useState } from 'react';
import type { IndividualAgentReasoning } from '../../types/contracts';
import AgentEvidenceCard from './AgentEvidenceCard';
import { Waves, CloudSun, MapPin, Shield, ChevronDown, ChevronUp } from 'lucide-react';

interface AgentCardsGridProps {
  agents: IndividualAgentReasoning[];
}

export default function AgentCardsGrid({ agents }: AgentCardsGridProps) {
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  const toggleExpand = (agentId: string) => {
    setExpandedAgent(prev => (prev === agentId ? null : agentId));
  };

  const getAgentIcon = (id: string) => {
    switch (id) {
      case 'marine_agent':
        return <Waves size={18} className="agent-title-icon text-cyan" />;
      case 'weather_agent':
        return <CloudSun size={18} className="agent-title-icon text-amber" />;
      case 'geospatial_agent':
        return <MapPin size={18} className="agent-title-icon text-emerald" />;
      case 'safety_agent':
        return <Shield size={18} className="agent-title-icon text-purple" />;
      default:
        return <Shield size={18} className="agent-title-icon text-accent" />;
    }
  };

  const getBadgeClass = (status: string) => {
    switch (status) {
      case 'GO':
        return 'badge-go';
      case 'CAUTION':
        return 'badge-caution';
      case 'NO_GO':
        return 'badge-nogo';
      default:
        return 'badge-unknown';
    }
  };

  return (
    <div className="agent-cards-grid" data-testid="agent-cards-grid">
      {agents.map(agent => {
        const isExpanded = expandedAgent === agent.agent_id;

        return (
          <div
            key={agent.agent_id}
            className={`agent-card agent-card-${agent.agent_id}`}
            data-testid={`agent-card-${agent.agent_id}`}
          >
            <div className="agent-card-header">
              <div className="agent-id-row">
                {getAgentIcon(agent.agent_id)}
                <div>
                  <h4 className="agent-name">{agent.agent_name}</h4>
                  <p className="agent-role">{agent.role_description}</p>
                </div>
              </div>
              <div className="agent-badges-row">
                <span className={`stance-badge ${getBadgeClass(agent.recommendation)}`}>
                  {agent.recommendation}
                </span>
                <span className={`strength-badge strength-${agent.evidence_strength.toLowerCase()}`}>
                  Strength: {agent.evidence_strength}
                </span>
              </div>
            </div>

            <div className="agent-card-summary">
              <p className="summary-text">{agent.summary}</p>
            </div>

            <div className="agent-card-findings">
              <span className="findings-label">Evaluated Observations:</span>
              <ul className="findings-list">
                {agent.key_findings.map((finding, idx) => (
                  <li key={idx} className="finding-item">
                    {finding}
                  </li>
                ))}
              </ul>
            </div>

            {/* Evidence Sources Block */}
            <div className="agent-card-sources-wrapper">
              <AgentEvidenceCard sources={agent.sources} agentName={agent.agent_id} />
            </div>

            {/* Collapsible raw observation metrics */}
            <div className="agent-collapsible-details">
              <button
                type="button"
                className="details-toggle-btn"
                onClick={() => toggleExpand(agent.agent_id)}
                aria-expanded={isExpanded}
              >
                <span>{isExpanded ? 'Hide Raw Variables' : 'Inspect Raw Variables'}</span>
                {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>

              {isExpanded && (
                <div className="raw-metrics-table-wrap">
                  <table className="raw-metrics-table">
                    <tbody>
                      {Object.entries(agent.observations).map(([k, v]) => (
                        <tr key={k}>
                          <td className="metric-key">{k.replace(/_/g, ' ')}</td>
                          <td className="metric-val mono">
                            {typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? '—')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
