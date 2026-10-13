// @vitest-environment jsdom
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
    fireEvent.change(screen.getByLabelText("Badge"), { target: { value: "14" } });
    expect(onFonts).toHaveBeenLastCalledWith({ title: 12, sub: 10, tag: 14 });
  });
  it("the text slider changes title and subtitle and keeps the badge size", () => {
    const onFonts = vi.fn();
    render(<CurrentPanel value={{}} onChange={() => {}} onClose={() => {}} fonts={{ ...fonts, tag: 14 }} onFonts={onFonts} />);
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: "18" } });
    expect(onFonts).toHaveBeenLastCalledWith({ title: 18, sub: 15, tag: 14 });
  });
  it("speed and amount are sliders over their steps", () => {
    const onChange = vi.fn();
    render(<CurrentPanel value={{ speed: 1, amount: 20 }} onChange={onChange} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Speed"), { target: { value: "3" } });
    expect(onChange).toHaveBeenLastCalledWith({ speed: 2 });
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "2" } });
    expect(onChange).toHaveBeenLastCalledWith({ amount: 100 });
  });
  it("Box, Gap and V.Gap report the whole layout", () => {
    const onLayout = vi.fn();
    render(<CurrentPanel value={{}} onChange={() => {}} onClose={() => {}} layout={{ box: 1, gap: 1, vgap: 1 }} onLayout={onLayout} />);
    fireEvent.change(screen.getByLabelText("Gap"), { target: { value: "1.5" } });
    expect(onLayout).toHaveBeenLastCalledWith({ box: 1, gap: 1.5, vgap: 1 });
    fireEvent.change(screen.getByLabelText("Box"), { target: { value: "1.25" } });
    expect(onLayout).toHaveBeenLastCalledWith({ box: 1.25, gap: 1, vgap: 1 });
  });
});
