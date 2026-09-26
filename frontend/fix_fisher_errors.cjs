const fs = require('fs');
let file = 'src/components/fisher/FisherDecisionSurface.tsx';
let f = fs.readFileSync(file, 'utf8');

// Fix 1: Revert getFisherExplanation to use translateText
const explRegex = /getFisherExplanation\([\s\S]*?\)\s*:\s*string\s*\{\s*if\s*\(isLoading\)\s*\{\s*return\s*i18nT\('FisherDecisionSurface\.Checking current marine conditions…',\s*'Checking current marine conditions…'\);\s*\}\s*if\s*\(error\)\s*\{\s*return\s*i18nT\('FisherDecisionSurface\.Unable to obtain a current safety assessment\.',\s*'Unable to obtain a current safety assessment\.'\);\s*\}/;

const explFixed = `getFisherExplanation(
  response: TripAssessmentResponse | null,
  status: FisherDecisionStatus,
  language: SupportedLanguage = 'en',
  error?: string | null,
  isLoading?: boolean
): string {
  if (isLoading) {
    return translateText('Checking current marine conditions…', language);
  }
  if (error) {
    return translateText('Unable to obtain a current safety assessment.', language);
  }`;

f = f.replace(/getFisherExplanation\([\s\S]*?if\s*\(error\)\s*\{[\s\S]*?\n\s*\}/, explFixed);

// Actually, let's just replace all i18nT(...) inside getFisherExplanation with translateText(..., language)
f = f.replace(/return i18nT\('FisherDecisionSurface\.([^']+)', '[^']+'\);/g, "return translateText('$1', language);");

// Fix 2: Move conditions and hasActiveHazard before the override
const badOverride = `    let status = getFisherDecisionStatus(assessment, error);

  
  if (hasActiveHazard && status === 'SAFE_TO_GO') {
    const highestAlert = assessment?.alerts?.find((a: any) => a.affects_trip) || assessment?.alerts?.[0];
    if (highestAlert && (highestAlert.severity === 'CRITICAL' || highestAlert.severity === 'HIGH')) {
      status = 'DO_NOT_GO';
    } else {
      status = 'CAUTION';
    }
  }
  const explanation = getFisherExplanation(assessment, status, language, error, isLoading);
  const conditions = extractFisherConditions(isLoading || error ? null : assessment);`;

const goodOverride = `  let status = getFisherDecisionStatus(assessment, error);
  const conditions = extractFisherConditions(isLoading || error ? null : assessment);
  const hazardVal = conditions.hazard;
  const hasActiveHazard = hazardVal !== '—' && hazardVal !== 'No Active Hazards' && hazardVal !== 'Status Unknown';

  if (hasActiveHazard && status === 'SAFE_TO_GO') {
    const highestAlert = assessment?.alerts?.find((a: any) => a.affects_trip) || assessment?.alerts?.[0];
    if (highestAlert && (highestAlert.severity === 'CRITICAL' || highestAlert.severity === 'HIGH')) {
      status = 'DO_NOT_GO';
    } else {
      status = 'CAUTION';
    }
  }

  const explanation = getFisherExplanation(assessment, status, language, error, isLoading);`;

f = f.replace(badOverride, goodOverride);

fs.writeFileSync(file, f);
