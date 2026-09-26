const fs = require('fs');

// 1. GuidedTripSetup.tsx
let f1 = fs.readFileSync('src/components/fisher/GuidedTripSetup.tsx', 'utf8');
if (!f1.includes('useTranslation')) {
    f1 = f1.replace("import { MapPin, Target, Navigation, Anchor } from 'lucide-react';", "import { MapPin, Target, Navigation, Anchor } from 'lucide-react';\nimport { useTranslation } from 'react-i18next';");
    f1 = f1.replace('const { speak, stop } = useSpokenGuidance({ language });', 'const { speak, stop } = useSpokenGuidance({ language });\n  const { t } = useTranslation();');
}
f1 = f1.replace(/translateText\('From which port\?', language\)/g, "t('GuidedTripSetup.from_which_port', 'From which port?')");
f1 = f1.replace(/translateText\('Select PFZ', language\)/g, "t('GuidedTripSetup.select_pfz', 'Select PFZ')");
f1 = f1.replace(/translateText\('Boat vessel size type\?', language\)/g, "t('GuidedTripSetup.boat_vessel_size_type', 'Boat vessel size type?')");
f1 = f1.replace(/translateText\('Confirm Route', language\)/g, "t('GuidedTripSetup.confirm_route', 'Confirm Route')");
fs.writeFileSync('src/components/fisher/GuidedTripSetup.tsx', f1);

// 2. MapView.tsx
let f2 = fs.readFileSync('src/components/map/MapView.tsx', 'utf8');
if (!f2.includes('useTranslation')) {
    f2 = f2.replace("import { translateText } from '../../i18n/translations';", "import { translateText } from '../../i18n/translations';\nimport { useTranslation } from 'react-i18next';");
    f2 = f2.replace('export default function MapView({', 'export default function MapView({');
    // Find the component body start to inject const { t }
    f2 = f2.replace(/(export default function MapView\([^)]+\)\s*\{)/, "$1\n  const { t } = useTranslation();");
}
f2 = f2.replace(/translateText\('Fit Trip', language\) \|\| 'Fit Trip'/g, "t('MapView.fit_trip', 'Fit Trip')");
f2 = f2.replace(/translateText\('My Location', language\) \|\| 'My Location'/g, "t('MapView.my_location', 'My Location')");
f2 = f2.replace(/\{isSimulating \? 'Stop' : 'Simulate'\}/g, "{isSimulating ? t('MapView.stop', 'Stop') : t('MapView.simulate', 'Simulate')}");
fs.writeFileSync('src/components/map/MapView.tsx', f2);

// 3. DataModeIndicator.tsx
let f3 = fs.readFileSync('src/components/layout/DataModeIndicator.tsx', 'utf8');
f3 = f3.replace(/\{t\('DataModeIndicator\.modeval', \{ val: mode \}\)\}/g, "{t('DataModeIndicator.mode', 'Mode: {{val}}', { val: t('DataModeIndicator.' + mode, mode) })}");
f3 = f3.replace(/\{t\('DataModeIndicator\.dbval', \{ val: health\.database === 'connected' \? 'Connected' : 'Offline' \}\)\}/g, "{t('DataModeIndicator.db', 'DB: {{val}}', { val: health.database === 'connected' ? t('DataModeIndicator.Connected', 'Connected') : t('DataModeIndicator.Offline', 'Offline') })}");
fs.writeFileSync('src/components/layout/DataModeIndicator.tsx', f3);

// 4. App.tsx / Header.tsx for "Settings"
let f4 = fs.readFileSync('src/components/layout/Header.tsx', 'utf8');
if (!f4.includes('useTranslation')) {
    f4 = f4.replace("import { Menu, Settings as SettingsIcon } from 'lucide-react';", "import { Menu, Settings as SettingsIcon } from 'lucide-react';\nimport { useTranslation } from 'react-i18next';");
    f4 = f4.replace('export default function Header({', 'export default function Header({');
    f4 = f4.replace(/(export default function Header\([^)]+\)\s*\{)/, "$1\n  const { t } = useTranslation();");
}
f4 = f4.replace(/<span className="header-settings-label">Settings<\/span>/g, '<span className="header-settings-label">{t("Header.settings", "Settings")}</span>');
fs.writeFileSync('src/components/layout/Header.tsx', f4);

console.log("Issue 1 fixes applied");
