export type OAuthCallbackInfo = {
  hasCallback: boolean;
  appKey: string | null;
  code: string | null;
  state: string | null;
  error: string | null;
  errorDescription: string | null;
};

const OAUTH_TECHNICAL_QUERY_KEYS = [
  "code",
  "state",
  "error",
  "error_description",
  "errorDescription",
  "hmac",
  "shop",
  "host",
  "timestamp",
  "oauth",
  "session",
];

export function parseOAuthCallbackInfo(search: string): OAuthCallbackInfo {
  const params = new URLSearchParams(search);
  const code = params.get("code");
  const state = params.get("state");
  const error = params.get("error");
  const errorDescription = params.get("error_description") || params.get("errorDescription");
  const appKey = params.get("appKey");

  return {
    hasCallback: Boolean(code || error),
    appKey,
    code,
    state,
    error,
    errorDescription,
  };
}

export function stripOAuthParamsFromSearch(search: string): string {
  const params = new URLSearchParams(search);
  for (const key of OAUTH_TECHNICAL_QUERY_KEYS) {
    params.delete(key);
  }

  const next = params.toString();
  return next ? `?${next}` : "";
}

export function buildOAuthRedirectUri(input: {
  origin: string;
  appKey: string;
  returnTo?: string;
  templateId?: string;
}): string {
  const params = new URLSearchParams();
  params.set("appKey", input.appKey);
  params.set("oauth", "1");
  if (input.returnTo) {
    params.set("returnTo", input.returnTo);
  }
  if (input.templateId) {
    params.set("templateId", input.templateId);
  }

  return `${input.origin}/integrations?${params.toString()}`;
}

export function getOAuthPendingStorageKey(appKey: string): string {
  return `integration.oauth.pending.${appKey}`;
}
