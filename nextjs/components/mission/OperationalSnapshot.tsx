import type React from 'react';
import { Activity, AlertTriangle, CheckCircle2, FileCheck2, RadioTower, ShieldAlert } from 'lucide-react';
import type { ChatResponse } from '../../types/contracts';
import type { MissionContext, OperationalRole } from '../../types/mission';

interface OperationalSnapshotProps {
  role: OperationalRole;
  context: MissionContext;
  response: ChatResponse | null;
  onOpenEvidence: () => void;
}

export default function OperationalSnapshot({
  role,
  context,
  response,
  onOpenEvidence,
}: OperationalSnapshotProps) {
  const status = response?.recommendation.status ?? 'READY';
  const evidenceCount = response?.evidence.length ?? 0;
  const traceCount = response?.trace.length ?? 0;
  const warningCount = response?.warnings.length ?? 0;

  if (role === 'fisher') {
    return (
      <section className="operational-snapshot fisher-snapshot" aria-label="Voyage brief">
        <div className="snapshot-icon"><RadioTower size={17} /></div>
        <div>
          <span className="snapshot-eyebrow">Voyage brief</span>
          <strong>{context.origin_harbor} · {formatCraft(context.craft_profile)}</strong>
          <p>{response ? `Latest advisory: ${status.replace('_', '-')}.` : 'Set your context, then ask SAMUDRA before leaving port.'}</p>
        </div>
        {response && evidenceCount > 0 && (
          <button type="button" onClick={onOpenEvidence} className="snapshot-action">
            <FileCheck2 size={14} /> Evidence
          </button>
        )}
      </section>
    );
  }

  return (
    <section className="operational-snapshot authority-snapshot" aria-label="Operational monitoring summary">
      <div className="authority-snapshot-heading">
        <div>
          <span className="snapshot-eyebrow">Authority operational view</span>
          <strong>Decision audit summary</strong>
        </div>
        <span className={`authority-status status-${status.toLowerCase().replace('_', '-')}`}>
          {status === 'READY' ? <CheckCircle2 size={13} /> : <ShieldAlert size={13} />}
          {status.replace('_', '-')}
        </span>
      </div>
      <div className="authority-metrics">
        <Metric icon={<FileCheck2 size={14} />} label="Evidence" value={evidenceCount} />
        <Metric icon={<Activity size={14} />} label="Trace steps" value={traceCount} />
        <Metric icon={<AlertTriangle size={14} />} label="Warnings" value={warningCount} />
      </div>
      <button type="button" onClick={onOpenEvidence} className="authority-audit-link" disabled={!response}>
        Review evidence and high-level execution trace
      </button>
    </section>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return <div className="authority-metric"><span>{icon}</span><strong>{value}</strong><small>{label}</small></div>;
}

function formatCraft(profile: MissionContext['craft_profile']): string {
  if (profile === 'traditional_non_motorized') return 'Traditional craft';
  if (profile === 'mechanized_trawler') return 'Mechanized trawler';
  return 'Motorized boat';
}
