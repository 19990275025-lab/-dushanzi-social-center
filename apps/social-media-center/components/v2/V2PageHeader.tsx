import type { ReactNode } from "react";

export function V2PageHeader({ eyebrow, title, description, aside }: {
  eyebrow: string;
  title: string;
  description: string;
  aside?: ReactNode;
}) {
  return <header className="v2-page-header">
    <div>
      <p>{eyebrow}</p>
      <h1>{title}</h1>
      <span>{description}</span>
    </div>
    {aside && <div className="v2-page-aside">{aside}</div>}
  </header>;
}
