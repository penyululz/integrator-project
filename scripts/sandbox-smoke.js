require("dotenv").config({ quiet: true });

const { loadConfig } = require("../src/config/env");
const { PROVIDER_NAMES } = require("../src/config/validate");

function providerPrefix(providerName) {
  return providerName.toUpperCase();
}

function requiredProviderEnv(prefix) {
  return [
    `${prefix}_CLIENT_ID`,
    `${prefix}_CLIENT_SECRET`,
    `${prefix}_AUTH_URL`,
    `${prefix}_TOKEN_URL`,
    `${prefix}_API_BASE_URL`,
  ];
}

function missingRequiredEnv() {
  const missing = [];

  for (const providerName of PROVIDER_NAMES) {
    const prefix = providerPrefix(providerName);
    for (const key of requiredProviderEnv(prefix)) {
      if (!process.env[key]) {
        missing.push(key);
      }
    }
  }

  if (!process.env.SANDBOX_TENANT_ID) {
    missing.push("SANDBOX_TENANT_ID");
  }

  if (!process.env.SANDBOX_REDIRECT_URI) {
    missing.push("SANDBOX_REDIRECT_URI");
  }

  return missing;
}

async function pingProvider({
  providerName,
  baseUrl,
  pingPath,
  bearerToken,
  timeoutMs,
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = new URL(pingPath || "/", baseUrl).toString();
    const headers = bearerToken
      ? {
          Authorization: `Bearer ${bearerToken}`,
        }
      : {};

    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
    });

    return {
      provider: providerName,
      url,
      ok: response.status < 500,
      status: response.status,
    };
  } catch (error) {
    return {
      provider: providerName,
      url: new URL(pingPath || "/", baseUrl).toString(),
      ok: false,
      status: null,
      error: error.message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const missing = missingRequiredEnv();
  if (missing.length) {
    console.error("Missing required sandbox environment variables:");
    for (const key of missing) {
      console.error(`- ${key}`);
    }
    process.exit(1);
  }

  const config = loadConfig(process.env);
  const timeoutMs = Number(process.env.SANDBOX_TEST_TIMEOUT_MS) || 15_000;
  const tenantId = process.env.SANDBOX_TENANT_ID;
  const redirectUri = process.env.SANDBOX_REDIRECT_URI;

  console.log("Building OAuth authorization URLs...");
  for (const providerName of PROVIDER_NAMES) {
    const provider = config.providers[providerName];
    const url = new URL(provider.authorizationEndpoint);
    url.searchParams.set("client_id", provider.clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", `${providerName}:${tenantId}`);

    console.log(`- ${providerName}: ${url.toString()}`);
  }

  console.log("Pinging sandbox API bases...");
  const pingResults = await Promise.all(
    PROVIDER_NAMES.map((providerName) => {
      const prefix = providerPrefix(providerName);
      return pingProvider({
        providerName,
        baseUrl: process.env[`${prefix}_API_BASE_URL`],
        pingPath: process.env[`${prefix}_SANDBOX_PING_PATH`] || "/",
        bearerToken: process.env[`${prefix}_SANDBOX_BEARER_TOKEN`] || "",
        timeoutMs,
      });
    }),
  );

  let hasFailure = false;
  for (const result of pingResults) {
    if (result.ok) {
      console.log(
        `[PASS] ${result.provider} sandbox reachable (${result.status}) ${result.url}`,
      );
    } else {
      hasFailure = true;
      console.error(
        `[FAIL] ${result.provider} sandbox unreachable (${result.status || "ERR"}) ${result.url} ${result.error || ""}`.trim(),
      );
    }
  }

  if (hasFailure) {
    process.exit(1);
  }

  console.log("Sandbox smoke test completed successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
