// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { ReactFlowProvider } from "@xyflow/react";
import { DetailView } from "../../src/views/DetailView.jsx";

afterEach(cleanup);

// jsdom has no ResizeObserver, but @xyflow/react needs one to mount its canvas.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = global.ResizeObserver || ResizeObserverStub;

const sampleDiagram = {
  id: "d1",
  title: "IFTTT Automation",
  data: { nodes: [{ id: "user", position: { x: 0, y: 0 } }], edges: [] },
  updatedAt: new Date().toISOString(),
  tags: ["API"],
};

function setup(overrides = {}) {
  const props = {
    toast: { message: "", visible: false },
    setView: vi.fn(),
    showDetailCode: false,
    setShowDetailCode: vi.fn(),
    rfInstance: { current: null },
    flashZoomHud: vi.fn(),
    zoomHudRef: { current: null },
    showSharePanel: false,
    setShowSharePanel: vi.fn(),
    activeDiagram: sampleDiagram,
    detailCodeCopied: false,
    setDetailCodeCopied: vi.fn(),
    nodes: [{ id: "user", position: { x: 0, y: 0 }, data: {} }],
    edges: [],
    exportPng: vi.fn(),
    exportCode: vi.fn(),
    exportJson: vi.fn(),
    copyLink: vi.fn(),
    copiedLink: false,
    shareAction: vi.fn(),
    copiedShare: false,
    copyCode: vi.fn(),
    copiedCode: false,
    showDocs: false,
    setShowDocs: vi.fn(),
    copiedLabel: "",
    onCopyFormat: vi.fn(),
    ...overrides,
  };
  render(
    <ReactFlowProvider>
      <DetailView {...props} />
    </ReactFlowProvider>
  );
  return props;
}

describe("DetailView", () => {
  it("renders without crashing and shows the back button", () => {
    setup();
    expect(document.querySelector("header")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /back to gallery/i })).toBeInTheDocument();
  });

  it("shows the Code and Share toolbar toggles", () => {
    setup();
    expect(screen.getByText("Code")).toBeInTheDocument();
    expect(screen.getByText("Share")).toBeInTheDocument();
  });

  it("shows the Fit button", () => {
    setup();
    expect(screen.getByText("Fit")).toBeInTheDocument();
  });

  it("goes back to the index view and hides the code panel when back is clicked", async () => {
    const { setView, setShowDetailCode } = setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /back to gallery/i }));
    expect(setView).toHaveBeenCalledWith("index");
    expect(setShowDetailCode).toHaveBeenCalledWith(false);
  });

  it("toggles the code panel when the Code button is clicked", async () => {
    const { setShowDetailCode } = setup();
    const user = userEvent.setup();
    await user.click(screen.getByText("Code"));
    expect(setShowDetailCode).toHaveBeenCalled();
  });
});

// The owner can open every diagram, so a private one looks shared when it is
// not. The header pill says which it is - and only the owner sees it.
describe("visibility pill", () => {
  it("shows Private for a private diagram and flips on click", async () => {
    const onToggleVisibility = vi.fn();
    setup({ isDiagramPublic: false, onToggleVisibility });
    const pill = screen.getByRole("switch", { name: /private/i });
    expect(pill).toHaveAttribute("title", expect.stringMatching(/404/));
    expect(pill).toHaveAttribute("aria-checked", "false");
    await userEvent.click(pill);
    expect(onToggleVisibility).toHaveBeenCalledTimes(1);
  });

  it("shows Public for a public diagram", () => {
    setup({ isDiagramPublic: true, onToggleVisibility: vi.fn() });
    expect(screen.getByRole("switch", { name: /public/i })).toBeInTheDocument();
  });

  it("is hidden for anyone who is not the owner", () => {
    setup({ isDiagramPublic: false });
    expect(screen.queryByRole("switch", { name: /private/i })).toBeNull();
  });
});

// Pressing Share is the moment a diagram goes public - not Copy link later.
describe("share opens = publish", () => {
  it("calls onShareOpen when the panel opens, not when it closes", async () => {
    const onShareOpen = vi.fn();
    const setShowSharePanel = vi.fn();
    setup({ onShareOpen, setShowSharePanel, showSharePanel: false });
    await userEvent.click(screen.getAllByRole("button", { name: /^share$/i })[0]);
    expect(onShareOpen).toHaveBeenCalledTimes(1);
    cleanup();
    setup({ onShareOpen, setShowSharePanel, showSharePanel: true });
    await userEvent.click(screen.getAllByRole("button", { name: /^share$/i })[0]);
    expect(onShareOpen).toHaveBeenCalledTimes(1);
  });

  it("keys the link preview on visibility so it reloads once published", () => {
    setup({ showSharePanel: true, shareSlug: "x", shareUrl: "u", isDiagramPublic: false });
    expect(screen.getByAltText("Share card preview").getAttribute("src")).toContain("v=private");
  });
});

// A showcase is meant to be read, not rearranged. A visitor keeps the reading
// aids (Fit, Details, Steps, badge style) and loses everything that changes the
// diagram or takes a copy of it.
describe("read-only demo view", () => {
  const EDIT_ONLY = [/^code$/i, /^arrange$/i, /^share$/i, /^undo$/i, /^redo$/i];
  const KEPT = [/^fit$/i, /^details$/i, /^steps$/i];

  it("hides every edit, share and export control when canEdit is false", () => {
    setup({ canEdit: false, canUndo: true, canRedo: true, onArrange: vi.fn(), showSharePanel: true, showDetailCode: true, shareSlug: "x", shareUrl: "u" });
    for (const name of EDIT_ONLY) expect(screen.queryByRole("button", { name }), String(name)).toBeNull();
    for (const name of KEPT) expect(screen.getByRole("button", { name }), String(name)).toBeInTheDocument();
    // A remembered view_state must not reopen the panels either.
    expect(screen.queryByAltText("Share card preview")).toBeNull();
    expect(screen.queryByRole("button", { name: /^copy$/i })).toBeNull();
  });

  it("keeps them for the owner", () => {
    setup({ canEdit: true, canUndo: true, canRedo: true, onArrange: vi.fn() });
    for (const name of [...EDIT_ONLY, ...KEPT]) expect(screen.getByRole("button", { name }), String(name)).toBeInTheDocument();
  });
});

// The info card covers a third of a phone screen, so it folds to a badge.
describe("info card", () => {
  const withInfo = { ...sampleDiagram, pattern: "Fan-out on write", description: "A URL shortener." };

  it("folds into a badge on click and comes back", async () => {
    setup({ activeDiagram: withInfo });
    const card = screen.getByRole("button", { name: /hide the diagram summary/i });
    expect(screen.getByText("Fan-out on write")).toBeInTheDocument();

    await userEvent.click(card);
    expect(screen.queryByText("Fan-out on write")).toBeNull();
    const badge = screen.getByRole("button", { name: /show the diagram summary/i });
    expect(badge).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(badge);
    expect(screen.getByText("Fan-out on write")).toBeInTheDocument();
  });

  it("starts folded on a phone-width window and open on a desktop one", () => {
    const w = window.innerWidth;
    try {
      window.innerWidth = 390;
      setup({ activeDiagram: withInfo });
      expect(screen.getByRole("button", { name: /show the diagram summary/i })).toBeInTheDocument();
      cleanup();
      window.innerWidth = 1280;
      setup({ activeDiagram: withInfo });
      expect(screen.getByRole("button", { name: /hide the diagram summary/i })).toBeInTheDocument();
    } finally {
      window.innerWidth = w;
    }
  });

  it("renders nothing when the diagram has no pattern or description", () => {
    setup({ activeDiagram: sampleDiagram });
    expect(screen.queryByRole("button", { name: /the diagram summary/i })).toBeNull();
  });
});
