"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { useLinkStatus } from "next/link";

interface NavProgressCtx {
  begin: () => void;
  end: () => void;
}

const Ctx = createContext<NavProgressCtx>({ begin: () => {}, end: () => {} });

/** A slim top-of-viewport progress bar plus a shared "navigation pending"
 * signal. Sidebar links feed it via <LinkPending>, so a click gets instant
 * feedback even when the destination chunk takes a moment to load. */
export function NavProgress({ children }: { children: ReactNode }) {
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);
  const active = useRef(0);
  const running = useRef(false);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathname = usePathname();
  const mounted = useRef(false);

  const stopTick = () => {
    if (tick.current) {
      clearInterval(tick.current);
      tick.current = null;
    }
  };

  const begin = useCallback(() => {
    active.current += 1;
    if (active.current > 1) return;
    if (settle.current) clearTimeout(settle.current);
    running.current = true;
    setVisible(true);
    setWidth(10);
    stopTick();
    tick.current = setInterval(() => {
      setWidth((w) => (w < 88 ? w + (90 - w) * 0.1 : w));
    }, 160);
  }, []);

  const finish = useCallback(() => {
    if (!running.current) return;
    running.current = false;
    stopTick();
    setWidth(100);
    settle.current = setTimeout(() => {
      setVisible(false);
      setWidth(0);
    }, 240);
  }, []);

  const end = useCallback(() => {
    active.current = Math.max(0, active.current - 1);
    if (active.current === 0) finish();
  }, [finish]);

  // The route actually changed — whatever was pending is done now.
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    active.current = 0;
    finish();
  }, [pathname, finish]);

  useEffect(() => () => {
    stopTick();
    if (settle.current) clearTimeout(settle.current);
  }, []);

  return (
    <Ctx.Provider value={{ begin, end }}>
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 z-[300] h-[2px] transition-opacity duration-200"
        style={{ opacity: visible ? 1 : 0 }}
      >
        <div
          className="h-full rounded-r-full bg-gradient-to-r from-om-blue via-om-cyan to-om-blue shadow-[0_0_8px_rgba(79,122,255,0.6)] transition-[width] duration-200 ease-out"
          style={{ width: `${width}%` }}
        />
      </div>
      {children}
    </Ctx.Provider>
  );
}

export function useNavProgress() {
  return useContext(Ctx);
}

/** Drop inside a <Link> to report its pending state to the top bar. */
export function LinkPending() {
  const { pending } = useLinkStatus();
  const { begin, end } = useNavProgress();
  useEffect(() => {
    if (!pending) return;
    begin();
    return () => end();
  }, [pending, begin, end]);
  return null;
}
