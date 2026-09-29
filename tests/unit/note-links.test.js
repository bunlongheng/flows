import { describe, it, expect } from "vitest";
import { noteParts, noteRuns, linkLabel, infoLead } from "../../src/note.js";

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

// The popover opens with the card's name, so every card reads "<Name> is ...".
describe("infoLead", () => {
  it("puts the name in front and lowers the old first letter", () => {
    expect(infoLead("Cyclr", "The embedded iPaaS behind every rebuilt integration.")).toEqual({ name: "Cyclr", rest: " is the embedded iPaaS behind every rebuilt integration." });
  });
  it("keeps an initialism's capital", () => {
    expect(infoLead("Lambda", "AWS compute for the handler.")).toEqual({ name: "Lambda", rest: " is AWS compute for the handler." });
  });
  it("leaves text that already names the card", () => {
    expect(infoLead("Cyclr", "Cyclr replaces Tray.io.")).toEqual({ name: "Cyclr", rest: " replaces Tray.io." });
  });
});

// The word marks a note may carry, and the 2 traps: a URL's underscores and
// snake_case are never italics.
describe("noteRuns", () => {
  it("marks bold, italic, underline, strike and code", () => {
    expect(noteRuns("**done** *soon* _maybe_ __key__ ~~old~~ `FLAG_X`")).toEqual([
      { text: "done", b: true }, { text: " " }, { text: "soon", i: true }, { text: " " }, { text: "maybe", i: true }, { text: " " },
      { text: "key", u: true }, { text: " " }, { text: "old", s: true }, { text: " " }, { text: "FLAG_X", code: true },
    ]);
  });
  it("keeps a link whole and leaves snake_case alone", () => {
    expect(noteRuns("see https://x.io/a_b_c and use_this_name")).toEqual([
      { text: "see " }, { url: "https://x.io/a_b_c" }, { text: " and use_this_name" },
    ]);
  });
  it("leaves a plain note as one run", () => {
    expect(noteRuns("Resolves the slug.")).toEqual([{ text: "Resolves the slug." }]);
  });
});
