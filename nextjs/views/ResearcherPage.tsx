import { useState, Component, type ErrorInfo, type ReactNode } from 'react';
import {
  Beaker, Waves, Database, FlaskConical, MessageSquareText, AlertOctagon, RotateCcw,
} from 'lucide-react';
import OceanDataExplorer from '../components/researcher/OceanDataExplorer';
import DataSourceMonitor from '../components/researcher/DataSourceMonitor';
import ScenarioLab from '../components/researcher/ScenarioLab';
import QueryWorkbench from '../components/researcher/QueryWorkbench';
import { CANONICAL_DATA_MODE_LABEL, CANONICAL_DATA_MODE_TOOLTIP } from '../api/researcher-client';

type ResearcherDeck = 'ocean' | 'sources' | 'scenarios' | 'query';

interface ErrorBoundaryProps {
  children: ReactNode;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class DeckErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ResearcherDeck Error caught:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="researcher-empty-results" style={{ padding: '3rem 1.5rem', textAlign: 'center', background: 'var(--card, #0f172a)', borderRadius: '8px', border: '1px solid var(--border, #334155)', margin: '1rem' }}>
          <AlertOctagon size={32} style={{ color: '#ef4444', marginBottom: '0.75rem' }} />
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--foreground, #f8fafc)', marginBottom: '0.5rem' }}>
            Deck Rendering Error
          </h3>
          <p style={{ color: 'var(--muted-foreground, #94a3b8)', maxWidth: '480px', margin: '0 auto 1rem', fontSize: '0.875rem' }}>
            {this.state.error?.message || 'An unexpected error occurred while displaying this lab component.'}
          </p>
          <button
            className="researcher-refresh-btn"
            onClick={this.handleReset}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', borderRadius: '6px', background: 'var(--accent, #38bdf8)', color: '#000', fontWeight: 500, cursor: 'pointer', border: 'none' }}
          >
            <RotateCcw size={14} />
            <span>Retry Component</span>
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const DECKS: { id: ResearcherDeck; label: string; icon: typeof Waves }[] = [
  { id: 'ocean', label: 'Ocean Data', icon: Waves },
  { id: 'sources', label: 'Data Sources', icon: Database },
  { id: 'scenarios', label: 'Scenario Lab', icon: FlaskConical },
  { id: 'query', label: 'Query Workbench', icon: MessageSquareText },
];

export default function ResearcherPage() {
  const [activeDeck, setActiveDeck] = useState<ResearcherDeck>('ocean');

  return (
    <div className="researcher-page">
      {/* Command Bar */}
      <div className="researcher-command-bar">
        <div className="researcher-bar-left">
          <Beaker size={16} className="researcher-bar-icon" />
          <span className="researcher-bar-title">Researcher Lab</span>
          <div
            className="researcher-data-mode-badge"
            title={CANONICAL_DATA_MODE_TOOLTIP}
            aria-label={CANONICAL_DATA_MODE_LABEL}
          >
            <Database size={12} />
            <span>{CANONICAL_DATA_MODE_LABEL}</span>
          </div>
        </div>

        <nav className="researcher-nav-segmented" role="tablist" aria-label="Research deck navigation">
          {DECKS.map(d => {
            const Icon = d.icon;
            return (
              <button
                key={d.id}
                className={`researcher-segment-btn ${activeDeck === d.id ? 'active' : ''}`}
                onClick={() => setActiveDeck(d.id)}
                role="tab"
                aria-selected={activeDeck === d.id}
              >
                <Icon size={14} />
                <span>{d.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Active Deck Content */}
      <div className="researcher-deck-content">
        <DeckErrorBoundary key={activeDeck}>
          {activeDeck === 'ocean' && <OceanDataExplorer />}
          {activeDeck === 'sources' && <DataSourceMonitor />}
          {activeDeck === 'scenarios' && <ScenarioLab />}
          {activeDeck === 'query' && <QueryWorkbench />}
        </DeckErrorBoundary>
      </div>
    </div>
  );
}
