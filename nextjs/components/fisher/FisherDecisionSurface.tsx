import React, { useState } from "react";
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
import TripPlanDetails from "./TripPlanDetails";

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
  collaboration?: AgentCollaborationPayload;
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
  const rawStatus =
    assessment.decision_object?.decision?.toUpperCase() ||
    (typeof assessment.decision === "string"
      ? (assessment.decision as string).toUpperCase()
      : (assessment.decision as any)?.status?.toUpperCase() || "");
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

export function extractFisherConditions(
  response: TripAssessmentResponse | null,
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
  const isForecast = !!measurements.is_forecast;

  const extractVal = (key: string) => {
    const m = measurements[key];
    if (m && m.value !== undefined && m.value !== null) {
      const v = typeof m.value === "number" ? m.value.toFixed(1) : m.value;
      return `${v} ${m.unit || ""}`.trim();
    }
    return "—";
  };

  const waveVal =
    extractVal("wave_height") !== "—"
      ? extractVal("wave_height")
      : extractVal("significant_wave_height");
  const windVal = extractVal("wind_speed");
  const visVal = extractVal("visibility");
  const tideVal =
    extractVal("tide") !== "—"
      ? extractVal("tide")
      : measurements.tide_schedule
        ? "Available"
        : "Unavailable";

  let hazardVal = "—";
  if (response.alerts && response.alerts.length > 0) {
    // Pick highest severity alert that affects trip
    const highestAlert =
      response.alerts.find((a) => a.affects_trip) || response.alerts[0];
    hazardVal = highestAlert.title || (highestAlert as any).message || "—";
  } else {
    const status =
      (response.decision as any)?.status ||
      (typeof response.decision === "string" ? response.decision : undefined);
    if (status === "GO") {
      hazardVal = "No Active Hazards";
    } else if (status === "UNKNOWN") {
      hazardVal = "Status Unknown";
    } else if (status === "CAUTION") {
      hazardVal = "Elevated Hazard";
    } else if (status === "NO_GO") {
      hazardVal = "Hazard Alert";
    }
  }

  return {
    waves: waveVal || "—",
    wind: windVal || "—",
    visibility: visVal || "—",
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
  collaboration,
  onOpenVoyageSettings,
  onViewMap,
  isOffline = false,
  isExpired = false,
}: FisherDecisionSurfaceProps) {
  const [showCollaboration, setShowCollaboration] = useState(false);
  const t = TRANSLATIONS[language] || TRANSLATIONS.en;
  const status = getFisherDecisionStatus(assessment, error);
  const explanation = getFisherExplanation(
    assessment,
    status,
    language,
    error,
    isLoading,
  );
  const conditions = extractFisherConditions(
    isLoading || error ? null : assessment,
  );
  const { speak, stop, isPlaying } = useSpokenGuidance({ language });
  const collab = collaboration || (assessment as any)?.agent_collaboration;

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
        label: translateText("CHECKING…", language),
        bgClass: "decision-loading",
        icon: <Loader2 size={32} className="decision-icon spin-icon" />,
        testId: "status-loading",
      }
    : statusConfig[status];

  const hazardVal = conditions.hazard;
  const hasActiveHazard =
    hazardVal !== "—" &&
    hazardVal !== "No Active Hazards" &&
    hazardVal !== "Status Unknown";

  const handleSpeak = () => {
    if (isPlaying) {
      stop();
    } else {
      let textToSpeak = `${currentCfg.label}. ${explanation}.`;
      if (hasActiveHazard) {
        const alertPrefix = translateText("Alert", language);
        const affectsSuffix = translateText(
          "affects your planned trip. Do not depart.",
          language,
        );
        const hazardText = hazardVal ? translateText(hazardVal, language) : "";
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
      <div
        className={`fisher-decision-card ${currentCfg.bgClass}`}
        data-testid={currentCfg.testId}
      >
        {/* Connectivity / Data Status Indicator */}
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
              {t.statusLabels?.["LIVE"] || "Live Data"}
            </span>
          )}
        </div>

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
              <strong>{translateText("Evaluated Window:", language)}</strong>{" "}
              {assessment.trip_context.departure_time || "Now"} -{" "}
              {assessment.trip_context.return_time || "End of trip"}
            </div>
            <div>
              <strong>{translateText("Assessment Time:", language)}</strong>{" "}
              {new Date(assessment.assessed_at).toLocaleString()}
            </div>
          </div>
        )}
      </div>

      <MissionBriefPanel
        brief={assessment?.brief}
        delta={collab?.delta}
        activeDiff={activeDiff}
        language={language}
      />

      <TripPlanDetails assessment={assessment} language={language} />

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
            background: "#fef2f2",
            borderLeft: "8px solid #ef4444",
            padding: "16px",
            marginTop: "16px",
            borderRadius: "8px",
          }}
        >
          <h3
            style={{
              margin: "0 0 8px 0",
              color: "#991b1b",
              fontSize: "1.25rem",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <AlertTriangle size={24} />
            {translateText(hazardVal, language)}
          </h3>
          <p
            style={{
              margin: "0 0 16px 0",
              fontSize: "1.1rem",
              color: "#7f1d1d",
            }}
          >
            <strong>{translateText("What is happening:", language)}</strong>{" "}
            {translateText(hazardVal, language)}.<br />
            <strong>
              {translateText("Does it affect this trip?", language)}
            </strong>{" "}
            {translateText(
              "Yes, it directly affects your planned route.",
              language,
            )}
            <br />
            <strong>{translateText("What to do next:", language)}</strong>{" "}
            {translateText("Do not depart. Await further clearance.", language)}
          </p>
          <button
            onClick={() => {
              const alertPrefix = translateText("Alert", language);
              const affectsSuffix = translateText(
                "affects your planned trip. Do not depart.",
                language,
              );
              const hearAdvisory = translateText(
                "Hear the official advisory",
                language,
              );
              speak(
                `${alertPrefix}: ${translateText(hazardVal, language)}. ${affectsSuffix} ${hearAdvisory}`,
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
            {translateText("Hear the official advisory", language)}
          </button>
        </div>
      )}

      {/* Multi-Agent Collaboration & Decision Authority Accordion */}
      {collab && (
        <div
          className="fisher-collaboration-accordion"
          style={{
            marginTop: "16px",
            marginBottom: "16px",
            border: "1px solid #cbd5e1",
            borderRadius: "12px",
            overflow: "hidden",
            background: "#ffffff",
          }}
          data-testid="fisher-agent-reasoning-section"
        >
          <button
            type="button"
            className="collaboration-toggle-bar"
            onClick={() => setShowCollaboration((prev) => !prev)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "14px 16px",
              background: "#f8fafc",
              border: "none",
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
          }}
        >
          <SlidersHorizontal size={28} />
          {TRANSLATIONS[language].planMyTrip}
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
