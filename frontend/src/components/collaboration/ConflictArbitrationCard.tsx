import type { ConflictArbitration } from '../../types/contracts';
import { AlertTriangle, CheckCircle, ShieldAlert, Award } from 'lucide-react';

interface ConflictArbitrationCardProps {
  arbitration: ConflictArbitration;
}

export default function ConflictArbitrationCard({ arbitration }: ConflictArbitrationCardProps) {
  const {
    conflict_detected,
    reason,
    agent_positions,
    winning_decision,
    winning_rule,
    accepted_reasons,
    rejected_reasons,
  } = arbitration;

  const getStatusBadgeClass = (status: string) => {
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
    <div
      className={`conflict-arbitration-card ${conflict_detected ? 'is-conflict' : 'is-consensus'}`}
      data-testid="conflict-arbitration-card"
    >
      <div className="arbitration-header">
        <div className="arbitration-title-wrap">
          {conflict_detected ? (
            <div className="conflict-badge-banner">
              <ShieldAlert size={18} className="text-warning-icon" />
              <span>Multi-Agent Conflict Detected & Resolved</span>
            </div>
          ) : (
            <div className="consensus-badge-banner">
              <CheckCircle size={18} className="text-success-icon" />
              <span>Multi-Agent Consensus Validated</span>
            </div>
          )}
        </div>
        <div className="winning-decision-pill-wrap">
          <span className="winning-label">Decision Authority Ruling:</span>
          <span className={`decision-pill ${getStatusBadgeClass(winning_decision)}`}>
            {winning_decision}
          </span>
        </div>
      </div>

      {reason && (
        <div className="arbitration-reason-box">
          <p className="reason-text">
            <strong>Conflict Summary:</strong> {reason}
          </p>
        </div>
      )}

      {/* Agent Positions Strip */}
      <div className="agent-positions-section">
        <span className="section-label">Agent Positions Prior to Arbitration:</span>
        <div className="positions-grid">
          {Object.entries(agent_positions).map(([agentName, stance]) => (
            <div key={agentName} className="position-chip">
              <span className="agent-short-name">{agentName.replace(' Agent', '')}:</span>
              <span className={`position-badge ${getStatusBadgeClass(stance)}`}>{stance}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Winning Rule Callout */}
      <div className="winning-rule-box">
        <div className="rule-title-row">
          <Award size={15} className="rule-icon" />
          <span className="rule-title">Prevailing Statutory Rule</span>
        </div>
        <p className="rule-text">{winning_rule}</p>
      </div>

      {/* Accepted vs Rejected Explanations */}
      {(accepted_reasons.length > 0 || rejected_reasons.length > 0) && (
        <div className="arbitration-reasons-columns">
          {accepted_reasons.length > 0 && (
            <div className="reasons-column accepted-column">
              <div className="column-header">
                <CheckCircle size={14} className="text-emerald" />
                <span>Why Decision Was Accepted</span>
              </div>
              <ul className="reasons-list">
                {accepted_reasons.map((r, i) => (
                  <li key={i} className="reason-item">
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {rejected_reasons.length > 0 && (
            <div className="reasons-column rejected-column">
              <div className="column-header">
                <AlertTriangle size={14} className="text-rose" />
                <span>Why Divergent Positions Were Overridden</span>
              </div>
              <ul className="reasons-list">
                {rejected_reasons.map((r, i) => (
                  <li key={i} className="reason-item">
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
