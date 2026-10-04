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
  onSelectLocation, onSignals, dataMode = "DEMO", craftProfile,
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
  const notesVoice = useVoiceRecorder({ onTranscription: result => setDescription(result.transcript), onError: msg => setActionError(msg) });
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const generation = useRef(0);
  const onSignalsRef = useRef(onSignals); onSignalsRef.current = onSignals;
  const [locationConfirmed, setLocationConfirmed] = useState(false);
  const [corroboratingId, setCorroboratingId] = useState<string | null>(null);

  const fetchObservations = async (isRefresh = false) => {
    const gen = ++generation.current;
    setActionError(null);
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await getFieldObservations({ harbor, include_demo: ["DEMO", "SNAPSHOT", "SYNTHETIC"].includes(dataMode.toUpperCase()) });
      if (gen === generation.current && res && res.observations) {
        onSignalsRef.current?.(res.observations);
        setObservations(res.observations);
        setEpistemicNotice(res.epistemic_notice);
      }
    } catch {
      if (gen === generation.current) setActionError("Field reports unavailable. Missing reports do not establish safety.");
    } finally {
      if (gen === generation.current) { setLoading(false); setRefreshing(false); }
    }
  };

  useEffect(() => {
    setObservations([]); onSignalsRef.current?.([]);
    setLocationConfirmed(false); setPhoto(null);
    fetchObservations();
    return () => { generation.current++; };
  }, [harbor, dataMode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userCoordinates || !locationConfirmed) { setActionError("Confirm a real observation location before posting."); return; }
    setSubmitting(true); setActionError(null);
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
        is_demo: dataMode.toUpperCase() === "DEMO",
        media_keys: uploaded ? [uploaded.key] : undefined,
      };
      await submitFieldObservation(payload);
      setShowSubmitModal(false);
      setDescription(''); setPhoto(null);
      await fetchObservations(true);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Observation was not saved. Retry later.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCorroborate = async (obs: FieldObservation) => {
    if (!userCoordinates || !locationConfirmed) { setActionError("Confirm your current observation location in the report form before confirming a report."); setShowSubmitModal(true); return; }
    setActionError(null); setCorroboratingId(obs.public_id);
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
      {actionError && <p role="alert" className="product-notice">{actionError}</p>}
      <p className="muted">Anonymous field reports are contextual evidence. They do not authorize departure or change official limits. Demo records are read-only; refresh your mission to inspect newly available context.</p>
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

                {obs.is_demo && <small className="muted">DEMO DATA ? {obs.persistence === "DEMO_FIXTURE" ? "Read-only fixture" : "Saved demonstration report"}</small>}
                {obs.valid_until && Date.parse(obs.valid_until) < Date.now() && <small className="muted">Expired context ? not current evidence</small>}
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
                        Device reports ({obs.corroboration_count})
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
                    disabled={corroboratingId === obs.public_id || obs.persistence === "DEMO_FIXTURE"}
                    onClick={() => handleCorroborate(obs)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-cyan-50 dark:hover:bg-cyan-950 text-slate-700 dark:text-slate-200 text-xs font-medium transition"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-cyan-600" />
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
              <label className="block"><input type="checkbox" checked={locationConfirmed} onChange={e => setLocationConfirmed(e.target.checked)} disabled={!userCoordinates} /> I observed this at {userCoordinates ? `${userCoordinates[1].toFixed(3)}, ${userCoordinates[0].toFixed(3)}` : 'location unavailable'}. The public location will be approximate.</label>
              <label className="block">Optional private photo (JPEG/PNG/WebP, up to 5 MB)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { const f=e.target.files?.[0]; if (f && f.size > 5 * 1024 * 1024) { setActionError('Photo must be under 5 MB.'); return; } setPhoto(f || null); }} /></label>
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
                <button type="button" disabled={!notesVoice.isSupported || notesVoice.isTranscribing} onClick={() => notesVoice.isRecording ? notesVoice.stopRecording() : notesVoice.startRecording()}>{notesVoice.isRecording ? 'Stop dictating notes' : notesVoice.isTranscribing ? 'Recognizing notes?' : 'Dictate field notes'}</button>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Swell wave height around 2m, currents setting to southeast..."
                  rows={3}
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500 text-xs"
                />
              </div>

              <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/60 text-[11px] text-slate-500">
                Privacy Protection: Only approximate coordinates are stored. Photo GPS metadata is removed. Your coordinates are blurred to a ~5km grid cell. Device identity and exact GPS are not published. Do not include personal details in notes.
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
                  disabled={submitting || !userCoordinates || !locationConfirmed}
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
