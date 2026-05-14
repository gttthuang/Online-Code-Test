type LogLevel = "info" | "error";

export function logInfo(event: string, payload: Record<string, unknown> = {}) {
  writeLog("info", event, payload);
}

export function logError(event: string, payload: Record<string, unknown> = {}) {
  writeLog("error", event, payload);
}

function writeLog(level: LogLevel, event: string, payload: Record<string, unknown>) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service: "judge-worker",
    event,
    ...payload
  };

  const serialized = JSON.stringify(entry);

  if (level === "error") {
    console.error(serialized);
    return;
  }

  console.log(serialized);
}
