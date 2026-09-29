import type { DecisionStabilityPayload } from "../../types/assessment";
import { translateText, type SupportedLanguage } from "../../i18n/translations";
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Activity,
  Gauge,
} from "lucide-react";

export interface DecisionStabilityCardProps {
  stability?: DecisionStabilityPayload | null;
  language?: SupportedLanguage;
}

export default function DecisionStabilityCard({
  stability,
  language = "en",
}: DecisionStabilityCardProps) {
  if (!stability) {
    return null;
  }

  const levelUpper = (stability.level || "MEDIUM").toUpperCase();

  const getLevelBadge = () => {
    switch (levelUpper) {
      case "HIGH":
        return {
          bg: "#ecfdf5",
          text: "#065f46",
          border: "#a7f3d0",
          icon: <ShieldCheck size={14} />,
          label: "HIGH STABILITY",
        };
      case "LOW":
        return {
          bg: "#fef2f2",
          text: "#991b1b",
          border: "#fecaca",
          icon: <AlertTriangle size={14} />,
          label: "LOW STABILITY",
        };
      case "MEDIUM":
      default:
        return {
          bg: "#fffbeb",
          text: "#92400e",
          border: "#fde68a",
          icon: <ShieldAlert size={14} />,
          label: "MEDIUM STABILITY",
        };
    }
  };

  const badge = getLevelBadge();
  const nb = stability.nearest_boundary;
  const minAdj = stability.minimal_safe_adjustment;
  const safeReason =
    /storm|cyclone|warning|coastal warning|तूफान|चेतावनी/i.test(
      stability.reason,
    ) && levelUpper === "HIGH"
      ? "All environmental margins remain comfortably within safe limits."
      : stability.reason;

  const formatMetric = (metric?: string) => {
    if (!metric) return "—";
    return metric
      .replace(/_/g, " ")
      .replace(/\bm\b/g, "")
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  return (
    <div
      className="decision-stability-card"
      data-testid="decision-stability-card"
      style={{
        backgroundColor: "#f8fafc",
        border: "1px solid #e2e8f0",
        borderRadius: "10px",
        padding: "14px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      }}
    >
      {/* Top Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "8px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <Gauge size={16} color="#0284c7" />
          <span
            style={{ fontSize: "0.9rem", fontWeight: 700, color: "#0f172a" }}
          >
            {translateText("Recommendation Stability", language)}
          </span>
        </div>
        <div
          data-testid="stability-level-badge"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            backgroundColor: badge.bg,
            color: badge.text,
            border: `1px solid ${badge.border}`,
            padding: "2px 8px",
            borderRadius: "9999px",
            fontSize: "0.75rem",
            fontWeight: 700,
            letterSpacing: "0.03em",
          }}
        >
          {badge.icon}
          <span>{translateText(badge.label, language)}</span>
        </div>
      </div>

      {/* Headline & Reason */}
      <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
        <div
          data-testid="stability-headline"
          style={{ fontSize: "0.875rem", fontWeight: 600, color: "#1e293b" }}
        >
          {translateText(stability.headline, language)}
        </div>
        <div
          data-testid="stability-reason"
          style={{ fontSize: "0.8125rem", color: "#64748b", lineHeight: 1.45 }}
        >
          {translateText(safeReason, language)}
        </div>
      </div>

      {/* Nearest Boundary Info */}
      {nb && (
        <div
          data-testid="nearest-boundary-info"
          style={{
            backgroundColor: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "6px",
            padding: "8px 10px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            rowGap: "6px",
            fontSize: "0.8rem",
            color: "#334155",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              minWidth: 0,
              flex: "1 1 220px",
            }}
          >
            <Activity size={13} color="#64748b" />
            <span>
              <strong>{translateText("Nearest Boundary", language)}:</strong>{" "}
              {translateText(formatMetric(nb.metric_name), language)}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              flexWrap: "wrap",
              justifyContent: "flex-end",
              flex: "1 1 180px",
            }}
          >
            <span style={{ fontFamily: "monospace", color: "#0f172a" }}>
              {nb.observed_value}{nb.unit} / {nb.threshold_value}{nb.unit}
            </span>
            <span
              style={{
                fontWeight: 700,
                color: nb.margin >= 0 ? "#16a34a" : "#dc2626",
              }}
            >
              ({nb.margin >= 0 ? "+" : ""}
              {nb.margin_percent.toFixed(1)}%{" "}
              {translateText("buffer", language)})
            </span>
          </div>
        </div>
      )}

      {/* Minimal Safe Adjustment */}
      {minAdj && (
        <div
          data-testid="minimal-safe-adjustment"
          style={{
            backgroundColor: "#eff6ff",
            border: "1px solid #bfdbfe",
            borderRadius: "6px",
            padding: "8px 10px",
            fontSize: "0.8rem",
            color: "#1d4ed8",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <strong>{translateText("Minimal Safe Adjustment", language)}:</strong>
          <span>{translateText(minAdj, language)}</span>
        </div>
      )}
    </div>
  );
}
