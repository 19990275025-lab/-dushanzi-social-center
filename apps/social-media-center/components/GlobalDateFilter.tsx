"use client";

import { useEffect, useState } from "react";
import { chinaToday, datePresetLabels, dateRangeQuery, isoDate, rangeForMonth, rangeForPreset, resolveDateRange, type DatePreset, type DateRange } from "@/lib/date-range";

const storageKey = "social-center-date-range-v1";
const rangeEvent = "social-center-date-range-change";
const defaultRange = rangeForPreset("yesterday");

function readRange() {
  if (typeof window === "undefined") return defaultRange;
  const urlRange = resolveDateRange(new URLSearchParams(window.location.search));
  if (window.location.search.includes("preset=")) return urlRange;
  try {
    const saved = window.localStorage.getItem(storageKey);
    if (saved) return resolveDateRange(new URLSearchParams(saved));
  } catch {
    // Private browsing may disable local storage; the URL remains the source of truth.
  }
  return urlRange;
}

function publishRange(range: DateRange) {
  const query = dateRangeQuery(range);
  const url = new URL(window.location.href);
  url.searchParams.set("preset", range.preset);
  url.searchParams.set("from", range.from);
  url.searchParams.set("to", range.to);
  window.history.replaceState(null, "", `${url.pathname}?${url.searchParams.toString()}${url.hash}`);
  try {
    window.localStorage.setItem(storageKey, query);
  } catch {
    // URL synchronization still works when storage is unavailable.
  }
  window.dispatchEvent(new CustomEvent(rangeEvent, { detail: range }));
}

export function useGlobalDateRange() {
  const [range, setRange] = useState<DateRange>(readRange);

  useEffect(() => {
    const sync = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail as DateRange : null;
      setRange(detail ?? readRange());
    };
    window.addEventListener(rangeEvent, sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener(rangeEvent, sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  return range;
}

export function GlobalDateFilter() {
  const range = useGlobalDateRange();
  const [openPicker, setOpenPicker] = useState<"month" | "custom" | null>(null);

  useEffect(() => {
    if (!openPicker) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenPicker(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [openPicker]);

  function selectPreset(preset: DatePreset) {
    if (preset === "month" || preset === "custom") {
      setOpenPicker((current) => current === preset ? null : preset);
      return;
    }
    setOpenPicker(null);
    publishRange(rangeForPreset(preset));
  }

  return (
    <section className="global-date-filter" aria-label="全局数据周期筛选器">
      <div className="date-filter-title"><span>DATA PERIOD</span><strong>数据周期</strong><small>{range.from} — {range.to}</small></div>
      <div className="date-preset-group" role="group" aria-label="选择数据周期">
        {(Object.keys(datePresetLabels) as DatePreset[]).map((preset) => (
          <button aria-expanded={preset === "month" || preset === "custom" ? openPicker === preset : undefined} className={range.preset === preset || openPicker === preset ? "active" : ""} key={preset} onClick={() => selectPreset(preset)}>{datePresetLabels[preset]}</button>
        ))}
      </div>
      {openPicker === "month" && <MonthPicker range={range} onClose={() => setOpenPicker(null)} onSelect={(nextRange) => { publishRange(nextRange); setOpenPicker(null); }} />}
      {openPicker === "custom" && <CustomDateRange key={`${range.from}-${range.to}`} range={range} onClose={() => setOpenPicker(null)} onApply={(nextRange) => { publishRange(nextRange); setOpenPicker(null); }} />}
    </section>
  );
}

const monthNames = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];
const weekdayNames = ["一", "二", "三", "四", "五", "六", "日"];

function parseIso(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
}

function shiftMonth(year: number, month: number, amount: number) {
  const date = new Date(Date.UTC(year, month - 1 + amount, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

export function MonthPicker({ range, onSelect, onClose }: { range: DateRange; onSelect: (range: DateRange) => void; onClose: () => void }) {
  const today = chinaToday();
  const selected = range.preset === "month" ? parseIso(range.from) : today;
  const [year, setYear] = useState(selected.year);

  return <div className="date-picker-popover month-picker-popover" role="dialog" aria-label="选择自然月">
    <div className="month-picker-head">
      <button aria-label="上一年" onClick={() => setYear((value) => value - 1)}>«</button>
      <strong>{year}年</strong>
      <button aria-label="下一年" disabled={year >= today.year} onClick={() => setYear((value) => value + 1)}>»</button>
    </div>
    <div className="month-picker-grid">
      {monthNames.map((name, index) => {
        const month = index + 1;
        const disabled = year > today.year || (year === today.year && month > today.month);
        const active = year === selected.year && month === selected.month;
        return <button className={active ? "active" : ""} disabled={disabled} key={name} onClick={() => onSelect(rangeForMonth(year, month))}>{name}</button>;
      })}
    </div>
    <button className="picker-close" onClick={onClose}>取消</button>
  </div>;
}

function CalendarMonth({ year, month, from, to, maxDate, onSelect }: { year: number; month: number; from: string; to: string; maxDate: string; onSelect: (date: string) => void }) {
  const firstWeekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const cells = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1, index - firstWeekday + 1));
    return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
  });

  return <section className="calendar-month" aria-label={`${year}年${month}月`}>
    <h3>{year}年 {month}月</h3>
    <div className="calendar-weekdays">{weekdayNames.map((name) => <span key={name}>{name}</span>)}</div>
    <div className="calendar-days">
      {cells.map((cell) => {
        const value = isoDate(cell.year, cell.month, cell.day);
        const outside = cell.month !== month;
        const unavailable = outside || value > maxDate;
        const isStart = value === from;
        const isEnd = value === to;
        const inRange = Boolean(from && to && value > from && value < to);
        return <button aria-label={value} className={`${outside ? "outside" : ""} ${isStart ? "range-start" : ""} ${isEnd ? "range-end" : ""} ${inRange ? "in-range" : ""}`} disabled={unavailable} key={value} onClick={() => onSelect(value)}>{cell.day}</button>;
      })}
    </div>
  </section>;
}

export function CustomDateRange({ range, onApply, onClose }: { range: DateRange; onApply: (range: DateRange) => void; onClose: () => void }) {
  const today = chinaToday();
  const [draftFrom, setDraftFrom] = useState(range.from);
  const [draftTo, setDraftTo] = useState(range.to);
  const rangeStart = parseIso(range.from);
  const initial = range.preset === "custom" && (rangeStart.year < today.year || rangeStart.month < today.month)
    ? rangeStart
    : shiftMonth(today.year, today.month, -1);
  const [leftMonth, setLeftMonth] = useState({ year: initial.year, month: initial.month });
  const rightMonth = shiftMonth(leftMonth.year, leftMonth.month, 1);
  const invalid = !draftFrom || !draftTo || draftFrom > draftTo;

  function selectDate(value: string) {
    if (draftFrom && !draftTo) {
      if (value < draftFrom) {
        setDraftTo(draftFrom);
        setDraftFrom(value);
      } else {
        setDraftTo(value);
      }
      return;
    }
    setDraftFrom(value);
    setDraftTo("");
  }

  function applyCustom() {
    if (invalid) return;
    onApply({ preset: "custom", from: draftFrom, to: draftTo, label: `${draftFrom} 至 ${draftTo}` });
  }

  return <div className="date-picker-popover range-picker-popover" role="dialog" aria-label="选择自定义日期范围">
    <div className="range-picker-navigation">
      <div><button aria-label="向前一年" onClick={() => setLeftMonth((value) => shiftMonth(value.year, value.month, -12))}>«</button><button aria-label="上一个月" onClick={() => setLeftMonth((value) => shiftMonth(value.year, value.month, -1))}>‹</button></div>
      <span>选择开始日期和结束日期</span>
      <div><button aria-label="下一个月" disabled={rightMonth.year === today.year && rightMonth.month >= today.month} onClick={() => setLeftMonth((value) => shiftMonth(value.year, value.month, 1))}>›</button><button aria-label="向后一年" disabled={leftMonth.year >= today.year} onClick={() => setLeftMonth((value) => shiftMonth(value.year, value.month, 12))}>»</button></div>
    </div>
    <div className="dual-calendar">
      <CalendarMonth {...leftMonth} from={draftFrom} to={draftTo} maxDate={today.iso} onSelect={selectDate} />
      <CalendarMonth {...rightMonth} from={draftFrom} to={draftTo} maxDate={today.iso} onSelect={selectDate} />
    </div>
    <div className="range-picker-footer"><p><span>开始</span><strong>{draftFrom || "请选择"}</strong><i>→</i><span>结束</span><strong>{draftTo || "请选择"}</strong></p><div><button className="picker-close" onClick={onClose}>取消</button><button className="picker-apply" disabled={invalid} onClick={applyCustom}>应用日期</button></div></div>
  </div>;
}
