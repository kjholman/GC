"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useConfirm } from "./Confirm";

/**
 * Warns before leaving a form with unsaved changes, using GAIA's own pop-up.
 * Any <form data-unsaved-guard> becomes "dirty" when typed in and clean again
 * when submitted. Clicking a link elsewhere in the app while a form is dirty
 * asks "Leave without saving?" first.
 */
export function UnsavedGuard() {
  const router = useRouter();
  const confirm = useConfirm();
  useEffect(() => {
    const formOf = (t: EventTarget | null) => (t instanceof Element ? t.closest("form[data-unsaved-guard]") : null);
    const onInput = (e: Event) => {
      const f = formOf(e.target);
      if (f) f.setAttribute("data-dirty", "1");
    };
    const onSubmit = (e: Event) => {
      const f = formOf(e.target);
      if (f) f.removeAttribute("data-dirty");
    };
    const onClick = async (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!(a instanceof HTMLAnchorElement) || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname.startsWith("/api/")) return;
      // Same page, just a different section: nothing is lost.
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (!hasUnsavedChanges()) return;
      e.preventDefault();
      e.stopPropagation();
      if (await confirmLeave(confirm)) {
        document.querySelectorAll("form[data-dirty]").forEach((f) => f.removeAttribute("data-dirty"));
        router.push(url.pathname + url.search + url.hash);
      }
    };
    document.addEventListener("input", onInput, true);
    document.addEventListener("change", onInput, true);
    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("change", onInput, true);
      document.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("click", onClick, true);
    };
  }, [router, confirm]);
  return null;
}

/** True when a guarded form (inside `within`, or anywhere) has changes not yet saved. */
export function hasUnsavedChanges(within?: Element | null): boolean {
  return !!(within ?? document).querySelector("form[data-unsaved-guard][data-dirty]");
}

export function confirmLeave(confirm: ReturnType<typeof useConfirm>) {
  return confirm({
    title: "Leave without saving?",
    body: "You have changes that haven't been saved. If you leave now, they will be lost.",
    confirmLabel: "Leave without saving",
    cancelLabel: "Stay and keep editing",
    danger: true,
  });
}
