// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import CrashGuard from "../../src/components/CrashGuard";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function Boom({ message }) { throw new Error(message); }

describe("CrashGuard", () => {
  it("renders the app when nothing throws", () => {
    render(<CrashGuard><p>diagram</p></CrashGuard>);
    expect(screen.getByText("diagram")).toBeInTheDocument();
  });

  it("shows a reload card instead of a blank page and reports the crash", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const beacon = vi.fn(() => true);
    Object.defineProperty(navigator, "sendBeacon", { value: beacon, configurable: true });
    render(<CrashGuard><Boom message="nodes is undefined" /></CrashGuard>);
    expect(screen.getByText("This diagram did not load")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    expect(beacon).toHaveBeenCalledWith("/api/client-error", expect.any(Blob));
  });
});
