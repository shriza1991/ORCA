const fs = require('fs');
let f = fs.readFileSync('src/components/layout/DataModeIndicator.tsx', 'utf8');
f = f.replace(
    /t\('DataModeIndicator\.mode',\s*'Mode:\s*\{\{val\}\}',\s*\{\s*val:\s*t\('DataModeIndicator\.' \+ mode,\s*mode\)\s*\}\)/g,
    "t('DataModeIndicator.mode', 'Mode:') + ' ' + t('DataModeIndicator.' + mode, mode)"
);
f = f.replace(
    /t\('DataModeIndicator\.db',\s*'DB:\s*\{\{val\}\}',\s*\{\s*val:\s*health\.database === 'connected' \? t\('DataModeIndicator\.Connected',\s*'Connected'\)\s*:\s*t\('DataModeIndicator\.Offline',\s*'Offline'\)\s*\}\)/g,
    "t('DataModeIndicator.db', 'DB:') + ' ' + (health.database === 'connected' ? t('DataModeIndicator.Connected', 'Connected') : t('DataModeIndicator.Offline', 'Offline'))"
);
fs.writeFileSync('src/components/layout/DataModeIndicator.tsx', f);
