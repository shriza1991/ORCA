import { useState, useEffect } from 'react';
import { ShieldCheck, Search, Filter, RefreshCw } from 'lucide-react';
import { fetchNearbyAquaculture, type AquacultureSite } from '../../api/marinewatch-client';

export default function AquaWatchRegistry() {
  const [farms, setFarms] = useState<AquacultureSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedState, setSelectedState] = useState<string>('ALL');

  useEffect(() => {
    loadFarms();
  }, []);

  async function loadFarms() {
    setLoading(true);
    try {
      const data = await fetchNearbyAquaculture(20.0, 78.0, 2500, 50);
      setFarms(data.aquaculture_sites || []);
    } catch (err) {
      console.error('Failed to load aquaculture farms:', err);
    } finally {
      setLoading(false);
    }
  }

  const states = ['ALL', ...Array.from(new Set(farms.map((f) => f.state).filter(Boolean)))];

  const filteredFarms = farms.filter((f) => {
    const matchesSearch =
      !searchQuery ||
      f.farm_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.district.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.cultured_species.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.caa_registration_number.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesState = selectedState === 'ALL' || f.state === selectedState;
    return matchesSearch && matchesState;
  });

  const totalArea = filteredFarms.reduce((acc, f) => acc + (f.water_spread_area_ha || 0), 0);
  const compliantCount = filteredFarms.filter((f) => f.biosecurity_compliant).length;

  return (
    <div className="marinewatch-tab-inner-view" style={{ padding: '16px' }}>
      <div className="tab-view-header" style={{ marginBottom: '16px' }}>
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <ShieldCheck size={20} className="text-emerald-500" />
            Coastal Aquaculture Authority (CAA) Farm & Biosecurity Registry
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Statutory brackishwater shrimp and fish aquaculture facilities registered under the Coastal
            Aquaculture Authority Act, 2005. Environmental parameters, biosecurity status, and water sources.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <span className="registry-count-pill">{filteredFarms.length} Certified Facilities</span>
          <button
            onClick={loadFarms}
            className="p-1.5 rounded border border-border hover:bg-muted text-xs flex items-center gap-1"
            title="Refresh farm registry"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="p-3 rounded-lg border border-border bg-card">
          <div className="text-[11px] uppercase font-bold text-muted-foreground">Monitored Facilities</div>
          <div className="text-xl font-bold mt-1 text-primary">{filteredFarms.length}</div>
        </div>
        <div className="p-3 rounded-lg border border-border bg-card">
          <div className="text-[11px] uppercase font-bold text-muted-foreground">Water Spread Area</div>
          <div className="text-xl font-bold mt-1 text-foreground">{totalArea.toFixed(1)} ha</div>
        </div>
        <div className="p-3 rounded-lg border border-border bg-card">
          <div className="text-[11px] uppercase font-bold text-muted-foreground">Biosecurity Audited</div>
          <div className="text-xl font-bold mt-1 text-emerald-600">{compliantCount} Compliant</div>
        </div>
        <div className="p-3 rounded-lg border border-border bg-card">
          <div className="text-[11px] uppercase font-bold text-muted-foreground">Statutory Authority</div>
          <div className="text-xs font-semibold mt-2 text-muted-foreground">CAA, Min of Fisheries (GoI)</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-3 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by farm name, registration #, cultured species, or district…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-md border border-border bg-background text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-muted-foreground" />
          <select
            value={selectedState}
            onChange={(e) => setSelectedState(e.target.value)}
            className="px-3 py-2 rounded-md border border-border bg-background text-sm font-medium"
          >
            {states.map((st) => (
              <option key={st} value={st}>
                {st === 'ALL' ? 'All Coastal States' : st}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Farm Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredFarms.map((farm) => (
          <div key={farm.id} className="p-4 rounded-lg border border-border bg-card shadow-sm hover:shadow transition-shadow">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <h4 className="font-bold text-sm text-foreground">{farm.farm_name}</h4>
                <span className="text-[11px] font-mono text-muted-foreground block mt-0.5">
                  Reg: {farm.caa_registration_number}
                </span>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                {farm.caa_status}
              </span>
            </div>

            <div className="space-y-1.5 text-xs mt-3 pt-2 border-t border-border/50">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Location</span>
                <span className="font-medium text-foreground">{farm.district}, {farm.state}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cultured Species</span>
                <span className="font-semibold text-primary">{farm.cultured_species}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Water Source</span>
                <span className="font-medium text-foreground">{farm.water_source}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Salinity</span>
                <span className="font-mono text-foreground">{farm.water_salinity_ppt} ppt</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Water Spread</span>
                <span className="font-medium text-foreground">{farm.water_spread_area_ha} ha ({farm.ponds_count} ponds)</span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-border/30">
                <span className="text-muted-foreground">Biosecurity / ETP</span>
                <span className={`text-[11px] font-semibold ${farm.biosecurity_compliant ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {farm.biosecurity_compliant ? 'Certified Compliant' : 'Audit Required'}
                </span>
              </div>
            </div>

            <div className="mt-3 pt-2 text-[10px] text-muted-foreground flex justify-between items-center border-t border-border/40">
              <span>{farm.latitude.toFixed(4)}°N, {farm.longitude.toFixed(4)}°E</span>
              <span className="px-1.5 py-0.5 rounded bg-muted">CAA Registry</span>
            </div>
          </div>
        ))}
      </div>
      {filteredFarms.length === 0 && (
        <div className="p-8 text-center text-muted-foreground text-sm border border-dashed rounded-lg mt-2">
          No aquaculture sites match the current search filter.
        </div>
      )}
    </div>
  );
}
