import React, { useState } from 'react';
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
  submitFieldObservation,
  corroborateFieldObservation,
} from '../../api/client';
import type { FieldObservation, SubmitObservationPayload } from '../../types/contracts';

interface CommunityObservationsPanelProps {
  harbor?: string;
  userCoordinates?: [number, number] | null;
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

const SNAPSHOT_OBSERVATIONS: FieldObservation[] = [
  {
    public_id: 'OBS-DEMO-01',
    observation_type: 'ROUGH_SEA',
    severity: 'MODERATE',
    description: '2m swell and moderate choppy conditions near northern corridor.',
    observed_at: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
    valid_until: new Date(Date.now() + 3 * 3600 * 1000).toISOString(),
    approx_latitude: 17.02,
    approx_longitude: 73.26,
    approx_radius_km: 5.0,
    harbor_reference: 'Ratnagiri',
    verification_status: 'CORROBORATED',
    corroboration_count: 3,
    contributor_trust: 'ESTABLISHED',
    official_agreement: true,
    source_type: 'COMMUNITY',
    data_mode: 'FIELD_SIGNAL',
    lineage_label: '[FIELD SIGNAL]',
    safety_disclaimer: 'Community field signals inform confidence but do NOT override official constraints.',
    evidence_count: 0,
    is_demo: true,
  },
  {
    public_id: 'OBS-DEMO-02',
    observation_type: 'FISH_ACTIVITY',
    severity: 'MILD',
    description: 'Surface feeding observed around 12nm southwest of Ratnagiri lighthouse.',
    observed_at: new Date(Date.now() - 75 * 60 * 1000).toISOString(),
    valid_until: new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
    approx_latitude: 16.92,
    approx_longitude: 73.18,
    approx_radius_km: 5.0,
    harbor_reference: 'Ratnagiri',
    verification_status: 'UNVERIFIED',
    corroboration_count: 0,
    contributor_trust: 'PHONE_VERIFIED',
    official_agreement: null,
    source_type: 'COMMUNITY',
    data_mode: 'FIELD_SIGNAL',
    lineage_label: '[FIELD SIGNAL]',
    safety_disclaimer: 'Community field signals inform confidence but do NOT override official constraints.',
    evidence_count: 0,
    is_demo: true,
  },
];

export const CommunityObservationsPanel: React.FC<CommunityObservationsPanelProps> = ({
  harbor = 'Ratnagiri',
  userCoordinates,
  onSelectLocation,
}) => {
  const [observations, setObservations] = useState<FieldObservation[]>(SNAPSHOT_OBSERVATIONS);
  const [epistemicNotice, setEpistemicNotice] = useState<string>(
    'Missing community reports in an area do NOT imply safe conditions. ORCA uses official sources as the primary safety authority.',
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [showSubmitModal, setShowSubmitModal] = useState<boolean>(false);
  const [selectedType, setSelectedType] = useState<string>('ROUGH_SEA');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('MODERATE');
  const [description, setDescription] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [corroboratingId, setCorroboratingId] = useState<string | null>(null);

  const fetchObservations = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await getFieldObservations({ harbor, include_demo: true });
      if (res && res.observations) {
        setObservations(res.observations);
        setEpistemicNotice(res.epistemic_notice);
      }
    } catch {
      // Retain snapshot
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const lat = userCoordinates ? userCoordinates[1] : 16.99;
      const lon = userCoordinates ? userCoordinates[0] : 73.30;
      const payload: SubmitObservationPayload = {
        observation_type: selectedType,
        severity: selectedSeverity,
        description: description.trim() || undefined,
        latitude: lat,
        longitude: lon,
        harbor_reference: harbor,
      };
      await submitFieldObservation(payload);
      setShowSubmitModal(false);
      setDescription('');
      await fetchObservations(true);
    } catch (err) {
      console.error('Failed to submit observation', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCorroborate = async (obs: FieldObservation) => {
    setCorroboratingId(obs.public_id);
    try {
      await corroborateFieldObservation(obs.public_id, {
        latitude: obs.approx_latitude,
        longitude: obs.approx_longitude,
      });
      await fetchObservations(true);
    } catch (err) {
      console.error('Failed to corroborate', err);
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

  const getTrustBadgeClass = (trust: string) => {
    switch (trust) {
      case 'ESTABLISHED':
        return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
      case 'PHONE_VERIFIED':
        return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
      default:
        return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
    }
  };

  return (
    <div className="space-y-4 text-slate-800 dark:text-slate-100">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-4 bg-white/70 dark:bg-slate-900/70 backdrop-blur rounded-2xl border border-slate-200/60 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-base tracking-tight">Community Field Intelligence</h3>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-cyan-100 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 font-medium">
                [FIELD SIGNAL]
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Crowdsourced observations near {harbor} (privacy-preserved ~5km grid)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fetchObservations(true)}
            disabled={refreshing}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            title="Refresh feed"
          >
            <RefreshCw className={`w-4 h-4 text-slate-600 dark:text-slate-300 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => setShowSubmitModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            Report Signal
          </button>
        </div>
      </div>

      {/* Safety Invariant Notice (C-1 & C-2) */}
      <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
        <div>
          <span className="font-medium">Safety Standard: </span>
          {epistemicNotice || 'Missing community reports in an area do not imply safe conditions. Community signals inform confidence but never override official authority constraints.'}
        </div>
      </div>

      {/* Feed list */}
      <div className="space-y-2.5">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400">Loading field observations...</div>
        ) : observations.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400 border border-dashed rounded-2xl border-slate-300 dark:border-slate-800">
            No active community signals reported near {harbor} in the last 12 hours.
          </div>
        ) : (
          observations.map((obs) => {
            const isCorroborated = obs.verification_status === 'CORROBORATED';
            return (
              <div
                key={obs.public_id}
                className="p-3.5 bg-white/60 dark:bg-slate-900/60 backdrop-blur rounded-xl border border-slate-200/50 dark:border-slate-800/80 hover:border-cyan-500/30 transition flex flex-col gap-2 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold tracking-wide uppercase px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      {obs.observation_type.replace(/_/g, ' ')}
                    </span>
                    {obs.severity && (
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                        obs.severity === 'SEVERE' || obs.severity === 'EXTREME'
                          ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                          : 'bg-slate-500/10 text-slate-600 dark:text-slate-400'
                      }`}>
                        {obs.severity}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{formatTimeAgo(obs.observed_at)}</span>
                  </div>
                </div>

                {obs.description && (
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    "{obs.description}"
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-800/60 text-[11px]">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-medium ${getTrustBadgeClass(obs.contributor_trust)}`}>
                      {obs.contributor_trust.replace(/_/g, ' ')}
                    </span>

                    {isCorroborated && (
                      <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                        <CheckCircle2 className="w-3 h-3" />
                        Corroborated ({obs.corroboration_count})
                      </span>
                    )}

                    {onSelectLocation && (
                      <button
                        type="button"
                        onClick={() => onSelectLocation([obs.approx_longitude, obs.approx_latitude])}
                        className="flex items-center gap-1 text-cyan-600 hover:text-cyan-700 dark:text-cyan-400 hover:underline"
                      >
                        <Navigation className="w-3 h-3" />
                        ~{obs.approx_latitude.toFixed(2)}, {obs.approx_longitude.toFixed(2)}
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={corroboratingId === obs.public_id}
                    onClick={() => handleCorroborate(obs)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-cyan-50 dark:hover:bg-cyan-950 text-slate-700 dark:text-slate-200 text-xs font-medium transition"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-cyan-600" />
                    <span>+1 Confirm ({obs.corroboration_count})</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Submit Observation Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3 border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-cyan-600" />
                <h4 className="font-semibold text-base">Submit Field Signal</h4>
              </div>
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">
                  Condition / Observation Type
                </label>
                <div className="grid grid-cols-2 gap-2">
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
                        className={`flex items-center gap-2 p-2.5 rounded-xl border text-left transition ${
                          isSel
                            ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-950/50 text-cyan-700 dark:text-cyan-300 font-semibold'
                            : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <Icon className="w-4 h-4 flex-shrink-0" />
                        <span className="truncate">{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">
                  Severity / Intensity
                </label>
                <div className="flex gap-2">
                  {['MILD', 'MODERATE', 'SEVERE', 'EXTREME'].map((sev) => (
                    <button
                      type="button"
                      key={sev}
                      onClick={() => setSelectedSeverity(sev)}
                      className={`flex-1 py-1.5 rounded-lg border text-center font-medium transition ${
                        selectedSeverity === sev
                          ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-950/50 text-cyan-700 dark:text-cyan-300 font-semibold'
                          : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {sev}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-medium mb-1 text-slate-700 dark:text-slate-300">
                  Field Notes / Description (Optional)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Swell wave height around 2m, currents setting to southeast..."
                  rows={3}
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500 text-xs"
                />
              </div>

              <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/60 text-[11px] text-slate-500">
                Privacy Protection: Your exact coordinates are blurred to a ~5km grid cell. No personal identifying information is published.
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowSubmitModal(false)}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-300 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white font-semibold transition"
                >
                  <Send className="w-3.5 h-3.5" />
                  {submitting ? 'Submitting...' : 'Post Field Signal'}
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
