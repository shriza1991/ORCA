import { useTranslation } from 'react-i18next';
import DataModeIndicator from './DataModeIndicator';
import { FileText, LogOut, Settings } from 'lucide-react';
import { TRANSLATIONS, type SupportedLanguage } from '../../i18n/translations';

interface HeaderProps {
  language: SupportedLanguage;
  evidenceCount: number;
  onOpenEvidence: () => void;
  theme: 'light' | 'dark';
  currentPortal?: 'selection' | 'fisher' | 'authority' | 'researcher' | 'settings';
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
  const { t } = useTranslation();
  const tLegacy = TRANSLATIONS[language] || TRANSLATIONS.en;
  const handleLogout = onLogout || onReturnToPortal;

  return (
    <header className="app-header">
      <div className="app-header-left">
        <h1 className="app-title">ORCA</h1>
        <p className="app-tagline">
          Marine mission intelligence
        </p>
      </div>

      <div className="app-header-right">
        <DataModeIndicator />
        {evidenceCount > 0 && (
          <button
            className="evidence-toggle-btn"
            onClick={onOpenEvidence}
            aria-label={`${tLegacy.evidenceBtn} (${evidenceCount})`}
          >
            <FileText size={14} />
            <span>{tLegacy.evidenceBtn} ({evidenceCount})</span>
          </button>
        )}
        {onOpenSettings && (
          <button
            type="button"
            className={`header-settings-btn ${currentPortal === 'settings' ? 'active' : ''}`}
            onClick={onOpenSettings}
            title={t('Header.settings_preferences', 'Settings & Preferences')}
            aria-label={t('Header.settings_preferences', 'Settings & Preferences')}
          >
            <Settings size={14} />
            <span className="header-settings-label">{t('Header.settings', 'Settings')}</span>
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
            title={'Workspaces'}
            aria-label={'Workspaces'}
          >
            <LogOut size={14} />
            <span>{'Workspaces'}</span>
          </button>
        )}
      </div>
    </header>
  );
}
