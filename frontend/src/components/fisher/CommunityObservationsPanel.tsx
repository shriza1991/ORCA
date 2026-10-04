import React, { useState, useEffect, useRef } from 'react';
import {
  Users,
  AlertTriangle,
  Waves,
  Wind,
  Eye,
  Fish,
  ShieldCheck,
  Clock,
  Plus,
  CheckCircle2,
  RefreshCw,
  Send,
  Navigation,
} from 'lucide-react';
import {
  getFieldObservations,
  uploadFieldImage,
  submitFieldObservation,
  corroborateFieldObservation,
} from '../../api/client';
import { useVoiceRecorder } from '../../hooks/useVoiceRecorder';
import type { FieldObservation, SubmitObservationPayload } from '../../types/contracts';

interface CommunityObservationsPanelProps {
  harbor?: string;
  userCoordinates?: [number, number] | null;
  onSignals?: (signals: FieldObservation[]) => void;
  dataMode?: string;
  craftProfile?: string;
  onSelectLocation?: (coords: [number, number]) => void;
}

const OBSERVATION_TYPES = [
  { id: 'ROUGH_SEA', label: 'Rough Sea / Swell', icon: Waves, defaultSeverity: 'MODERATE' },
  { id: 'CALM_SEA', label: 'Calm Sea', icon: Waves, defaultSeverity: 'MILD' },
  { id: 'HIGH_WIND', label: 'High Wind / Gusts', icon: Wind, defaultSeverity: 'MODERATE' },
  { id: 'LOW_VISIBILITY', label: 'Low Visibility / Fog', icon: Eye, defaultSeverity: 'MODERATE' },
  { id: 'FISH_ACTIVITY', label: 'Fish Activity / Shoal', icon: Fish, defaultSeverity: 'MILD' },
  { id: 'DEBRIS', label: 'Floating Debris / Hazard', icon: AlertTriangle, defaultSeverity: 'SEVERE' },
];

export const CommunityObservationsPanel: React.FC<CommunityObservationsPanelProps> = ({
  harbor = 'Ratnagiri',
  userCoordinates,
  onSelectLocation,
  onSignals,
  dataMode = 'DEMO',
  craftProfile,
}) => {
  const [observations, setObservations] = useState<FieldObservation[]>([]);
  const [epistemicNotice, setEpistemicNotice] = useState<string>(
    'Missing community reports in an area do NOT imply safe conditions. ORCA uses official sources as the primary safety authority.',
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [showSubmitModal, setShowSubmitModal] = useState<boolean>(false);
  const [selectedType, setSelectedType] = useState<string>('ROUGH_SEA');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('MODERATE');
  const [description, setDescription] = useState<string>('');
  const notesVoice = useVoiceRecorder({
    onTranscription: (result) => setDescription(result.transcript),
    onError: (msg) => setActionError(msg),
  });
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const generation = useRef(0);
  const onSignalsRef = useRef(onSignals);
  onSignalsRef.current = onSignals;
  const [locationConfirmed, setLocationConfirmed] = useState(false);
  const [corroboratingId, setCorroboratingId] = useState<string | null>(null);

  const fetchObservations = async (isRefresh = false) => {
    const gen = ++generation.current;
    setActionError(null);
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await getFieldObservations({
        harbor,
        include_demo: ['DEMO', 'SNAPSHOT', 'SYNTHETIC'].includes(dataMode.toUpperCase()),
      });
      if (gen === generation.current && res && res.observations) {
        onSignalsRef.current?.(res.observations);
        setObservations(res.observations);
        setEpistemicNotice(res.epistemic_notice);
      }
    } catch {
      if (gen === generation.current)
        setActionError('Field reports unavailable. Missing reports do not establish safety.');
    } finally {
      if (gen === generation.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  useEffect(() => {
    setObservations([]);
    onSignalsRef.current?.([]);
    setLocationConfirmed(false);
    setPhoto(null);
    fetchObservations();
    return () => {
      generation.current++;
    };
  }, [harbor, dataMode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userCoordinates || !locationConfirmed) {
      setActionError('Confirm a real observation location before posting.');
      return;
    }
    setSubmitting(true);
    setActionError(null);
    try {
      const [lon, lat] = userCoordinates;
      const uploaded = photo ? await uploadFieldImage(photo) : null;
      const payload: SubmitObservationPayload = {
        observation_type: selectedType,
        severity: selectedSeverity,
        description: description.trim() || undefined,
        latitude: lat,
        longitude: lon,
        harbor_reference: harbor,
        origin_harbor: harbor,
        craft_profile: craftProfile,
        is_demo: dataMode.toUpperCase() === 'DEMO',
        media_keys: uploaded ? [uploaded.key] : undefined,
      };
      await submitFieldObservation(payload);
      setShowSubmitModal(false);
      setDescription('');
      setPhoto(null);
      await fetchObservations(true);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Observation was not saved. Retry later.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleCorroborate = async (obs: FieldObservation) => {
    if (!userCoordinates || !locationConfirmed) {
      setActionError(
        'Confirm your current observation location in the report form before confirming a report.',
      );
      setShowSubmitModal(true);
      return;
    }
    setActionError(null);
    setCorroboratingId(obs.public_id);
    try {
      await corroborateFieldObservation(obs.public_id, {
        latitude: userCoordinates[1],
        longitude: userCoordinates[0],
      });
      await fetchObservations(true);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Confirmation was not saved.');
    } finally {
      setCorroboratingId(null);
    }
  };

  const formatTimeAgo = (iso: string) => {
    try {
      const diffMs = Date.now() - new Date(iso).getTime();
      const mins = Math.max(1, Math.round(diffMs / 60000));
      if (mins < 60) return `${mins}m ago`;
      const hours = Math.round(mins / 60);
      return `${hours}h ago`;
    } catch {
      return 'Recently';
    }
  };

  return (
    <div className="community-panel">
      {actionError && (
        <p role="alert" className="product-notice">
          {actionError}
        </p>
      )}

      {/* Advisory context banner */}
      <p className="community-disclaimer">
        Anonymous field reports are contextual evidence. They do not authorize departure or change official limits. Demo records are read-only; refresh your mission to inspect newly available context.
      </p>

      {/* Header */}
      <div className="community-header">
        <div className="community-header-left">
          <div className="community-icon-box">
            <Users size={20} />
          </div>
          <div className="community-title-col">
            <div className="community-title-row">
              <h3 className="community-title">Community Field Intelligence</h3>
              <span className="community-badge-signal">[FIELD SIGNAL]</span>
            </div>
            <p className="community-subtitle">
              Crowdsourced observations near {harbor} (privacy-preserved ~5km grid)
            </p>
          </div>
        </div>

        <div className="community-header-actions">
          <button
            type="button"
            onClick={() => fetchObservations(true)}
            disabled={refreshing}
            className="community-btn-refresh"
            title="Refresh feed"
            aria-label="Refresh feed"
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button
            type="button"
            onClick={() => setShowSubmitModal(true)}
            className="community-btn-report"
          >
            <Plus size={15} />
            Report Signal
          </button>
        </div>
      </div>

      {/* Safety Invariant Notice */}
      <div className="community-safety-banner">
        <AlertTriangle size={16} />
        <div>
          <strong>Safety Standard: </strong>
          {epistemicNotice ||
            'Missing community reports in an area do not imply safe conditions. Community signals inform confidence but never override official authority constraints.'}
        </div>
      </div>

      {/* Feed list */}
      <div className="community-feed">
        {loading ? (
          <div className="community-feed-loading">Loading field observations...</div>
        ) : observations.length === 0 ? (
          <div className="community-feed-empty">
            No active community signals reported near {harbor} in the last 12 hours.
          </div>
        ) : (
          observations.map((obs) => {
            const isCorroborated = obs.verification_status === 'CORROBORATED';
            const sevLower = (obs.severity || 'mild').toLowerCase();
            const trustLower = (obs.contributor_trust || 'anonymous').toLowerCase();

            return (
              <div key={obs.public_id} className="community-card">
                <div className="community-card-top">
                  <div className="community-card-badges">
                    <span className="community-tag-type">
                      {obs.observation_type.replace(/_/g, ' ')}
                    </span>
                    {obs.severity && (
                      <span className={`community-tag-sev sev-${sevLower}`}>
                        {obs.severity}
                      </span>
                    )}
                  </div>

                  <div className="community-card-time">
                    <Clock size={13} />
                    <span>{formatTimeAgo(obs.observed_at)}</span>
                  </div>
                </div>

                {(obs.is_demo || (obs.valid_until && Date.parse(obs.valid_until) < Date.now())) && (
                  <div className="community-context-pills">
                    {obs.is_demo && (
                      <span className="community-pill-demo">
                        DEMO DATA · {obs.persistence === 'DEMO_FIXTURE' ? 'Read-only fixture' : 'Saved demonstration report'}
                      </span>
                    )}
                    {obs.valid_until && Date.parse(obs.valid_until) < Date.now() && (
                      <span className="community-pill-expired">
                        Expired context · Not current evidence
                      </span>
                    )}
                  </div>
                )}

                {obs.description && (
                  <p className="community-card-desc">
                    "{obs.description}"
                  </p>
                )}

                <div className="community-card-footer">
                  <div className="community-footer-meta">
                    <span className={`community-trust-tag trust-${trustLower}`}>
                      {obs.contributor_trust.replace(/_/g, ' ')}
                    </span>

                    {isCorroborated && (
                      <span className="community-corroboration-count">
                        <CheckCircle2 size={13} />
                        <span>Device reports ({obs.corroboration_count})</span>
                      </span>
                    )}

                    {onSelectLocation && (
                      <button
                        type="button"
                        onClick={() => onSelectLocation([obs.approx_longitude, obs.approx_latitude])}
                        className="community-btn-loc"
                        title="View approximate location on map"
                      >
                        <Navigation size={12} />
                        <span>~{obs.approx_latitude.toFixed(2)}, {obs.approx_longitude.toFixed(2)}</span>
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={corroboratingId === obs.public_id || obs.persistence === 'DEMO_FIXTURE'}
                    onClick={() => handleCorroborate(obs)}
                    className="community-btn-agree"
                    title={obs.persistence === 'DEMO_FIXTURE' ? 'Read-only demo fixture' : 'Confirm this report'}
                  >
                    <ShieldCheck size={14} style={{ color: 'var(--product-accent, #006b69)' }} />
                    <span>Report agreement ({obs.corroboration_count})</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Submit Observation Modal */}
      {showSubmitModal && (
        <div className="community-modal-backdrop">
          <div className="community-modal-dialog">
            <div className="community-modal-header">
              <div className="community-modal-title">
                <Users size={18} style={{ color: 'var(--product-accent, #006b69)' }} />
                <h4>Submit Field Signal</h4>
              </div>
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                className="community-modal-close"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="community-modal-form">
              <label className="community-form-checkbox-label">
                <input
                  type="checkbox"
                  checked={locationConfirmed}
                  onChange={(e) => setLocationConfirmed(e.target.checked)}
                  disabled={!userCoordinates}
                />
                <span>
                  I observed this at{' '}
                  {userCoordinates
                    ? `${userCoordinates[1].toFixed(3)}, ${userCoordinates[0].toFixed(3)}`
                    : 'location unavailable'}
                  . The public location will be approximate.
                </span>
              </label>

              <label className="community-form-file-label">
                <span>Optional private photo (JPEG/PNG/WebP, up to 5 MB)</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f && f.size > 5 * 1024 * 1024) {
                      setActionError('Photo must be under 5 MB.');
                      return;
                    }
                    setPhoto(f || null);
                  }}
                />
              </label>

              <div>
                <span className="community-form-section-title">
                  Condition / Observation Type
                </span>
                <div className="community-type-grid">
                  {OBSERVATION_TYPES.map((t) => {
                    const Icon = t.icon;
                    const isSel = selectedType === t.id;
                    return (
                      <button
                        type="button"
                        key={t.id}
                        onClick={() => {
                          setSelectedType(t.id);
                          setSelectedSeverity(t.defaultSeverity);
                        }}
                        className={`community-type-btn ${isSel ? 'selected' : ''}`}
                      >
                        <Icon size={16} />
                        <span>{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <span className="community-form-section-title">
                  Severity / Intensity
                </span>
                <div className="community-sev-row">
                  {['MILD', 'MODERATE', 'SEVERE', 'EXTREME'].map((sev) => (
                    <button
                      type="button"
                      key={sev}
                      onClick={() => setSelectedSeverity(sev)}
                      className={`community-sev-btn ${selectedSeverity === sev ? 'selected' : ''}`}
                    >
                      {sev}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="community-form-section-title">
                  Field Notes / Description (Optional)
                </span>
                {notesVoice.isSupported && (
                  <button
                    type="button"
                    disabled={notesVoice.isTranscribing}
                    onClick={() =>
                      notesVoice.isRecording
                        ? notesVoice.stopRecording()
                        : notesVoice.startRecording()
                    }
                    className="community-voice-dictate-btn"
                  >
                    {notesVoice.isRecording
                      ? 'Stop dictating notes'
                      : notesVoice.isTranscribing
                        ? 'Recognizing notes…'
                        : 'Dictate field notes'}
                  </button>
                )}
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Swell wave height around 2m, currents setting to southeast..."
                  rows={3}
                  className="community-textarea"
                />
              </div>

              <div className="community-privacy-notice">
                <strong>Privacy Protection:</strong> Only approximate coordinates are stored. Photo GPS metadata is removed. Your coordinates are blurred to a ~5km grid cell. Device identity and exact GPS are not published. Do not include personal details in notes.
              </div>

              <div className="community-modal-actions">
                <button
                  type="button"
                  onClick={() => setShowSubmitModal(false)}
                  className="community-btn-cancel"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !userCoordinates || !locationConfirmed}
                  className="community-btn-submit"
                >
                  <Send size={14} />
                  <span>{submitting ? 'Submitting...' : 'Post Field Signal'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CommunityObservationsPanel;
