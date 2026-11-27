/**
 * Reads a string field from a JSON object that is still being generated.
 *
 * Tool input arrives as JSON fragments (`session.tool.input.delta`), so the
 * document is not valid JSON until the tool call ends. This scanner finds a
 * top-level key, decodes the string value available so far and stops safely
 * before an incomplete escape sequence.
 */
export function readPartialJsonString(
  raw: string,
  key: string,
): string | null {
  const start = findFieldValueStart(raw, key);
  if (start === null) return null;
  return decodePartialString(raw, start);
}

function findFieldValueStart(raw: string, key: string): number | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  let stringStart = -1;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char !== '"') continue;
      inString = false;
      let next = index + 1;
      while (next < raw.length && /\s/.test(raw[next])) next += 1;
      if (
        depth === 1 &&
        raw.slice(stringStart + 1, index) === key &&
        raw[next] === ":"
      ) {
        let value = next + 1;
        while (value < raw.length && /\s/.test(raw[value])) value += 1;
        return raw[value] === '"' ? value + 1 : null;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      stringStart = index;
      continue;
    }
    if (char === "{") depth += 1;
    else if (char === "}") depth -= 1;
  }
  return null;
}

function decodePartialString(raw: string, start: number): string {
  let result = "";
  let index = start;
  while (index < raw.length) {
    const char = raw[index];
    if (char === '"') return result;
    if (char !== "\\") {
      result += char;
      index += 1;
      continue;
    }
    index += 1;
    if (index >= raw.length) return result;
    const escape = raw[index];
    if (escape === "u") {
      if (index + 4 >= raw.length) return result;
      const hex = raw.slice(index + 1, index + 5);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) return result;
      result += String.fromCharCode(parseInt(hex, 16));
      index += 5;
      continue;
    }
    const simple: Record<string, string> = {
      '"': '"',
      "\\": "\\",
      "/": "/",
      b: "\b",
      f: "\f",
      n: "\n",
      r: "\r",
      t: "\t",
    };
    result += simple[escape] ?? escape;
    index += 1;
  }
  return result;
}
