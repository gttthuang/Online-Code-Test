// Persists a candidate's in-progress code locally so it survives closing or
// refreshing the tab, mirroring how the login session is stored (see session.ts).
// Drafts are keyed by user + problem + language so switching between assigned
// problems (or languages) keeps each draft separate.

const DRAFTS_STORAGE_KEY = "oct-demo-drafts";

type DraftStore = Record<string, string>;

function draftKey(userId: string, problemId: string, language: string): string {
  return `${userId}:${problemId}:${language}`;
}

function readStore(): DraftStore {
  const raw = window.localStorage.getItem(DRAFTS_STORAGE_KEY);

  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as DraftStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: DraftStore) {
  try {
    window.localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Storage may be unavailable or over quota; losing a draft is preferable to
    // crashing the editor, so swallow the error.
  }
}

export function loadDraft(userId: string, problemId: string, language: string): string | null {
  const store = readStore();
  return store[draftKey(userId, problemId, language)] ?? null;
}

export function saveDraft(userId: string, problemId: string, language: string, code: string) {
  const store = readStore();
  store[draftKey(userId, problemId, language)] = code;
  writeStore(store);
}

export function clearDraft(userId: string, problemId: string, language: string) {
  const store = readStore();
  delete store[draftKey(userId, problemId, language)];
  writeStore(store);
}
