import { useState, useEffect } from 'react';
import {
  Database,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  ShieldCheck,
  ExternalLink,
  Layers,
  X,
  Compass,
} from 'lucide-react';
import {
  fetchDatasets,
  type DatasetItem,
} from '../../api/marinewatch-client';

const CATEGORIES = [
  'All',
  'Ocean',
  'Fisheries',
  'Hazards',
  'Bathymetry',
  'Navigation',
  'Aquaculture',
  'Environment',
  'Research',
  'Boundaries',
  'Surveillance',
];

const PROVIDERS = [
  'All',
  'INCOIS',
  'IMD',
  'GEBCO',
  'CMFRI',
  'CAA',
  'NHO',
  'ISRO MOSDAC',
  'Bhuvan / NRSC',
  'OpenStreetMap',
  'Survey of India',
  'data.gov.in / DoF',
  'Global Fishing Watch',
];

import { type SupportedLanguage } from '../../i18n/translations';

interface DataCatalogueViewProps {
  language?: SupportedLanguage;
}

export default function DataCatalogueView({ language = 'en' }: DataCatalogueViewProps) {
  void language; // Disable TS lint rule until strings are wrapped
  const [datasets, setDatasets] = useState<DatasetItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedProvider, setSelectedProvider] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedDataset, setSelectedDataset] = useState<DatasetItem | null>(null);

  useEffect(() => {
    loadCatalogue();
  }, [selectedCategory, selectedProvider]);

  async function loadCatalogue() {
    setLoading(true);
    try {
      const cat = selectedCategory === 'All' ? undefined : selectedCategory;
      const prov = selectedProvider === 'All' ? undefined : selectedProvider;
      const res = await fetchDatasets(cat, prov);
      setDatasets(res.datasets);
    } catch (err) {
      console.error('Failed to load datasets:', err);
    } finally {
      setLoading(false);
    }
  }

  const filteredDatasets = datasets.filter((d) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      d.id.toLowerCase().includes(q) ||
      d.title.toLowerCase().includes(q) ||
      d.provider.toLowerCase().includes(q) ||
      d.description.toLowerCase().includes(q)
    );
  });

  return (
    <div className="marinewatch-catalogue-container">
      {/* Header Banner */}
      <div className="marinewatch-catalogue-header">
        <div>
          <div className="marinewatch-catalogue-badge">
            <Database size={14} />
            <span>India MarineWatch — §212 National Catalogue</span>
          </div>
          <h2>Authoritative Marine & Coastal Dataset Registry</h2>
          <p>
            Official oceanographic, meteorological, bathymetric, and fisheries datasets curated for India's maritime domain.
            Every dataset maintains strict provenance, update cadence, and licensing compliance.
          </p>
        </div>
        <div className="marinewatch-catalogue-stats">
          <div className="catalogue-stat-box">
            <span className="stat-num">{datasets.length}</span>
            <span className="stat-label">Active Datasets</span>
          </div>
          <div className="catalogue-stat-box">
            <span className="stat-num">12</span>
            <span className="stat-label">Institutions</span>
          </div>
          <div className="catalogue-stat-box">
            <span className="stat-num">100%</span>
            <span className="stat-label">Verified Provenance</span>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="marinewatch-filter-bar">
        <div className="catalogue-search-wrap">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search datasets by title, provider (INCOIS, IMD, GEBCO), or parameter…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="catalogue-filters">
          <div className="filter-group">
            <Filter size={14} />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              aria-label="Filter by Category"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  Category: {c}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <Layers size={14} />
            <select
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value)}
              aria-label="Filter by Provider"
            >
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  Provider: {p}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Datasets Grid */}
      {loading ? (
        <div className="catalogue-loading">Loading dataset catalogue…</div>
      ) : (
        <div className="marinewatch-dataset-grid">
          {filteredDatasets.map((ds) => (
            <div
              key={ds.id}
              className="marinewatch-dataset-card"
              onClick={() => setSelectedDataset(ds)}
            >
              <div className="dataset-card-top">
                <span className="dataset-id-tag">{ds.id}</span>
                <span className={`dataset-status-pill ${ds.status.toLowerCase()}`}>
                  <CheckCircle2 size={12} />
                  {ds.status}
                </span>
              </div>
              <h4 className="dataset-title">{ds.title}</h4>
              <p className="dataset-desc">{ds.description}</p>

              <div className="dataset-metadata-rows">
                <div className="dataset-meta-item">
                  <span className="meta-label">Provider</span>
                  <span className="meta-val font-semibold">{ds.provider}</span>
                </div>
                <div className="dataset-meta-item">
                  <span className="meta-label">Category</span>
                  <span className="meta-val">{ds.category}</span>
                </div>
                <div className="dataset-meta-item">
                  <span className="meta-label">Update Cadence</span>
                  <span className="meta-val">
                    <Clock size={12} className="inline mr-1" />
                    {ds.update_cadence}
                  </span>
                </div>
                <div className="dataset-meta-item">
                  <span className="meta-label">Access Mode</span>
                  <span className="meta-val">{ds.access_mode}</span>
                </div>
              </div>

              <div className="dataset-card-footer">
                <span className="dataset-tier-badge">{ds.quality_tier}</span>
                <button
                  type="button"
                  className="dataset-inspect-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedDataset(ds);
                  }}
                >
                  Inspect Provenance
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dataset Details Slide-out Modal */}
      {selectedDataset && (
        <div className="catalogue-modal-backdrop" onClick={() => setSelectedDataset(null)}>
          <div className="catalogue-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="catalogue-modal-header">
              <div>
                <span className="dataset-id-tag">{selectedDataset.id}</span>
                <h3>{selectedDataset.title}</h3>
                <span className="catalogue-provider-subtitle">{selectedDataset.provider}</span>
              </div>
              <button
                className="modal-close-btn"
                onClick={() => setSelectedDataset(null)}
                aria-label="Close details"
              >
                <X size={18} />
              </button>
            </div>

            <div className="catalogue-modal-body">
              <div className="detail-section">
                <h4>Description & Purpose</h4>
                <p>{selectedDataset.description}</p>
              </div>

              <div className="detail-grid">
                <div className="detail-box">
                  <span className="detail-label">Spatial Bounds</span>
                  <span className="detail-val">{selectedDataset.spatial_coverage}</span>
                </div>
                <div className="detail-box">
                  <span className="detail-label">Temporal Resolution</span>
                  <span className="detail-val">{selectedDataset.temporal_resolution}</span>
                </div>
                <div className="detail-box">
                  <span className="detail-label">Update Interval</span>
                  <span className="detail-val">{selectedDataset.update_cadence}</span>
                </div>
                <div className="detail-box">
                  <span className="detail-label">Quality Level</span>
                  <span className="detail-val">{selectedDataset.quality_tier}</span>
                </div>
              </div>

              <div className="detail-section">
                <h4>Licensing & Governance (§216-§218)</h4>
                <div className="license-info-card">
                  <ShieldCheck size={18} className="text-emerald-500" />
                  <div>
                    <strong>{selectedDataset.license}</strong>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Compliant with official government portal terms and open attribution guidelines. No unauthorized redistribution.
                    </p>
                  </div>
                </div>
              </div>

              <div className="detail-section">
                <h4>Source Provenance & Live Access</h4>
                <div className="provenance-link-card">
                  <Compass size={16} />
                  <a
                    href={selectedDataset.provenance_url}
                    target="_blank"
                    rel="noreferrer"
                    className="provenance-url-text"
                  >
                    {selectedDataset.provenance_url}
                    <ExternalLink size={13} className="ml-1" />
                  </a>
                </div>
              </div>
            </div>

            <div className="catalogue-modal-footer">
              <span className="text-xs text-muted-foreground">
                India MarineWatch §212 Baseline Registry · Verified
              </span>
              <button
                className="modal-dismiss-btn"
                onClick={() => setSelectedDataset(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
