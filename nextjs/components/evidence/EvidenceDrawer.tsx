import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import type { EvidenceItem, AgentTraceItem } from '../../types/contracts';
import { TRANSLATIONS, type SupportedLanguage } from '../../i18n/translations';
import EvidenceCard from './EvidenceCard';
import AgentTimeline from '../trace/AgentTimeline';
import { X, FileText, Activity } from 'lucide-react';

interface EvidenceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  evidence: EvidenceItem[];
  trace: AgentTraceItem[];
  language?: SupportedLanguage;
}

export default function EvidenceDrawer({
  isOpen,
  onClose,
  evidence,
  trace,
  language = 'en',
}: EvidenceDrawerProps) {
  const [activeTab, setActiveTab] = useState<'evidence' | 'trace'>('evidence');
  const t = TRANSLATIONS[language] || TRANSLATIONS.en;

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="drawer-overlay" />
        <Dialog.Content
          className="evidence-drawer"
          aria-describedby={undefined}
        >
          <div className="drawer-header">
            <Dialog.Title className="sr-only">
              {t.drawerTitleEvidence} & {t.drawerTitleTrace}
            </Dialog.Title>
            <div className="drawer-tabs">
              <button
                type="button"
                className={`drawer-tab ${activeTab === 'evidence' ? 'active' : ''}`}
                onClick={() => setActiveTab('evidence')}
              >
                <FileText size={16} />
                <span>{t.drawerTitleEvidence} ({evidence.length})</span>
              </button>
              <button
                type="button"
                className={`drawer-tab ${activeTab === 'trace' ? 'active' : ''}`}
                onClick={() => setActiveTab('trace')}
              >
                <Activity size={16} />
                <span>{t.drawerTitleTrace} ({trace.length})</span>
              </button>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="drawer-close-btn"
                aria-label="Close drawer"
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          <div className="drawer-content">
            {activeTab === 'evidence' ? (
              <div className="evidence-list">
                {evidence.length === 0 ? (
                  <div className="drawer-empty">
                    <p>{t.drawerEmptyEvidence}</p>
                  </div>
                ) : (
                  evidence.map((item, idx) => (
                    <EvidenceCard key={idx} evidence={item} />
                  ))
                )}
              </div>
            ) : (
              <div className="trace-container">
                {trace.length === 0 ? (
                  <div className="drawer-empty">
                    <p>{t.drawerEmptyTrace}</p>
                  </div>
                ) : (
                  <AgentTimeline trace={trace} />
                )}
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

