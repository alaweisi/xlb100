/**
 * Clean customer application root.
 *
 * The previous customer UI slices were intentionally removed so the next
 * design can establish its own routes, shell and visual system without
 * inheriting legacy presentation decisions.
 */
export function App() {
  return <main id="customer-redesign-root" data-ui-status="redesign-ready" />;
}
