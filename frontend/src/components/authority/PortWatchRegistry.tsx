import { useState, useEffect } from 'react';
import { Anchor, Radio, Search, Filter, RefreshCw } from 'lucide-react';
import { fetchNearbyPorts, type LandingCentre } from '../../api/marinewatch-client';

export default function PortWatchRegistry() {
  const [ports, setPorts] = useState<LandingCentre[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedState, setSelectedState] = useState<string>('ALL');

  useEffect(() => {
    loadPorts();
  }, []);

  async function loadPorts() {
    setLoading(true);
    try {
      const data = await fetchNearbyPorts(20.0, 78.0, 2500, 50);
      setPorts(data.ports || []);
    } catch (err) {
      console.error('Failed to load ports:', err);
    } finally {
      setLoading(false);
    }
  }

  const states = ['ALL', ...Array.from(new Set(ports.map((p) => p.state).filter(Boolean)))];

  const filteredPorts = ports.filter((p) => {
    const matchesSearch =
      !searchQuery ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.district.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.state.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesState = selectedState === 'ALL' || p.state === selectedState;
    return matchesSearch && matchesState;
  });

  const totalCraft = filteredPorts.reduce((acc, p) => acc + (p.craft_count?.total || 0), 0);
  const totalMech = filteredPorts.reduce((acc, p) => acc + (p.craft_count?.mechanized || 0), 0);
  const totalMot = filteredPorts.reduce((acc, p) => acc + (p.craft_count?.motorized || 0), 0);

  return (
    <div className="marinewatch-tab-inner-view" style={{ padding: '16px' }}>
      <div className="tab-view-header" style={{ marginBottom: '16px' }}>
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Anchor size={20} className="text-primary" />
            CMFRI Fish Landing Centres & Harbour Census Registry
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Authoritative maritime fleet statistics, quay facilities, and emergency VHF radio calling channels
            across all Indian coastal states and island territories.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <span className="registry-count-pill">{filteredPorts.length} Registered Harbours</span>
          <button
            onClick={loadPorts}
            className="p-1.5 rounded border border-border hover:bg-muted text-xs flex items-center gap-1"
            title="Refresh port census"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Fleet KPI Banner */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="p-3 rounded-lg border border-border bg-card">
          <div className="text-[11px] uppercase font-bold text-muted-foreground">Total Monitored Harbours</div>
          <div className="text-xl font-bold mt-1 text-primary">{filteredPorts.length}</div>
        </div>
        <div className="p-3 rounded-lg border border-border bg-card">
          <div className="text-[11px] uppercase font-bold text-muted-foreground">Total Registered Craft</div>
          <div className="text-xl font-bold mt-1 text-foreground">{totalCraft.toLocaleString()}</div>
        </div>
        <div className="p-3 rounded-lg border border-border bg-card">
          <div className="text-[11px] uppercase font-bold text-muted-foreground">Mechanized Fleet</div>
          <div className="text-xl font-bold mt-1 text-emerald-600">{totalMech.toLocaleString()}</div>
        </div>
        <div className="p-3 rounded-lg border border-border bg-card">
          <div className="text-[11px] uppercase font-bold text-muted-foreground">Motorized Fleet</div>
          <div className="text-xl font-bold mt-1 text-blue-600">{totalMot.toLocaleString()}</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-3 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search harbours by name, district, or facilities…"
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

      {/* Harbours Census Table */}
      <div className="ports-table-wrap overflow-x-auto rounded-lg border border-border">
        <table className="oceanwatch-table w-full text-left text-sm">
          <thead className="bg-muted/50 border-b border-border text-xs uppercase font-semibold text-muted-foreground">
            <tr>
              <th className="p-3">Harbour Name</th>
              <th className="p-3">District & State</th>
              <th className="p-3">Harbour Type</th>
              <th className="p-3">Total Fleet</th>
              <th className="p-3">Mechanized</th>
              <th className="p-3">Motorized</th>
              <th className="p-3">VHF Channel</th>
              <th className="p-3">Key Facilities</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {filteredPorts.map((p) => (
              <tr key={p.id} className="hover:bg-muted/40 transition-colors">
                <td className="p-3 font-semibold text-foreground flex items-center gap-1.5">
                  <Anchor size={14} className="text-primary shrink-0" />
                  {p.name}
                </td>
                <td className="p-3 text-muted-foreground">
                  {p.district}, <span className="font-medium text-foreground">{p.state}</span>
                </td>
                <td className="p-3">
                  <span className="centre-type-pill text-xs px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                    {p.type.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="p-3 font-bold text-foreground">{p.craft_count?.total ?? '—'}</td>
                <td className="p-3 text-emerald-600 font-semibold">{p.craft_count?.mechanized ?? '—'}</td>
                <td className="p-3 text-blue-600 font-semibold">{p.craft_count?.motorized ?? '—'}</td>
                <td className="p-3">
                  <span className="inline-flex items-center gap-1 font-mono text-xs px-1.5 py-0.5 rounded bg-muted">
                    <Radio size={12} className="text-primary" />
                    Ch {p.vhf_channel || 16}
                  </span>
                </td>
                <td className="p-3 text-xs text-muted-foreground max-w-xs truncate" title={(p.facilities || []).join(', ')}>
                  {(p.facilities || []).join(', ')}
                </td>
              </tr>
            ))}
            {filteredPorts.length === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-muted-foreground text-sm">
                  No harbours match the current search filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
