/**
 * CSV for the review importer.
 *
 * The same parser runs in the browser (to show the column mapping and the
 * five-row preview) and again on the server (which is what actually decides
 * what gets written). The browser's parse is only a picture; nothing is
 * imported from it.
 */

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

/** RFC-4180-ish: quoted fields, doubled quotes, CRLF or LF. */
export function parseCsv(text: string): ParsedCsv {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let started = false;

  const endField = () => {
    row.push(field);
    field = "";
    started = false;
  };
  const endRow = () => {
    endField();
    if (row.length > 1 || row[0] !== "") rows.push(row);
    row = [];
  };

  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < source.length; i++) {
    const char = source[i];

    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && !started) {
      quoted = true;
      started = true;
    } else if (char === ",") {
      endField();
    } else if (char === "\r") {
      // handled by the \n that follows
    } else if (char === "\n") {
      endRow();
    } else {
      field += char;
      started = true;
    }
  }
  if (field !== "" || row.length) endRow();

  const headers = rows.shift() ?? [];
  return { headers: headers.map((h) => h.trim()), rows };
}

/** The targets the mapping step offers, in the design's own order. */
export const IMPORT_TARGETS = [
  ["name", "Name"],
  ["rating", "Rating"],
  ["title", "Title"],
  ["body", "Body"],
  ["date", "Date"],
  ["country", "Country"],
  ["image", "Image"],
  ["verified", "Verified"],
] as const;

export type ImportTarget = (typeof IMPORT_TARGETS)[number][0];

/** A first guess at the mapping, from the header names themselves. */
export function guessMapping(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  const taken = new Set<string>();
  for (const header of headers) {
    const key = header.toLowerCase().replace(/[^a-z]/g, "");
    const guess: ImportTarget | "" =
      /^(name|author|reviewer|customer)/.test(key) ? "name"
      : /^(rating|stars|score)/.test(key) ? "rating"
      : /^(title|headline|subject)/.test(key) ? "title"
      : /^(body|review|content|text|comment|message)/.test(key) ? "body"
      : /^(date|created|reviewedon|time)/.test(key) ? "date"
      : /^(country|location|region)/.test(key) ? "country"
      : /^(image|photo|picture|media|url)/.test(key) ? "image"
      : /^(verified|purchase)/.test(key) ? "verified"
      : "";
    if (guess && !taken.has(guess)) {
      map[header] = guess;
      taken.add(guess);
    }
  }
  return map;
}
