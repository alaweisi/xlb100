Phase 1+ shared components.

Customer slices opt in to the frozen homepage design language with
`productRole="customer"`. This selects the shared warm-card, liquid-glass,
control, state and overlay recipes; it does not copy homepage composition into
other routes. Keep the default `productRole="neutral"` for worker/admin or
unmigrated consumers.
