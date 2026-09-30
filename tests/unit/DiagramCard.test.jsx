// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { DiagramCard } from "../../src/components/DiagramCard.jsx";

afterEach(cleanup);

const diagram = { nodes: [{ id: "user", position: { x: 0, y: 0 } }], edges: [] };

function setup(overrides = {}) {
  const onOpen = vi.fn();
  const onViewCode = vi.fn();
  const onDelete = vi.fn();
  render(
    <DiagramCard
      diagram={diagram}
      title="Netflix"
      updatedAt={new Date()}
      tags={["aws"]}
      onOpen={onOpen}
      onViewCode={onViewCode}
      onDelete={onDelete}
      {...overrides}
    />
  );
  return { onOpen, onViewCode, onDelete };
}

describe("DiagramCard", () => {
  it("renders the title and the node / edge counts", () => {
    setup();
    expect(screen.getByText("Netflix")).toBeInTheDocument();
    expect(screen.getByText("1 node")).toBeInTheDocument();
    expect(screen.getByText("0 edges")).toBeInTheDocument();
  });

  it("calls onOpen when the card is clicked", async () => {
    const { onOpen } = setup();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /open netflix/i }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("calls onOpen when Enter is pressed on the card", async () => {
    const { onOpen } = setup();
    const card = screen.getByRole("button", { name: /open netflix/i });
    card.focus();
    const user = userEvent.setup();
    await user.keyboard("{Enter}");
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("requires a second click on the confirm control before calling onDelete", async () => {
    const { onDelete } = setup();
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    expect(onDelete).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /delete\?/i }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});

// A private diagram in the owner's gallery carries a lock next to its title,
// so it is obvious before the link goes anywhere. Public cards show nothing.
describe("private lock", () => {
  it("shows the lock only when isPrivate", () => {
    setup({ isPrivate: true });
    expect(screen.getByTitle(/Private: only you can open it/)).toBeInTheDocument();
    cleanup();
    setup({ isPrivate: false });
    expect(screen.queryByTitle(/Private: only you can open it/)).toBeNull();
  });
});

// A locked diagram is embedded in a README or Confluence page, so its card
// carries a badge and offers no delete button.
describe("locked badge", () => {
  it("shows the lock badge and no delete button when locked", () => {
    setup({ isLocked: true });
    expect(screen.getByTitle(/Locked: embedded in a README or Confluence page/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });
});

// The gallery on /demo offers no code panel either - that is an export.
describe("view code", () => {
  it("renders the button only when a handler is given", () => {
    setup({ onViewCode: undefined });
    expect(screen.queryByRole("button", { name: /view code/i })).toBeNull();
    cleanup();
    setup();
    expect(screen.getByRole("button", { name: /view code/i })).toBeInTheDocument();
  });
});

// The tile is the flow itself: the app's capture of the real canvas, or the
// SVG render until the owner first opens it. Both come from the row's thumb
// route, versioned so a new capture or a content change is a new address.
describe("tile picture", () => {
  it("loads the flow's thumb route, versioned on the capture and the content", () => {
    setup({ id: "11111111-1111-1111-1111-111111111111", thumbnailAt: "2026-09-30T10:00:00.000Z", changedAt: "2026-09-30T09:00:00.000Z" });
    const img = document.querySelector("img.dc-thumb");
    expect(img).not.toBeNull();
    expect(img.getAttribute("src")).toBe(
      `/api/flows/11111111-1111-1111-1111-111111111111?format=thumb&v=${Date.parse("2026-09-30T10:00:00.000Z")}-${Date.parse("2026-09-30T09:00:00.000Z")}`,
    );
    expect(img.getAttribute("loading")).toBe("lazy");
  });

  it("draws no picture for a bundled sample, which has no row to fetch", () => {
    setup({ id: "ifttt" });
    expect(document.querySelector("img.dc-thumb")).toBeNull();
  });
});
