const fs = require('fs');
const file = 'src/components/fisher/FisherDecisionSurface.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Override status if there is a hazard
const statusLine = "const status = getFisherDecisionStatus(assessment, error);";
const overrideCode = `  let status = getFisherDecisionStatus(assessment, error);
  const hazardVal = conditions.hazard;
  const hasActiveHazard = hazardVal !== '—' && hazardVal !== 'No Active Hazards' && hazardVal !== 'Status Unknown';
  
  if (hasActiveHazard && status === 'SAFE_TO_GO') {
    const highestAlert = assessment?.alerts?.find((a: any) => a.affects_trip) || assessment?.alerts?.[0];
    if (highestAlert && (highestAlert.severity === 'CRITICAL' || highestAlert.severity === 'HIGH')) {
      status = 'DO_NOT_GO';
    } else {
      status = 'CAUTION';
    }
  }`;
content = content.replace(statusLine, overrideCode);

// Remove the old hasActiveHazard logic further down
content = content.replace(
  "  const hazardVal = conditions.hazard;\n  const hasActiveHazard = hazardVal !== '—' && hazardVal !== 'No Active Hazards' && hazardVal !== 'Status Unknown';",
  ""
);

// 2. Fix the red banner to use dynamic colors based on status
const bannerStart = `      {hasActiveHazard && (
        <div className="fisher-actionable-alert" style={{ background: '#fef2f2', borderLeft: '8px solid #ef4444', padding: '16px', marginTop: '16px', borderRadius: '8px' }}>
          <h3 style={{ margin: '0 0 8px 0', color: '#991b1b', fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={24} />
            {translateText(hazardVal, language)}
          </h3>
          <p style={{ margin: '0 0 16px 0', fontSize: '1.1rem', color: '#7f1d1d' }}>
            <strong>{translateText('What is happening:', language)}</strong> {translateText(hazardVal, language)}.<br/>
            <strong>{translateText('Does it affect this trip?', language)}</strong> {translateText('Yes, it directly affects your planned route.', language)}<br/>
            <strong>{translateText('What to do next:', language)}</strong> {translateText('Do not depart. Await further clearance.', language)}
          </p>`;

const bannerReplacement = `      {hasActiveHazard && (
        <div className="fisher-actionable-alert" style={{ background: status === 'DO_NOT_GO' ? '#fef2f2' : '#fffbeb', borderLeft: \`8px solid \${status === 'DO_NOT_GO' ? '#ef4444' : '#f59e0b'}\`, padding: '16px', marginTop: '16px', borderRadius: '8px' }}>
          <h3 style={{ margin: '0 0 8px 0', color: status === 'DO_NOT_GO' ? '#991b1b' : '#b45309', fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={24} />
            {translateText(hazardVal, language)}
          </h3>
          <p style={{ margin: '0 0 16px 0', fontSize: '1.1rem', color: status === 'DO_NOT_GO' ? '#7f1d1d' : '#92400e' }}>
            <strong>{translateText('What is happening:', language)}</strong> {translateText(hazardVal, language)}.<br/>
            <strong>{translateText('Does it affect this trip?', language)}</strong> {translateText('Yes, it directly affects your planned route.', language)}<br/>
            <strong>{translateText('What to do next:', language)}</strong> {status === 'DO_NOT_GO' ? translateText('Do not depart. Await further clearance.', language) : translateText('Proceed with caution.', language)}
          </p>`;

content = content.replace(bannerStart, bannerReplacement);

fs.writeFileSync(file, content);
