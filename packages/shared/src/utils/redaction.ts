const SENSITIVE_KEY_PATTERN =
  /(token|secret|password|api[_-]?key|authorization|cookie|client[_-]?secret|private[_-]?key|credential)/i;

const SENSITIVE_VALUE_PATTERNS: RegExp[] = [
  /\bBearer\s+[A-Za-z0-9\-_.=]+/gi,
  /\b(access[_-]?token|refresh[_-]?token|api[_-]?key|secret|password|authorization)\s*[:=]\s*([^\s,;]+)/gi,
];

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key);
}

export function maskSecretValue(input: unknown): string {
  if (input === undefined || input === null) {
    return "[redacted]";
  }
  const value = String(input);
  if (!value) {
    return "[redacted]";
  }
  if (value.length <= 4) {
    return "****";
  }
  return `****${value.slice(-4)}`;
}

export function sanitizeSensitiveMessage(message: string): string {
  let sanitized = message;
  for (const pattern of SENSITIVE_VALUE_PATTERNS) {
    sanitized = sanitized.replace(pattern, (full, name) => {
      if (name) {
        return `${String(name)}=[redacted]`;
      }
      return "Bearer [redacted]";
    });
  }
  return sanitized.slice(0, 800);
}

export function redactSensitiveValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveValue(item)) as T;
  }

  if (isRecord(value)) {
    const output: Record<string, unknown> = {};
    for (const [key, fieldValue] of Object.entries(value)) {
      if (isSensitiveKey(key)) {
        output[key] = maskSecretValue(fieldValue);
      } else {
        output[key] = redactSensitiveValue(fieldValue);
      }
    }
    return output as T;
  }

  if (typeof value === "string") {
    return sanitizeSensitiveMessage(value) as T;
  }

  return value;
}

export function redactSensitiveRecord(
  input: Record<string, unknown>,
): Record<string, unknown> {
  return redactSensitiveValue(input);
}

export function splitSensitiveFields(
  input: Record<string, unknown>,
): {
  publicData: Record<string, unknown>;
  sensitiveData: Record<string, unknown>;
} {
  const publicData: Record<string, unknown> = {};
  const sensitiveData: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (isSensitiveKey(key)) {
      sensitiveData[key] = value;
    } else {
      publicData[key] = value;
    }
  }

  return {
    publicData,
    sensitiveData,
  };
}
