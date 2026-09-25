'use client';

import { Anchor, ShieldCheck, Microscope } from 'lucide-react';

export type StakeholderRole = 'fisherman' | 'authority' | 'researcher';

interface StakeholderPerspectiveSelectorProps {
  activeRole: StakeholderRole;
  onChangeRole: (role: StakeholderRole) => void;
  perspectivesData?: Record<string, any>;
}

export default function StakeholderPerspectiveSelector({
  activeRole,
  onChangeRole,
  perspectivesData = {},
}: StakeholderPerspectiveSelectorProps) {
  const currentViewData = perspectivesData[activeRole] || {};

  return (
    <div className="stakeholder-selector-container" data-testid="stakeholder-perspective-selector">
      <div className="stakeholder-tabs-strip" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeRole === 'fisherman'}
          className={`stakeholder-tab-btn ${activeRole === 'fisherman' ? 'active' : ''}`}
          onClick={() => onChangeRole('fisherman')}
        >
          <Anchor size={15} />
          <span>Fisherman View</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeRole === 'authority'}
          className={`stakeholder-tab-btn ${activeRole === 'authority' ? 'active' : ''}`}
          onClick={() => onChangeRole('authority')}
        >
          <ShieldCheck size={15} />
          <span>Authority View</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeRole === 'researcher'}
          className={`stakeholder-tab-btn ${activeRole === 'researcher' ? 'active' : ''}`}
          onClick={() => onChangeRole('researcher')}
        >
          <Microscope size={15} />
          <span>Researcher View</span>
        </button>
      </div>

      {/* Dynamic Stakeholder Focus Banner */}
      <div className={`stakeholder-perspective-banner role-${activeRole}`}>
        {activeRole === 'fisherman' && (
          <div className="perspective-content fisherman-content">
            <div className="perspective-hero-row">
              <span className="perspective-headline-badge">{currentViewData.headline || 'Mariner Assessment'}</span>
              <span className="perspective-tip">{currentViewData.pfz_tip}</span>
            </div>
            <p className="perspective-summary">{currentViewData.simple_summary}</p>
            <div className="perspective-kpis">
              <span className="kpi-pill">🌊 Waves: {currentViewData.waves || 'Calm'}</span>
              <span className="kpi-pill">💨 Wind: {currentViewData.wind || 'Calm'}</span>
              <span className="kpi-pill highlight">👉 Action: {currentViewData.key_advice}</span>
            </div>
          </div>
        )}

        {activeRole === 'authority' && (
          <div className="perspective-content authority-content">
            <div className="perspective-hero-row">
              <span className="perspective-headline-badge">
                Operational Directive: {currentViewData.operational_status || 'ACTIVE'}
              </span>
              <span className="perspective-sector">{currentViewData.monitored_sector}</span>
            </div>
            <div className="perspective-kpis">
              <span className="kpi-pill">Boundary Status: {currentViewData.boundary_status || 'Clear'}</span>
              <span className="kpi-pill">Vessel Class: {currentViewData.craft_profile}</span>
              <span className="kpi-pill highlight">Fleet Command: {currentViewData.fleet_action}</span>
            </div>
            {currentViewData.winning_rule && (
              <p className="perspective-rule-note">
                <strong>Statutory Basis:</strong> {currentViewData.winning_rule}
              </p>
            )}
          </div>
        )}

        {activeRole === 'researcher' && (
          <div className="perspective-content researcher-content">
            <div className="perspective-hero-row">
              <span className="perspective-headline-badge">
                Data Quality: {currentViewData.data_quality || 'Verified'}
              </span>
              <span className="perspective-providers">
                Providers: {(currentViewData.primary_providers || []).join(' · ')}
              </span>
            </div>
            <div className="perspective-kpis">
              <span className="kpi-pill">Evidence Strength: {currentViewData.evidence_strength || 'HIGH'}</span>
              <span className="kpi-pill">
                Active Threshold Breaches: {(currentViewData.threshold_breaches || []).length}
              </span>
              <span className="kpi-pill">Trace Steps: {currentViewData.trace_step_count || 8}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
