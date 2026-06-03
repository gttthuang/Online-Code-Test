import { afterEach, describe, expect, it } from "vitest";

import { clearDraft, loadDraft, saveDraft, loadEditorSettings, saveEditorSettings } from "./drafts";

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

describe("editor settings storage", () => {
  it("returns null when nothing is stored", () => {
    expect(loadEditorSettings("u1")).toBeNull();
  });

  it("round-trips per-user settings", () => {
    saveEditorSettings("u1", { fontSize: 18, tabSize: 2, keybinding: "vim" });
    saveEditorSettings("u2", { fontSize: 12, tabSize: 8, keybinding: "standard" });

    expect(loadEditorSettings("u1")).toEqual({ fontSize: 18, tabSize: 2, keybinding: "vim" });
    expect(loadEditorSettings("u2")).toEqual({ fontSize: 12, tabSize: 8, keybinding: "standard" });
  });

  it("overwrites the previous settings for a user", () => {
    saveEditorSettings("u1", { fontSize: 14, tabSize: 4, keybinding: "standard" });
    saveEditorSettings("u1", { fontSize: 20, tabSize: 2, keybinding: "vim" });

    expect(loadEditorSettings("u1")).toEqual({ fontSize: 20, tabSize: 2, keybinding: "vim" });
  });

  it("does not collide with code drafts in storage", () => {
    saveDraft("u1", "p1", "python", "print(1)");
    saveEditorSettings("u1", { fontSize: 16, tabSize: 4, keybinding: "vim" });

    expect(loadDraft("u1", "p1", "python")).toBe("print(1)");
    expect(loadEditorSettings("u1")).toEqual({ fontSize: 16, tabSize: 4, keybinding: "vim" });
  });
});
