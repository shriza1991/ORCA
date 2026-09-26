const fs = require('fs');
let file = 'src/components/fisher/FisherDecisionSurface.tsx';
let f = fs.readFileSync(file, 'utf8');

if (!f.includes("import { useTranslation }")) {
  f = f.replace("import React from 'react';", "import React from 'react';\nimport { useTranslation } from 'react-i18next';");
}

f = f.replace(/const t = TRANSLATIONS\[language\] \|\| TRANSLATIONS\.en;/g, 
  "const { t: i18nT } = useTranslation();\n  const t = TRANSLATIONS[language] || TRANSLATIONS.en;");

f = f.replace(/translateText\('([^']+)', language\)/g, "i18nT('FisherDecisionSurface.$1', '$1')");

// We also need to fix Trip Plan Summary
f = f.replace(/>Trip Plan Summary<\/h1>/g, ">{i18nT('FisherDecisionSurface.trip_plan_summary', 'Trip Plan Summary')}</h1>");

// And map the dynamic hazardVal properly
f = f.replace(/translateText\(hazardVal, language\)/g, "i18nT('Hazard.' + hazardVal, hazardVal)");

fs.writeFileSync(file, f);
