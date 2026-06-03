// Persists a candidate's in-progress code and editor preferences locally so they
// survive closing or refreshing the tab, mirroring how the login session is
// stored (see session.ts).
//
//  - Code drafts are keyed by user + problem + language, so switching between
//    assigned problems (or languages) keeps each draft separate.
//  - Editor settings are a single per-user preference set (not per problem).

const DRAFTS_STORAGE_KEY = "oct-demo-drafts";
const SETTINGS_STORAGE_KEY = "oct-demo-editor-settings";

type DraftStore = Record<string, string>;

export interface EditorSettings {
  fontSize: number;
  tabSize: number;
  keybinding: string;
}

type SettingsStore = Record<string, EditorSettings>;

function readJson<T>(key: string, fallback: T): T {
  const raw = globalThis.localStorage.getItem(key);

  if (!raw) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    globalThis.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage may be unavailable or over quota; losing a draft is preferable to
    // crashing the editor, so swallow the error.
  }
}

function draftKey(userId: string, problemId: string, language: string): string {
  return `${userId}:${problemId}:${language}`;
}

export function loadDraft(userId: string, problemId: string, language: string): string | null {
  const store = readJson<DraftStore>(DRAFTS_STORAGE_KEY, {});
  return store[draftKey(userId, problemId, language)] ?? null;
}

export function saveDraft(userId: string, problemId: string, language: string, code: string) {
  const store = readJson<DraftStore>(DRAFTS_STORAGE_KEY, {});
  store[draftKey(userId, problemId, language)] = code;
  writeJson(DRAFTS_STORAGE_KEY, store);
}

export function clearDraft(userId: string, problemId: string, language: string) {
  const store = readJson<DraftStore>(DRAFTS_STORAGE_KEY, {});
  delete store[draftKey(userId, problemId, language)];
  writeJson(DRAFTS_STORAGE_KEY, store);
}

export function loadEditorSettings(userId: string): EditorSettings | null {
  const store = readJson<SettingsStore>(SETTINGS_STORAGE_KEY, {});
  return store[userId] ?? null;
}

export function saveEditorSettings(userId: string, settings: EditorSettings) {
  const store = readJson<SettingsStore>(SETTINGS_STORAGE_KEY, {});
  store[userId] = settings;
  writeJson(SETTINGS_STORAGE_KEY, store);
}
