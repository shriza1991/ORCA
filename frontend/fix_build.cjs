const fs = require('fs');
let file = 'src/components/fisher/FisherDecisionSurface.tsx';
let f = fs.readFileSync(file, 'utf8');

// 1. Fix redeclarations
f = f.replace(
  /const hazardVal = conditions\.hazard;\n  const hasActiveHazard = hazardVal !== '—' && hazardVal !== 'No Active Hazards' && hazardVal !== 'Status Unknown';\n\n  const hazardVal = conditions\.hazard;/g,
  "const hazardVal = conditions.hazard;\n  const hasActiveHazard = hazardVal !== '—' && hazardVal !== 'No Active Hazards' && hazardVal !== 'Status Unknown';"
);
f = f.replace(
  /const hazardVal = conditions\.hazard;\n  const hasActiveHazard = hazardVal !== '—' && hazardVal !== 'No Active Hazards' && hazardVal !== 'Status Unknown';/g,
  "const hazardVal = conditions.hazard;\n  const hasActiveHazard = hazardVal !== '—' && hazardVal !== 'No Active Hazards' && hazardVal !== 'Status Unknown';"
);

// I might have injected it later in the file. Let's just fix it properly.
// The easiest way is to remove ALL occurrences of `const hazardVal = conditions.hazard;` and then add it back in one place.
f = f.split('\n').filter(line => !line.includes('const hazardVal = conditions.hazard;')).join('\n');
f = f.split('\n').filter(line => !line.includes("const hasActiveHazard = hazardVal !== '—' && hazardVal !== 'No Active Hazards' && hazardVal !== 'Status Unknown';")).join('\n');

const goodOverride = `  let status = getFisherDecisionStatus(assessment, error);
  const conditions = extractFisherConditions(isLoading || error ? null : assessment);
  const hazardVal = conditions.hazard;
  const hasActiveHazard = hazardVal !== '—' && hazardVal !== 'No Active Hazards' && hazardVal !== 'Status Unknown';

  if (hasActiveHazard && status === 'SAFE_TO_GO') {
    const highestAlert = assessment?.alerts?.find((a: any) => a.affects_trip) || assessment?.alerts?.[0];
    const alertSeverity = highestAlert?.severity ? String(highestAlert.severity).toUpperCase() : '';
    if (highestAlert && (alertSeverity === 'CRITICAL' || alertSeverity === 'HIGH')) {
      status = 'DO_NOT_GO';
    } else {
      status = 'CAUTION';
    }
  }`;

f = f.replace(/let status = getFisherDecisionStatus[\s\S]*?status = 'CAUTION';\n    }\n  }/, goodOverride);

fs.writeFileSync(file, f);
