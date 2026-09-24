import type { DatasetTrustMetadata } from '../components/researcher/DataProvenancePanel';
export type { DatasetTrustMetadata };
import type { MarineObservation, EOGridCell, PFZCandidate, HazardBulletin } from '../api/researcher-client';

/**
 * Derives DatasetTrustMetadata for Marine Observations (48-hour hourly snapshot).
 */
export function deriveMarineTrustMetadata(
  observations: MarineObservation[],
  harborName: string = 'Ratnagiri'
): DatasetTrustMetadata {
  const totalCount = observations?.length || 0;
  const qcCounts: Record<string, number> = {};

  let validCount = 0;
  for (const obs of observations || []) {
    const qc = obs.qc_status || (obs.quality_flags?.includes('verified') ? 'VALID' : 'VALID');
    qcCounts[qc] = (qcCounts[qc] || 0) + 1;
    if (qc === 'VALID') {
      validCount++;
    }
  }

  // Get timestamp range
  let referenceTime: string | undefined;
  let snapshotPeriod = '48-Hour Hourly Time-Series';
  if (totalCount > 0) {
    const times = observations.map((o) => o.observation_time).sort();
    const earliest = times[0]?.slice(0, 16).replace('T', ' ');
    const latest = times[times.length - 1]?.slice(0, 16).replace('T', ' ');
    referenceTime = `Latest: ${latest} UTC`;
    snapshotPeriod = `48-Hour Snapshot (${earliest} → ${latest} UTC)`;
  }

  return {
    datasetName: `Marine Weather Observations (${harborName})`,
    sourceProvider: 'INCOIS',
    sourceProduct: 'INCOIS Ocean State Forecast (OSF) Hourly Station Series',
    dataMode: 'SYNTHETIC SNAPSHOT',
    snapshotPeriod,
    referenceTime,
    validCount,
    totalCount,
    qcBreakdown: qcCounts,
    semanticsDescription:
      'Station-centric marine weather metrics (Significant Wave Height in meters, Sea Surface Temperature in °C, Wind Speed in knots, Swell Period in seconds). Missing/null sensor values are preserved as explicit gaps, never coerced to zero.',
    officialDocUrl: 'https://incois.gov.in/portal/osf/osf.jsp',
  };
}

/**
 * Derives DatasetTrustMetadata for Earth Observation Grid (14-day 5x5 grid snapshot).
 */
export function deriveEOTrustMetadata(records: EOGridCell[]): DatasetTrustMetadata {
  const totalCount = records?.length || 0;
  const qcCounts: Record<string, number> = {};
  const uncertainties: number[] = [];

  let validCount = 0;
  for (const cell of records || []) {
    const qc = cell.qc_status || 'VALID';
    qcCounts[qc] = (qcCounts[qc] || 0) + 1;
    if (qc === 'VALID') {
      validCount++;
    }
    if (typeof cell.uncertainty === 'number' && !isNaN(cell.uncertainty)) {
      uncertainties.push(cell.uncertainty);
    }
  }

  let meanUncertainty: number | null = null;
  if (uncertainties.length > 0) {
    meanUncertainty = +(uncertainties.reduce((a, b) => a + b, 0) / uncertainties.length).toFixed(3);
  }

  let referenceTime: string | undefined;
  let snapshotPeriod = '14-Day Multi-Cell Snapshot (5×5 Grid)';
  if (totalCount > 0) {
    const times = records.map((r) => r.pass_time).sort();
    const earliestDate = times[0]?.slice(0, 10);
    const latestDate = times[times.length - 1]?.slice(0, 10);
    referenceTime = `Coverage: ${earliestDate} through ${latestDate}`;
    snapshotPeriod = `14-Day Spatial Grid (${earliestDate} → ${latestDate})`;
  }

  return {
    datasetName: 'Earth Observation Satellite Grid (5×5 Spatial Cells)',
    sourceProvider: 'ISRO / MOSDAC',
    sourceProduct: 'Oceansat-3 OCM L3 Chlorophyll & INSAT-3D Thermal Infrared SST',
    dataMode: 'SYNTHETIC SNAPSHOT',
    snapshotPeriod,
    referenceTime,
    validCount,
    totalCount,
    qcBreakdown: qcCounts,
    meanUncertainty,
    semanticsDescription:
      'Spatially gridded Earth Observation parameters: absolute SST (°C) from thermal sensors, surface Chlorophyll-a (mg/m³) from ocean color radiometry, and cloud fraction (%). Daily values represent deterministic spatial means across valid non-obscured pixels.',
    officialDocUrl: 'https://www.mosdac.gov.in',
  };
}

/**
 * Derives DatasetTrustMetadata for a single spatial slice (date) of EO grid cells.
 */
export function deriveEOSpatialTrustMetadata(
  records: EOGridCell[],
  selectedDate: string
): DatasetTrustMetadata {
  const slice = (records || []).filter(
    (r) => r && r.pass_time && r.pass_time.startsWith(selectedDate)
  );
  const totalCount = slice.length;
  const qcCounts: Record<string, number> = {};
  const uncertainties: number[] = [];

  let validCount = 0;
  for (const cell of slice) {
    const qc = cell.qc_status || 'VALID';
    qcCounts[qc] = (qcCounts[qc] || 0) + 1;
    if (qc === 'VALID' && (cell.sst_celsius !== null || cell.chlorophyll_a_mg_m3 !== null)) {
      validCount++;
    }
    if (typeof cell.uncertainty === 'number' && !isNaN(cell.uncertainty)) {
      uncertainties.push(cell.uncertainty);
    }
  }

  let meanUncertainty: number | null = null;
  if (uncertainties.length > 0) {
    meanUncertainty = +(uncertainties.reduce((a, b) => a + b, 0) / uncertainties.length).toFixed(3);
  }

  return {
    datasetName: `Earth Observation Spatial Grid (5×5 Cells) · ${selectedDate}`,
    sourceProvider: 'ISRO / MOSDAC',
    sourceProduct: 'Oceansat-3 OCM L3 Chlorophyll & INSAT-3D Thermal Infrared SST',
    dataMode: 'SYNTHETIC SNAPSHOT',
    snapshotPeriod: `Daily Spatial Slice (${selectedDate})`,
    referenceTime: `Pass Time: ${slice[0]?.pass_time ? slice[0].pass_time.slice(0, 16).replace('T', ' ') + ' UTC' : selectedDate}`,
    validCount,
    totalCount,
    qcBreakdown: qcCounts,
    meanUncertainty,
    semanticsDescription:
      'Discrete 5×5 spatial grid observation cells for the selected date snapshot. Values reflect individual pixel measurements; cells flagged as CLOUD_OBSCURED or DEGRADED represent real data-quality conditions and are not interpolated.',
    officialDocUrl: 'https://www.mosdac.gov.in',
  };
}

/**
 * Derives DatasetTrustMetadata for PFZ Advisory Candidates.
 */
export function derivePFZTrustMetadata(candidates: PFZCandidate[]): DatasetTrustMetadata {
  const totalCount = candidates?.length || 0;
  const qcCounts: Record<string, number> = {};
  const confCounts: Record<string, number> = {};

  let validCount = 0;
  for (const cand of candidates || []) {
    const qc = cand.qc_status || 'VALID';
    qcCounts[qc] = (qcCounts[qc] || 0) + 1;
    if (qc === 'VALID' || cand.status === 'ACTIVE') {
      validCount++;
    }
    const conf = cand.confidence || 'UNKNOWN';
    confCounts[conf] = (confCounts[conf] || 0) + 1;
  }

  let snapshotPeriod = 'PFZ Advisory Candidates Snapshot';
  let referenceTime: string | undefined;
  if (totalCount > 0) {
    const validFrom = candidates[0]?.valid_from?.slice(0, 10);
    const validTo = candidates[0]?.valid_to?.slice(0, 10);
    snapshotPeriod = `Advisory Validity Period (${validFrom || '—'} → ${validTo || '—'})`;
    referenceTime = `Valid through: ${candidates[0]?.valid_to?.slice(0, 16).replace('T', ' ')} UTC`;
  }

  return {
    datasetName: 'Potential Fishing Zone (PFZ) Advisory Candidates',
    sourceProvider: 'INCOIS',
    sourceProduct: 'INCOIS Multi-Satellite PFZ Thermal Gradient & Chlorophyll Front Bulletin',
    dataMode: 'SYNTHETIC SNAPSHOT',
    snapshotPeriod,
    referenceTime,
    validCount,
    totalCount,
    qcBreakdown: qcCounts,
    confidenceBreakdown: confCounts,
    semanticsDescription:
      'Oceanographic front intersection candidate coordinates. SST Gradient represents frontal thermal anomaly magnitude (°C/km or unitless index), NOT absolute sea surface temperature. Confidence is an advisory heuristic, distinct from observation QC.',
    officialDocUrl: 'https://incois.gov.in/MarineFisheries/pfz.jsp',
  };
}

/**
 * Derives DatasetTrustMetadata for Marine Hazard Bulletins.
 */
export function deriveHazardTrustMetadata(hazards: HazardBulletin[]): DatasetTrustMetadata {
  const totalCount = hazards?.length || 0;
  const qcCounts: Record<string, number> = {};
  const statusCounts: Record<string, number> = {};

  let validCount = 0;
  for (const hz of hazards || []) {
    const qc = hz.qc_status || 'VALID';
    qcCounts[qc] = (qcCounts[qc] || 0) + 1;
    if (qc === 'VALID') {
      validCount++;
    }
    const st = hz.status || 'ACTIVE';
    statusCounts[st] = (statusCounts[st] || 0) + 1;
  }

  return {
    datasetName: 'Marine Weather & Cyclone Advisory Bulletins',
    sourceProvider: 'IMD',
    sourceProduct: 'IMD Severe Weather & Cyclone Warning Bulletin',
    dataMode: 'SYNTHETIC SNAPSHOT',
    snapshotPeriod: 'Active, Planned & Expired Advisories',
    validCount,
    totalCount,
    qcBreakdown: qcCounts,
    statusBreakdown: statusCounts,
    semanticsDescription:
      'Meteorological warning polygons with canonical GeoJSON boundary coordinates, event types (e.g. CYCLONE_SQUALL, HIGH_WAVE), and valid time windows. ACTIVE status denotes operational advisory applicability, distinct from observation data quality.',
    officialDocUrl: 'https://rsmcnewdelhi.imd.gov.in',
  };
}

/**
 * Derives DatasetTrustMetadata for Tide Temporal Analysis (48-hour hourly snapshot).
 */
export function deriveTideTrustMetadata(
  observations: MarineObservation[],
  harborName: string = 'Ratnagiri'
): DatasetTrustMetadata {
  const totalCount = observations?.length || 0;
  const qcCounts: Record<string, number> = {};
  const phaseCounts: Record<string, number> = {};

  let validCount = 0;
  for (const obs of observations || []) {
    const qc = obs.qc_status || 'VALID';
    qcCounts[qc] = (qcCounts[qc] || 0) + 1;
    if (qc === 'VALID' && typeof obs.tide_level_m === 'number') {
      validCount++;
    }
    const phase = obs.tide_phase || 'UNKNOWN';
    phaseCounts[phase] = (phaseCounts[phase] || 0) + 1;
  }

  let referenceTime: string | undefined;
  let snapshotPeriod = '48-Hour Hourly Tide Snapshot';
  if (totalCount > 0) {
    const times = observations.map((o) => o.observation_time).sort();
    const earliest = times[0]?.slice(0, 16).replace('T', ' ');
    const latest = times[times.length - 1]?.slice(0, 16).replace('T', ' ');
    referenceTime = `Latest: ${latest} UTC`;
    snapshotPeriod = `48-Hour Snapshot (${earliest} → ${latest} UTC)`;
  }

  return {
    datasetName: `Tide Level & Phase Observations (${harborName})`,
    sourceProvider: 'INCOIS',
    sourceProduct: 'INCOIS Ocean State Forecast (OSF) Hourly Station Series — Tide Gauge / Model',
    dataMode: 'SYNTHETIC SNAPSHOT',
    snapshotPeriod,
    referenceTime,
    validCount,
    totalCount,
    qcBreakdown: qcCounts,
    confidenceBreakdown: phaseCounts,
    semanticsDescription:
      'Station-centric tidal water level in meters referenced to Lowest Astronomical Tide (LAT) and observed tidal flow phase (FLOOD, EBB, HIGH, LOW). Observations reflect recorded snapshot values; no astronomical tide forecast is generated.',
    officialDocUrl: 'https://incois.gov.in/portal/osf/osf.jsp',
  };
}

