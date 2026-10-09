import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  subscribe, beginCapture, stepCapture, endCapture,
  motionAllowed, capturePeriodMs, setSteps, stepAt, dotAt, glowAt, beatsOf, beatCount,
  isPlaying, setPlaying, isFlowing, subscribeFlowing,
  ambientAt, AMBIENT_DOTS,
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
  beforeEach(() => { clock = raf(); endCapture(); setSteps(1); setPlaying(true); });
  afterEach(() => { endCapture(); setPlaying(false); vi.restoreAllMocks(); });

  it("drives every subscriber from one loop", () => {
    const a = vi.fn(), b = vi.fn();
    const offA = subscribe(a), offB = subscribe(b);
    clock.flush(capturePeriodMs() / 2);
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
    clock.flush(capturePeriodMs() * 0.77); // wall time must NOT move the dots now
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
    clock.flush(capturePeriodMs() / 4);
    expect(seen).toHaveLength(2);
    expect(seen.at(-1)).toBeCloseTo(0.25, 5);
    off();
  });

  // ONE current at a time. Every dot used to set off and land together, and the
  // owner could not tell which step a diagram was on. The cycle now gives each
  // line its own slot, in the order the Steps badges number them.
  it("gives each line its own slot, in order, across one cycle", () => {
    expect(stepAt(0, 4)).toMatchObject({ index: 0 });
    expect(stepAt(0.24, 4)).toMatchObject({ index: 0 });
    expect(stepAt(0.26, 4)).toMatchObject({ index: 1 });
    expect(stepAt(0.51, 4)).toMatchObject({ index: 2 });
    expect(stepAt(0.99, 4)).toMatchObject({ index: 3 });
    // The slot is walked end to end, so the dot crosses the whole line.
    expect(stepAt(0.25, 4).local).toBeCloseTo(0, 5);
    expect(stepAt(0.49, 4).local).toBeCloseTo(0.96, 5);
  });

  it("wraps the phase and never runs off the end of the list", () => {
    expect(stepAt(1, 4).index).toBe(0);
    expect(stepAt(-0.1, 4).index).toBe(3);
    expect(stepAt(0.5, 0).index).toBe(0); // a diagram with no lines still answers
  });

  // The ambient current: every line carries its small dots the whole time,
  // under the 1 big step dot, and a cycle holds whole crossings so a GIF loops.
  it("keeps small dots on every line, staggered by line, and loops with the cycle", () => {
    for (const i of [0, 1, 2, 3]) expect(ambientAt(0.3, 4, i)).toHaveLength(AMBIENT_DOTS);
    const a = ambientAt(0.3, 4, 1);
    expect(Math.abs(a[0] - a[1])).toBeCloseTo(0.5, 5);
    expect(Math.abs(ambientAt(0.3, 4, 0)[0] - a[0])).toBeGreaterThan(0.1);
    expect(ambientAt(1, 4, 2)[0]).toBeCloseTo(ambientAt(0, 4, 2)[0], 5);
    for (const x of ambientAt(0.77, 4, 3)) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(1); }
  });

  it("puts exactly 1 dot on the canvas at a time", () => {
    for (const phase of [0.05, 0.3, 0.6, 0.95]) {
      const live = [0, 1, 2, 3].filter((i) => dotAt(phase, 4, i) != null);
      expect(live).toHaveLength(1);
    }
    expect(dotAt(0.3, 4, 1)).toBeCloseTo(0.2, 5);
    expect(dotAt(0.3, 4, 0)).toBeNull();
  });

  // A line marked async fires on the beat of the line before it, so a fan-out
  // of independent lines leaves its card together and lands together.
  it("fires async lines on the beat of the line before them", () => {
    const fan = [
      { id: "e1", source: "a", target: "b" },
      { id: "e2", source: "b", target: "c" },
      { id: "e3", source: "b", target: "d", async: true },
      { id: "e4", source: "b", target: "e", async: true },
      { id: "e5", source: "e", target: "f" },
    ];
    expect(beatsOf(fan)).toEqual([0, 1, 1, 1, 2]);
    expect(beatCount(fan)).toBe(3);
    // beat 1 runs from phase 1/3 to 2/3: e2, e3 and e4 all carry a dot, at the same spot
    expect(fan.map((_, i) => dotAt(0.5, fan, i) != null)).toEqual([false, true, true, true, false]);
    expect(dotAt(0.5, fan, 2)).toBeCloseTo(0.5, 5);
    expect(dotAt(0.5, fan, 3)).toBeCloseTo(0.5, 5);
    // and c, d, e light together as the beat lands, while b stays dark
    for (const n of ["c", "d", "e"]) expect(glowAt(0.66, fan, n)).toBeGreaterThan(0.9);
    expect(glowAt(0.66, fan, "b")).toBe(0);
    // the canvas edge carries the flag under data
    expect(beatCount([{ id: "e1" }, { id: "e2", data: { async: true } }])).toBe(1);
    // the first line always opens the cycle: there is nothing before it to join
    expect(beatsOf([{ id: "e1", async: true }, { id: "e2" }])).toEqual([0, 1]);
  });

  // The glow says "the current is HERE" - so it is on 1 card, not 20.
  const chain = [
    { id: "e1", source: "a", target: "b" },
    { id: "e2", source: "b", target: "c" },
    { id: "e3", source: "c", target: "d" },
  ];

  it("lights only the card the current is crossing into", () => {
    const lit = (p) => ["a", "b", "c", "d"].filter((n) => glowAt(p, chain, n) > 0.01);
    // Mid step 2 of 3: c is coming up and that is the whole canvas. b has
    // already gone dark behind the dot, a is a source only, d is still to come.
    expect(lit(0.5)).toEqual(["c"]);
    expect(glowAt(0.5, chain, "a")).toBe(0);
    expect(glowAt(0.5, chain, "d")).toBe(0);
    expect(lit(0.3)).toEqual(["b"]); // late in step 1, where it lands
    // The hand off is the only moment 2 cards carry any light at all, and the
    // one being left is already on its way out.
    expect(glowAt(0.37, chain, "b")).toBeGreaterThan(glowAt(0.37, chain, "c"));
  });

  it("brings a card up to full as the dot lands, then back down", () => {
    expect(glowAt(0.001, chain, "b")).toBeLessThan(0.01); // the step has just left a
    expect(glowAt(0.333, chain, "b")).toBeCloseTo(1, 1); // and lands on b
    expect(glowAt(0.5, chain, "b")).toBeLessThan(0.01); // gone early into c's step
    expect(glowAt(0.66, chain, "b")).toBeLessThan(0.01); // and still dark
  });

  it("holds the glow still when a diagram has a single line", () => {
    const one = [{ id: "e1", source: "a", target: "b" }];
    expect(glowAt(0.99, one, "b")).toBeCloseTo(1, 1);
    expect(glowAt(0.99, one, "a")).toBe(0);
  });

  it("stretches one cycle to 1 slot per line, so the GIF covers the whole walk", () => {
    setSteps(1);
    const one = capturePeriodMs();
    setSteps(6);
    expect(capturePeriodMs()).toBe(one * 6);
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
    clock.flush(capturePeriodMs() / 2);
    expect(seen).toEqual([]);
    expect(isPlaying()).toBe(false);

    setPlaying(true);
    clock.flush(capturePeriodMs() / 2);
    expect(seen).toHaveLength(1);
    off();
  });

  it("the canvas flows while a capture runs, even though the button says Play", () => {
    setPlaying(false);
    const seen = [];
    const off = subscribeFlowing((f) => seen.push(f));
    expect(isFlowing()).toBe(false);
    beginCapture();
    expect(isFlowing()).toBe(true);
    endCapture();
    expect(isFlowing()).toBe(false);
    setPlaying(true);
    expect(isFlowing()).toBe(true);
    setPlaying(false);
    expect(seen).toEqual([true, false, true, false]);
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
