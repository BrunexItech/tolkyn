"use client";

/** Tiny event bus so the marketing header can drive the live demo without
 * threading a context through the server-rendered page tree. */
export type DemoView = "publish" | "engage" | "analyze";

const EVT = "mkt:demo-view";

export function setDemoView(view: DemoView) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<DemoView>(EVT, { detail: view }));

  // Only bring the demo into view if it's actually off-screen. When it's
  // already visible (the common case — the nav and the demo share the first
  // screen) we do nothing, so switching tabs never jolts the page.
  const el = document.getElementById("live-demo");
  if (!el) return;
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight || document.documentElement.clientHeight;
  const mostlyVisible = r.top >= 0 && r.bottom <= vh + r.height * 0.25;
  if (!mostlyVisible) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

export function onDemoView(cb: (view: DemoView) => void) {
  const handler = (e: Event) => cb((e as CustomEvent<DemoView>).detail);
  window.addEventListener(EVT, handler);
  return () => window.removeEventListener(EVT, handler);
}
