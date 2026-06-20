/**
 * Shared CSV serialization helpers. Every CSV builder in the app must route
 * field values through `escapeCsvField` (or `toCsvRow`) so that:
 *   - commas / quotes / newlines stay inside a single cell, and
 *   - attacker-influenceable text (e.g. imported staff names) cannot smuggle a
 *     spreadsheet formula into the exported file.
 */

/**
 * Escape a single CSV field value.
 *
 * Neutralizes formula injection (CWE-1236): Excel/Sheets treat a leading
 * `=` `+` `-` `@` (and tab/CR variants) as a formula. We prefix such values
 * with a single quote per OWASP guidance. We then RFC-4180 quote any field
 * containing a comma, double quote, or line break so it cannot break the row.
 */
export function escapeCsvField(value: string): string {
  const escaped = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  if (
    escaped.includes(",") ||
    escaped.includes('"') ||
    escaped.includes("\n") ||
    escaped.includes("\r")
  ) {
    return `"${escaped.replace(/"/g, '""')}"`;
  }
  return escaped;
}

/** Build a single CSV row from raw field values, escaping each one. */
export function toCsvRow(fields: string[]): string {
  return fields.map(escapeCsvField).join(",");
}
