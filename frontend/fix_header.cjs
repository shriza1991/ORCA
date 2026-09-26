const fs = require('fs');

let content = fs.readFileSync('src/components/layout/Header.tsx', 'utf8');

// Rename the legacy `t` declaration
content = content.replace(
  'const { t } = useTranslation();\n  const t = TRANSLATIONS[language] || TRANSLATIONS.en;',
  'const { t } = useTranslation();\n  const tLegacy = TRANSLATIONS[language] || TRANSLATIONS.en;'
);

// Replace usages of the legacy `t`
content = content.replace(/t\.appTagline/g, 'tLegacy.appTagline');
content = content.replace(/t\.evidenceBtn/g, 'tLegacy.evidenceBtn');
content = content.replace(/t\.logoutBtn/g, 'tLegacy.logoutBtn');

// Replace the hardcoded translateText('Settings') that was missed
content = content.replace(
  /{translateText\('Settings', language\)}/g,
  "{t('Header.settings', 'Settings')}"
);

content = content.replace(
  /translateText\('Settings & Preferences', language\)/g,
  "t('Header.settings_preferences', 'Settings & Preferences')"
);

fs.writeFileSync('src/components/layout/Header.tsx', content, 'utf8');
console.log('Fixed Header.tsx');
