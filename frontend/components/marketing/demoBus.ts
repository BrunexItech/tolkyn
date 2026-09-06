"use client";

/** Tiny event bus so the marketing header can drive the live demo without
 * threading a context through the server-rendered page tree. */
export type DemoView = "publish" | "engage" | "analyze";

const EVT = "mkt:demo-view";

export function setDemoView(view: DemoView) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<DemoView>(EVT, { detail: view }));
  document
    .getElementById("live-demo")
    ?.scrollIntoView({ behavior: "smooth", block: "center" });
}

export function onDemoView(cb: (view: DemoView) => void) {
  const handler = (e: Event) => cb((e as CustomEvent<DemoView>).detail);
  window.addEventListener(EVT, handler);
  return () => window.removeEventListener(EVT, handler);
}
