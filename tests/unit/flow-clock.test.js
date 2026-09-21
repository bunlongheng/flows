import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  subscribe, beginCapture, stepCapture, endCapture,
  offsetFor, motionAllowed, CAPTURE_PERIOD_MS,
  isPlaying, setPlaying,
} from "../../src/flowClock.js";

// The clock exists so a GIF export can show motion. html-to-image serialises the
// DOM's committed attributes, so a SMIL or CSS-driven dot would snapshot at its
// t=0 pose and every frame would come out identical. These tests pin the two
// properties that guarantee a usable GIF: the phase is drivable by hand, and the
// frames it produces are evenly spaced around exactly one loop.

const raf = () => {
  let cbs = [];
  globalThis.requestAnimationFrame = (fn) => { cbs.push(fn); return cbs.length; };
  globalThis.cancelAnimationFrame = () => {};
  return { flush: (t) => { const r = cbs; cbs = []; r.forEach((f) => f(t)); } };
};

describe("flowClock", () => {
  let clock;
  beforeEach(() => { clock = raf(); endCapture(); setPlaying(true); });
  afterEach(() => { endCapture(); setPlaying(false); vi.restoreAllMocks(); });

  it("drives every subscriber from one loop", () => {
    const a = vi.fn(), b = vi.fn();
    const offA = subscribe(a), offB = subscribe(b);
    clock.flush(CAPTURE_PERIOD_MS / 2);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(a.mock.calls[0][0]).toBeCloseTo(0.5, 5);
    offA(); offB();
  });

  it("stops the loop when the last subscriber leaves", () => {
    const off = subscribe(() => {});
    const cancel = vi.spyOn(globalThis, "cancelAnimationFrame");
    off();
    expect(cancel).toHaveBeenCalled();
  });

  it("a capture takes the phase off the wall clock", () => {
    const seen = [];
    const off = subscribe((p) => seen.push(p));
    beginCapture();
    clock.flush(CAPTURE_PERIOD_MS * 0.77); // wall time must NOT move the dots now
    expect(seen).toEqual([]);
    off();
  });

  it("steps to exactly the phase asked for, so frames are evenly spaced", () => {
    const seen = [];
    const off = subscribe((p) => seen.push(p));
    beginCapture();
    const FRAMES = 20;
    for (let i = 0; i < FRAMES; i++) stepCapture(i / FRAMES);
    endCapture();
    expect(seen).toHaveLength(FRAMES);
    expect(seen[0]).toBe(0);
    expect(seen.at(-1)).toBeCloseTo(0.95, 5);
    // Even spacing is what makes the loop close without a visible jump.
    const gaps = seen.slice(1).map((p, i) => p - seen[i]);
    for (const g of gaps) expect(g).toBeCloseTo(1 / FRAMES, 10);
    off();
  });

  it("hands the dots back to the wall clock afterwards", () => {
    const seen = [];
    const off = subscribe((p) => seen.push(p));
    beginCapture(); stepCapture(0.25); endCapture();
    clock.flush(CAPTURE_PERIOD_MS / 4);
    expect(seen).toHaveLength(2);
    expect(seen.at(-1)).toBeCloseTo(0.25, 5);
    off();
  });

  it("staggers edges by id, stably, so a diagram flows instead of throbbing", () => {
    expect(offsetFor("edge-a")).toBe(offsetFor("edge-a"));
    expect(offsetFor("edge-a")).not.toBe(offsetFor("edge-b"));
    for (const id of ["e0", "e1", "e2", "some-long-edge-id"]) {
      expect(offsetFor(id)).toBeGreaterThanOrEqual(0);
      expect(offsetFor(id)).toBeLessThan(1);
    }
  });

  it("respects prefers-reduced-motion", () => {
    const prev = globalThis.window;
    globalThis.window = { matchMedia: () => ({ matches: true }) };
    expect(motionAllowed()).toBe(false);
    globalThis.window = { matchMedia: () => ({ matches: false }) };
    expect(motionAllowed()).toBe(true);
    globalThis.window = prev;
  });

  // The dots are a reading distraction until someone asks for them, so the canvas
  // starts still and the Play button is what releases it.
  it("is still by default and only runs once play is pressed", () => {
    setPlaying(false);
    const seen = [];
    const off = subscribe((p) => seen.push(p));
    clock.flush(CAPTURE_PERIOD_MS / 2);
    expect(seen).toEqual([]);
    expect(isPlaying()).toBe(false);

    setPlaying(true);
    clock.flush(CAPTURE_PERIOD_MS / 2);
    expect(seen).toHaveLength(1);
    off();
  });

  it("still exports a GIF while paused - capture drives the phase itself", () => {
    setPlaying(false);
    const seen = [];
    const off = subscribe((p) => seen.push(p));
    beginCapture();
    stepCapture(0.25);
    stepCapture(0.5);
    endCapture();
    expect(seen).toEqual([0.25, 0.5]);
    off();
  });
});
