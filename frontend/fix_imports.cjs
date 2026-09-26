const fs = require('fs');

function addImport(file) {
  let content = fs.readFileSync(file, 'utf8');
  if (!content.includes("useTranslation } from 'react-i18next'")) {
    content = content.replace("import ", "import { useTranslation } from 'react-i18next';\nimport ");
    fs.writeFileSync(file, content);
  }
}

addImport('src/components/fisher/GuidedTripSetup.tsx');
addImport('src/components/map/MapView.tsx');
addImport('src/components/layout/Header.tsx');

let header = fs.readFileSync('src/components/layout/Header.tsx', 'utf8');
header = header.replace('const t = TRANSLATIONS[language] || TRANSLATIONS.en;', 'const tLegacy = TRANSLATIONS[language] || TRANSLATIONS.en;');
fs.writeFileSync('src/components/layout/Header.tsx', header);

console.log("Fixed missing imports and tLegacy");
