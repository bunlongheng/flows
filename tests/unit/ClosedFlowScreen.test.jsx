// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import ClosedFlowScreen from "../../src/components/ClosedFlowScreen";

const ID = "77f0c76c-1111-2222-3333-444444444444";

afterEach(cleanup);

describe("ClosedFlowScreen", () => {
  it("tells a signed-out visitor the flow is private and offers sign-in that returns here", () => {
    render(<ClosedFlowScreen status={404} signedIn={false} flowId={ID} onBack={vi.fn()} />);
    expect(screen.getByRole("heading")).toHaveTextContent("This flow is private");
    expect(screen.getByRole("link", { name: /Sign in and open it/ })).toHaveAttribute("href", "/api/auth/login");
    expect(screen.getByText("77f0c76c")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View live demo/ })).toHaveAttribute("href", "/demo");
  });

  it("tells the signed-in owner the flow is gone and sends them back to the gallery", () => {
    const onBack = vi.fn();
    render(<ClosedFlowScreen status={404} signedIn flowId={ID} onBack={onBack} />);
    expect(screen.getByRole("heading")).toHaveTextContent("This flow is gone");
    expect(screen.queryByRole("link", { name: /Sign in/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back to gallery" }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("names the API when nothing answered and offers a reload", () => {
    render(<ClosedFlowScreen status="network" signedIn flowId="not-a-uuid" onBack={vi.fn()} />);
    expect(screen.getByRole("heading")).toHaveTextContent("Flows could not be reached");
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    expect(screen.queryByText(/^id$/)).toBeNull();
  });
});
