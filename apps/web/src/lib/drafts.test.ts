import { afterEach, describe, expect, it } from "vitest";

import { clearDraft, loadDraft, saveDraft } from "./drafts";

const KEY = "oct-demo-drafts";

afterEach(() => {
  window.localStorage.clear();
});

describe("draft storage", () => {
  it("returns null when nothing is stored", () => {
    expect(loadDraft("u1", "p1", "python")).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    window.localStorage.setItem(KEY, "{not json");
    expect(loadDraft("u1", "p1", "python")).toBeNull();
  });

  it("round-trips a saved draft", () => {
    saveDraft("u1", "p1", "python", "print(1)");
    expect(loadDraft("u1", "p1", "python")).toBe("print(1)");
  });

  it("keeps drafts separate per user, problem, and language", () => {
    saveDraft("u1", "p1", "python", "py-code");
    saveDraft("u1", "p1", "cpp", "cpp-code");
    saveDraft("u2", "p1", "python", "other-user");

    expect(loadDraft("u1", "p1", "python")).toBe("py-code");
    expect(loadDraft("u1", "p1", "cpp")).toBe("cpp-code");
    expect(loadDraft("u2", "p1", "python")).toBe("other-user");
    expect(loadDraft("u1", "p2", "python")).toBeNull();
  });

  it("clears a single draft without touching others", () => {
    saveDraft("u1", "p1", "python", "py-code");
    saveDraft("u1", "p1", "cpp", "cpp-code");

    clearDraft("u1", "p1", "python");

    expect(loadDraft("u1", "p1", "python")).toBeNull();
    expect(loadDraft("u1", "p1", "cpp")).toBe("cpp-code");
  });
});
