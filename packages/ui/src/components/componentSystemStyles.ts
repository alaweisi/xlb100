/** Shared L7 behavior for role-aware components. */
export const COMPONENT_SYSTEM_STYLES = `
[data-xlb-component][data-xlb-product-role="customer"] {
  font-family: var(--xlb-font-family-sans);
}

[data-xlb-component][data-xlb-product-role="customer"]:focus-visible,
[data-xlb-component][data-xlb-product-role="customer"] button:focus-visible,
[data-xlb-component][data-xlb-product-role="customer"] input:focus-visible,
[data-xlb-component][data-xlb-product-role="customer"] select:focus-visible,
[data-xlb-component][data-xlb-product-role="customer"] textarea:focus-visible {
  outline: var(--xlb-stroke-regular) solid var(--xlb-border-focus);
  outline-offset: var(--xlb-spacing-xs);
}

[data-xlb-component="input"][data-xlb-product-role="customer"]::placeholder,
[data-xlb-component="textarea"][data-xlb-product-role="customer"]::placeholder {
  color: var(--xlb-role-customer-component-input-placeholder);
  opacity: 1;
}

[data-xlb-component][data-xlb-product-role="customer"][data-xlb-interactive="true"] {
  transition:
    opacity var(--xlb-motion-duration-fast) var(--xlb-motion-easing-standard),
    transform var(--xlb-motion-duration-fast) var(--xlb-motion-easing-standard);
}

[data-xlb-component][data-xlb-product-role="customer"][data-xlb-material="glass"] {
  -webkit-backdrop-filter: blur(var(--xlb-role-customer-component-overlay-blur)) saturate(var(--xlb-glass-saturation));
  backdrop-filter: blur(var(--xlb-role-customer-component-overlay-blur)) saturate(var(--xlb-glass-saturation));
}

@media (prefers-reduced-motion: reduce) {
  [data-xlb-component][data-xlb-product-role="customer"] {
    animation: none !important;
    scroll-behavior: auto !important;
    transition: none !important;
  }
}

@media (prefers-contrast: more), (forced-colors: active) {
  [data-xlb-component][data-xlb-product-role="customer"] {
    box-shadow: none !important;
    forced-color-adjust: auto;
  }

  [data-xlb-component][data-xlb-product-role="customer"][data-xlb-material="glass"] {
    background: var(--xlb-role-customer-component-overlay-fallback-background) !important;
    border-color: currentColor !important;
    -webkit-backdrop-filter: none !important;
    backdrop-filter: none !important;
  }
}

@supports not ((-webkit-backdrop-filter: blur(1px)) or (backdrop-filter: blur(1px))) {
  [data-xlb-component][data-xlb-product-role="customer"][data-xlb-material="glass"] {
    background: var(--xlb-role-customer-component-overlay-fallback-background);
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }
}
`;
