import type { ButtonHTMLAttributes } from "react";

export type CustomerButtonVariant = "primary" | "secondary" | "quiet";

export interface CustomerButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: CustomerButtonVariant;
  busy?: boolean;
}

export function CustomerButton({ variant = "primary", busy = false, disabled, children, className, ...props }: CustomerButtonProps) {
  const classes = ["xlb-customer-button", className].filter(Boolean).join(" ");
  return (
    <button
      {...props}
      className={classes}
      data-variant={variant}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
    >
      {children}
    </button>
  );
}
