// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { IndexView } from "../../src/views/IndexView.jsx";

afterEach(cleanup);

const sampleDiagram = {
  id: "d1",
  title: "Netflix Streaming",
  data: { nodes: [{ id: "user", position: { x: 0, y: 0 } }], edges: [] },
  updatedAt: new Date().toISOString(),
  tags: ["API"],
};

function setup(overrides = {}) {
  const props = {
    toast: { message: "", visible: false },
    search: "",
    setSearch: vi.fn(),
    user: { email: "o@x.com" },
    canAI: true,
    showMenu: false,
    setShowMenu: vi.fn(),
    menuRef: { current: null },
    showDocs: false,
    setShowDocs: vi.fn(),
    copiedLabel: "",
    onCopyFormat: vi.fn(),
    filtered: [sampleDiagram],
    onOpen: vi.fn(),
    onViewCode: vi.fn(),
    onDeleteDiagram: vi.fn(),
    signOut: vi.fn(),
    showAIPrompt: false,
    setShowAIPrompt: vi.fn(),
    aiPrompt: "",
    setAiPrompt: vi.fn(),
    aiThinking: false,
    aiInputRef: { current: null },
    submitAI: vi.fn(),
    codeDiagram: null,
    setCodeDiagram: vi.fn(),
    codeCopied: false,
    setCodeCopied: vi.fn(),
    ...overrides,
  };
  render(<IndexView {...props} />);
  return props;
}

describe("IndexView", () => {
  it("renders the search input", () => {
    setup();
    expect(screen.getByPlaceholderText("Search...")).toBeInTheDocument();
  });

  it("renders a diagram card for the sample diagram", () => {
    setup();
    expect(screen.getByText("Netflix Streaming")).toBeInTheDocument();
  });

  it("shows only the API banner when the list failed, never an empty-state hint or a sample", () => {
    setup({ filtered: [], listError: true });
    expect(screen.getByText(/Could not reach the API/)).toBeInTheDocument();
    expect(screen.queryByText("No diagrams yet")).toBeNull();
    expect(screen.queryByText(/IFTTT/)).toBeNull();
  });

  it("shows the empty-state hint when the list is empty and the API answered", () => {
    setup({ filtered: [], listError: false });
    expect(screen.getByText("No diagrams yet")).toBeInTheDocument();
    expect(screen.queryByText(/Could not reach the API/)).toBeNull();
  });

  it("shows the AI affordance when canAI is true", () => {
    setup({ canAI: true });
    expect(screen.getByTitle("Generate with AI")).toBeInTheDocument();
  });

  it("hides the AI affordance when canAI is false", () => {
    setup({ canAI: false });
    expect(screen.queryByTitle("Generate with AI")).not.toBeInTheDocument();
  });

  it("calls setSearch when typing in the search box", async () => {
    const { setSearch } = setup();
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("Search..."), "a");
    expect(setSearch).toHaveBeenCalled();
  });

  it("opens the AI prompt modal when the FAB is clicked", async () => {
    const { setShowAIPrompt } = setup();
    const user = userEvent.setup();
    await user.click(screen.getByTitle("Generate with AI"));
    expect(setShowAIPrompt).toHaveBeenCalledWith(true);
  });
});
