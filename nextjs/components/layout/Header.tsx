import DataModeIndicator from './DataModeIndicator';
import { FileText, LogOut, Settings } from 'lucide-react';
import { TRANSLATIONS, translateText, type SupportedLanguage } from '../../i18n/translations';

interface HeaderProps {
  language: SupportedLanguage;
  evidenceCount: number;
  onOpenEvidence: () => void;
  theme: 'light' | 'dark';
  currentPortal?: 'selection' | 'fisher' | 'authority' | 'researcher' | 'marinewatch' | 'settings' | 'deckgl-experiment';
  onLogout?: () => void;
  onReturnToPortal?: () => void;
  onOpenSettings?: () => void;
}

export default function Header({
  language,
  evidenceCount,
  onOpenEvidence,
  theme,
  currentPortal = 'selection',
  onLogout,
  onReturnToPortal,
  onOpenSettings,
}: HeaderProps) {
  const t = TRANSLATIONS[language] || TRANSLATIONS.en;
  const handleLogout = onLogout || onReturnToPortal;

  return (
    <header className="app-header">
      <div className="app-header-left">
        <h1 className="app-title">SAMUDRA</h1>
        <p className="app-tagline">
          {t.appTagline}
        </p>
      </div>

      <div className="app-header-right">
        <DataModeIndicator />
        {evidenceCount > 0 && (
          <button
            className="evidence-toggle-btn"
            onClick={onOpenEvidence}
            aria-label={`${t.evidenceBtn} (${evidenceCount})`}
          >
            <FileText size={14} />
            <span>{t.evidenceBtn} ({evidenceCount})</span>
          </button>
        )}
        {onOpenSettings && (
          <button
            type="button"
            className={`header-settings-btn ${currentPortal === 'settings' ? 'active' : ''}`}
            onClick={onOpenSettings}
            title={translateText('Settings & Preferences', language)}
            aria-label={translateText('Settings & Preferences', language)}
          >
            <Settings size={14} />
            <span className="header-settings-label">{translateText('Settings', language)}</span>
            <span className="header-settings-pill">
              {language.toUpperCase()} · {theme === 'dark' ? '🌙' : '☀️'}
            </span>
          </button>
        )}
        {currentPortal !== 'selection' && currentPortal !== 'settings' && handleLogout && (
          <button
            type="button"
            className="header-logout-btn"
            onClick={handleLogout}
            title={t.logoutBtn || 'Logout'}
            aria-label={t.logoutBtn || 'Logout'}
          >
            <LogOut size={14} />
            <span>{t.logoutBtn || 'Logout'}</span>
          </button>
        )}
      </div>
    </header>
  );
}
