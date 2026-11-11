"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "motion/react";

/**
 * Dragging and zooming for the site's SVG maps (the Storms map and the Helene replay map). A map is an SVG whose viewBox
 * is the part of it on screen: the `View`. Marks that should keep their size on screen scale by `view.w / bounds.w`.
 */

export type View = { x: number; y: number; w: number; h: number };
/** The whole map, and the closest zoom as the narrowest view width. */
export type Bounds = View & { minW: number };

const within = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

/** Keeps a view on the map: no further out than the whole of it, no closer than minW, and never past an edge. */
function fit(b: Bounds, v: { x: number; y: number; w: number }): View {
  const w = within(v.w, b.minW, b.w);
  const h = w * (b.h / b.w);
  return { x: within(v.x, b.x, b.x + b.w - w), y: within(v.y, b.y, b.y + b.h - h), w, h };
}

/** The view `factor` times closer, keeping the point at fraction (fx, fy) of the map where it is on screen. */
function zoomed(b: Bounds, v: View, factor: number, fx = 0.5, fy = 0.5) {
  const w = within(v.w / factor, b.minW, b.w);
  const h = w * (b.h / b.w);
  return fit(b, { x: v.x + fx * (v.w - w), y: v.y + fy * (v.h - h), w });
}

type Point = { x: number; y: number };
const centre = (points: Point[]) => ({ x: points.reduce((a, p) => a + p.x, 0) / points.length, y: points.reduce((a, p) => a + p.y, 0) / points.length });
const spread = (points: Point[], c: Point) => (points.length < 2 ? 1 : points.reduce((a, p) => a + Math.hypot(p.x - c.x, p.y - c.y), 0) / points.length);

/**
 * The map's viewing window, and the gestures that move it. It glides to `target` whenever that changes (a storm picked,
 * or back to the whole map). Drag moves it, pinch or Ctrl/⌘-scroll zooms, double-click zooms in. A plain scroll still
 * scrolls the page, so nobody gets stuck in the map; it shows a hint instead. A drag never counts as a click.
 */
export function usePanZoom(bounds: Bounds, target: View = bounds) {
  // `bounds` is a module constant for each map, so the handlers below read it directly.
  const calm = useReducedMotion();
  const [view, setView] = useState<View>(target);
  const latest = useRef<View>(view);
  const running = useRef<{ stop: () => void } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const start = useRef<{ view: View; c: Point; d: number } | null>(null);
  const moved = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [hint, setHint] = useState(false);

  /** Moves the window: at once while a gesture is under way, gliding for buttons and targets. */
  const go = useCallback(
    (to: View, glide: boolean) => {
      running.current?.stop();
      const from = latest.current;
      const place = (t: number) => {
        const next = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, w: from.w + (to.w - from.w) * t, h: from.h + (to.h - from.h) * t };
        latest.current = next;
        setView(next);
      };
      if (!glide || calm) return place(1);
      running.current = animate(0, 1, { duration: 0.6, ease: [0.22, 1, 0.36, 1], onUpdate: place });
    },
    [calm],
  );

  useEffect(() => {
    go(target, true);
    return () => running.current?.stop();
  }, [target.x, target.y, target.w, target.h, go]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Starts the gesture again from where it is, whenever a finger is added or lifted. */
  const restart = () => {
    const points = [...pointers.current.values()];
    if (!points.length) return (start.current = null);
    const c = centre(points);
    start.current = { view: latest.current, c, d: spread(points, c) };
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (!pointers.current.size) moved.current = false;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    restart();
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(e.pointerId) || !start.current || !svg.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const points = [...pointers.current.values()];
    const c = centre(points);
    const { view: from, c: c0, d: d0 } = start.current;
    if (!moved.current) {
      if (points.length < 2 && Math.hypot(c.x - c0.x, c.y - c0.y) < 4) return;
      moved.current = true;
      setDragging(true);
      // Captured only once it's a drag, so a plain click still reaches what's under the pointer. Capture only keeps the
      // drag going when the pointer leaves the map, so a pointer the browser no longer tracks is just skipped.
      for (const id of pointers.current.keys()) {
        try {
          svg.current.setPointerCapture(id);
        } catch {}
      }
    }
    const box = svg.current.getBoundingClientRect();
    // The map point that was under the gesture's centre stays under it, at the new zoom.
    const w = within(from.w / (spread(points, c) / d0), bounds.minW, bounds.w);
    const h = w * (bounds.h / bounds.w);
    const ax = from.x + ((c0.x - box.left) / box.width) * from.w;
    const ay = from.y + ((c0.y - box.top) / box.height) * from.h;
    go(fit(bounds, { x: ax - ((c.x - box.left) / box.width) * w, y: ay - ((c.y - box.top) / box.height) * h, w }), false);
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!pointers.current.delete(e.pointerId)) return;
    if (svg.current?.hasPointerCapture?.(e.pointerId)) svg.current.releasePointerCapture(e.pointerId);
    if (!pointers.current.size) setDragging(false);
    restart();
  };

  const onClickCapture = (e: React.MouseEvent) => {
    if (!moved.current) return;
    moved.current = false;
    e.stopPropagation();
    e.preventDefault();
  };

  const onDoubleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if ((e.target as Element).closest("[role=button]") || !svg.current) return;
    const box = svg.current.getBoundingClientRect();
    go(zoomed(bounds, latest.current, 2, (e.clientX - box.left) / box.width, (e.clientY - box.top) / box.height), true);
  };

  // React's wheel listener can't stop the page scrolling, so this one is added by hand.
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) {
        setHint(true);
        clearTimeout(timer);
        timer = setTimeout(() => setHint(false), 1400);
        return;
      }
      e.preventDefault();
      const box = el.getBoundingClientRect();
      go(zoomed(bounds, latest.current, Math.exp(-e.deltaY * 0.01), (e.clientX - box.left) / box.width, (e.clientY - box.top) / box.height), false);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      clearTimeout(timer);
    };
  }, [go, bounds]);

  const atWhole = view.w >= bounds.w - 0.5;
  const atTarget = Math.abs(view.x - target.x) + Math.abs(view.y - target.y) + Math.abs(view.w - target.w) < 0.5;

  return {
    view,
    /** How much smaller the window is than the whole map: multiply sizes by this to keep them the same on screen. */
    k: view.w / bounds.w,
    /** The props for the map's <svg>. */
    svgProps: {
      ref: svg,
      viewBox: `${view.x.toFixed(2)} ${view.y.toFixed(2)} ${view.w.toFixed(2)} ${view.h.toFixed(2)}`,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onClickCapture,
      onDoubleClick,
      // Zoomed in, a finger drag moves the map. At the whole map it scrolls the page, and two fingers still zoom.
      style: { touchAction: atWhole ? "pan-y" : "none" } as const,
      // The whole map already fits, so there a click zooms (double-click); zoomed in, it drags.
      className: `block h-auto w-full select-none ${dragging ? "cursor-grabbing" : atWhole ? "cursor-zoom-in" : "cursor-grab"}`,
    },
    /** The zoom buttons and the hint, for MapControls. */
    controls: {
      hint,
      atWhole,
      atTarget,
      atClosest: view.w <= bounds.minW + 0.5,
      zoom: (factor: number) => go(zoomed(bounds, latest.current, factor), true),
      reset: () => go(target, true),
    },
  };
}

function MapButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-7 w-7 items-center justify-center text-ink transition hover:bg-ice-soft disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent sm:h-9 sm:w-9"
    >
      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden>
        {children}
      </svg>
    </button>
  );
}

/** +, − and reset in the map's bottom-right corner, and a hint on how to move it in the bottom-left. Put inside a relative box. */
export function MapControls({ controls, resetLabel }: { controls: ReturnType<typeof usePanZoom>["controls"]; resetLabel: string }) {
  const { hint, atWhole, atTarget, atClosest, zoom, reset } = controls;
  return (
    <>
      <div className="absolute bottom-2 right-2 flex flex-col overflow-hidden rounded-lg bg-white shadow-md ring-1 ring-ice sm:bottom-3 sm:right-3 sm:rounded-xl" role="group" aria-label="Map zoom">
        <MapButton label="Zoom in" onClick={() => zoom(1.6)} disabled={atClosest}>
          <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </MapButton>
        <span className="h-px bg-ice" />
        <MapButton label="Zoom out" onClick={() => zoom(1 / 1.6)} disabled={atWhole}>
          <path d="M4 10h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </MapButton>
        <span className="h-px bg-ice" />
        <MapButton label={resetLabel} onClick={reset} disabled={atTarget}>
          <path d="M4 8V4h4M16 8V4h-4M4 12v4h4M16 12v4h-4" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </MapButton>
      </div>

      <p
        aria-hidden
        className={`pointer-events-none absolute bottom-2 left-2 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors duration-300 sm:bottom-3 sm:left-3 sm:px-3 sm:py-1.5 sm:text-[12px] ${hint ? "bg-ink text-white" : "bg-ink/55 text-white/85"}`}
      >
        {hint ? (
          "Hold Ctrl or ⌘ and scroll to zoom"
        ) : atWhole ? (
          <>
            <span className="sm:hidden">Pinch or tap + to zoom</span>
            <span className="max-sm:hidden">Double-click, pinch or press + to zoom in</span>
          </>
        ) : (
          <>
            <span className="sm:hidden">Drag to move</span>
            <span className="max-sm:hidden">Drag to move &middot; pinch or double-click to zoom</span>
          </>
        )}
      </p>
    </>
  );
}
