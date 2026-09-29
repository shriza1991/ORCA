import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  HelpCircle,
  Waves as WavesIcon,
  Wind as WindIcon,
  Eye as VisibilityIcon,
  Droplets as TideIcon,
  AlertTriangle,
  Loader2,
  SlidersHorizontal,
  Volume2,
  VolumeX,
  Map as MapIcon,
  FileText,
  Clock,
} from "lucide-react";
import type { TripAssessmentResponse } from "../../types/assessment";
import type { DecisionDiff, MissionContext } from "../../types/mission";
import type { AgentCollaborationPayload } from "../../types/contracts";
import {
  translateText,
  type SupportedLanguage,
  TRANSLATIONS,
} from "../../i18n/translations";
import { useSpokenGuidance } from "../../hooks/useSpokenGuidance";
import AgentCollaborationPanel from "../collaboration/AgentCollaborationPanel";
import MissionBriefPanel from "./MissionBriefPanel";
import PFZDetails from "./PFZDetails";
import TripPlanDetails, { getRouteSummary } from "./TripPlanDetails";
import EvidenceDrawer from "../evidence/EvidenceDrawer";
import {
  formatMissionTime,
  formatMissionWindow,
} from "../../utils/fisher-format";

export type FisherDecisionStatus =
  | "SAFE_TO_GO"
  | "CAUTION"
  | "DO_NOT_GO"
  | "UNKNOWN";

export interface FisherConditions {
  waves: string;
  wind: string;
  visibility: string;
  tide: string;
  hazard: string;
  isForecast: boolean;
}

export interface FisherDecisionSurfaceProps {
  assessment: TripAssessmentResponse | null;
  isLoading?: boolean;
  error?: string | null;
  activeDiff?: DecisionDiff | null;
  missionContext?: MissionContext;
  language?: SupportedLanguage;
  collaboration?: AgentCollaborationPayload | null;
  onOpenVoyageSettings?: () => void;
  onViewMap?: () => void;
  isOffline?: boolean;
  isExpired?: boolean;
}

export function getFisherDecisionStatus(
  assessment: TripAssessmentResponse | null,
  error?: string | null,
): FisherDecisionStatus {
  if (error || !assessment || !assessment.decision) {
    return "UNKNOWN";
  }
  if (
    assessment.route_candidates?.length > 0 &&
    !assessment.route_candidates.some((route) => route.is_feasible !== false)
  ) {
    return "UNKNOWN";
  }
  const rawStatus =
    typeof assessment.decision === "string"
      ? (assessment.decision as string).toUpperCase()
      : (assessment.decision as any)?.status?.toUpperCase() || "";
  switch (rawStatus) {
    case "GO":
      return "SAFE_TO_GO";
    case "CAUTION":
      return "CAUTION";
    case "NO_GO":
      return "DO_NOT_GO";
    case "UNKNOWN":
    case "INFORMATIONAL":
    default:
      return "UNKNOWN";
  }
}

export function getFisherExplanation(
  response: TripAssessmentResponse | null,
  status: FisherDecisionStatus,
  language: SupportedLanguage = "en",
  error?: string | null,
  isLoading?: boolean,
): string {
  if (isLoading) {
    return translateText("Checking current marine conditions…", language);
  }
  if (error) {
    return translateText(
      "Unable to obtain a current safety assessment.",
      language,
    );
  }
  if (!response || !response.decision) {
    return translateText("No current safety assessment available.", language);
  }

  const rec = response.decision as any;
  if (typeof rec === "string") {
    // If it's a string, we might only have alerts for the explanation
    if (status === "UNKNOWN" && response.alerts?.length > 0) {
      return translateText(
        (response.alerts[0] as any).message ||
          response.alerts[0].title ||
          "A safety recommendation is not available from the current evidence.",
        language,
      );
    }
    if (status === "SAFE_TO_GO") {
      return translateText(
        "Conditions are within safe operating limits.",
        language,
      );
    }
    if (status === "CAUTION" || status === "DO_NOT_GO") {
      return translateText(
        (response.alerts?.[0] as any)?.message ||
          response.alerts?.[0]?.title ||
          "Conditions exceed safety limits.",
        language,
      );
    }
    return translateText(
      "A safety recommendation is not available from the current evidence.",
      language,
    );
  }

  if (status === "UNKNOWN") {
    if (rec.summary && rec.summary.trim().length > 0) {
      return translateText(rec.summary, language);
    }
    return translateText(
      "A safety recommendation is not available from the current evidence.",
      language,
    );
  }

  if (rec.summary && rec.summary.trim().length > 0) {
    return translateText(rec.summary, language);
  }

  if (rec.decisive_factors && rec.decisive_factors.length > 0) {
    return translateText(rec.decisive_factors[0], language);
  }

  return translateText("No operational summary available.", language);
}

/**
 * Safe numeric formatter — returns null for null/undefined/NaN/empty.
 */
function safeNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "" || v === "—") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return isNaN(n) ? null : n;
}

/**
 * Mines the evidence[] array for a named metric value.
 * Used when conditions.measurements is empty (HYBRID fallback path).
 */
function evidenceVal(
  evidence: Record<string, any>[],
  metricName: string,
): number | null {
  for (const e of evidence || []) {
    if (e.metric_name === metricName && e.impact !== "UNKNOWN_TRIGGER") {
      return safeNum(e.observed_value);
    }
  }
  return null;
}

export function extractFisherConditions(
  response: TripAssessmentResponse | null,
  status?: FisherDecisionStatus,
  language: SupportedLanguage = "en",
): FisherConditions {
  if (!response) {
    return {
      waves: "—",
      wind: "—",
      visibility: "—",
      tide: "—",
      hazard: "—",
      isForecast: false,
    };
  }

  const measurements = response.conditions?.measurements || {};
  const marine = response.conditions?.marine || {};
  const weather = response.conditions?.weather || {};
  const evidence: Record<string, any>[] = response.evidence || [];
  const isForecast = Boolean(
    response.conditions?.hourly_forecast?.length ||
    marine?.hourly_forecast?.length,
  );

  /** Try measurements object first, then fall back to evidence array. */
  const resolveMetric = (
    measurementKeys: string[],
    evidenceKeys: string[],
    unit: string,
  ): string => {
    if (status === "UNKNOWN") return "INSUFFICIENT DATA";

    const canonicalValues: Record<string, number | null | undefined> = {
      significant_wave_height_m: marine?.significant_wave_height_m,
      wind_speed_knots: weather?.wind_speed_knots,
      visibility_km: weather?.visibility_km,
    };
    for (const key of evidenceKeys) {
      const canonical = safeNum(canonicalValues[key]);
      if (canonical !== null) return `${canonical.toFixed(1)} ${unit}`;
    }

    // 1. Try measurements map
    for (const key of measurementKeys) {
      const m = measurements[key];
      const n = safeNum(m?.value ?? m);
      if (n !== null) return `${n.toFixed(1)} ${m?.unit || unit}`.trim();
    }
    // 2. Fall back to evidence array (contains real Open-Meteo values)
    for (const key of evidenceKeys) {
      const n = evidenceVal(evidence, key);
      if (n !== null) return `${n.toFixed(1)} ${unit}`;
    }
    return "—";
  };

  const waveVal = resolveMetric(
    ["wave_height", "significant_wave_height"],
    ["significant_wave_height_m"],
    "m",
  );

  const windVal = resolveMetric(
    ["wind_speed", "wind_speed_knots"],
    ["wind_speed_knots"],
    "knots",
  );

  // Prefer the canonical observation bundle before threshold-only evidence.
  const visRaw = (() => {
    if (status === "UNKNOWN") return "INSUFFICIENT DATA";
    for (const key of ["visibility", "visibility_km"]) {
      const m = measurements[key];
      const n = safeNum(m?.value ?? m);
      if (n !== null) return `${n.toFixed(1)} ${m?.unit || "km"}`.trim();
    }
    const visibility = safeNum(weather.visibility_km);
    if (visibility !== null) return `${visibility.toFixed(1)} km`;
    return "—";
  })();

  // Tide comes from the same canonical marine record as the wave/SST fields.
  const tideVal = (() => {
    if (status === "UNKNOWN") return "INSUFFICIENT DATA";
    const canonicalTide = safeNum(marine?.sea_level_height_m);
    if (canonicalTide !== null) {
      const phase = marine?.tide_phase
        ? ` ${translateText(marine.tide_phase, language)}`
        : "";
      return `${canonicalTide.toFixed(1)} m${phase} ${marine?.tide_is_estimated ? `(${translateText("estimated", language)})` : ""}`.trim();
    }
    for (const key of ["tide", "tide_level", "tide_height_m"]) {
      const m = measurements[key];
      const n = safeNum(m?.value ?? m);
      if (n !== null) return `${n.toFixed(1)} ${m?.unit || "m"}`.trim();
    }
    const tideLevel = safeNum(marine.tide_level_m);
    if (tideLevel !== null) {
      const phase = marine.tide_phase ? ` (${marine.tide_phase})` : "";
      return `${tideLevel.toFixed(1)} m${phase}`;
    }
    if (measurements.tide_schedule) return "Available";
    return "INSUFFICIENT DATA";
  })();

  let hazardVal = "—";
  const normalBulletin =
    String(response.conditions?.hazard?.severity || "").toUpperCase() ===
    "NORMAL";
  if (!normalBulletin && response.alerts && response.alerts.length > 0) {
    const highestAlert =
      response.alerts.find((a) => a.affects_trip) || response.alerts[0];
    hazardVal = highestAlert.title || (highestAlert as any).message || "—";
  } else {
    const status = (response.decision as any)?.status;
    if (status === "GO") hazardVal = "No Active Hazards";
    else if (status === "UNKNOWN") hazardVal = "Status Unknown";
    else if (status === "CAUTION") hazardVal = "Elevated Hazard";
    else if (status === "NO_GO") hazardVal = "Hazard Alert";
  }

  return {
    waves: waveVal,
    wind: windVal,
    visibility: visRaw,
    tide: tideVal,
    hazard: hazardVal,
    isForecast,
  };
}

export default function FisherDecisionSurface({
  assessment,
  isLoading = false,
  error = null,
  activeDiff = null,
  language = "en",
  collaboration = null,
  onOpenVoyageSettings,
  onViewMap,
  isOffline = false,
  isExpired = false,
}: FisherDecisionSurfaceProps) {
  const { t: i18nT } = useTranslation();
  const [showCollaboration, setShowCollaboration] = useState(false);
  const [isEvidenceDrawerOpen, setIsEvidenceDrawerOpen] = useState(false);
  const t = TRANSLATIONS[language] || TRANSLATIONS.en;
  let status = getFisherDecisionStatus(assessment, error);
  const conditions = extractFisherConditions(
    isLoading || error ? null : assessment,
    status,
    language,
  );
  const hazardVal = conditions.hazard;
  const hasActiveHazard =
    hazardVal !== "—" &&
    hazardVal !== "No Active Hazards" &&
    hazardVal !== "Status Unknown";

  if (hasActiveHazard && status === "SAFE_TO_GO") {
    const highestAlert =
      assessment?.alerts?.find((a: any) => a.affects_trip) ||
      assessment?.alerts?.[0];
    const alertSeverity = highestAlert?.severity
      ? String(highestAlert.severity).toUpperCase()
      : "";
    if (
      highestAlert &&
      (alertSeverity === "CRITICAL" || alertSeverity === "HIGH")
    ) {
      status = "DO_NOT_GO";
    } else {
      status = "CAUTION";
    }
  }

  const explanation = getFisherExplanation(
    assessment,
    status,
    language,
    error,
    isLoading,
  );
  const { speak, stop, isPlaying } = useSpokenGuidance({ language });
  const collab = collaboration || (assessment as any)?.agent_collaboration;
  const provenanceMode =
    assessment?.conditions?.source_metadata?.provenance_mode ||
    (isOffline ? "SAVED" : "LIVE");
  const provenanceUpdatedAt =
    assessment?.conditions?.captured_at ||
    assessment?.conditions?.marine?.observed_at ||
    assessment?.conditions?.weather?.observed_at ||
    assessment?.assessed_at;
  const provenanceAge = provenanceUpdatedAt
    ? Math.max(
        0,
        Math.round((Date.now() - Date.parse(provenanceUpdatedAt)) / 60000),
      )
    : 0;
  const provenanceLabel = translateText(`${provenanceMode} Data`, language);

  const statusConfig: Record<
    FisherDecisionStatus,
    { label: string; bgClass: string; icon: React.ReactNode; testId: string }
  > = {
    SAFE_TO_GO: {
      label: t.statusLabels["GO"] || "Within assessed limits",
      bgClass: "decision-safe",
      icon: <ShieldCheck size={32} className="decision-icon" />,
      testId: "status-safe-to-go",
    },
    CAUTION: {
      label: t.statusLabels["CAUTION"] || "Be careful",
      bgClass: "decision-caution",
      icon: <ShieldAlert size={32} className="decision-icon" />,
      testId: "status-caution",
    },
    DO_NOT_GO: {
      label: t.statusLabels["NO_GO"] || "Do not depart",
      bgClass: "decision-nogo",
      icon: <ShieldX size={32} className="decision-icon" />,
      testId: "status-do-not-go",
    },
    UNKNOWN: {
      label: t.statusLabels["UNKNOWN"] || "Information unavailable",
      bgClass: "decision-unknown",
      icon: <HelpCircle size={32} className="decision-icon" />,
      testId: "status-unknown",
    },
  };

  const currentCfg = isLoading
    ? {
        label: i18nT("FisherDecisionSurface.CHECKING…", "CHECKING…"),
        bgClass: "decision-loading",
        icon: <Loader2 size={32} className="decision-icon spin-icon" />,
        testId: "status-loading",
      }
    : statusConfig[status];

  const handleSpeak = () => {
    if (isPlaying) {
      stop();
    } else {
      let textToSpeak = `${currentCfg.label}. ${explanation}.`;

      const routes = assessment?.route_candidates || [];
      const recommendedRoute =
        routes.find(
          (route: any) => route.is_recommended && route.is_feasible !== false,
        ) || routes.find((route: any) => route.is_feasible !== false);
      const planLabel =
        language === "hi"
          ? "यात्रा योजना"
          : language === "mr"
            ? "प्रवास योजना"
            : "Trip plan";
      textToSpeak += ` ${planLabel}.`;
      if (recommendedRoute) {
        const routeRisk =
          status === "UNKNOWN"
            ? "UNKNOWN"
            : recommendedRoute.risk_rating || "UNKNOWN";
        const routeSummary = getRouteSummary(
          routeRisk,
          recommendedRoute.max_wave_height_m || 0,
          recommendedRoute.fuel_estimate_liters || 0,
          language,
        );
        const distance = recommendedRoute.distance_km;
        const fuel = recommendedRoute.fuel_estimate_liters;
        const distanceLabel =
          language === "hi" ? "दूरी" : language === "mr" ? "अंतर" : "Distance";
        const fuelLabel =
          language === "hi"
            ? "आवश्यक ईंधन"
            : language === "mr"
              ? "आवश्यक इंधन"
              : "Fuel required";
        textToSpeak += ` ${planLabel}. ${routeSummary}`;
        if (typeof distance === "number")
          textToSpeak += ` ${distanceLabel}: ${distance} kilometers.`;
        if (typeof fuel === "number")
          textToSpeak += ` ${fuelLabel}: ${fuel} liters.`;
      } else {
        const noRouteMessage =
          language === "hi"
            ? "इस यात्रा के लिए कोई सुरक्षित जल मार्ग उपलब्ध नहीं है।"
            : language === "mr"
              ? "या प्रवासासाठी सुरक्षित जलमार्ग उपलब्ध नाही."
              : "No feasible water route is available for this trip. Do not depart until a safe passage is provided.";
        textToSpeak += ` ${noRouteMessage}`;
      }

      const safeWindow = assessment?.safe_window;
      if (safeWindow) {
        const timeLabel =
          language === "hi"
            ? "जाने का सबसे सुरक्षित समय"
            : language === "mr"
              ? "निघण्याची सुरक्षित वेळ"
              : "Safest time to leave";
        const formatTime = (value?: string | null) => {
          if (!value) return "";
          const date = new Date(value);
          if (Number.isNaN(date.getTime())) return "";
          const locale =
            language === "hi" ? "hi-IN" : language === "mr" ? "mr-IN" : "en-IN";
          return new Intl.DateTimeFormat(locale, {
            dateStyle: "medium",
            timeStyle: "short",
          }).format(date);
        };
        const start = formatTime(
          safeWindow.recommended_window_start ||
            safeWindow.earliest_safer_departure,
        );
        const end = formatTime(safeWindow.recommended_window_end);
        if (start)
          textToSpeak += ` ${timeLabel}: ${start}${end ? ` to ${end}` : ""}.`;
        else
          textToSpeak += ` ${translateText(safeWindow.window_summary, language)}.`;
      }

      if (hasActiveHazard) {
        const alertPrefix = i18nT("FisherDecisionSurface.Alert", "Alert");
        const affectsSuffix = i18nT(
          "FisherDecisionSurface.affects your planned trip. Do not depart.",
          "affects your planned trip. Do not depart.",
        );
        const hazardText = hazardVal
          ? i18nT("Hazard." + hazardVal, hazardVal)
          : "";
        textToSpeak += ` ${alertPrefix}: ${hazardText} ${affectsSuffix}`;
      }
      speak(textToSpeak);
    }
  };

  return (
    <section
      className="fisher-decision-surface"
      aria-label="Primary Mission Decision and Conditions"
      data-testid="fisher-decision-surface"
    >
      <button
        onClick={onOpenVoyageSettings}
        className="fisher-large-action-btn"
        style={{
          padding: "20px",
          fontSize: "1.25rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
          background: "#f1f5f9",
          color: "#0f172a",
          borderRadius: "12px",
          border: "1px solid #cbd5e1",
          width: "100%",
          marginBottom: "16px",
        }}
      >
        <SlidersHorizontal size={28} />
        {TRANSLATIONS[language].planMyTrip}
      </button>

      {/* 1. Decision Banner */}
      <div
        className={`fisher-decision-card ${currentCfg.bgClass}`}
        data-testid={currentCfg.testId}
      >
        {/* Connectivity / Data Status Indicator */}
        {(() => {
          const isDegraded = assessment?.alerts?.some(
            (a: any) =>
              (a.message || a.title || "").includes("DEGRADED_DATA") ||
              (a.message || a.title || "").includes("Stale") ||
              (a.message || a.title || "").includes("incomplete telemetry"),
          );
          const isDemo = ["SNAPSHOT", "SYNTHETIC", "DEMO"].includes(
            String(assessment?.conditions?.data_mode || "").toUpperCase(),
          );
          return (
            <div
              className="connectivity-strip"
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginBottom: "8px",
              }}
            >
              {isOffline ? (
                <span
                  className="badge badge-error"
                  style={{
                    fontSize: "0.7rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <AlertTriangle size={12} />
                  {isExpired
                    ? t.statusLabels?.["EXPIRED"] || "Expired Cache"
                    : t.statusLabels?.["CACHED"] || "Offline Cached"}
                </span>
              ) : isDegraded ? (
                <span
                  className="badge badge-warning"
                  style={{
                    fontSize: "0.7rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    color: "#92400e",
                    background: "#fef3c7",
                    border: "1px solid #fbbf24",
                    borderRadius: "4px",
                    padding: "2px 6px",
                  }}
                >
                  <AlertTriangle size={12} />
                  {t.statusLabels?.["PARTIAL"] || "Partial Data"}
                </span>
              ) : isDemo ? (
                <span className="badge badge-cached" style={{ fontSize: "0.7rem" }}>
                  DEMO DATA
                </span>
              ) : (
                <span
                  className="badge badge-success"
                  style={{
                    fontSize: "0.7rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <span
                    className="pulse-dot"
                    style={{
                      width: 6,
                      height: 6,
                      backgroundColor: "currentColor",
                      borderRadius: "50%",
                    }}
                  ></span>
                  {provenanceLabel} - {translateText("updated", language)}{" "}
                  {provenanceAge}m ago
                </span>
              )}
            </div>
          );
        })()}

        <div className="decision-card-badge-row">
          <div
            className="decision-badge"
            style={{ padding: "16px", gap: "12px" }}
          >
            {currentCfg.icon}
            <span
              className="decision-status-text"
              style={{ fontSize: "1.5rem", fontWeight: "bold" }}
            >
              {currentCfg.label}
            </span>
          </div>
        </div>

        <p
          className="decision-explanation-text"
          style={{ fontSize: "1.25rem", lineHeight: "1.6" }}
          data-testid="decision-explanation"
        >
          {explanation}
        </p>

        {assessment && (
          <div
            style={{
              marginTop: "16px",
              fontSize: "0.9rem",
              color: "#475569",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
            }}
          >
            <div>
              <strong>
                {i18nT(
                  "FisherDecisionSurface.Evaluated Window:",
                  translateText("Evaluated Window", language),
                )}
              </strong>{" "}
              {formatMissionWindow(
                assessment.trip_context.departure_time,
                assessment.trip_context.return_time,
                language,
              )}
            </div>
            <div>
              <strong>
                {i18nT(
                  "FisherDecisionSurface.Assessment Time:",
                  translateText("Assessment Time", language),
                )}
              </strong>{" "}
              {formatMissionTime(assessment.assessed_at, language)}
            </div>
          </div>
        )}

        {/* M1.4 Safe Mission Window Summary */}
        {assessment?.safe_window && (
          <div
            data-testid="safe-window-summary"
            style={{
              marginTop: "12px",
              padding: "10px 14px",
              borderRadius: "8px",
              backgroundColor: assessment.safe_window.is_current_safe
                ? "#f0fdf4"
                : "#fffbeb",
              border: `1px solid ${assessment.safe_window.is_current_safe ? "#bbf7d0" : "#fde68a"}`,
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "0.875rem",
              color: assessment.safe_window.is_current_safe
                ? "#166534"
                : "#92400e",
              fontWeight: 600,
            }}
          >
            <Clock size={16} />
            <span>
              {translateText(assessment.safe_window.window_summary, language)}
            </span>
          </div>
        )}
      </div>

      <TripPlanDetails
        assessment={assessment}
        language={language}
        mainStatus={status}
      />

      {/* 2. Mission Brief */}
      <MissionBriefPanel
        brief={assessment?.brief}
        delta={collab?.delta}
        activeDiff={activeDiff}
        stability={assessment?.stability}
        language={language}
      />

      {/* 3. Inspect Evidence & Data Feeds Button */}
      <div className="inspect-evidence-container" style={{ marginTop: "14px" }}>
        <button
          type="button"
          onClick={() => setIsEvidenceDrawerOpen(true)}
          className="fisher-inspect-evidence-btn"
          data-testid="inspect-evidence-btn"
          style={{
            width: "100%",
            padding: "12px 18px",
            borderRadius: "10px",
            border: "1px solid #cbd5e1",
            background: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            cursor: "pointer",
            fontSize: "0.9375rem",
            fontWeight: 600,
            color: "#0f172a",
            boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
          }}
        >
          <FileText size={18} color="#0284c7" />
          <span>
            {translateText("Inspect Evidence & Data Feeds", language)}
          </span>
        </button>
      </div>

      <EvidenceDrawer
        isOpen={isEvidenceDrawerOpen}
        onClose={() => setIsEvidenceDrawerOpen(false)}
        evidence={assessment?.evidence}
        sourceStatus={assessment?.source_status}
        brief={assessment?.brief}
        stability={assessment?.stability}
        language={language}
      />

      {/* 4. Agent Collaboration Accordion */}
      {collab && (
        <div
          className="fisher-collaboration-container"
          style={{ marginTop: "16px" }}
          data-testid="fisher-collaboration-container"
        >
          <button
            type="button"
            onClick={() => setShowCollaboration(!showCollaboration)}
            className="fisher-collaboration-toggle"
            style={{
              width: "100%",
              padding: "14px 18px",
              borderRadius: "12px",
              border: "1px solid #cbd5e1",
              background: showCollaboration ? "#f8fafc" : "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: "pointer",
              fontSize: "1rem",
              fontWeight: 600,
              color: "#0f172a",
              boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
            }}
            aria-expanded={showCollaboration}
            data-testid="toggle-fisher-collaboration"
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <ShieldCheck size={20} color="#0284c7" />
              <span>
                {translateText(
                  "Decision Authority & Agent Reasoning",
                  language,
                )}
              </span>
              <span
                style={{
                  fontSize: "0.75rem",
                  padding: "3px 8px",
                  borderRadius: "9999px",
                  background: collab.arbitration?.conflict_detected
                    ? "#fef3c7"
                    : "#dcfce7",
                  color: collab.arbitration?.conflict_detected
                    ? "#92400e"
                    : "#166534",
                  fontWeight: 700,
                }}
              >
                {collab.arbitration?.conflict_detected
                  ? translateText("Protocol D010 Overridden", language)
                  : translateText("4 Agents Consensus", language)}
              </span>
            </div>
            <span style={{ fontSize: "0.875rem", color: "#64748b" }}>
              {showCollaboration
                ? translateText("Hide Details ▲", language)
                : translateText("Inspect Agents ▼", language)}
            </span>
          </button>

          {showCollaboration && (
            <div
              style={{ marginTop: "12px" }}
              data-testid="fisher-collaboration-drawer"
            >
              <AgentCollaborationPanel
                collaboration={collab}
                defaultRole="fisherman"
              />
            </div>
          )}
        </div>
      )}

      {/* 5. Ocean Conditions */}
      <div
        className="fisher-conditions-grid"
        role="group"
        aria-label="Essential local conditions"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "8px",
          marginTop: "16px",
        }}
      >
        <div className="condition-tile" data-testid="condition-waves">
          <div
            className="condition-tile-header"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              color: "#64748b",
            }}
          >
            <WavesIcon size={16} className="condition-icon" />
            <span className="condition-label">
              {translateText("Waves", language)}
            </span>
          </div>
          <div
            className="condition-value"
            style={{ fontSize: "1.25rem", marginTop: "4px" }}
          >
            {conditions.waves}
          </div>
        </div>
        <div className="condition-tile" data-testid="condition-wind">
          <div
            className="condition-tile-header"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              color: "#64748b",
            }}
          >
            <WindIcon size={16} className="condition-icon" />
            <span className="condition-label">
              {translateText("Wind", language)}
            </span>
          </div>
          <div
            className="condition-value"
            style={{ fontSize: "1.25rem", marginTop: "4px" }}
          >
            {conditions.wind}
          </div>
        </div>
        <div className="condition-tile" data-testid="condition-visibility">
          <div
            className="condition-tile-header"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              color: "#64748b",
            }}
          >
            <VisibilityIcon size={16} className="condition-icon" />
            <span className="condition-label">
              {translateText("Visibility", language)}
            </span>
          </div>
          <div
            className="condition-value"
            style={{ fontSize: "1.25rem", marginTop: "4px" }}
          >
            {conditions.visibility}
          </div>
        </div>
        <div className="condition-tile" data-testid="condition-tide">
          <div
            className="condition-tile-header"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              color: "#64748b",
            }}
          >
            <TideIcon size={16} className="condition-icon" />
            <span className="condition-label">
              {translateText("Tide", language)}
            </span>
          </div>
          <div
            className="condition-value"
            style={{ fontSize: "1.25rem", marginTop: "4px" }}
          >
            {translateText(conditions.tide, language)}
          </div>
        </div>
      </div>

      <div
        style={{
          fontSize: "0.875rem",
          color: "#64748b",
          marginTop: "12px",
          textAlign: "center",
        }}
      >
        {conditions.isForecast
          ? translateText("Based on forecast", language)
          : translateText("Based on current observation", language)}
      </div>

      {hasActiveHazard && (
        <div
          className="fisher-actionable-alert"
          style={{
            background: status === "DO_NOT_GO" ? "#fef2f2" : "#fffbeb",
            borderLeft: `8px solid ${status === "DO_NOT_GO" ? "#ef4444" : "#f59e0b"}`,
            padding: "16px",
            marginTop: "16px",
            borderRadius: "8px",
          }}
        >
          <h3
            style={{
              margin: "0 0 8px 0",
              color: status === "DO_NOT_GO" ? "#991b1b" : "#b45309",
              fontSize: "1.25rem",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <AlertTriangle size={24} />
            {i18nT("Hazard." + hazardVal, hazardVal)}
          </h3>
          <p
            style={{
              margin: "0 0 16px 0",
              fontSize: "1.1rem",
              color: status === "DO_NOT_GO" ? "#7f1d1d" : "#92400e",
            }}
          >
            <strong>{translateText("Based on forecast", language)}</strong>{" "}
            {i18nT("Hazard." + hazardVal, hazardVal)}.<br />
            <strong>
              {translateText("Based on current observation", language)}
            </strong>{" "}
            {i18nT(
              "FisherDecisionSurface.Yes, it directly affects your planned route.",
              "Yes, it directly affects your planned route.",
            )}
            <br />
            <strong>
              {i18nT(
                "FisherDecisionSurface.What to do next:",
                "What to do next:",
              )}
            </strong>{" "}
            {status === "DO_NOT_GO"
              ? i18nT(
                  "FisherDecisionSurface.Do not depart. Await further clearance.",
                  "Do not depart. Await further clearance.",
                )
              : i18nT(
                  "FisherDecisionSurface.Proceed with caution.",
                  "Proceed with caution.",
                )}
          </p>
          <button
            onClick={() => {
              const alertPrefix = i18nT("FisherDecisionSurface.Alert", "Alert");
              const affectsSuffix = i18nT(
                "FisherDecisionSurface.affects your planned trip. Do not depart.",
                "affects your planned trip. Do not depart.",
              );
              const hearAdvisory = i18nT(
                "FisherDecisionSurface.Hear the official advisory",
                "Hear the official advisory",
              );
              speak(
                `${alertPrefix}: ${i18nT("Hazard." + hazardVal, hazardVal)}. ${affectsSuffix} ${hearAdvisory}`,
              );
            }}
            style={{
              padding: "16px",
              fontSize: "1.25rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              background: "#ef4444",
              color: "white",
              borderRadius: "8px",
              border: "none",
              width: "100%",
            }}
          >
            <Volume2 size={24} />
            {i18nT(
              "FisherDecisionSurface.Hear the official advisory",
              "Hear the official advisory",
            )}
          </button>
        </div>
      )}

      {/* 6. PFZ Explainability */}
      <PFZDetails assessment={assessment} language={language} />

      {/* Fisher Action Buttons */}
      <div
        className="fisher-action-buttons"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          marginTop: "16px",
        }}
      >
        <button
          onClick={handleSpeak}
          className="fisher-large-action-btn"
          style={{
            padding: "20px",
            fontSize: "1.25rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
            background: "#0f172a",
            color: "white",
            borderRadius: "12px",
            border: "none",
          }}
        >
          {isPlaying ? <VolumeX size={28} /> : <Volume2 size={28} />}
          {isPlaying
            ? TRANSLATIONS[language].stopAudioBtn
            : TRANSLATIONS[language].hearTheUpdate}
        </button>

        <button
          onClick={onViewMap}
          className="fisher-large-action-btn"
          style={{
            padding: "20px",
            fontSize: "1.25rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
            background: "#f1f5f9",
            color: "#0f172a",
            borderRadius: "12px",
            border: "1px solid #cbd5e1",
          }}
        >
          <MapIcon size={28} />
          {TRANSLATIONS[language].viewTheMap}
        </button>
      </div>
    </section>
  );
}
