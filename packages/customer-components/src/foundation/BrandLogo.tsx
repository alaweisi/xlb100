import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type BrandLogoVariant = "header" | "compact" | "splash";
export type BrandLogoTone = "default" | "inverse";

export type BrandLogoConfig =
  | { kind: "text"; text: string; accessibleName?: string }
  | { kind: "image"; src: string; accessibleName: string; fallbackText?: string }
  | { kind: "lockup"; src: string; text: string; accessibleName?: string };

export const defaultBrandLogoConfig: BrandLogoConfig = {
  kind: "text",
  text: "xlb100",
  accessibleName: "xlb100",
};

const BrandLogoContext = createContext<BrandLogoConfig>(defaultBrandLogoConfig);

export interface BrandLogoProviderProps {
  children: ReactNode;
  value?: BrandLogoConfig;
}

export function BrandLogoProvider({ children, value = defaultBrandLogoConfig }: BrandLogoProviderProps) {
  const safeValue = useMemo<BrandLogoConfig>(() => {
    if (value.kind === "text" && value.text.trim().length === 0) return defaultBrandLogoConfig;
    if ((value.kind === "image" || value.kind === "lockup") && value.src.trim().length === 0) {
      return defaultBrandLogoConfig;
    }
    return value;
  }, [value]);

  return <BrandLogoContext.Provider value={safeValue}>{children}</BrandLogoContext.Provider>;
}

export interface BrandLogoProps {
  config?: BrandLogoConfig;
  variant?: BrandLogoVariant;
  tone?: BrandLogoTone;
  className?: string;
}

export function BrandLogo({ config, variant = "header", tone = "default", className }: BrandLogoProps) {
  const configuredLogo = useContext(BrandLogoContext);
  const [imageFailed, setImageFailed] = useState(false);
  const logo = config ?? configuredLogo;
  const imageRevision = logo.kind === "text" ? `text:${logo.text}` : `${logo.kind}:${logo.src}`;
  const classes = ["xlb-brand-logo", className].filter(Boolean).join(" ");
  const fallbackText = logo.kind === "text" ? logo.text : logo.kind === "lockup" ? logo.text : logo.fallbackText ?? "xlb100";
  const accessibleName = logo.accessibleName ?? fallbackText;

  useEffect(() => setImageFailed(false), [imageRevision]);

  if (logo.kind === "text" || imageFailed) {
    return (
      <span className={classes} data-variant={variant} data-tone={tone} aria-label={accessibleName} role="img">
        {fallbackText}
      </span>
    );
  }

  return (
    <span className={classes} data-variant={variant} data-tone={tone} aria-label={accessibleName} role="img">
      <img src={logo.src} alt="" aria-hidden="true" onError={() => setImageFailed(true)} />
      {logo.kind === "lockup" ? <span>{logo.text}</span> : null}
    </span>
  );
}
