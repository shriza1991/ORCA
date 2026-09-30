import { useState } from 'react';
import { ArrowRight, Check, Clock, Cpu, RefreshCw, SlidersHorizontal, Sparkles } from 'lucide-react';
import type { DecisionDiff, MissionContext, WhatIfParameters } from '../../types/mission';
import { translateText, type SupportedLanguage } from '../../i18n/translations';
import DecisionDeltaPanel from '../fisher/DecisionDeltaPanel';

interface WhatIfSimulatorProps {
  currentContext: MissionContext;
  currentStatus?: string;
  language?: SupportedLanguage;
  isLoading?: boolean;
  activeDiff?: DecisionDiff | null;
  onSimulate: (params: WhatIfParameters, queryText: string) => void;
  onApplyContext: (newContext: MissionContext) => void;
}

const TIME_OFFSETS = [
  { label: 'Now', hours: 0 },
  { label: '+2h', hours: 2 },
  { label: '+4h', hours: 4 },
  { label: '+6h', hours: 6 },
  { label: '+12h', hours: 12 },
];

const CRAFT_OPTIONS = [
  { value: 'traditional_non_motorized', label: 'Traditional craft' },
  { value: 'motorized_boat', label: 'Motorized boat' },
  { value: 'mechanized_trawler', label: 'Mechanized trawler' },
] as const;

const OBJECTIVES = [
  { value: 'pfz', label: '🐟 PFZ Harvesting' },
  { value: 'safety', label: '⚓ Coastal Safety' },
  { value: 'transit', label: '🧭 Safe Passage' },
] as const;

export default function WhatIfSimulator({
  currentContext,
  currentStatus = 'READY',
  language = 'en',
  isLoading = false,
  activeDiff,
  onSimulate,
  onApplyContext,
}: WhatIfSimulatorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [timeOffset, setTimeOffset] = useState<number>(4);
  const [craftOverride, setCraftOverride] = useState<MissionContext['craft_profile']>(
    currentContext.craft_profile ?? 'motorized_boat'
  );
  const [vesselSizeOverride, setVesselSizeOverride] = useState<NonNullable<MissionContext['vessel_size']>>(
    (currentContext.vessel_size as any) || 'medium'
  );
  const [objective, setObjective] = useState<'pfz' | 'safety' | 'transit'>('pfz');
  const [applied, setApplied] = useState(false);

  const craftLabel = CRAFT_OPTIONS.find((c) => c.value === craftOverride)?.label ?? 'Motorized boat';
  const sizeLabel = vesselSizeOverride.charAt(0).toUpperCase() + vesselSizeOverride.slice(1);
  const harbor = currentContext.origin_harbor ?? 'Ratnagiri';

  const handleRunSimulation = () => {
    setApplied(false);
    let query: string;
    if (language === 'hi') {
      query = timeOffset === 0
        ? `${harbor} से ${sizeLabel} ${craftLabel} के साथ वर्तमान मौसम में निकलना कैसा है?`
        : `यदि मैं ${harbor} से प्रस्थान ${timeOffset} घंटे विलंबित करूँ (${sizeLabel} ${craftLabel}), तो क्या स्थिति अनुकूल होगी?`;
    } else if (language === 'mr') {
      query = timeOffset === 0
        ? `${harbor} वरून ${sizeLabel} ${craftLabel} सह सध्या समुद्रात जाणे सुरक्षित आहे का?`
        : `जर मी ${harbor} वरून प्रस्थान ${timeOffset} तास पुढे ढकलले (${sizeLabel} ${craftLabel}), तर स्थिती कशी असेल?`;
    } else {
      query = timeOffset === 0
        ? `What is the voyage risk departing from ${harbor} now with a ${sizeLabel} ${craftLabel}?`
        : `What if I delay departure from ${harbor} by ${timeOffset} hours with a ${sizeLabel} ${craftLabel}?`;
    }

    onSimulate(
      {
        timeOffsetHours: timeOffset,
        craftProfileOverride: craftOverride,
        vesselSizeOverride,
        objective,
      },
      query
    );
  };

  const handleApply = () => {
    let updatedDeparture = currentContext.departure_time;
    let updatedReturn = currentContext.return_time;

    if (timeOffset > 0 && currentContext.departure_time) {
      const depParsed = Date.parse(currentContext.departure_time);
      if (!isNaN(depParsed)) {
        updatedDeparture = new Date(depParsed + timeOffset * 60 * 60 * 1000).toISOString();
      }
    }
    if (timeOffset > 0 && currentContext.return_time) {
      const retParsed = Date.parse(currentContext.return_time);
      if (!isNaN(retParsed)) {
        updatedReturn = new Date(retParsed + timeOffset * 60 * 60 * 1000).toISOString();
      }
    }

    onApplyContext({
      ...currentContext,
      origin_harbor: currentContext.origin_harbor,
      craft_profile: craftOverride,
      vessel_size: vesselSizeOverride,
      departure_time: updatedDeparture,
      return_time: updatedReturn,
      target_pfz: currentContext.target_pfz,
      parent_assessment_id: currentContext.parent_assessment_id,
    });
    setApplied(true);
  };

  return (
    <div className="what-if-container" aria-label="Mission Twin What-If Simulator">
      <button
        type="button"
        className={`what-if-toggle-btn ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <span className="what-if-toggle-left">
          <Cpu size={14} className="what-if-icon" />
          <strong>{translateText('Mission Twin', language)}</strong>
          <span className="what-if-tag">{translateText('What-If Simulation', language)}</span>
        </span>
        <SlidersHorizontal size={13} />
      </button>

      {isOpen && (
        <div className="what-if-panel">
          <p className="what-if-description">
            {translateText('Current status:', language)} <strong>{currentStatus.replace('_', '-')}</strong>. {translateText('Simulate counterfactual voyage parameters (temporal window, vessel limits) against deterministic risk rules.', language)}
          </p>

          {/* Temporal delay selector */}
          <div className="what-if-section">
            <span className="what-if-label">
              <Clock size={12} /> {translateText('Departure window offset:', language)}
            </span>
            <div className="what-if-time-chips" role="radiogroup" aria-label="Departure delay offset">
              {TIME_OFFSETS.map((t) => (
                <button
                  key={t.hours}
                  type="button"
                  className={`what-if-chip ${timeOffset === t.hours ? 'active' : ''}`}
                  onClick={() => setTimeOffset(t.hours)}
                  aria-pressed={timeOffset === t.hours}
                >
                  {t.label === 'Now' ? translateText('Now', language) : t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Vessel profile, Size & Objective selectors */}
          <div className="what-if-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
            <label className="what-if-field">
              <span>{translateText('Vessel profile', language)}</span>
              <select
                value={craftOverride}
                onChange={(e) => setCraftOverride(e.target.value as MissionContext['craft_profile'])}
              >
                {CRAFT_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {translateText(c.label, language)}
                  </option>
                ))}
              </select>
            </label>

            <label className="what-if-field">
              <span>{translateText('Vessel size', language)}</span>
              <select
                value={vesselSizeOverride}
                onChange={(e) => setVesselSizeOverride(e.target.value as NonNullable<MissionContext['vessel_size']>)}
              >
                <option value="small">{translateText('Small', language)}</option>
                <option value="medium">{translateText('Medium', language)}</option>
                <option value="large">{translateText('Large', language)}</option>
              </select>
            </label>

            <label className="what-if-field">
              <span>{translateText('Objective', language)}</span>
              <select
                value={objective}
                onChange={(e) => setObjective(e.target.value as 'pfz' | 'safety' | 'transit')}
              >
                {OBJECTIVES.map((o) => {
                  let translatedLabel: string = o.label;
                  if (o.value === 'pfz') translatedLabel = `🐟 ${translateText('PFZ Harvesting', language)}`;
                  else if (o.value === 'safety') translatedLabel = `⚓ ${translateText('Coastal Safety', language)}`;
                  else if (o.value === 'transit') translatedLabel = `🧭 ${translateText('Safe Passage', language)}`;
                  return (
                    <option key={o.value} value={o.value}>
                      {translatedLabel}
                    </option>
                  );
                })}
              </select>
            </label>
          </div>

          {/* Action button */}
          <div className="what-if-actions">
            <button
              type="button"
              className="what-if-run-btn"
              onClick={handleRunSimulation}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <RefreshCw size={13} className="spin" /> {translateText('Simulating...', language)}
                </>
              ) : (
                <>
                  <Sparkles size={13} /> {translateText('Run What-If Simulation', language)}
                </>
              )}
            </button>
          </div>

          {/* Decision Diff card */}
          {activeDiff && (
            <div className="what-if-diff-card" role="region" aria-label="Decision Diff Analysis">
              <div className="diff-header">
                <span className="diff-title">{translateText('Counterfactual Decision Impact', language)}</span>
                <span className="diff-timestamp">+{activeDiff.timeOffsetHours}h {translateText('offset', language)}</span>
              </div>
              <div className="diff-comparison">
                <div className="diff-status-item">
                  <small>{translateText('Baseline', language)}</small>
                  <span className={`status-pill status-${activeDiff.baselineStatus.toLowerCase().replace('_', '-')}`}>
                    {activeDiff.baselineStatus.replace('_', '-')}
                  </span>
                </div>
                <ArrowRight size={14} className="diff-arrow" />
                <div className="diff-status-item">
                  <small>{translateText('Simulated', language)}</small>
                  <span className={`status-pill status-${activeDiff.simulatedStatus.toLowerCase().replace('_', '-')}`}>
                    {activeDiff.simulatedStatus.replace('_', '-')}
                  </span>
                </div>
              </div>

              {activeDiff.summary && (
                <p className="diff-summary">{translateText(activeDiff.summary, language)}</p>
              )}

              {/* M1.4 Decision Delta Panel */}
              <DecisionDeltaPanel diff={activeDiff} language={language} />

              {(craftOverride !== currentContext.craft_profile || vesselSizeOverride !== (currentContext.vessel_size ?? 'medium')) && (
                <button
                  type="button"
                  className={`diff-apply-btn ${applied ? 'applied' : ''}`}
                  onClick={handleApply}
                  disabled={applied}
                >
                  {applied ? (
                    <>
                      <Check size={13} /> {translateText('Profile Applied', language)}
                    </>
                  ) : (
                    translateText('Apply simulated craft & size to mission context', language)
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
