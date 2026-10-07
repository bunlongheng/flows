// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
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
    onBack: vi.fn(),
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
  // Every flow starts with both locks on. The Lock button opens a menu with
  // one switch per lock, and each switch asks for just its own lock.
  it("the Lock button opens a menu with a delete lock and an edit lock", () => {
    const onSetLocks = vi.fn();
    setup({ isLocked: true, isEditLocked: true, onSetLocks });
    fireEvent.click(screen.getByRole("button", { name: /^locked$/i }));
    const del = screen.getByRole("menuitemcheckbox", { name: /delete lock/i });
    const edit = screen.getByRole("menuitemcheckbox", { name: /edit lock/i });
    expect(del).toHaveAttribute("aria-checked", "true");
    expect(edit).toHaveAttribute("aria-checked", "true");
    fireEvent.click(edit);
    expect(onSetLocks).toHaveBeenCalledWith({ edit_locked: false });
    fireEvent.click(del);
    expect(onSetLocks).toHaveBeenCalledWith({ locked: false });
  });

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

  // onBack, not setView("index"): going back has to clear ?name= from the URL
  // as well as change the view, or the address bar still names a flow and a
  // reload drops you straight back into it.
  it("goes back to the index view and hides the code panel when back is clicked", async () => {
    const { onBack, setShowDetailCode } = setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /back to gallery/i }));
    expect(onBack).toHaveBeenCalled();
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

  it("a shared link shows the diagram's title in its slim header", () => {
    setup({ canEdit: false, isPublic: true, shareSlug: "x", shareUrl: "u" });
    const header = document.querySelector(".sd-share-header");
    expect(within(header).getByText("IFTTT Automation")).toBeInTheDocument();
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

// A showcase is meant to be read, not rearranged. A visitor keeps every control
// that only changes what they see and loses every one that changes the diagram.
describe("read-only demo view", () => {
  const EDIT_ONLY = [/^arrange$/i, /^fit$/i, /^undo$/i, /^redo$/i, /^history$/i, /^lock$/i, /^delete$/i];
  const KEPT = [/^play$/i, /^steps$/i, /^notes$/i, /^share$/i];

  it("gives a visitor the reading controls and nothing that edits", () => {
    setup({ canEdit: false, isPublic: true, canUndo: true, canRedo: true, onArrange: vi.fn(), onRestored: vi.fn(), onSetLocks: vi.fn(), onDeleteDiagram: vi.fn(), shareSlug: "x", shareUrl: "u" });
    for (const name of EDIT_ONLY) expect(screen.queryByRole("button", { name }), String(name)).toBeNull();
    for (const name of KEPT) expect(screen.getByRole("button", { name }), String(name)).toBeInTheDocument();
    // The code panel is the owner's. Share already opens the download, and a
    // sign-in button a reader with no account cannot use is off the bar too.
    expect(screen.queryByRole("button", { name: /^code$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^download png$/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /^sign in$/i })).toBeNull();
    expect(screen.getByRole("link", { name: /flows/i })).toHaveAttribute("href", "/demo");
  });

  // The export panel a visitor opens holds pictures of the diagram. The publish
  // preview and the editable copies stay the owner's.
  it("trims the share panel to the exports a reader can take", () => {
    setup({ canEdit: false, isPublic: true, showSharePanel: true, shareSlug: "x", shareUrl: "u", activeDiagram: { ...sampleDiagram, id: "abc" } });
    const panel = within(document.querySelector(".sd-share-panel"));
    for (const name of [/^png$/i, /^webp$/i, /^gif$/i, /^code$/i]) expect(panel.getByRole("button", { name }), String(name)).toBeInTheDocument();
    // Link, Share and Copy all put the link on the clipboard, and the reader is
    // standing on it already.
    for (const name of [/^link$/i, /^share$/i, /^copy$/i, /^json$/i]) expect(panel.queryByRole("button", { name }), String(name)).toBeNull();
    expect(screen.queryByAltText("Share card preview")).toBeNull();
    expect(screen.queryByRole("link", { name: /excalidraw/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^miro$/i })).toBeNull();
  });

  // A shared link gets the same bar as the showcase.
  it("draws the reading bar on a shared link too", () => {
    setup({ canEdit: false, isPublic: false });
    expect(document.querySelector("header")).not.toBeNull();
    for (const name of KEPT) expect(screen.getByRole("button", { name }), String(name)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^download png$/i })).toBeNull();
  });

  it("keeps them for the owner", () => {
    setup({ canEdit: true, canUndo: true, canRedo: true, onArrange: vi.fn() });
    for (const name of [...KEPT, /^fit$/i]) expect(screen.getByRole("button", { name }), String(name)).toBeInTheDocument();
    // The Details panel is gone: the info card on the canvas already carries
    // the pattern and the description, and the Steps tab carries the steps.
    expect(screen.queryByRole("button", { name: /^details$/i })).toBeNull();
  });
});

// The info card covers a third of a phone screen, so it folds to a badge.
describe("info card", () => {
  const withInfo = { ...sampleDiagram, pattern: "Fan-out on write", description: "A URL shortener." };

  it("starts folded on every screen, opens on click and folds back", async () => {
    setup({ activeDiagram: withInfo });
    expect(screen.queryByText("Fan-out on write")).toBeNull();
    const badge = screen.getByRole("button", { name: /show the diagram summary/i });
    expect(badge).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(badge);
    expect(screen.getByText("Fan-out on write")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /hide the diagram summary/i }));
    expect(screen.queryByText("Fan-out on write")).toBeNull();
  });

  it("starts folded on a desktop-width window too", () => {
    const w = window.innerWidth;
    try {
      window.innerWidth = 1280;
      setup({ activeDiagram: withInfo });
      expect(screen.getByRole("button", { name: /show the diagram summary/i })).toBeInTheDocument();
    } finally {
      window.innerWidth = w;
    }
  });

  it("renders nothing when the diagram has no pattern or description", () => {
    setup({ activeDiagram: sampleDiagram });
    expect(screen.queryByRole("button", { name: /the diagram summary/i })).toBeNull();
  });
});
