import type { ReactNode } from "react";

export function EmptyState({ title = "暂无真实数据", description, action }: {
  title?: string;
  description: string;
  action?: ReactNode;
}) {
  return <div className="v2-empty-state">
    <span aria-hidden="true">—</span>
    <h2>{title}</h2>
    <p>{description}</p>
    {action && <div className="v2-empty-action">{action}</div>}
  </div>;
}
