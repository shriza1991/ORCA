import type { SupportedLanguage } from "../i18n/translations";

function localeFor(language: SupportedLanguage): string {
  return language === "hi" ? "hi-IN" : language === "mr" ? "mr-IN" : "en-IN";
}

export function formatMissionTime(
  value: string | undefined | null,
  language: SupportedLanguage = "en",
): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const dateKey = (item: Date) =>
    `${item.getFullYear()}-${item.getMonth()}-${item.getDate()}`;
  const dayLabel =
    dateKey(date) === dateKey(tomorrow)
      ? language === "hi"
        ? "कल"
        : "Tomorrow"
      : dateKey(date) === dateKey(today)
        ? language === "hi"
          ? "आज"
          : "Today"
        : new Intl.DateTimeFormat(localeFor(language), {
            day: "numeric",
            month: "short",
          }).format(date);
  const time = new Intl.DateTimeFormat(localeFor(language), {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  return `${dayLabel}, ${time}`;
}

export function formatMissionWindow(
  start: string | undefined | null,
  end: string | undefined | null,
  language: SupportedLanguage = "en",
): string {
  const first = formatMissionTime(start, language);
  const second = formatMissionTime(end, language);
  return first === "-"
    ? second
    : second === "-"
      ? first
      : `${first} - ${second}`;
}

export function formatDurationHours(hours: number | undefined | null): string {
  if (hours === undefined || hours === null || !Number.isFinite(hours))
    return "-";
  const totalMinutes = Math.max(0, Math.round(hours * 60));
  const wholeHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (wholeHours === 0) return `${minutes} min`;
  if (minutes === 0) return `${wholeHours} h`;
  return `${wholeHours} h ${minutes} min`;
}

export function formatKilometers(value: number | undefined | null): string {
  return value === undefined || value === null || !Number.isFinite(value)
    ? "-"
    : `${Number(value).toFixed(1)} km`;
}
