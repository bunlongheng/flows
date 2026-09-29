import { describe, it, expect } from "vitest";
import { noteParts, linkLabel } from "../../src/note.js";

// The owner links tickets in notes, so a URL has to come out as its own part
// and everything around it as text - and a full stop after the link is text.
describe("noteParts", () => {
  it("leaves a plain note as one text run", () => {
    expect(noteParts("Target for the router.")).toEqual([{ text: "Target for the router." }]);
  });
  it("splits a URL out of the sentence and keeps the trailing full stop as text", () => {
    expect(noteParts("See https://jira.example.com/browse/SHAR-8425. Then retry")).toEqual([
      { text: "See " }, { url: "https://jira.example.com/browse/SHAR-8425" }, { text: ". Then retry" },
    ]);
  });
  it("finds every link and leaves a bare ticket key alone", () => {
    expect(noteParts("SHAR-8090 http://a.io/x and https://b.io/y)")).toEqual([
      { text: "SHAR-8090 " }, { url: "http://a.io/x" }, { text: " and " }, { url: "https://b.io/y" }, { text: ")" },
    ]);
  });
  it("handles an empty note", () => {
    expect(noteParts("")).toEqual([]);
  });
});

// The link shows its ticket key, never the whole address.
describe("linkLabel", () => {
  it("shows the Jira key for a ticket URL", () => {
    expect(linkLabel("https://jira.example.com/browse/SHAR-7977")).toBe("SHAR-7977");
    expect(linkLabel("https://acme.atlassian.net/jira/software/c/projects/SHAR/issues/SHAR-8206?filter=x")).toBe("SHAR-8206");
  });
  it("drops the scheme and www for any other link", () => {
    expect(linkLabel("https://www.github.com/bunlongheng/flows")).toBe("github.com/bunlongheng/flows");
  });
  it("cuts a long address short", () => {
    const label = linkLabel("https://docs.example.com/some/very/long/path/that/keeps/going/on/and/on");
    expect(label.length).toBe(32);
    expect(label.endsWith("\u2026")).toBe(true);
  });
});
