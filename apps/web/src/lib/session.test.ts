import type { AuthUser } from "@oct/contracts";
import { afterEach, describe, expect, it } from "vitest";

import { clearStoredSession, loadStoredSession, saveStoredSession } from "./session";

const user: AuthUser = { id: "u1", name: "Alice", email: "alice@example.com", role: "candidate" };
const KEY = "oct-demo-session";

afterEach(() => {
  window.localStorage.clear();
});

describe("session storage", () => {
  it("returns null when nothing is stored", () => {
    expect(loadStoredSession()).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    window.localStorage.setItem(KEY, "{not json");
    expect(loadStoredSession()).toBeNull();
  });

  it("returns null when token or user is missing", () => {
    window.localStorage.setItem(KEY, JSON.stringify({ token: "t" }));
    expect(loadStoredSession()).toBeNull();
    window.localStorage.setItem(KEY, JSON.stringify({ user }));
    expect(loadStoredSession()).toBeNull();
  });

  it("round-trips a saved session", () => {
    saveStoredSession({ token: "tok", user });
    expect(loadStoredSession()).toEqual({ token: "tok", user });
  });

  it("clears a stored session", () => {
    saveStoredSession({ token: "tok", user });
    clearStoredSession();
    expect(loadStoredSession()).toBeNull();
  });
});
