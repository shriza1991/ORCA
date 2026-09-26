import { useState } from 'react';
import type { AgentCollaborationPayload } from '../../types/contracts';
import StakeholderPerspectiveSelector, { type StakeholderRole } from './StakeholderPerspectiveSelector';
import ConflictArbitrationCard from './ConflictArbitrationCard';
import AgentCardsGrid from './AgentCardsGrid';
import CausalExplanationCards from './CausalExplanationCards';
import ReasoningTimelineView from './ReasoningTimelineView';
import { Layers, ShieldCheck, Scale, Zap, Info } from 'lucide-react';

interface AgentCollaborationPanelProps {
  collaboration?: AgentCollaborationPayload;
  defaultRole?: StakeholderRole;
  harbor?: string;
  onClose?: () => void;
}

export default function AgentCollaborationPanel({
  collaboration,
  defaultRole = 'fisherman',
  harbor = 'Ratnagiri',
  onClose,
}: AgentCollaborationPanelProps) {
  const [activeRole, setActiveRole] = useState<StakeholderRole>(defaultRole);
  const [activeTab, setActiveTab] = useState<'agents' | 'causal' | 'timeline'>('agents');

  if (!collaboration) {
    return (
      <div className="agent-collaboration-empty" data-testid="agent-collaboration-empty">
        <Info size={18} className="text-dim" />
        <p className="empty-text">
          Multi-agent reasoning telemetry is generated automatically when queries or trip assessments execute.
        </p>
      </div>
    );
  }

  const { agents, arbitration, explanation, timeline, stakeholder_perspectives } = collaboration;

  return (
    <div className="agent-collaboration-panel" data-testid="agent-collaboration-panel">
      {/* Top Header */}
      <div className="collaboration-panel-header">
        <div className="header-title-group">
          <div className="header-badge">
            <Scale size={16} className="badge-icon" />
            <span>Multi-Agent Mission Reasoning</span>
          </div>
          <h3 className="collaboration-title">Specialist Agent Intelligence & Decision Authority</h3>
          <p className="collaboration-subtitle">
            Transparent collaboration off {harbor} across Marine (INCOIS), Weather (IMD), Geospatial, and Safety specialist agents.
          </p>
        </div>

        {onClose && (
          <button type="button" className="close-panel-btn" onClick={onClose} aria-label="Close reasoning panel">
            ✕
          </button>
        )}
      </div>

      {/* Stakeholder Adaptation Bar */}
      <StakeholderPerspectiveSelector
        activeRole={activeRole}
        onChangeRole={setActiveRole}
        perspectivesData={stakeholder_perspectives}
      />

      {/* Decision Authority & Conflict Arbitration Card (Prominent Banner) */}
      <ConflictArbitrationCard arbitration={arbitration} />

      {/* Segmented Sub-Deck Tabs */}
      <div className="collaboration-subtabs-nav" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'agents'}
          className={`subtab-btn ${activeTab === 'agents' ? 'active' : ''}`}
          onClick={() => setActiveTab('agents')}
        >
          <Layers size={14} />
          <span>Agent Evidence & Stances ({agents.length})</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'causal'}
          className={`subtab-btn ${activeTab === 'causal' ? 'active' : ''}`}
          onClick={() => setActiveTab('causal')}
        >
          <ShieldCheck size={14} />
          <span>5-Stage Causal Explainability</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'timeline'}
          className={`subtab-btn ${activeTab === 'timeline' ? 'active' : ''}`}
          onClick={() => setActiveTab('timeline')}
        >
          <Zap size={14} />
          <span>8-Step Lifecycle Timeline ({timeline.length})</span>
        </button>
      </div>

      {/* Tab Contents */}
      <div className="collaboration-tab-body">
        {activeTab === 'agents' && <AgentCardsGrid agents={agents} />}
        {activeTab === 'causal' && <CausalExplanationCards explanation={explanation} />}
        {activeTab === 'timeline' && <ReasoningTimelineView timeline={timeline} />}
      </div>
    </div>
  );
}
