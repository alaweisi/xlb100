import { useEffect, useRef } from "react";
import type { KeyboardEvent, RefObject } from "react";

const focusableSelector = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector))
    .filter((element) => !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true");
}

export interface DialogFocusContract<Element extends HTMLElement> {
  dialogRef: RefObject<Element>;
  onDialogKeyDown: (event: KeyboardEvent<Element>) => void;
}

/** Traps focus, handles Escape when closable, and restores the trigger. */
export function useDialogFocus<Element extends HTMLElement>(
  open: boolean,
  onClose?: () => void,
): DialogFocusContract<Element> {
  const dialogRef = useRef<Element>(null);
  const restoreTargetRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;

    restoreTargetRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const dialog = dialogRef.current;
    const first = dialog ? focusableElements(dialog)[0] : undefined;
    (first ?? dialog)?.focus();

    return () => {
      const restoreTarget = restoreTargetRef.current;
      if (restoreTarget?.isConnected) restoreTarget.focus();
      restoreTargetRef.current = null;
    };
  }, [open]);

  function onDialogKeyDown(event: KeyboardEvent<Element>) {
    if (event.key === "Escape" && onClose) {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;

    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusables = focusableElements(dialog);
    if (focusables.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }

    const first = focusables[0]!;
    const last = focusables.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return { dialogRef, onDialogKeyDown };
}
