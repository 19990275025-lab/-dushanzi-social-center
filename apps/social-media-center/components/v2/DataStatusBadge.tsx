type DataStatus = "ready" | "connecting" | "unavailable" | "legacy";

const labels: Record<DataStatus, string> = {
  ready: "真实数据已接入",
  connecting: "数据接入中",
  unavailable: "暂无真实数据",
  legacy: "现有能力 · 冻结区",
};

export function DataStatusBadge({ status }: { status: DataStatus }) {
  return <span className={`v2-status-badge status-${status}`}><i />{labels[status]}</span>;
}
