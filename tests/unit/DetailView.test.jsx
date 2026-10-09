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

// A clicked card opens a read-only right panel with its name, info, note and
// every connection in and out - desktop and iPad, never a phone.
describe("card panel", () => {
  // Custom icon strings (not real files - jsdom never loads them) force the
  // custom-brand branch of findService, so these labels render exactly as
  // given instead of fuzzy-matching an unrelated catalog entry by id.
  const cardNodes = [
    { id: "user", type: "awsNode", position: { x: 0, y: 0 }, data: { id: "user", label: "User", icon: "/t.svg", info: "The person using the app.", note: "Entry point." } },
    { id: "api", type: "awsNode", position: { x: 200, y: 0 }, data: { id: "api", label: "API", icon: "/t.svg", info: "Handles requests.", note: "Stateless." } },
    { id: "db", type: "awsNode", position: { x: 400, y: 0 }, data: { id: "db", label: "DB", icon: "/t.svg", info: "Stores records." } },
  ];
  const cardEdges = [
    { id: "e1", source: "user", target: "api", label: "opens", data: { step: 1 } },
    { id: "e2", source: "api", target: "db", label: "query", data: { step: 2 } },
  ];

  function mockMatchMedia(matches) {
    const prev = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: !!matches[query],
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    return () => { window.matchMedia = prev; };
  }

  it("opens on a card click with name, info, note and both connection lists", () => {
    setup({ nodes: cardNodes, edges: cardEdges });
    fireEvent.click(document.querySelector('.react-flow__node[data-id="api"]'));
    const panel = within(screen.getByTestId("card-panel"));
    expect(panel.getByText("API")).toBeInTheDocument();
    expect(panel.getByText("Handles requests.")).toBeInTheDocument();
    expect(panel.getByText("Stateless.")).toBeInTheDocument();
    const out = panel.getByText(/^Connections out/).parentElement;
    expect(within(out).getByText("DB")).toBeInTheDocument();
    expect(within(out).getByText("query")).toBeInTheDocument();
    const into = panel.getByText(/^Connections in/).parentElement;
    expect(within(into).getByText("User")).toBeInTheDocument();
    expect(within(into).getByText("opens")).toBeInTheDocument();
  });

  // Owner 2026-10-09: "connection in and out should next to each other in the
  // details panel, below notes". In used to sit at the very top, with the
  // card's facts, what it is and the note between the 2 lists.
  it("keeps the 2 connection lists together, under the note", () => {
    setup({ nodes: cardNodes, edges: cardEdges });
    fireEvent.click(document.querySelector('.react-flow__node[data-id="api"]'));
    const titles = [...screen.getByTestId("card-panel").querySelectorAll("section")]
      .map((s) => s.firstChild.textContent);
    expect(titles.slice(-3)).toEqual(["Notes", "Connections in (1)", "Connections out (1)"]);
  });

  it("names the lane and section the card sits in, and the status", () => {
    const lane = { id: "__lane_entry", type: "lane", position: { x: -50, y: -50 }, width: 300, height: 600, selectable: false, draggable: false,
      data: { title: "1. Entry", axis: "col", sections: [{ id: "a", title: "Entry: target", x: 0, y: 0, w: 300, h: 250 }, { id: "b", title: "Entry: today", x: 0, y: 250, w: 300, h: 350 }] } };
    setup({ nodes: [lane, ...cardNodes], edges: cardEdges });
    fireEvent.click(document.querySelector('.react-flow__node[data-id="user"]'));
    const panel = within(screen.getByTestId("card-panel"));
    expect(panel.getByText("1. Entry")).toBeInTheDocument();
    expect(panel.getByText("Entry: target")).toBeInTheDocument();
    expect(panel.getByText("Active")).toBeInTheDocument();
    expect(panel.getByText("1 out, 0 in")).toBeInTheDocument();
  });

  it("clicking a connected name walks to that card", () => {
    setup({ nodes: cardNodes, edges: cardEdges });
    fireEvent.click(document.querySelector('.react-flow__node[data-id="api"]'));
    const panel = screen.getByTestId("card-panel");
    fireEvent.click(within(panel).getByRole("button", { name: "DB" }));
    expect(within(screen.getByTestId("card-panel")).getByText("Stores records.")).toBeInTheDocument();
  });

  it("closes on the X button and on Escape", () => {
    setup({ nodes: cardNodes, edges: cardEdges });
    fireEvent.click(document.querySelector('.react-flow__node[data-id="api"]'));
    fireEvent.click(screen.getByRole("button", { name: /close card panel/i }));
    expect(screen.queryByTestId("card-panel")).toBeNull();

    fireEvent.click(document.querySelector('.react-flow__node[data-id="api"]'));
    expect(screen.getByTestId("card-panel")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("card-panel")).toBeNull();
  });

  it("never opens on a phone", () => {
    const restore = mockMatchMedia({ "(max-width: 880px)": true, "(pointer: coarse)": true });
    try {
      setup({ nodes: cardNodes, edges: cardEdges });
      fireEvent.click(document.querySelector('.react-flow__node[data-id="api"]'));
      expect(screen.queryByTestId("card-panel")).toBeNull();
    } finally {
      restore();
    }
  });
});

// Clicking the Start here pill opens the current's own panel: the speed
// multiplier and how many small dots the whole diagram carries (owner
// 2026-10-09: "if I click on start here, show right panel for me to control
// speed of current 1 2 3 4 5 x, control amount 5 10 20 50 100").
describe("current panel", () => {
  const nodes = [
    { id: "user", type: "awsNode", position: { x: 0, y: 0 }, data: { id: "user", label: "User", icon: "/t.svg" } },
    { id: "__start_user", type: "marker", position: { x: -200, y: 0 }, width: 132, height: 36, selectable: false, data: { kind: "start", dir: "right", control: true } },
  ];
  const clickPill = () => fireEvent.click(document.querySelector('.react-flow__node[data-id="__start_user"]'));

  it("opens on the Start pill with both rows of presets", () => {
    setup({ nodes, current: { speed: 1, amount: 10 }, onCurrentChange: vi.fn() });
    clickPill();
    const panel = within(screen.getByTestId("current-panel"));
    for (const s of ["0.5x", "1x", "1.5x", "2x"]) expect(panel.getByRole("button", { name: s })).toBeInTheDocument();
    for (const a of ["5", "10", "20", "50", "100", "200", "500"]) expect(panel.getByRole("button", { name: a })).toBeInTheDocument();
  });

  it("reports a picked speed and a picked amount, 1 key at a time", () => {
    const onCurrentChange = vi.fn();
    setup({ nodes, current: { speed: 1, amount: 10 }, onCurrentChange });
    clickPill();
    const panel = within(screen.getByTestId("current-panel"));
    fireEvent.click(panel.getByRole("button", { name: "0.5x" }));
    fireEvent.click(panel.getByRole("button", { name: "500" }));
    expect(onCurrentChange.mock.calls).toEqual([[{ speed: 0.5 }], [{ amount: 500 }]]);
  });

  it("closes on the X and on Escape, and never opens for a visitor", () => {
    setup({ nodes, current: { speed: 1, amount: 10 }, onCurrentChange: vi.fn() });
    clickPill();
    fireEvent.click(screen.getByRole("button", { name: /close current panel/i }));
    expect(screen.queryByTestId("current-panel")).toBeNull();
    clickPill();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("current-panel")).toBeNull();

    cleanup();
    // No onCurrentChange is what makes a diagram read-only here: a visitor sees
    // the current the owner left running and has no panel to change it.
    setup({ nodes, current: { speed: 1, amount: 10 } });
    clickPill();
    expect(screen.queryByTestId("current-panel")).toBeNull();
  });

  // A swimlane diagram draws no Start pill, so the owner needs a second way in
  // (owner 2026-10-09: "some graphs has no start, pls make sure show when click
  // on i"). The "i" badge is it, and it is there even with nothing to summarise.
  it("opens from the i badge on a diagram with no Start pill", () => {
    setup({ nodes: [nodes[0]], current: { speed: 1, amount: 10 }, onCurrentChange: vi.fn() });
    expect(document.querySelector('.react-flow__node[data-id="__start_user"]')).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /control the current/i }));
    const panel = within(screen.getByTestId("current-panel"));
    expect(panel.getByRole("button", { name: "2x" })).toBeInTheDocument();
    expect(panel.getByRole("button", { name: "500" })).toBeInTheDocument();
  });

  // The badge used to unfold the summary card, so the summary rides along in
  // the panel rather than being lost to the owner.
  it("carries the diagram summary the badge used to show", () => {
    const activeDiagram = { ...sampleDiagram, pattern: "Fan-out on write", description: "A URL shortener." };
    setup({ activeDiagram, nodes: [nodes[0]], current: { speed: 1, amount: 10 }, onCurrentChange: vi.fn() });
    fireEvent.click(screen.getByRole("button", { name: /control the current/i }));
    const panel = within(screen.getByTestId("current-panel"));
    expect(panel.getByText("Fan-out on write")).toBeInTheDocument();
    expect(panel.getByText("A URL shortener.")).toBeInTheDocument();
  });

  // A visitor's badge is unchanged: it still unfolds the card on the canvas.
  it("leaves the visitor's i badge showing the summary", () => {
    const activeDiagram = { ...sampleDiagram, pattern: "Fan-out on write" };
    setup({ activeDiagram, nodes: [nodes[0]] });
    fireEvent.click(screen.getByRole("button", { name: /show the diagram summary/i }));
    expect(screen.getByText("Fan-out on write")).toBeInTheDocument();
    expect(screen.queryByTestId("current-panel")).toBeNull();
  });
});
