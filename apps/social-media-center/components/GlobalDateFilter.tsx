"use client";

import { useEffect, useState } from "react";
import { datePresetLabels, dateRangeQuery, rangeForPreset, resolveDateRange, type DatePreset, type DateRange } from "@/lib/date-range";

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

  function selectPreset(preset: DatePreset) {
    if (preset === "custom") {
      publishRange({ preset, from: range.from, to: range.to, label: `${range.from} 至 ${range.to}` });
      return;
    }
    publishRange(rangeForPreset(preset));
  }

  return (
    <section className="global-date-filter" aria-label="全局数据周期筛选器">
      <div className="date-filter-title"><span>DATA PERIOD</span><strong>数据周期</strong><small>{range.from} — {range.to}</small></div>
      <div className="date-preset-group" role="group" aria-label="选择数据周期">
        {(Object.keys(datePresetLabels) as DatePreset[]).map((preset) => (
          <button className={range.preset === preset ? "active" : ""} key={preset} onClick={() => selectPreset(preset)}>{datePresetLabels[preset]}</button>
        ))}
      </div>
      {range.preset === "custom" && <CustomDateRange key={`${range.from}-${range.to}`} range={range} />}
    </section>
  );
}

function CustomDateRange({ range }: { range: DateRange }) {
  const [draftFrom, setDraftFrom] = useState(range.from);
  const [draftTo, setDraftTo] = useState(range.to);
  const invalid = !draftFrom || !draftTo || draftFrom > draftTo;

  function applyCustom() {
    if (invalid) return;
    publishRange({ preset: "custom", from: draftFrom, to: draftTo, label: `${draftFrom} 至 ${draftTo}` });
  }

  return <div className="custom-date-range">
    <label>开始日期<input aria-label="自定义开始日期" type="date" value={draftFrom} onChange={(event) => setDraftFrom(event.target.value)} /></label>
    <span>至</span>
    <label>结束日期<input aria-label="自定义结束日期" type="date" value={draftTo} onChange={(event) => setDraftTo(event.target.value)} /></label>
    <button disabled={invalid} onClick={applyCustom}>应用</button>
  </div>;
}
