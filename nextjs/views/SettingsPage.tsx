import React from 'react';
import {
  ArrowLeft,
  Sun,
  Moon,
  Globe,
  Anchor,
  ShipWheel,
  Volume2,
  Database,
  Check,
} from 'lucide-react';
import type { SupportedLanguage } from '../i18n/translations';
import { translateText } from '../i18n/translations';
import { HARBORS, CRAFT_PROFILES } from '../components/mission/MissionContextPanel';
import type { MissionContext } from '../types/mission';

export interface SettingsPageProps {
  theme: 'light' | 'dark';
  onThemeChange: (theme: 'light' | 'dark') => void;
  language: SupportedLanguage;
  onLanguageChange: (language: SupportedLanguage) => void;
  missionContext: MissionContext;
  onMissionContextChange: (context: MissionContext) => void;
  onBack: () => void;
}

const LANGUAGES: Array<{
  code: SupportedLanguage;
  label: string;
  native: string;
  description: string;
  flag: string;
}> = [
  {
    code: 'en',
    label: 'English',
    native: 'English',
    description: 'International Maritime English · Standard coastal reporting',
    flag: '🌐',
  },
  {
    code: 'hi',
    label: 'Hindi',
    native: 'हिन्दी',
    description: 'राष्ट्रीय तटीय एवं मौसम परामर्श · National coastal bulletins',
    flag: '🇮🇳',
  },
  {
    code: 'mr',
    label: 'Marathi',
    native: 'मराठी',
    description: 'महाराष्ट्र किनारपट्टी स्थानिक बोली · Konkan coast vernacular advisories',
    flag: '🇮🇳',
  },
];

export default function SettingsPage({
  theme,
  onThemeChange,
  language,
  onLanguageChange,
  missionContext,
  onMissionContextChange,
  onBack,
}: SettingsPageProps) {
  const handleHarborChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onMissionContextChange({
      ...missionContext,
      origin_harbor: e.target.value,
    });
  };

  const handleCraftChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onMissionContextChange({
      ...missionContext,
      craft_profile: e.target.value as MissionContext['craft_profile'],
    });
  };

  return (
    <main className="settings-page" role="main">
      <div className="settings-container">
        {/* Top Header & Navigation */}
        <header className="settings-header">
          <button
            type="button"
            className="settings-back-btn"
            onClick={onBack}
            aria-label={translateText('Back', language)}
          >
            <ArrowLeft size={16} />
            <span>{translateText('Back', language)}</span>
          </button>
          <div className="settings-header-titles">
            <span className="settings-eyebrow">
              {translateText('System Configuration & Preferences', language)}
            </span>
            <h1 className="settings-title">{translateText('Settings', language)}</h1>
            <p className="settings-subtitle">
              {translateText(
                'Customize appearance, vernacular language, voice call assistant, and mission defaults.',
                language
              )}
            </p>
          </div>
        </header>

        <div className="settings-grid">
          {/* Section 1: Appearance & Display Theme */}
          <section className="settings-card" aria-labelledby="theme-heading">
            <div className="settings-card-header">
              <div className="settings-card-icon-wrap">
                {theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
              </div>
              <div>
                <h2 id="theme-heading" className="settings-card-title">
                  {translateText('Appearance & Theme', language)}
                </h2>
                <p className="settings-card-desc">
                  {translateText('Select interface color scheme for coastal daylight or night navigation.', language)}
                </p>
              </div>
            </div>

            <div className="settings-options-grid theme-options">
              <button
                type="button"
                className={`settings-option-card ${theme === 'light' ? 'selected' : ''}`}
                onClick={() => onThemeChange('light')}
                role="radio"
                aria-checked={theme === 'light'}
              >
                <div className="option-card-top">
                  <div className="option-icon-box light">
                    <Sun size={20} />
                  </div>
                  {theme === 'light' && (
                    <span className="option-active-badge">
                      <Check size={12} />
                      <span>{translateText('Active', language)}</span>
                    </span>
                  )}
                </div>
                <div className="option-card-body">
                  <span className="option-title">{translateText('Light Theme', language)}</span>
                  <p className="option-desc">
                    {translateText('High-contrast daylight view optimized for outdoor sun and bright harbor decks.', language)}
                  </p>
                </div>
              </button>

              <button
                type="button"
                className={`settings-option-card ${theme === 'dark' ? 'selected' : ''}`}
                onClick={() => onThemeChange('dark')}
                role="radio"
                aria-checked={theme === 'dark'}
              >
                <div className="option-card-top">
                  <div className="option-icon-box dark">
                    <Moon size={20} />
                  </div>
                  {theme === 'dark' && (
                    <span className="option-active-badge">
                      <Check size={12} />
                      <span>{translateText('Active', language)}</span>
                    </span>
                  )}
                </div>
                <div className="option-card-body">
                  <span className="option-title">{translateText('Dark Theme', language)}</span>
                  <p className="option-desc">
                    {translateText('Low-glare night navigation view optimized for wheelhouse and night fishing.', language)}
                  </p>
                </div>
              </button>
            </div>
          </section>

          {/* Section 2: Regional Language Selection */}
          <section className="settings-card" aria-labelledby="lang-heading">
            <div className="settings-card-header">
              <div className="settings-card-icon-wrap">
                <Globe size={18} />
              </div>
              <div>
                <h2 id="lang-heading" className="settings-card-title">
                  {translateText('Language & Regional Dialect', language)}
                </h2>
                <p className="settings-card-desc">
                  {translateText('Choose your preferred language for marine advisories, voice alerts, and map labels.', language)}
                </p>
              </div>
            </div>

            <div className="settings-options-list">
              {LANGUAGES.map((lang) => {
                const isSelected = language === lang.code;
                return (
                  <button
                    key={lang.code}
                    type="button"
                    className={`settings-lang-row ${isSelected ? 'selected' : ''}`}
                    onClick={() => onLanguageChange(lang.code)}
                    role="radio"
                    aria-checked={isSelected}
                  >
                    <div className="lang-row-left">
                      <span className="lang-flag">{lang.flag}</span>
                      <div>
                        <div className="lang-name-row">
                          <span className="lang-native-name">{lang.native}</span>
                          <span className="lang-code-pill">{lang.code.toUpperCase()}</span>
                        </div>
                        <span className="lang-description">{lang.description}</span>
                      </div>
                    </div>
                    <div className="lang-row-right">
                      {isSelected ? (
                        <div className="lang-check-circle active">
                          <Check size={14} />
                        </div>
                      ) : (
                        <div className="lang-check-circle" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Section 3: Operational Harbor & Craft Profile Defaults */}
          <section className="settings-card" aria-labelledby="mission-heading">
            <div className="settings-card-header">
              <div className="settings-card-icon-wrap">
                <Anchor size={18} />
              </div>
              <div>
                <h2 id="mission-heading" className="settings-card-title">
                  {translateText('Operational Voyage Defaults', language)}
                </h2>
                <p className="settings-card-desc">
                  {translateText('Default harbor and vessel dimensions used for deterministic safety thresholds.', language)}
                </p>
              </div>
            </div>

            <div className="settings-fields-grid">
              <label className="settings-field-group">
                <span className="field-label">
                  <Anchor size={13} className="field-icon" />
                  <span>{translateText('Default Departure Harbor', language)}</span>
                </span>
                <select
                  className="settings-select"
                  value={missionContext.origin_harbor ?? 'Ratnagiri'}
                  onChange={handleHarborChange}
                >
                  {HARBORS.map((h) => (
                    <option key={h} value={h}>
                      {translateText(h, language)}
                    </option>
                  ))}
                </select>
                <span className="field-hint">
                  {translateText('Base station for coastal ocean state forecasts and nearest PFZ vectoring.', language)}
                </span>
              </label>

              <label className="settings-field-group">
                <span className="field-label">
                  <ShipWheel size={13} className="field-icon" />
                  <span>{translateText('Default Vessel Craft Profile', language)}</span>
                </span>
                <select
                  className="settings-select"
                  value={missionContext.craft_profile ?? 'motorized_boat'}
                  onChange={handleCraftChange}
                >
                  {CRAFT_PROFILES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {translateText(c.label, language)}
                    </option>
                  ))}
                </select>
                <span className="field-hint">
                  {translateText('Calibrates physical craft wave ceiling and wind speed safety limits.', language)}
                </span>
              </label>
            </div>
          </section>

          {/* Section 4: Voice & Audio Assistance */}
          <section className="settings-card" aria-labelledby="voice-heading">
            <div className="settings-card-header">
              <div className="settings-card-icon-wrap">
                <Volume2 size={18} />
              </div>
              <div>
                <h2 id="voice-heading" className="settings-card-title">
                  {translateText('Voice Assistance & VAD', language)}
                </h2>
                <p className="settings-card-desc">
                  {translateText('Hands-free voice detection and spoken audio advisory settings.', language)}
                </p>
              </div>
            </div>

            <div className="settings-feature-list">
              <div className="feature-item">
                <div className="feature-info">
                  <span className="feature-title">
                    {translateText('Voice Activity Detection (VAD)', language)}
                  </span>
                  <span className="feature-desc">
                    {translateText('Automatically detects speech stops (~3.0s silence) to send queries hands-free.', language)}
                  </span>
                </div>
                <span className="feature-status-pill active">
                  <Check size={12} />
                  <span>{translateText('Enabled', language)}</span>
                </span>
              </div>

              <div className="feature-item">
                <div className="feature-info">
                  <span className="feature-title">
                    {translateText('Spoken Audio Readout (TTS)', language)}
                  </span>
                  <span className="feature-desc">
                    {translateText('Speaks out GO / CAUTION / NO-GO verdicts in your selected language.', language)}
                  </span>
                </div>
                <span className="feature-status-pill active">
                  <Check size={12} />
                  <span>{translateText('Active', language)}</span>
                </span>
              </div>
            </div>
          </section>

          {/* Section 5: Diagnostics & Official Government Feeds */}
          <section className="settings-card full-width" aria-labelledby="diagnostics-heading">
            <div className="settings-card-header">
              <div className="settings-card-icon-wrap">
                <Database size={18} />
              </div>
              <div>
                <h2 id="diagnostics-heading" className="settings-card-title">
                  {translateText('System Diagnostics & Feed Provenance', language)}
                </h2>
                <p className="settings-card-desc">
                  {translateText('Authoritative Indian oceanographic data sources backing the deterministic decision engine.', language)}
                </p>
              </div>
            </div>

            <div className="diagnostics-pill-grid">
              <div className="diag-card">
                <span className="diag-label">ENGINE MODE</span>
                <span className="diag-value">HYBRID (Live Feeds + Open-Meteo Fallback)</span>
              </div>
              <div className="diag-card">
                <span className="diag-label">INCOIS INTEGRATION</span>
                <span className="diag-value">OSF (Ocean State), PFZ (Fishing Zones), SVAS</span>
              </div>
              <div className="diag-card">
                <span className="diag-label">IMD INTEGRATION</span>
                <span className="diag-value">Coastal Weather & Cyclone Squall Warnings</span>
              </div>
              <div className="diag-card">
                <span className="diag-label">LOCAL PERSISTENCE</span>
                <span className="diag-value">In-Memory Cache · PostgreSQL/PostGIS Ready</span>
              </div>
            </div>
          </section>
        </div>

        {/* Footer Return Button */}
        <footer className="settings-footer">
          <button
            type="button"
            className="settings-done-btn"
            onClick={onBack}
          >
            <Check size={16} />
            <span>{translateText('Done', language)}</span>
          </button>
        </footer>
      </div>
    </main>
  );
}
