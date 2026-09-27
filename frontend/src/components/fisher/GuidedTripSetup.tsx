import React, { useState } from "react";
import {
  ShipWheel,
  MapPin,
  CalendarClock,
  ArrowLeft,
  Check,
  Clock,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import type { MissionContext } from "../../types/mission";
import { translateText, type SupportedLanguage } from "../../i18n/translations";
import { useSpokenGuidance } from "../../hooks/useSpokenGuidance";

interface GuidedTripSetupProps {
  context: MissionContext;
  language?: SupportedLanguage;
  onContextChange?: (context: MissionContext) => void;
  onComplete: (confirmedContext?: MissionContext) => void;
  onCancel: () => void;
}

const HARBORS = [
  "Ratnagiri",
  "Malvan",
  "Panaji",
  "Mumbai",
  "Veraval",
  "Mangalore",
  "Cochin",
  "Tuticorin",
  "Chennai",
  "Visakhapatnam",
  "Paradip",
];

const CRAFT_PROFILES = [
  { value: "traditional_non_motorized", label: "Traditional craft" },
  { value: "motorized_boat", label: "Motorized boat" },
  { value: "mechanized_trawler", label: "Mechanized trawler" },
] as const;

function formatLocalizedDateTime(
  value: string | undefined,
  language: SupportedLanguage,
) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const locale =
    language === "hi" ? "hi-IN" : language === "mr" ? "mr-IN" : "en-IN";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function toDatetimeLocal(isoString?: string): string {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocal(val: string): string {
  if (!val) return "";
  const d = new Date(val);
  return isNaN(d.getTime()) ? "" : d.toISOString();
}

function getTomorrowAtHour(hour: number): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

export default function GuidedTripSetup({
  context,
  language = "en",
  onContextChange,
  onComplete,
  onCancel,
}: GuidedTripSetupProps) {
  const [step, setStep] = useState(0);
  const { speak, stop } = useSpokenGuidance({ language });

  // Store all wizard values locally until confirmation step (M1.1.5)
  const [localContext, setLocalContext] = useState<MissionContext>(() => {
    let dep = context.departure_time;
    let ret = context.return_time;
    const now = Date.now();
    if (!dep || dep === "today" || isNaN(Date.parse(dep))) {
      dep = new Date(now + 60 * 60 * 1000).toISOString();
    }
    if (
      !ret ||
      ret === "tomorrow" ||
      isNaN(Date.parse(ret)) ||
      Date.parse(ret) <= Date.parse(dep)
    ) {
      ret = new Date(Date.parse(dep) + 12 * 60 * 60 * 1000).toISOString();
    }
    return {
      origin_harbor: context.origin_harbor || "Ratnagiri",
      craft_profile: context.craft_profile || "motorized_boat",
      departure_time: dep,
      return_time: ret,
      target_pfz: context.target_pfz || "auto",
      parent_assessment_id: context.parent_assessment_id,
    };
  });

  const depTimeParsed = localContext.departure_time
    ? Date.parse(localContext.departure_time)
    : NaN;
  const retTimeParsed = localContext.return_time
    ? Date.parse(localContext.return_time)
    : NaN;
  const nowMs = Date.now();

  // Validation rules
  const isDepartureValid =
    !isNaN(depTimeParsed) && depTimeParsed >= nowMs - 15 * 60 * 1000;
  const isReturnValid =
    !isNaN(retTimeParsed) &&
    !isNaN(depTimeParsed) &&
    retTimeParsed > depTimeParsed;
  const durationHours =
    isDepartureValid && isReturnValid
      ? Math.max(0, (retTimeParsed - depTimeParsed) / (3600 * 1000))
      : 0;

  const isMissionValid =
    isDepartureValid &&
    isReturnValid &&
    !!localContext.origin_harbor &&
    !!localContext.craft_profile;

  const steps = [
    {
      id: "harbor",
      title: translateText("From which port?", language),
      icon: <MapPin size={40} />,
    },
    {
      id: "boat",
      title: translateText("Boat vessel size type?", language),
      icon: <ShipWheel size={40} />,
    },
    {
      id: "depart",
      title: translateText("When will you depart?", language),
      icon: <CalendarClock size={40} />,
    },
    {
      id: "return",
      title: translateText("When will you return?", language),
      icon: <Clock size={40} />,
    },
    {
      id: "pfz",
      title: translateText("Select PFZ", language),
      icon: <MapPin size={40} />,
    },
    {
      id: "review",
      title: translateText("Review your voyage plan", language),
      icon: <ShieldCheck size={40} />,
    },
    {
      id: "confirm",
      title: translateText("Confirm & Assess Voyage", language),
      icon: <Check size={40} />,
    },
  ];

  // Spoken guidance on step change
  React.useEffect(() => {
    if (step === 5) {
      const harbor = translateText(
        localContext.origin_harbor || "Ratnagiri",
        language,
      );
      const boat = translateText(
        CRAFT_PROFILES.find((c) => c.value === localContext.craft_profile)
          ?.label || "Motorized boat",
        language,
      );
      const portLabel = translateText('Port', language);
      const craftLabel = translateText('Craft', language);
      const durationLabel = translateText('Duration', language);
      const hoursLabel = translateText('hours', language);
      speak(`${steps[step].title}. ${portLabel}: ${harbor}. ${craftLabel}: ${boat}. ${durationLabel}: ${durationHours.toFixed(0)} ${hoursLabel}.`);
    } else if (step === 6) {
      const confirmNotice = translateText('Confirm your voyage plan to assess safety.', language);
      speak(`${steps[step].title}. ${confirmNotice}`);
    } else {
      speak(steps[step].title);
    }
  }, [step, language]);

  const handleNext = () => {
    if (step < steps.length - 1) setStep((s) => s + 1);
  };

  const handleBack = () => {
    if (step > 0) setStep((s) => s - 1);
    else {
      stop();
      onCancel();
    }
  };

  const handleConfirmAndAssess = () => {
    if (!isMissionValid) return;
    stop();
    if (onContextChange) {
      onContextChange(localContext);
    }
    onComplete(localContext);
  };

  const renderContent = () => {
    switch (step) {
      // Step 0: Harbor
      case 0:
        return (
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr", gap: "12px" }}
          >
            {HARBORS.map((h) => (
              <button
                key={h}
                onClick={() => {
                  setLocalContext((prev) => ({ ...prev, origin_harbor: h }));
                  handleNext();
                }}
                style={{
                  padding: "20px",
                  fontSize: "1.35rem",
                  borderRadius: "12px",
                  background:
                    localContext.origin_harbor === h ? "#0284c7" : "#f1f5f9",
                  color: localContext.origin_harbor === h ? "white" : "#0f172a",
                  border:
                    localContext.origin_harbor === h
                      ? "2px solid #0369a1"
                      : "1px solid #cbd5e1",
                  cursor: "pointer",
                  fontWeight: 600,
                  textAlign: "left",
                }}
              >
                ⚓ {translateText(h, language)}
              </button>
            ))}
          </div>
        );

      // Step 1: Vessel
      case 1:
        return (
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr", gap: "16px" }}
          >
            {CRAFT_PROFILES.map((c) => (
              <button
                key={c.value}
                onClick={() => {
                  setLocalContext((prev) => ({
                    ...prev,
                    craft_profile: c.value,
                  }));
                  handleNext();
                }}
                style={{
                  padding: "22px",
                  fontSize: "1.35rem",
                  borderRadius: "12px",
                  background:
                    localContext.craft_profile === c.value
                      ? "#0284c7"
                      : "#f1f5f9",
                  color:
                    localContext.craft_profile === c.value
                      ? "white"
                      : "#0f172a",
                  border:
                    localContext.craft_profile === c.value
                      ? "2px solid #0369a1"
                      : "1px solid #cbd5e1",
                  cursor: "pointer",
                  fontWeight: 600,
                  textAlign: "left",
                }}
              >
                ⛵ {translateText(c.label, language)}
              </button>
            ))}
          </div>
        );

      // Step 2: Departure DateTime
      case 2:
        return (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "20px" }}
          >
            <p style={{ color: "#475569", fontSize: "1.1rem", margin: 0 }}>
              {translateText(
                "Select a departure time preset or enter your scheduled departure:",
                language,
              )}
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px",
              }}
            >
              {[
                {
                  label: translateText("In 1 Hour", language),
                  getIso: () =>
                    new Date(Date.now() + 60 * 60 * 1000).toISOString(),
                },
                {
                  label: translateText("Tomorrow 04:00 AM", language),
                  getIso: () => getTomorrowAtHour(4),
                },
                {
                  label: translateText("Tomorrow 06:00 AM", language),
                  getIso: () => getTomorrowAtHour(6),
                },
                {
                  label: translateText("Tomorrow 08:00 AM", language),
                  getIso: () => getTomorrowAtHour(8),
                },
              ].map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    const newDep = p.getIso();
                    const newRet = new Date(
                      Date.parse(newDep) + 12 * 60 * 60 * 1000,
                    ).toISOString();
                    setLocalContext((prev) => ({
                      ...prev,
                      departure_time: newDep,
                      return_time: newRet,
                    }));
                  }}
                  style={{
                    padding: "16px",
                    borderRadius: "10px",
                    border: "1px solid #cbd5e1",
                    background: "#f8fafc",
                    color: "#0f172a",
                    fontWeight: 600,
                    fontSize: "1.05rem",
                    cursor: "pointer",
                  }}
                >
                  ⏱️ {translateText(p.label, language)}
                </button>
              ))}
            </div>

            <div style={{ marginTop: "8px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "1rem",
                  fontWeight: 600,
                  color: "#334155",
                  marginBottom: "8px",
                }}
              >
                {translateText(
                  "Custom Departure Date & Time (ISO-8601):",
                  language,
                )}
              </label>
              <input
                type="datetime-local"
                value={toDatetimeLocal(localContext.departure_time)}
                onChange={(e) => {
                  const iso = fromDatetimeLocal(e.target.value);
                  if (iso) {
                    setLocalContext((prev) => ({
                      ...prev,
                      departure_time: iso,
                    }));
                  }
                }}
                style={{
                  width: "100%",
                  padding: "14px",
                  borderRadius: "10px",
                  border: isDepartureValid
                    ? "1px solid #94a3b8"
                    : "2px solid #ef4444",
                  fontSize: "1.2rem",
                }}
              />
            </div>

            {!isDepartureValid && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  color: "#b91c1c",
                  background: "#fef2f2",
                  padding: "12px",
                  borderRadius: "8px",
                }}
              >
                <AlertCircle size={20} />
                <span>
                  {translateText(
                    "Departure time cannot be in the past.",
                    language,
                  )}
                </span>
              </div>
            )}

            <button
              onClick={handleNext}
              disabled={!isDepartureValid}
              style={{
                padding: "18px",
                fontSize: "1.25rem",
                borderRadius: "12px",
                background: isDepartureValid ? "#0284c7" : "#94a3b8",
                color: "white",
                border: "none",
                marginTop: "12px",
                cursor: isDepartureValid ? "pointer" : "not-allowed",
                fontWeight: 600,
              }}
            >
              {translateText("Next: Return Time →", language)}
            </button>
          </div>
        );

      // Step 3: Return DateTime
      case 3:
        return (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "20px" }}
          >
            <p style={{ color: "#475569", fontSize: "1.1rem", margin: 0 }}>
              {translateText(
                "Select planned voyage duration or custom return time:",
                language,
              )}
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px",
              }}
            >
              {[
                { label: translateText("+4h (Short Run)", language), hours: 4 },
                {
                  label: translateText("+8h (Standard Shift)", language),
                  hours: 8,
                },
                {
                  label: translateText("+12h (Half-Day Cruise)", language),
                  hours: 12,
                },
                {
                  label: translateText("+24h (Overnight)", language),
                  hours: 24,
                },
              ].map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => {
                    const baseDepMs = depTimeParsed || Date.now();
                    const newRet = new Date(
                      baseDepMs + p.hours * 60 * 60 * 1000,
                    ).toISOString();
                    setLocalContext((prev) => ({
                      ...prev,
                      return_time: newRet,
                    }));
                  }}
                  style={{
                    padding: "16px",
                    borderRadius: "10px",
                    border: "1px solid #cbd5e1",
                    background: "#f8fafc",
                    color: "#0f172a",
                    fontWeight: 600,
                    fontSize: "1.05rem",
                    cursor: "pointer",
                  }}
                >
                  ⌛ {translateText(p.label, language)}
                </button>
              ))}
            </div>

            <div style={{ marginTop: "8px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "1rem",
                  fontWeight: 600,
                  color: "#334155",
                  marginBottom: "8px",
                }}
              >
                {translateText(
                  "Custom Return Date & Time (ISO-8601):",
                  language,
                )}
              </label>
              <input
                type="datetime-local"
                value={toDatetimeLocal(localContext.return_time)}
                onChange={(e) => {
                  const iso = fromDatetimeLocal(e.target.value);
                  if (iso) {
                    setLocalContext((prev) => ({ ...prev, return_time: iso }));
                  }
                }}
                style={{
                  width: "100%",
                  padding: "14px",
                  borderRadius: "10px",
                  border: isReturnValid
                    ? "1px solid #94a3b8"
                    : "2px solid #ef4444",
                  fontSize: "1.2rem",
                }}
              />
            </div>

            {!isReturnValid && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  color: "#b91c1c",
                  background: "#fef2f2",
                  padding: "12px",
                  borderRadius: "8px",
                }}
              >
                <AlertCircle size={20} />
                <span>
                  {translateText(
                    "Return time must be chronologically after departure time.",
                    language,
                  )}
                </span>
              </div>
            )}

            {isReturnValid && (
              <div
                style={{
                  background: "#f0fdf4",
                  color: "#166534",
                  padding: "12px",
                  borderRadius: "8px",
                  fontWeight: 600,
                }}
              >
                ⏱️ {translateText("Planned Voyage Duration:", language)}{" "}
                {durationHours.toFixed(1)} {translateText("hours", language)}
              </div>
            )}

            <button
              onClick={handleNext}
              disabled={!isReturnValid}
              style={{
                padding: "18px",
                fontSize: "1.25rem",
                borderRadius: "12px",
                background: isReturnValid ? "#0284c7" : "#94a3b8",
                color: "white",
                border: "none",
                marginTop: "12px",
                cursor: isReturnValid ? "pointer" : "not-allowed",
                fontWeight: 600,
              }}
            >
              {translateText("Next: PFZ Target →", language)}
            </button>
          </div>
        );

      // Step 4: Optional PFZ Target
      case 4:
        return (
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr", gap: "16px" }}
          >
            {[
              {
                value: "auto",
                label: translateText(
                  "Auto-select best PFZ (Recommended)",
                  language,
                ),
                desc: translateText(
                  "Automatically vectors you to the highest rank INCOIS thermal front",
                  language,
                ),
              },
              {
                value: "",
                label: translateText(
                  "Open Waters / Coastal Safe Passage",
                  language,
                ),
                desc: translateText(
                  "No specific fishing zone target; assesses passage corridor",
                  language,
                ),
              },
              {
                value: "custom",
                label: translateText("Use Custom Target Coordinates", language),
                desc: translateText(
                  "Evaluates custom waypoint coordinates",
                  language,
                ),
              },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  setLocalContext((prev) => ({
                    ...prev,
                    target_pfz: opt.value,
                  }));
                  handleNext();
                }}
                style={{
                  padding: "20px",
                  fontSize: "1.25rem",
                  borderRadius: "12px",
                  background:
                    localContext.target_pfz === opt.value
                      ? "#0284c7"
                      : "#f1f5f9",
                  color:
                    localContext.target_pfz === opt.value ? "white" : "#0f172a",
                  border:
                    localContext.target_pfz === opt.value
                      ? "2px solid #0369a1"
                      : "1px solid #cbd5e1",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <div style={{ fontWeight: 700 }}>
                  🐟 {translateText(opt.label, language)}
                </div>
                <div
                  style={{
                    fontSize: "0.95rem",
                    opacity: 0.85,
                    marginTop: "4px",
                  }}
                >
                  {opt.desc}
                </div>
              </button>
            ))}
          </div>
        );

      // Step 5: Mission Review
      case 5:
        return (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "16px",
              fontSize: "1.15rem",
            }}
          >
            <div
              style={{
                background: "#f8fafc",
                padding: "16px",
                borderRadius: "12px",
                border: "1px solid #e2e8f0",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              <div>
                <strong>⚓ {translateText("Harbour", language)}:</strong>{" "}
                {translateText(
                  localContext.origin_harbor || "Ratnagiri",
                  language,
                )}
              </div>
              <div>
                <strong>⛵ {translateText("Boat", language)}:</strong>{" "}
                {translateText(
                  CRAFT_PROFILES.find(
                    (c) => c.value === localContext.craft_profile,
                  )?.label || "Motorized boat",
                  language,
                )}
              </div>
              <div>
                <strong>🛫 {translateText("Departure", language)}:</strong>{" "}
                {formatLocalizedDateTime(localContext.departure_time, language)}
              </div>
              <div>
                <strong>🛬 {translateText("Return", language)}:</strong>{" "}
                {formatLocalizedDateTime(localContext.return_time, language)}
              </div>
              <div>
                <strong>⏱️ {translateText("Duration", language)}:</strong>{" "}
                {durationHours.toFixed(1)} {translateText("hours", language)}
              </div>
              <div>
                <strong>🎯 {translateText("PFZ Target", language)}:</strong>{" "}
                {translateText(
                  localContext.target_pfz === "custom"
                    ? "Custom Coordinates"
                    : localContext.target_pfz === "auto"
                      ? "Auto-select best PFZ"
                      : "Open Waters",
                  language,
                )}
              </div>
            </div>

            {!isMissionValid && (
              <div
                style={{
                  color: "#b91c1c",
                  background: "#fef2f2",
                  padding: "12px",
                  borderRadius: "8px",
                  fontSize: "1rem",
                }}
              >
                ⚠️{" "}
                {translateText(
                  "Please resolve validation errors before continuing.",
                  language,
                )}
              </div>
            )}

            <button
              onClick={handleNext}
              disabled={!isMissionValid}
              style={{
                padding: "20px",
                fontSize: "1.3rem",
                borderRadius: "12px",
                background: isMissionValid ? "#0284c7" : "#94a3b8",
                color: "white",
                border: "none",
                marginTop: "16px",
                cursor: isMissionValid ? "pointer" : "not-allowed",
                fontWeight: 700,
              }}
            >
              {translateText("Proceed to Final Confirmation →", language)}
            </button>
          </div>
        );

      // Step 6: Confirm & Assess
      case 6:
        return (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "20px",
              textAlign: "center",
              padding: "12px 0",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                color: "#16a34a",
              }}
            >
              <ShieldCheck size={64} />
            </div>

            <div>
              <h3
                style={{
                  fontSize: "1.6rem",
                  margin: "0 0 8px 0",
                  color: "#0f172a",
                }}
              >
                {translateText("Confirm & Assess Voyage", language)}
              </h3>
              <p style={{ color: "#64748b", fontSize: "1.15rem", margin: 0 }}>
                {translateText(
                  "Launch authoritative safety assessment and route risk evaluation with this verified mission plan.",
                  language,
                )}
              </p>
            </div>

            <div
              style={{
                background: "#f0fdf4",
                padding: "16px",
                borderRadius: "12px",
                border: "1px solid #bbf7d0",
                textAlign: "left",
                fontSize: "1.05rem",
                color: "#166534",
              }}
            >
              <div>
                ✓ {translateText("Port", language)}:{" "}
                <strong>{localContext.origin_harbor}</strong>
              </div>
              <div>
                ✓ {translateText("Vessel", language)}:{" "}
                <strong>
                  {translateText(
                    CRAFT_PROFILES.find(
                      (c) => c.value === localContext.craft_profile,
                    )?.label || "Motorized boat",
                    language,
                  )}
                </strong>
              </div>
              <div>
                ✓ {translateText("Window", language)}:{" "}
                <strong>{durationHours.toFixed(1)}h</strong> (
                {new Intl.DateTimeFormat(
                  language === "hi"
                    ? "hi-IN"
                    : language === "mr"
                      ? "mr-IN"
                      : "en-IN",
                  { hour: "2-digit", minute: "2-digit" },
                ).format(new Date(localContext.departure_time || ""))}{" "}
                -{" "}
                {new Intl.DateTimeFormat(
                  language === "hi"
                    ? "hi-IN"
                    : language === "mr"
                      ? "mr-IN"
                      : "en-IN",
                  { hour: "2-digit", minute: "2-digit" },
                ).format(new Date(localContext.return_time || ""))}
                )
              </div>
            </div>

            <button
              onClick={handleConfirmAndAssess}
              disabled={!isMissionValid}
              style={{
                padding: "22px",
                fontSize: "1.4rem",
                borderRadius: "12px",
                background: isMissionValid ? "#16a34a" : "#94a3b8",
                color: "white",
                border: "none",
                marginTop: "12px",
                cursor: isMissionValid ? "pointer" : "not-allowed",
                fontWeight: 700,
                boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
              }}
            >
              🚀 {translateText("Confirm & Run Safety Assessment", language)}
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div
      style={{
        padding: "24px",
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          marginBottom: "24px",
          gap: "16px",
        }}
      >
        <button
          onClick={handleBack}
          style={{
            background: "transparent",
            border: "none",
            padding: "12px",
            cursor: "pointer",
          }}
          aria-label={translateText("Go back", language)}
        >
          <ArrowLeft size={32} />
        </button>
        <div style={{ color: "#0284c7" }}>{steps[step].icon}</div>
        <div>
          <div
            style={{
              fontSize: "0.85rem",
              color: "#64748b",
              fontWeight: 600,
              textTransform: "uppercase",
            }}
          >
            {translateText("Step", language)} {step + 1} / {steps.length}
          </div>
          <h2 style={{ fontSize: "1.75rem", margin: 0, color: "#0f172a" }}>
            {steps[step].title}
          </h2>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>{renderContent()}</div>
    </div>
  );
}
