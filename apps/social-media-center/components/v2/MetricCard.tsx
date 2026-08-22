import type { ReactNode } from "react";

export function MetricCard({ label, value, note, state = "available" }: {
  label: string;
  value: ReactNode;
  note: string;
  state?: "available" | "empty";
}) {
  return <article className={`v2-metric-card ${state === "empty" ? "is-empty" : ""}`}>
    <span>{label}</span>
    <strong>{value}</strong>
    <small>{note}</small>
  </article>;
}
