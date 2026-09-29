import {
  Activity,
  Anchor,
  ArrowRight,
  BarChart3,
  Beaker,
  Building2,
  CheckCircle2,
  Compass,
  FileCheck2,
  Fish,
  FlaskConical,
  MapPinned,
  Mic,
  Microscope,
  RadioTower,
  ShieldAlert,
  ShipWheel,
  SlidersHorizontal,
} from 'lucide-react';
import { translateText, type SupportedLanguage } from '../i18n/translations';

interface PortalPageProps {
  onSelectRole: (role: 'fisher' | 'authority' | 'researcher') => void;
  language?: SupportedLanguage;
}

export default function PortalPage({ onSelectRole, language = 'en' }: PortalPageProps) {
  const tr = (str: string) => translateText(str, language);

  return (
    <main className="portal-page" role="main" aria-label={tr('Select Your Operational Mission Portal')}>
      <div className="portal-container">
        {/* Hero Section */}
        <section className="portal-hero">
          <div className="portal-badge">
            <Anchor size={14} className="portal-badge-icon" />
            <span>{tr('ISRO & INCOIS Marine Intelligence Platform')}</span>
          </div>
          <h1 className="portal-title">{tr('Select Your Operational Mission Portal')}</h1>
          <p className="portal-description">
            {tr("ORCA orchestrates India's oceanographic, meteorological, and regulatory data into deterministic voyage advisories, risk evaluations, and maritime surveillance.")}
          </p>
        </section>

        {/* Portal Selection Cards Grid */}
        <section className="portal-grid" aria-label="Available Operational Portals">
          {/* Card 1: Fisher / Skipper Console */}
          <article className="portal-card fisher-portal-card">
            <div className="portal-card-header">
              <div className="portal-icon-wrapper fisher-icon">
                <Fish size={28} />
              </div>
              <div>
                <span className="portal-card-eyebrow">{tr('Artisanal Fishers & Vessel Skippers')}</span>
                <h2>{tr('Fisher Console')}</h2>
              </div>
            </div>

            <p className="portal-card-summary">
              {tr('Purpose-built for coastal fishermen and vessel operators preparing to depart harbor. Answers operational voyage questions with rigid safety thresholds and vernacular voice support.')}
            </p>

            <ul className="portal-features-list">
              <li>
                <CheckCircle2 size={15} className="feature-check" />
                <span><strong>{tr('Departure Safety Status:')}</strong> {tr('Instant GO / CAUTION / NO-GO verdicts.')}</span>
              </li>
              <li>
                <MapPinned size={15} className="feature-check" />
                <span><strong>{tr('Potential Fishing Zones (PFZ):')}</strong> {tr('Distance, bearing, SST, and chlorophyll gradients.')}</span>
              </li>
              <li>
                <SlidersHorizontal size={15} className="feature-check" />
                <span><strong>{tr('Mission Twin What-If:')}</strong> {tr('Test departure delay windows (+2h, +4h) and craft types.')}</span>
              </li>
              <li>
                <Mic size={15} className="feature-check" />
                <span><strong>{tr('Voice Calls with VAD:')}</strong> {tr('Bidirectional audio assistance in Hindi, Marathi, and English.')}</span>
              </li>
              <li>
                <ShipWheel size={15} className="feature-check" />
                <span><strong>{tr('Corridor Optimization:')}</strong> {tr('Compare Safest vs. Direct vs. Balanced route options.')}</span>
              </li>
            </ul>

            <button
              type="button"
              className="portal-cta-btn fisher-cta"
              onClick={() => onSelectRole('fisher')}
            >
              <span>{tr('Enter Fisher Console')}</span>
              <ArrowRight size={16} />
            </button>
          </article>

          {/* Card 2: Authority Command Deck */}
          <article className="portal-card authority-portal-card">
            <div className="portal-card-header">
              <div className="portal-icon-wrapper authority-icon">
                <Building2 size={28} />
              </div>
              <div>
                <span className="portal-card-eyebrow">{tr('Port Officials & Maritime Authorities')}</span>
                <h2>{tr('Authority Command Deck')}</h2>
              </div>
            </div>

            <p className="portal-card-summary">
              {tr('Dedicated command interface for Port Authorities, Fisheries Departments, and Coastal Disaster Management teams auditing fleet compliance and active hazard sectors.')}
            </p>

            <ul className="portal-features-list">
              <li>
                <RadioTower size={15} className="feature-check" />
                <span><strong>{tr('Coastal Sector Surveillance:')}</strong> {tr('Monitor Ratnagiri, Malvan, Goa, and Mumbai waters.')}</span>
              </li>
              <li>
                <ShieldAlert size={15} className="feature-check" />
                <span><strong>{tr('Live Hazard Polygons:')}</strong> {tr('Track IMD squall warnings, MPAs, and naval firing areas.')}</span>
              </li>
              <li>
                <FileCheck2 size={15} className="feature-check" />
                <span><strong>{tr('Evidence & Provenance Audit:')}</strong> {tr('Direct in-page inspection of official INCOIS/IMD feeds.')}</span>
              </li>
              <li>
                <Activity size={15} className="feature-check" />
                <span><strong>{tr('Autonomous Reasoning Trail:')}</strong> {tr('Full LangGraph agent execution trace logs.')}</span>
              </li>
              <li>
                <Compass size={15} className="feature-check" />
                <span><strong>{tr('Surveillance Query Terminal:')}</strong> {tr('Run regional simulations and query decision records.')}</span>
              </li>
            </ul>

            <button
              type="button"
              className="portal-cta-btn authority-cta"
              onClick={() => onSelectRole('authority')}
            >
              <span>{tr('Enter Authority Deck')}</span>
              <ArrowRight size={16} />
            </button>
          </article>

          {/* Card 3: Researcher Lab */}
          <article className="portal-card researcher-portal-card">
            <div className="portal-card-header">
              <div className="portal-icon-wrapper researcher-icon">
                <Beaker size={28} />
              </div>
              <div>
                <span className="portal-card-eyebrow">{tr('Marine Researchers & Data Scientists')}</span>
                <h2>{tr('Researcher Lab')}</h2>
              </div>
            </div>

            <p className="portal-card-summary">
              {tr('Explore ocean observation data, satellite EO products, evaluate benchmark scenarios, and inspect evidence provenance across ORCA\'s marine data ecosystem.')}
            </p>

            <ul className="portal-features-list">
              <li>
                <Microscope size={15} className="feature-check" />
                <span><strong>{tr('Ocean Data Explorer:')}</strong> {tr('Marine conditions, SST, wave heights, and current speeds by harbor.')}</span>
              </li>
              <li>
                <BarChart3 size={15} className="feature-check" />
                <span><strong>{tr('Satellite EO Grid:')}</strong> {tr('Chlorophyll-a concentrations, SST rasters, and cloud cover from MOSDAC.')}</span>
              </li>
              <li>
                <FlaskConical size={15} className="feature-check" />
                <span><strong>{tr('Scenario Lab:')}</strong> {tr('Execute S1–S8 benchmark evaluations and audit recommendation traces.')}</span>
              </li>
              <li>
                <FileCheck2 size={15} className="feature-check" />
                <span><strong>{tr('Source Provenance:')}</strong> {tr('Data freshness, quality flags, and authoritative source hierarchy.')}</span>
              </li>
              <li>
                <Activity size={15} className="feature-check" />
                <span><strong>{tr('Query Workbench:')}</strong> {tr('Exploratory natural language queries with inline evidence and trace.')}</span>
              </li>
            </ul>

            <button
              type="button"
              className="portal-cta-btn researcher-cta"
              onClick={() => onSelectRole('researcher')}
            >
              <span>{tr('Enter Researcher Lab')}</span>
              <ArrowRight size={16} />
            </button>
          </article>
        </section>

        {/* Footer info badge */}
        <footer className="portal-footer">
          <p>
            {tr('Deterministic Marine Decision Engine · Complying with Official Government Feeds (INCOIS OSF, PFZ, SVAS, IMD Marine)')}
          </p>
        </footer>
      </div>
    </main>
  );
}
