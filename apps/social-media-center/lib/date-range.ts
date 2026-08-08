export const datePresetLabels = {
  yesterday: "昨日",
  week: "近一周",
  month: "自然月",
  custom: "自定义",
} as const;

export type DatePreset = keyof typeof datePresetLabels;
export type DateRange = { preset: DatePreset; from: string; to: string; label: string };

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function chinaDateParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: Number(value.year), month: Number(value.month), day: Number(value.day) };
}

function isoDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

export function rangeForPreset(preset: Exclude<DatePreset, "custom">, now = new Date()): DateRange {
  const { year, month, day } = chinaDateParts(now);
  const todayUtc = new Date(Date.UTC(year, month - 1, day));
  const yesterday = new Date(todayUtc);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  let to = yesterday.toISOString().slice(0, 10);
  let from = to;

  if (preset === "week") {
    const start = new Date(todayUtc);
    start.setUTCDate(start.getUTCDate() - 6);
    from = start.toISOString().slice(0, 10);
    to = todayUtc.toISOString().slice(0, 10);
  } else if (preset === "month") {
    from = isoDate(year, month, 1);
    return { preset, from, to: isoDate(year, month, day), label: datePresetLabels[preset] };
  }

  return { preset, from, to, label: datePresetLabels[preset] };
}

export function resolveDateRange(searchParams: URLSearchParams, now = new Date()): DateRange {
  const requestedPreset = searchParams.get("preset");
  const preset = requestedPreset && requestedPreset in datePresetLabels
    ? requestedPreset as DatePreset
    : "yesterday";

  if (preset !== "custom") return rangeForPreset(preset, now);

  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  if (!datePattern.test(from) || !datePattern.test(to) || from > to) return rangeForPreset("yesterday", now);
  return { preset, from, to, label: `${from} 至 ${to}` };
}

export function dateRangeQuery(range: DateRange) {
  return new URLSearchParams({ preset: range.preset, from: range.from, to: range.to }).toString();
}
