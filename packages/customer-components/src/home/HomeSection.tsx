import { CaretRight } from "@phosphor-icons/react";
import type { ReactNode } from "react";

export interface HomeSectionProps {
  readonly title: string;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
  readonly children: ReactNode;
  readonly className?: string;
}

export function HomeSection({
  title,
  actionLabel,
  onAction,
  children,
  className,
}: HomeSectionProps) {
  return (
    <section className={["xlb-home-section", className].filter(Boolean).join(" ")}>
      <header className="xlb-home-section__header">
        <h2>{title}</h2>
        {actionLabel && onAction ? (
          <button type="button" className="xlb-home-section__action" onClick={onAction}>
            <span>{actionLabel}</span>
            <CaretRight aria-hidden="true" weight="bold" />
          </button>
        ) : null}
      </header>
      {children}
    </section>
  );
}
