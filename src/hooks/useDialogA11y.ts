"use client";

import { useEffect, useRef } from "react";

/**
 * Modal accessibility, matching the contract shadcn/ui's Dialog gets from its
 * primitive (Base UI / React Aria / Radix) rather than its appearance:
 *
 *   - Escape dismisses the dialog
 *   - Tab is trapped inside it while open
 *   - focus moves in on open and returns to the trigger on close
 *   - the page behind cannot scroll
 *   - Tab from the last element wraps to the first, and Shift+Tab from the
 *     first wraps to the last
 *
 * Implemented here instead of pulling `@radix-ui/react-dialog` because the app
 * ships exactly one UI dependency (lucide-react) and every other primitive is
 * hand-rolled; a dialog runtime would be the only heavyweight thing in the
 * bundle for one overlay shape shared by all nine dialogs.
 *
 * shadcn/ui is MIT licensed (github.com/shadcn-ui/ui).
 */

/** Elements that can hold focus, in DOM order. `[contenteditable]` covers the
    one editable surface the reader adds at runtime. */
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
  "[contenteditable]",
].join(",");

function focusableWithin(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) =>
      !el.hasAttribute("disabled") &&
      // offsetParent is null for display:none subtrees; fixed elements report
      // null too, so check the rect as well before rejecting a visible node.
      (el.offsetParent !== null || el.getClientRects().length > 0)
  );
}

/** Dialogs currently open, innermost last, so closing one restores focus to
    the right place even if two overlap. */
const openStack: HTMLElement[] = [];

export function useDialogA11y(
  open: boolean,
  onClose: () => void,
  panelRef: React.RefObject<HTMLElement | null>
): void {
  /* Kept in a ref so the keydown handler can stay attached for the whole open
     period without re-subscribing whenever the caller passes a new closure —
     `onClose={() => setX(false)}` is a new function on every render, and
     resubscribing would tear down and rebuild the trap each time. */
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;

    /* Remember where focus came from *before* anything moves it, so the user
       lands back on the control they opened the dialog from. */
    const returnFocusTo = document.activeElement as HTMLElement | null;
    const stackIndex = openStack.push(panel) - 1;

    /* ---- focus in ---- */
    const first = focusableWithin(panel)[0] ?? panel;
    /* panel needs a tabstop of -1 to be focusable when it holds nothing. */
    if (!panel.hasAttribute("tabindex")) panel.setAttribute("tabindex", "-1");
    first.focus({ preventScroll: true });

    /* ---- scroll lock ----
       Compensating for the scrollbar keeps the page from shifting sideways
       when it disappears on desktop; irrelevant but harmless on mobile. */
    const { body } = document;
    const prevOverflow = body.style.overflow;
    const prevPadding = body.style.paddingInlineEnd;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = "hidden";
    if (scrollbar > 0) body.style.paddingInlineEnd = `${scrollbar}px`;

    /* ---- keys ---- */
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        /* Only the topmost dialog reacts, otherwise one Escape would try to
           close every dialog in the stack. */
        if (openStack[openStack.length - 1] !== panel) return;
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;

      const items = focusableWithin(panel);
      if (items.length === 0) {
        /* Nothing to move between: keep focus on the panel itself. */
        e.preventDefault();
        panel.focus({ preventScroll: true });
        return;
      }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;

      /* Escape the trap if focus somehow ended up outside (a click on the
         backdrop, a browser quirk), rather than silently pinning it. */
      if (!active || !panel.contains(active)) {
        e.preventDefault();
        firstEl.focus({ preventScroll: true });
        return;
      }
      if (e.shiftKey && active === firstEl) {
        e.preventDefault();
        lastEl.focus({ preventScroll: true });
      } else if (!e.shiftKey && active === lastEl) {
        e.preventDefault();
        firstEl.focus({ preventScroll: true });
      }
    };

    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      body.style.overflow = prevOverflow;
      body.style.paddingInlineEnd = prevPadding;
      openStack.splice(stackIndex, 1);
      /* Returning focus only matters for the dialog that was actually on top;
         a dialog closed underneath should not steal focus from the live one. */
      if (openStack.length === 0 && returnFocusTo?.isConnected) {
        returnFocusTo.focus({ preventScroll: true });
      }
    };
  }, [open, panelRef]);
}