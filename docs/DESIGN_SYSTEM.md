# SAMUDRA / ORCA Design System & Maritime UX Architecture

> **Canonical UX & Styling Reference** for the SAMUDRA (Smart Autonomous Marine Understanding, Decision & Risk Assistant) / ORCA frontend platform.
> Owned by Frontend / UX Lead (P1), coordinated with Product & Safety (P5).

---

## 1. Design Philosophy: Mission-Grade Maritime Clarity

SAMUDRA is not a generic analytics dashboard or marketing landing page. It is an **Agentic Marine Intelligence Platform** operating in high-stakes environments:
- On a rocking, wet boat deck under direct tropical sunlight.
- In a port authority control room monitoring active squall warnings and fleet corridors.
- At an oceanographic research station analyzing satellite Earth Observation rasters.

### Core Principles
1. **Verdict at a Glance**: The primary decision gate (`GO` / `CAUTION` / `NO_GO` / `UNKNOWN`) must be legible from 2 meters away under bright sunlight.
2. **Deterministic Evidence Hierarchy**: Visual hierarchy directly mirrors source authority: IMD Cyclone Warnings > INCOIS Ocean State Forecasts > GIS Boundaries > Fallback Feeds.
3. **Tactile Field Usability**: All interactive targets are sized for wet, cold, or gloved hands (minimum 44×44px touch targets).
4. **Restrained Nautical Aesthetics**: Deep oceanic neutrals, high-visibility phosphor accents, and zero generic AI-purple glow.

---

## 2. Color Palette & Token Architecture

The color system is organized into two primary modes: **Coastal Day (Light)** and **Abyssal Ocean (Dark)**. Both modes maintain strict WCAG AA/AAA contrast ratios for outdoor readability.

### 2.1 Theme Palettes

| Token | Coastal Day (Light) | Abyssal Ocean (Dark) | Purpose / Usage |
|---|---|---|---|
| `--color-bg-primary` | `#ffffff` | `#070d18` | Main viewport background |
| `--color-bg-secondary` | `#f8fafc` | `#0c1527` | Sidebars, panels, surface layers |
| `--color-bg-tertiary` | `#f1f5f9` | `#131f37` | Input backgrounds, inactive tabs |
| `--color-card-bg` | `#ffffff` | `#0f1a30` | Elevated cards, tiles, modals |
| `--color-border` | `#e2e8f0` | `#1a2a4a` | Standard dividers and card borders |
| `--color-border-hover` | `#cbd5e1` | `#2d4370` | Interactive border hover state |
| `--color-text-primary` | `#091325` | `#f8fafc` | Primary titles, critical metrics (high contrast) |
| `--color-text-secondary` | `#1e293b` | `#cbd5e1` | Body copy, descriptions, table data |
| `--color-text-muted` | `#475569` | `#94a3b8` | Supporting labels, timestamps |
| `--color-text-dim` | `#64748b` | `#64748b` | Subtle captions, unit labels |

### 2.2 Accent & Nautical Phosphor Tokens

| Token | Light Value | Dark Value | Meaning |
|---|---|---|---|
| `--color-accent` | `#0284c7` (Oceanic Blue) | `#38bdf8` (Phosphor Cyan) | Primary interactive actions, active states, branding |
| `--color-accent-hover` | `#0369a1` | `#0ea5e9` | Button and link hover states |
| `--color-accent-subtle` | `rgba(2, 132, 199, 0.08)` | `rgba(56, 189, 248, 0.12)` | Chip backgrounds, active row highlights |
| `--color-teal` | `#0d9488` | `#2dd4bf` | Marine observation data, PFZ markers |

### 2.3 Decision Verdict Status Tokens

Every status color has an associated background, border, and glow token to create high-visibility verdict cards:

```
[ SAFE TO GO ]  ─── Emerald  (#15803d light / #10b981 dark)
                    Background: #f0fdf4 light / #05261a dark
                    Border:     #86efac light / #047857 dark

[  CAUTION   ]  ─── Amber    (#b45309 light / #f59e0b dark)
                    Background: #fffbeb light / #291804 dark
                    Border:     #fcd34d light / #b45309 dark

[ DO NOT GO  ]  ─── Crimson  (#be123c light / #f43f5e dark)
                    Background: #fff1f2 light / #2d0612 dark
                    Border:     #fda4af light / #be123c dark

[  UNKNOWN   ]  ─── Violet   (#6d28d9 light / #a78bfa dark)
                    Background: #f5f3ff light / #1e1338 dark
                    Border:     #c4b5fd light / #6d28d9 dark
```

---

## 3. Typography & Spacing Scales

### 3.1 Typography
- **Primary Interface**: `'Inter', system-ui, -apple-system, sans-serif`
  - High legibility at small sizes, excellent numerical readability.
  - Headings use `text-wrap: balance; font-weight: 700 / 800; letter-spacing: -0.01em;`
  - Body text uses `text-wrap: pretty; line-height: 1.5;`
- **Monospace (Data & Coordinates)**: `'JetBrains Mono', 'Fira Code', monospace`
  - Used for coordinates (`[73.28, 16.99]`), numerical values (`1.8 m`, `14 kn`), timestamps, and evidence IDs.

### 3.2 Spacing Scale (4px Base Grid)
| Token | Value | Common Usage |
|---|---|---|
| `--space-xs` | `4px` | Badge padding, icon gaps |
| `--space-sm` | `8px` | Tile padding, button gap |
| `--space-md` | `12px` | Card internal gap, toolbar padding |
| `--space-lg` | `16px` | Section margins, chat message padding |
| `--space-xl` | `20px` | Panel padding, grid gap |
| `--space-2xl` | `24px` | Container padding, hero spacing |
| `--space-3xl` | `32px` | Major section breaks |

---

## 4. Role-Specific UX Architectures

SAMUDRA delivers tailored interfaces for three distinct personas, selectable from the central Portal:

### 4.1 Fisher Console (`/fisher`)
Designed for **vessel skippers and artisanal fishers**:
- **Primary Decision Surface**:
  - Pinned prominently at the top of the sidebar.
  - Large verdict badge (`SAFE TO GO`, `CAUTION`, `DO NOT GO`, `UNKNOWN`) with dedicated icon.
  - Direct 1-sentence operational summary translated into active language (English, Hindi, Marathi).
  - 4 essential condition tiles:
    - 🌊 **Waves**: Significant wave height + swell period (`1.8 m`).
    - 💨 **Wind**: Wind speed + direction (`14 kn`).
    - 👁️ **Visibility**: Nautical range (`12 km`).
    - ⚠️ **Hazard**: Active IMD alert or geofence status (`No Active Hazards` / `Squall Alert`).
- **One-Tap Prompt Chips**:
  - Quick action chips for common maritime questions: *Nearest PFZ*, *Departure Safety*, *Active Cyclone Risk*, *Safest Route*.
- **Tactile Voyage Switcher**:
  - Quick harbor selector (Ratnagiri, Malvan, etc.) and craft ceiling indicator (`Motorized Boat`, `Trawler`, `Traditional`).

### 4.2 Authority Command Deck (`/authority`)
Designed for **port officials, fisheries enforcement, and coastal surveillance**:
- **Sector Surveillance**:
  - Monitored sector selector (Ratnagiri, Malvan, South Konkan, Goa).
  - Real-time sector KPI counters (Active Vessels, Weather Hazards, Safe Corridors).
- **Multi-Corridor Route Analysis**:
  - Visual comparison of candidate paths:
    - 🟢 **Safest Corridor**: Minimized wave height & hazard exposure along the coast.
    - 🔵 **Balanced Corridor**: Optimal transit time vs. sea state.
    - 🟡 **Direct Passage**: Fastest route with exposure trade-offs.
- **Fleet Tracking & Autoplay Replay**:
  - Monitored coastal fleet vessels with live telemetry (speed, heading, status).
  - Autoplay historical trajectory replay with yellow dotted predicted paths.
- **Evidence & Audit Trail**:
  - Direct in-page inspection of official INCOIS/IMD feeds and LangGraph execution traces.

### 4.3 Researcher Lab (`/researcher`)
Designed for **marine scientists, oceanographers, and data engineers**:
- **Ocean Data Explorer**:
  - Time-series marine observation tables (wave height, SST, swell, currents).
  - Quality badges: `official_source`, `fresh`, `fallback`.
- **Satellite EO Grid**:
  - Earth Observation cell inspection from ISRO MOSDAC (Oceansat-3 OCM, INSAT-3DR).
  - Chlorophyll-a concentration and sea surface temperature rasters.
- **Scenario Benchmark Lab**:
  - Execution harness for canonical evaluation scenarios (S1–S8).
  - KPI cards tracking latency, evidence count, trace depth, and confidence rating.
- **Query Workbench**:
  - Interactive exploratory chat with inline evidence tables and expandable agent trace steps.

### 4.4 Central Portal (`/`)
- Modern, clean role selection surface.
- High-end cards featuring role-specific gradient accents (Cyan for Fisher, Purple for Authority, Emerald for Researcher).
- Tactile hover elevation and WCAG-compliant primary action buttons.

---

## 5. Marine Field & Accessibility Considerations

1. **Direct Sunlight / High Glare**:
   - Light mode uses high-contrast text (`#091325` on `#ffffff`, ratio 18.5:1).
   - Numerical metrics use bold weights (`font-weight: 700 / 800`).
2. **Night Navigation / Bridge Mode**:
   - Dark mode (`[data-theme="dark"]`) avoids pure black/white contrast harshness, using deep abyssal navy (`#070d18`) and glowing phosphors to preserve mariner night vision.
3. **Motion Sensitivity**:
   - All transitions honor `@media (prefers-reduced-motion: reduce)`.
   - Spinners and radar sweeps collapse to static indicators when reduced motion is preferred.
4. **Offline / Snapshot Resiliency**:
   - Persistent `DataModeIndicator` in header informs the user whether they are viewing live satellite telemetry, cached official bulletins, or synthetic demonstration data.
