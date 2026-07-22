import type { ReactNode } from "react";
import { ThemeProvider } from "@xlb/ui";
import { customerThemeTokens } from "../tokens/customerTokens.js";

export interface CustomerDesignSystemRootProps {
  children: ReactNode;
  className?: string;
}

export function CustomerDesignSystemRoot({ children, className }: CustomerDesignSystemRootProps) {
  const classes = ["xlb-customer-theme", className].filter(Boolean).join(" ");

  return (
    <ThemeProvider className={classes} resolvedThemeId="default" resolvedTokens={customerThemeTokens}>
      {children}
    </ThemeProvider>
  );
}
