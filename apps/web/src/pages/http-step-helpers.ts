export type ParsedCurlRequest = {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: unknown;
};

function stripQuotes(value: string): string {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function parseBody(raw: string): unknown {
  const normalized = stripQuotes(raw).trim();
  if (!normalized) {
    return "";
  }

  try {
    return JSON.parse(normalized);
  } catch {
    return normalized;
  }
}

export function parseCurlCommand(command: string): ParsedCurlRequest | null {
  const trimmed = command.trim();
  if (!trimmed || !trimmed.startsWith("curl")) {
    return null;
  }

  const tokens =
    trimmed.match(/(?:[^\s\"']+|\"[^\"]*\"|'[^']*')+/g)?.map(stripQuotes) || [];
  if (tokens.length === 0) {
    return null;
  }

  let method = "GET";
  let url = "";
  const headers: Record<string, string> = {};
  let body: unknown;

  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];

    if ((token === "-X" || token === "--request") && tokens[index + 1]) {
      method = String(tokens[index + 1]).toUpperCase();
      index += 1;
      continue;
    }

    if ((token === "-H" || token === "--header") && tokens[index + 1]) {
      const headerValue = tokens[index + 1];
      const separatorIndex = headerValue.indexOf(":");
      if (separatorIndex > 0) {
        const headerKey = headerValue.slice(0, separatorIndex).trim();
        const headerData = headerValue.slice(separatorIndex + 1).trim();
        headers[headerKey] = headerData;
      }
      index += 1;
      continue;
    }

    if (
      (token === "-d" || token === "--data" || token === "--data-raw" || token === "--data-binary") &&
      tokens[index + 1]
    ) {
      body = parseBody(tokens[index + 1]);
      if (method === "GET") {
        method = "POST";
      }
      index += 1;
      continue;
    }

    if (/^https?:\/\//i.test(token)) {
      url = token;
      continue;
    }
  }

  if (!url) {
    return null;
  }

  return {
    method,
    url,
    headers,
    body,
  };
}

export function toFormattedJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return "{}";
  }
}
