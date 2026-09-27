import { Clock, Route as RouteIcon, Fuel, ShieldAlert } from "lucide-react";
import type { TripAssessmentResponse } from "../../types/assessment";
import { translateText, type SupportedLanguage } from "../../i18n/translations";

interface TripPlanDetailsProps {
  assessment: TripAssessmentResponse | null;
  language: SupportedLanguage;
}

function getRouteSummary(
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

export default function TripPlanDetails({
  assessment,
  language,
}: TripPlanDetailsProps) {
  const title = translateText("Trip Plan & Estimates", language);

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

  const primaryRoute = assessment.route_candidates[0];
  const distance = primaryRoute.distance_km || 0;
  const etaHours = primaryRoute.eta_hours || 0;
  const fuel = primaryRoute.fuel_estimate_liters || 0;
  const risk = primaryRoute.risk_rating || "UNKNOWN";
  const waves = primaryRoute.max_wave_height_m || 0;

  // Format time
  const hours = Math.floor(etaHours);
  const minutes = Math.round((etaHours - hours) * 60);
  let timeStr = `${hours}h ${minutes}m`;
  if (hours === 0) timeStr = `${minutes}m`;

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
    ? "Unknown"
    : arrivalDate.toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      });

  // AI Route Optimization Insights
  const altRoutes = assessment.route_candidates.slice(1);
  let optimizationStr = "";
  if (altRoutes.length > 0) {
    const alt = altRoutes[0];
    if (
      alt.distance_km < distance &&
      alt.risk_rating === "HIGH" &&
      risk !== "HIGH"
    ) {
      optimizationStr = `AI Route Optimization: This route is ${Math.round(distance - alt.distance_km)}km longer than the direct path, but safely avoids ${alt.max_wave_height_m}m waves.`;
    } else if (distance < alt.distance_km) {
      optimizationStr = `AI Route Optimization: This route saves you ${Math.round(alt.distance_km - distance)}km compared to alternative paths.`;
    } else {
      optimizationStr = `AI Route Optimization: This path provides the best balance of safety and speed.`;
    }
  }

  const summaryStr = getRouteSummary(risk, waves, fuel, language);

  // Very basic translation fallback for the metrics
  const distLabel =
    language === "hi" ? "दूरी" : language === "mr" ? "अंतर" : "Distance";
  const timeLabel =
    language === "hi" ? "समय" : language === "mr" ? "वेळ" : "Time";
  const fuelLabel =
    language === "hi" ? "ईंधन" : language === "mr" ? "इंधन" : "Fuel";

  return (
    <div
      className="ocean-details-panel"
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
        }}
      >
        <h3 style={{ margin: 0, fontSize: "1.1rem", color: "#0f172a" }}>
          {translateText("Trip Plan Summary", language) || "Trip Plan Summary"}
        </h3>
      </div>

      <div
        style={{
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: "1rem",
            color:
              risk === "LOW"
                ? "#166534"
                : risk === "MODERATE"
                  ? "#854d0e"
                  : "#991b1b",
            background:
              risk === "LOW"
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
                fontSize: "0.875rem",
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
              {distance} km
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
                fontSize: "0.875rem",
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
                fontSize: "0.75rem",
                color: "#64748b",
                marginTop: "4px",
              }}
            >
              Arriving: {arrivalStr}
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
                fontSize: "0.875rem",
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

        {optimizationStr && (
          <div
            style={{
              padding: "12px",
              background: "#eff6ff",
              borderRadius: "8px",
              border: "1px solid #bfdbfe",
              fontSize: "0.9rem",
              color: "#1e40af",
              lineHeight: "1.4",
            }}
          >
            <strong>💡 AI Insight:</strong> {optimizationStr}
          </div>
        )}

        {assessment.alerts && assessment.alerts.length > 0 && (
          <div
            style={{
              padding: "12px",
              background: "#fef2f2",
              borderRadius: "8px",
              border: "1px solid #fecaca",
              fontSize: "0.9rem",
              color: "#991b1b",
              lineHeight: "1.4",
              marginTop: "12px",
            }}
          >
            <strong>⚠️ Early Warning:</strong>{" "}
            {assessment.alerts[0].description ||
              assessment.alerts[0].title ||
              (assessment.alerts[0] as any).message ||
              "Weather anomalies detected along the route."}
          </div>
        )}
      </div>
    </div>
  );
}
