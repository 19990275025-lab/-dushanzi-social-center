export const datePresetLabels = {
  today: "今日",
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

export function isoDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

export function chinaToday(now = new Date()) {
  const { year, month, day } = chinaDateParts(now);
  return { year, month, day, iso: isoDate(year, month, day) };
}

export function rangeForMonth(year: number, month: number, now = new Date()): DateRange {
  const today = chinaToday(now);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const isCurrentMonth = year === today.year && month === today.month;
  const toDay = isCurrentMonth ? today.day : lastDay;
  return {
    preset: "month",
    from: isoDate(year, month, 1),
    to: isoDate(year, month, toDay),
    label: `${year}年${month}月`,
  };
}

export function rangeForPreset(preset: Exclude<DatePreset, "custom">, now = new Date()): DateRange {
  const { year, month, day } = chinaDateParts(now);
  const todayUtc = new Date(Date.UTC(year, month - 1, day));
  const yesterday = new Date(todayUtc);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  let to = yesterday.toISOString().slice(0, 10);
  let from = to;

  if (preset === "today") {
    from = todayUtc.toISOString().slice(0, 10);
    to = from;
  } else if (preset === "week") {
    const start = new Date(todayUtc);
    start.setUTCDate(start.getUTCDate() - 6);
    from = start.toISOString().slice(0, 10);
    to = todayUtc.toISOString().slice(0, 10);
  } else if (preset === "month") {
    return rangeForMonth(year, month, now);
  }

  return { preset, from, to, label: datePresetLabels[preset] };
}

export function resolveDateRange(searchParams: URLSearchParams, now = new Date()): DateRange {
  const requestedPreset = searchParams.get("preset");
  const preset = requestedPreset && requestedPreset in datePresetLabels
    ? requestedPreset as DatePreset
    : "yesterday";

  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  if (preset === "month") {
    const validMonth = datePattern.test(from)
      && datePattern.test(to)
      && from <= to
      && from.slice(0, 7) === to.slice(0, 7)
      && from.endsWith("-01");
    if (!validMonth) return rangeForPreset("month", now);
    const [year, month] = from.split("-").map(Number);
    return { preset, from, to, label: `${year}年${month}月` };
  }
  if (preset !== "custom") return rangeForPreset(preset, now);

  if (!datePattern.test(from) || !datePattern.test(to) || from > to) return rangeForPreset("yesterday", now);
  return { preset, from, to, label: `${from} 至 ${to}` };
}

export function dateRangeQuery(range: DateRange) {
  return new URLSearchParams({ preset: range.preset, from: range.from, to: range.to }).toString();
}
