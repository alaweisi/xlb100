import type { ReactNode } from "react";
import { ThemeProvider, type ThemeTokens } from "@xlb/ui";
import { customerThemeTokens } from "../tokens/customerTokens.js";

export interface CustomerDesignSystemRootProps {
  children: ReactNode;
  className?: string;
  resolvedTokens?: ThemeTokens;
  themeId?: string;
}

export function CustomerDesignSystemRoot({
  children,
  className,
  resolvedTokens = customerThemeTokens,
  themeId = "default",
}: CustomerDesignSystemRootProps) {
  const classes = ["xlb-customer-theme", className].filter(Boolean).join(" ");

  return (
    <ThemeProvider className={classes} themeId={themeId} resolvedTokens={resolvedTokens}>
      {children}
    </ThemeProvider>
  );
}
