"use client";

import { GlobalDateFilter, useGlobalDateRange } from "@/components/GlobalDateFilter";

export function DateRangeSelector() {
  return <GlobalDateFilter defaultPreset="yesterday" scope="v2" showToday={false} />;
}

export function useV2DateRange() {
  return useGlobalDateRange({ defaultPreset: "yesterday", scope: "v2" });
}
