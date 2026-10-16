"use client";

import { useEffect, useRef } from "react";

/**
 * Dialog accessibility contract for the hand-rolled modals in the app.
 *
 * `role="dialog"` + `aria-modal` alone is not enough: without this hook a
 * keyboard user can keep tabbing behind the overlay, Escape does nothing, and
 * the page behind keeps scrolling. Radix `DialogContent` handles this itself,
 * so this is only for modals that are not built on that primitive.
 *
 * - Escape closes the dialog.
 * - Background scrolling is locked and restored on unmount/close.
 * - Focus moves into the dialog on open and returns to the trigger on close.
 * - Tab is trapped inside the dialog so focus cannot escape behind it.
 */
export function useDialogA11y(
  open: boolean,
  onClose: () => void,
  ref: React.RefObject<HTMLElement | null>
) {
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement as HTMLElement | null;

    const node = ref.current;
    // Prefer the first focusable control, otherwise the dialog itself.
    const focusables = node?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    (focusables?.[0] ?? node)?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !node) return;
      const items = Array.from(
        node.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null);
      if (items.length === 0) {
        e.preventDefault();
        node.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      // Focus goes back where the user left it (the trigger), not <body>.
      returnFocusRef.current?.focus?.();
    };
  }, [open, onClose, ref]);
}
