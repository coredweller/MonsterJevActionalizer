/**
 * The app's one logger. Each call writes one `event key=value …` line to the matching `console`
 * method, so server logs stay greppable (research R11). No Node or browser APIs beyond `console`,
 * so client components can use it too.
 *
 * Never pass secrets. As a backstop, context keys named like a secret (`…key`, `…token`,
 * `authorization`, `…secret`, `…password`) are dropped before anything is written.
 */

export type LogValue = string | number | boolean | null | undefined;
/** Flat: nested data is stringified by the caller (e.g. `usage: JSON.stringify(usage)`). */
export type LogContext = Readonly<Record<string, LogValue>>;
export type LogLevel = "debug" | "info" | "warn" | "error";

const SECRET_NAME = /(key|token|authorization|secret|password)$/i;

/** Strings with whitespace (or none at all) are JSON-quoted, which also keeps newlines on one line. */
function formatValue(value: Exclude<LogValue, undefined>): string {
  if (typeof value !== "string") return String(value);
  return value === "" || /\s/.test(value) ? JSON.stringify(value) : value;
}

function line(event: string, context: LogContext): string {
  const pairs = Object.entries(context).flatMap(([name, value]) =>
    value === undefined || SECRET_NAME.test(name) ? [] : [`${name}=${formatValue(value)}`],
  );
  return [event, ...pairs].join(" ");
}

function write(level: LogLevel, event: string, context: LogContext): void {
  const text = line(event, context);
  switch (level) {
    case "debug":
      console.debug(text);
      return;
    case "info":
      console.info(text);
      return;
    case "warn":
      console.warn(text);
      return;
    case "error":
      console.error(text);
      return;
  }
}

export const log = {
  debug: (event: string, context: LogContext = {}) => write("debug", event, context),
  info: (event: string, context: LogContext = {}) => write("info", event, context),
  warn: (event: string, context: LogContext = {}) => write("warn", event, context),
  error: (event: string, context: LogContext = {}) => write("error", event, context),
};

/** "TypeError: boom" for an Error, `String(e)` for anything else thrown. */
export function errorText(e: unknown): string {
  return e instanceof Error ? `${e.name}: ${e.message}` : String(e);
}
