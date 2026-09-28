import {
  Clock,
  Route as RouteIcon,
  Fuel,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Award,
  ShieldCheck,
  HelpCircle,
} from "lucide-react";
import type { TripAssessmentResponse } from "../../types/assessment";
import { translateText, type SupportedLanguage } from "../../i18n/translations";
import {
  formatDurationHours,
  formatMissionTime,
} from "../../utils/fisher-format";

interface TripPlanDetailsProps {
  assessment: TripAssessmentResponse | null;
  language: SupportedLanguage;
  mainStatus?: string;
}

export function getRiskBadgeStyle(risk: string): {
  backgroundColor: string;
  color: string;
  borderColor: string;
} {
  switch (risk) {
    case "LOW":
      return {
        backgroundColor: "#dcfce7",
        color: "#166534",
        borderColor: "#86efac",
      };
    case "MODERATE":
      return {
        backgroundColor: "#fef3c7",
        color: "#92400e",
        borderColor: "#fcd34d",
      };
    case "HIGH":
      return {
        backgroundColor: "#fee2e2",
        color: "#991b1b",
        borderColor: "#fca5a5",
      };
    default:
      return {
        backgroundColor: "#f1f5f9",
        color: "#475569",
        borderColor: "#cbd5e1",
      };
  }
}

export function getRouteSummary(
  risk: string,
  waves: number,
  fuel: number,
  language: SupportedLanguage,
): string {
  if (language === "hi") {
    if (risk === "UNKNOWN")
      return "इस मार्ग की सुरक्षा का आकलन करने के लिए पर्याप्त जानकारी उपलब्ध नहीं है।";
    if (risk === "LOW")
      return `अनुशंसित मार्ग सुरक्षित है। लहरें ${waves} मीटर तक हो सकती हैं। लगभग ${fuel} लीटर ईंधन चाहिए।`;
    if (risk === "MODERATE")
      return `अनुशंसित मार्ग पर सावधानी जरूरी है। लहरें ${waves} मीटर तक हो सकती हैं। लगभग ${fuel} लीटर ईंधन चाहिए।`;
    return `अनुशंसित मार्ग में जोखिम अधिक है। लहरें ${waves} मीटर तक हो सकती हैं। बहुत सावधानी बरतें।`;
  }
  if (language === "mr") {
    if (risk === "UNKNOWN")
      return "या मार्गाच्या सुरक्षिततेचे मूल्यमापन करण्यासाठी पुरेशी माहिती उपलब्ध नाही.";
    if (risk === "LOW")
      return `शिफारस केलेला मार्ग सुरक्षित आहे. लाटा ${waves} मीटरपर्यंत असू शकतात. अंदाजे ${fuel} लिटर इंधन लागेल.`;
    if (risk === "MODERATE")
      return `शिफारस केलेल्या मार्गावर सावधगिरी आवश्यक आहे. लाटा ${waves} मीटरपर्यंत असू शकतात. अंदाजे ${fuel} लिटर इंधन लागेल.`;
    return `शिफारस केलेल्या मार्गाचा धोका जास्त आहे. लाटा ${waves} मीटरपर्यंत असू शकतात. अत्यंत सावधगिरी बाळगा.`;
  }
  if (risk === "UNKNOWN") return "Insufficient data to evaluate route safety.";
  if (risk === "LOW")
    return `Recommended route is safe. Expect waves up to ${waves}m. You will need approximately ${fuel}L of fuel.`;
  if (risk === "MODERATE")
    return `Recommended route requires caution. Expect waves up to ${waves}m. You will need approximately ${fuel}L of fuel.`;
  return `Recommended route has elevated exposure. Waves up to ${waves}m. Exercise high vigilance.`;
}

function routeName(
  name: string | undefined,
  language: SupportedLanguage,
): string {
  const key = (name || "").toLowerCase();
  const names: Record<string, string> =
    language === "hi"
      ? {
          "direct open sea": "सीधा खुले समुद्र का मार्ग",
          "coastal balanced": "संतुलित तटीय मार्ग",
          "inshore sheltered": "तटीय सुरक्षित मार्ग",
        }
      : {
          "direct open sea": "Direct open sea",
          "coastal balanced": "Coastal balanced",
          "inshore sheltered": "Inshore sheltered",
        };
  return names[key] || translateText(name || "Route", language);
}

function riskIcon(risk: string) {
  if (risk === "LOW") return <ShieldCheck size={14} aria-label="Safe" />;
  if (risk === "MODERATE")
    return <ShieldAlert size={14} aria-label="Caution" />;
  if (risk === "HIGH") return <XCircle size={14} aria-label="Do not go" />;
  return <HelpCircle size={14} aria-label="Unknown" />;
}

export default function TripPlanDetails({
  assessment,
  language,
  mainStatus,
}: TripPlanDetailsProps) {
  const title = translateText("Trip Plan & Evaluated Routes", language);

  if (
    !assessment ||
    !assessment.route_candidates ||
    assessment.route_candidates.length === 0
  ) {
    return (
      <div
        style={{
          marginTop: "16px",
          background: "#f8fafc",
          borderRadius: "12px",
          overflow: "hidden",
          border: "1px solid #e2e8f0",
        }}
      >
        <div
          style={{
            background: "#f8fafc",
            padding: "12px 16px",
            borderBottom: "1px solid #e2e8f0",
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: "1.1rem",
              color: "#0f172a",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <RouteIcon size={18} color="#3b82f6" /> {title}
          </h3>
        </div>
        <div style={{ padding: "16px", color: "#64748b" }}>
          No route estimates available for this trip. Check your data
          connection.
        </div>
      </div>
    );
  }

  // Find recommended route (marked with is_recommended or the first route)
  const routes = assessment.route_candidates;
  const recommendedIndex = routes.findIndex((r) => r.is_recommended);
  const primaryRoute =
    recommendedIndex >= 0 && routes[recommendedIndex].is_feasible !== false
      ? routes[recommendedIndex]
      : routes.find((route) => route.is_feasible !== false);

  if (!primaryRoute) {
    return (
      <div
        className="trip-plan-details-panel"
        data-testid="trip-plan-details"
        style={{
          marginTop: "16px",
          padding: "16px",
          background: "#fff7ed",
          border: "1px solid #fed7aa",
          borderRadius: "12px",
          color: "#9a3412",
        }}
      >
        No safe water route is available for this trip. Do not follow a route
        until a feasible passage is provided.
      </div>
    );
  }

  const distance = primaryRoute.distance_km || 0;
  const etaHours = primaryRoute.eta_hours || 0;
  const fuel = primaryRoute.fuel_estimate_liters || 0;
  let risk = primaryRoute.risk_rating || "UNKNOWN";
  if (mainStatus) {
    risk =
      mainStatus === "SAFE_TO_GO"
        ? "LOW"
        : mainStatus === "CAUTION"
          ? "MODERATE"
          : mainStatus === "DO_NOT_GO"
            ? "HIGH"
            : "UNKNOWN";
  }
  const waves = primaryRoute.max_wave_height_m || 0;

  // Format time
  const timeStr = formatDurationHours(etaHours);

  // Estimate arrival date/time
  let departureTimeMs = Date.now();
  const rawDep = assessment.trip_context?.departure_time;
  if (rawDep) {
    const parsed = Date.parse(rawDep);
    if (!isNaN(parsed)) {
      departureTimeMs = parsed;
    } else if (rawDep.toLowerCase().includes("tomorrow")) {
      departureTimeMs += 24 * 60 * 60 * 1000;
    }
  }
  const arrivalDate = new Date(departureTimeMs + etaHours * 60 * 60 * 1000);
  const arrivalStr = isNaN(arrivalDate.getTime())
    ? "-"
    : formatMissionTime(arrivalDate.toISOString(), language);

  const summaryStr = getRouteSummary(risk, waves, fuel, language);

  const distLabel =
    language === "hi" ? "दूरी" : language === "mr" ? "अंतर" : "Distance";
  const timeLabel =
    language === "hi" ? "समय" : language === "mr" ? "वेळ" : "Time";
  const fuelLabel =
    language === "hi" ? "ईंधन" : language === "mr" ? "इंधन" : "Fuel";

  return (
    <div
      className="trip-plan-details-panel"
      data-testid="trip-plan-details"
      style={{
        marginTop: "16px",
        background: "white",
        borderRadius: "12px",
        border: "1px solid #e2e8f0",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "16px",
          borderBottom: "1px solid #e2e8f0",
          background: "#f8fafc",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: "1.1rem",
            color: "#0f172a",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <RouteIcon size={20} color="#3b82f6" />
          {title}
        </h3>
        <span
          style={{
            fontSize: "0.75rem",
            fontWeight: 700,
            padding: "2px 8px",
            borderRadius: "9999px",
            background: "#dbeafe",
            color: "#1d4ed8",
          }}
        >
          {routes.length} {translateText("routes evaluated", language)}
        </span>
      </div>

      <div
        style={{
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        {/* Recommended Route Banner */}
        <p
          data-testid="route-summary-banner"
          style={{
            margin: 0,
            fontSize: "0.9375rem",
            color:
              risk === "UNKNOWN"
                ? "#475569"
                : risk === "LOW"
                  ? "#166534"
                  : risk === "MODERATE"
                    ? "#854d0e"
                    : "#991b1b",
            background:
              risk === "UNKNOWN"
                ? "#f1f5f9"
                : risk === "LOW"
                  ? "#dcfce7"
                  : risk === "MODERATE"
                    ? "#fef08a"
                    : "#fee2e2",
            padding: "12px",
            borderRadius: "8px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <ShieldAlert size={20} />
          {summaryStr}
        </p>

        {/* Quick Metrics for Recommended Route */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "12px",
          }}
        >
          <div
            style={{
              padding: "12px",
              background: "#f1f5f9",
              borderRadius: "8px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
            }}
          >
            <RouteIcon
              size={24}
              color="#3b82f6"
              style={{ marginBottom: "8px" }}
            />
            <div
              style={{
                fontSize: "0.8125rem",
                color: "#64748b",
                fontWeight: 500,
              }}
            >
              {distLabel}
            </div>
            <div
              style={{
                fontSize: "1.25rem",
                color: "#0f172a",
                fontWeight: "bold",
              }}
            >
              {distance.toFixed(1)} km
            </div>
          </div>

          <div
            style={{
              padding: "12px",
              background: "#f1f5f9",
              borderRadius: "8px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
            }}
          >
            <Clock size={24} color="#f59e0b" style={{ marginBottom: "8px" }} />
            <div
              style={{
                fontSize: "0.8125rem",
                color: "#64748b",
                fontWeight: 500,
              }}
            >
              {timeLabel}
            </div>
            <div
              style={{
                fontSize: "1.25rem",
                color: "#0f172a",
                fontWeight: "bold",
              }}
            >
              {timeStr}
            </div>
            <div
              style={{
                fontSize: "0.6875rem",
                color: "#64748b",
                marginTop: "4px",
              }}
            >
              {translateText("Arriving", language)}: {arrivalStr}
            </div>
          </div>

          <div
            style={{
              padding: "12px",
              background: "#f1f5f9",
              borderRadius: "8px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
            }}
          >
            <Fuel size={24} color="#ef4444" style={{ marginBottom: "8px" }} />
            <div
              style={{
                fontSize: "0.8125rem",
                color: "#64748b",
                fontWeight: 500,
              }}
            >
              {fuelLabel}
            </div>
            <div
              style={{
                fontSize: "1.25rem",
                color: "#0f172a",
                fontWeight: "bold",
              }}
            >
              {fuel === 0 ? "0 L" : `${fuel} L`}
            </div>
          </div>
        </div>

        {/* All Evaluated Routes Comparison Table */}
        <div style={{ marginTop: "8px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "8px",
            }}
          >
            <h4
              style={{
                margin: 0,
                fontSize: "0.9375rem",
                fontWeight: 700,
                color: "#0f172a",
              }}
            >
              {translateText(
                "Route Evaluation & Exposure Comparison",
                language,
              )}
            </h4>
            <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
              {translateText("Deterministic route exposure", language)}
            </span>
          </div>

          <div
            className="route-comparison-table-wrapper"
            data-testid="route-comparison-table"
            style={{
              overflowX: "auto",
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
              background: "#ffffff",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.8125rem",
                textAlign: "left",
                minWidth: "650px",
              }}
            >
              <thead>
                <tr
                  style={{
                    backgroundColor: "#f8fafc",
                    borderBottom: "1px solid #e2e8f0",
                    color: "#475569",
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    fontSize: "0.6875rem",
                  }}
                >
                  <th style={{ padding: "10px 12px" }}>
                    {translateText("Route", language)}
                  </th>
                  <th style={{ padding: "10px 12px" }}>
                    {translateText("Distance (one-way / round-trip)", language)}
                  </th>
                  <th style={{ padding: "10px 12px" }}>
                    {translateText("Wave height", language)}
                  </th>
                  <th style={{ padding: "10px 12px" }}>
                    {translateText("ETA", language)}
                  </th>
                  <th style={{ padding: "10px 12px" }}>
                    {translateText("Fuel (one-way / round-trip)", language)}
                  </th>
                  <th style={{ padding: "10px 12px" }}>
                    {translateText("Exposure score", language)}
                  </th>
                  <th style={{ padding: "10px 12px" }}>
                    {translateText("Risk rating", language)}
                  </th>
                  <th style={{ padding: "10px 12px" }}>
                    {translateText("Feasible", language)}
                  </th>
                </tr>
              </thead>
              <tbody>
                {routes.map((route, idx) => {
                  const isRec = Boolean(
                    route.is_recommended || (recommendedIndex < 0 && idx === 0),
                  );
                  const isFeasible = route.is_feasible !== false;
                  const infeasibleReasons: string[] =
                    route.infeasibility_reasons || [];
                  const riskStyle = getRiskBadgeStyle(route.risk_rating);

                  return (
                    <tr
                      key={idx}
                      data-testid={`route-candidate-${idx}`}
                      style={{
                        borderBottom:
                          idx === routes.length - 1
                            ? "none"
                            : "1px solid #f1f5f9",
                        backgroundColor: isRec
                          ? "#f0fdf4"
                          : idx % 2 === 0
                            ? "#ffffff"
                            : "#fcfcfd",
                      }}
                    >
                      <td
                        style={{
                          padding: "10px 12px",
                          fontWeight: 600,
                          color: "#0f172a",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          {isRec && <Award size={15} color="#16a34a" />}
                          <span>
                            {routeName(route.name || route.route_id, language)}
                          </span>
                          {isRec && (
                            <span
                              data-testid="recommended-route-badge"
                              style={{
                                fontSize: "0.625rem",
                                fontWeight: 700,
                                padding: "1px 6px",
                                borderRadius: "9999px",
                                backgroundColor: "#16a34a",
                                color: "#ffffff",
                              }}
                            >
                              {translateText("RECOMMENDED", language)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td
                        style={{
                          padding: "10px 12px",
                          fontFamily: "monospace",
                        }}
                      >
                        {route.distance_km !== undefined
                          ? `${Number(route.one_way_distance_km ?? route.distance_km).toFixed(1)} / ${Number(route.round_trip_distance_km ?? (route.one_way_distance_km ?? route.distance_km) * 2).toFixed(1)} km`
                          : "—"}
                      </td>
                      <td
                        style={{
                          padding: "10px 12px",
                          fontFamily: "monospace",
                        }}
                      >
                        {route.max_wave_height_m !== undefined
                          ? `${route.max_wave_height_m} m`
                          : "—"}
                      </td>
                      <td
                        style={{
                          padding: "10px 12px",
                          fontFamily: "monospace",
                        }}
                      >
                        {route.eta_hours !== undefined
                          ? formatDurationHours(route.eta_hours)
                          : "—"}
                      </td>
                      <td
                        style={{
                          padding: "10px 12px",
                          fontFamily: "monospace",
                        }}
                      >
                        {route.fuel_estimate_liters !== undefined
                          ? `${Number(route.one_way_fuel_liters ?? route.fuel_estimate_liters).toFixed(1)} / ${Number(route.round_trip_fuel_liters ?? (route.one_way_fuel_liters ?? route.fuel_estimate_liters) * 2).toFixed(1)} L`
                          : "—"}
                      </td>
                      <td
                        style={{
                          padding: "10px 12px",
                          fontFamily: "monospace",
                          fontWeight: 600,
                        }}
                      >
                        {route.exposure_score !== undefined
                          ? route.exposure_score
                          : "—"}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: "9999px",
                            fontSize: "0.6875rem",
                            fontWeight: 700,
                            border: `1px solid ${riskStyle.borderColor}`,
                            backgroundColor: riskStyle.backgroundColor,
                            color: riskStyle.color,
                          }}
                        >
                          {riskIcon(route.risk_rating || "UNKNOWN")}{" "}
                          {translateText(
                            route.risk_rating || "UNKNOWN",
                            language,
                          )}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        {isFeasible ? (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "4px",
                              color: "#16a34a",
                              fontWeight: 600,
                            }}
                          >
                            <CheckCircle2 size={14} />{" "}
                            {translateText("Feasible", language)}
                          </span>
                        ) : (
                          <div>
                            <span
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                color: "#dc2626",
                                fontWeight: 600,
                              }}
                            >
                              <XCircle size={14} />{" "}
                              {translateText("Infeasible", language)}
                            </span>
                            {infeasibleReasons.length > 0 && (
                              <div
                                data-testid={`infeasibility-reasons-${idx}`}
                                style={{
                                  fontSize: "0.6875rem",
                                  color: "#b91c1c",
                                  marginTop: "2px",
                                  maxWidth: "180px",
                                  lineHeight: "1.3",
                                }}
                              >
                                {infeasibleReasons.join("; ")}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
