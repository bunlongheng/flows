import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { CurrentPanel } from "../../src/components/CurrentPanel.jsx";

afterEach(cleanup);

describe("CurrentPanel text and badge sizes", () => {
  const fonts = { title: 12, sub: 10, tag: 8.5 };
  it("the badge slider changes only the badge size", () => {
    const onFonts = vi.fn();
    render(<CurrentPanel value={{}} onChange={() => {}} onClose={() => {}} fonts={fonts} onFonts={onFonts} />);
    fireEvent.change(screen.getByLabelText("Badge size"), { target: { value: "14" } });
    expect(onFonts).toHaveBeenLastCalledWith({ title: 12, sub: 10, tag: 14 });
  });
  it("the text slider changes title and subtitle and keeps the badge size", () => {
    const onFonts = vi.fn();
    render(<CurrentPanel value={{}} onChange={() => {}} onClose={() => {}} fonts={{ ...fonts, tag: 14 }} onFonts={onFonts} />);
    fireEvent.change(screen.getByLabelText("Text size"), { target: { value: "18" } });
    expect(onFonts).toHaveBeenLastCalledWith({ title: 18, sub: 15, tag: 14 });
  });
});
