import { createHmac, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

function asRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value
    : null;
}

function stringValue(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function parseEnvText(text) {
  const values = {};
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) continue;
    let value = line.slice(separator + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

export function validateLocalEnvironment(api, waha) {
  const errors = [];
  const apiKey = stringValue(api.WAHA_API_KEY);
  const providerApiKey = stringValue(waha.WAHA_API_KEY);
  const hmacKey = stringValue(api.WAHA_WEBHOOK_HMAC_KEY);
  const provider = stringValue(api.WHATSAPP_PROVIDER)?.toLowerCase();
  const session = stringValue(api.WAHA_SESSION);
  const expectedEngine = stringValue(api.WAHA_EXPECTED_ENGINE)?.toUpperCase();
  const providerEngine = stringValue(
    waha.WHATSAPP_DEFAULT_ENGINE,
  )?.toUpperCase();
  const enabledValue = stringValue(api.WHATSAPP_ENABLED)?.toLowerCase();

  if (!stringValue(api.JWT_SECRET)) errors.push('JWT_SECRET_MISSING');
  if (!['true', 'false'].includes(enabledValue ?? '')) {
    errors.push('WHATSAPP_ENABLED_INVALID');
  }
  if (provider !== 'waha') errors.push('WHATSAPP_PROVIDER_MUST_BE_WAHA');
  if (api.WAHA_BASE_URL !== 'http://waha:3000') {
    errors.push('API_WAHA_BASE_URL_INVALID');
  }
  if (!apiKey) errors.push('API_WAHA_API_KEY_MISSING');
  if (!providerApiKey) errors.push('PROVIDER_WAHA_API_KEY_MISSING');
  if (apiKey && providerApiKey && apiKey !== providerApiKey) {
    errors.push('WAHA_API_KEY_MISMATCH');
  }
  if (!hmacKey) errors.push('WAHA_WEBHOOK_HMAC_KEY_MISSING');
  if (apiKey && hmacKey && apiKey === hmacKey) {
    errors.push('WAHA_WEBHOOK_HMAC_KEY_MUST_DIFFER');
  }
  if (stringValue(api.WAHA_WEBHOOK_CUSTOM_SECRET)) {
    errors.push('WAHA_WEBHOOK_CUSTOM_SECRET_MUST_BE_EMPTY');
  }
  if (!session) errors.push('WAHA_SESSION_MISSING');
  if (!expectedEngine) errors.push('WAHA_EXPECTED_ENGINE_MISSING');
  if (!providerEngine) errors.push('WHATSAPP_DEFAULT_ENGINE_MISSING');
  if (expectedEngine && providerEngine && expectedEngine !== providerEngine) {
    errors.push('WAHA_ENGINE_MISMATCH');
  }
  if (waha.WAHA_BASE_URL !== 'http://localhost:3002') {
    errors.push('PROVIDER_WAHA_BASE_URL_INVALID');
  }
  if (waha.WAHA_PUBLIC_URL !== 'http://localhost:3002') {
    errors.push('PROVIDER_WAHA_PUBLIC_URL_INVALID');
  }
  if (stringValue(waha.WAHA_DASHBOARD_ENABLED)?.toLowerCase() !== 'true') {
    errors.push('WAHA_DASHBOARD_MUST_BE_ENABLED');
  }
  if (!stringValue(waha.WAHA_DASHBOARD_USERNAME)) {
    errors.push('WAHA_DASHBOARD_USERNAME_MISSING');
  }
  if (!stringValue(waha.WAHA_DASHBOARD_PASSWORD)) {
    errors.push('WAHA_DASHBOARD_PASSWORD_MISSING');
  }
  if (errors.length > 0) {
    throw new Error(`Konfigurasi local WAHA tidak valid: ${errors.join(', ')}`);
  }

  return {
    valid: true,
    whatsappEnabled: enabledValue === 'true',
    provider,
    session,
    engine: expectedEngine,
    apiKeyConfigured: true,
    hmacConfigured: true,
    dashboardPasswordConfigured: true,
  };
}

export function assertLocalProbeUrl(value, expectedPort, variableName) {
  let parsed;
  try {
    parsed = new URL(String(value).trim());
  } catch {
    throw new Error(`${variableName}_INVALID`);
  }
  const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
  if (
    parsed.protocol !== 'http:' ||
    !loopbackHosts.has(parsed.hostname.toLowerCase()) ||
    parsed.username ||
    parsed.password ||
    !['', '/'].includes(parsed.pathname) ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(`${variableName}_MUST_BE_LOOPBACK`);
  }
  if (parsed.port !== String(expectedPort)) {
    throw new Error(`${variableName}_PORT_MUST_BE_${expectedPort}`);
  }
  return parsed.origin;
}

export function buildWahaHealthUrls(baseUrl, session) {
  const normalizedBaseUrl = String(baseUrl).trim().replace(/\/+$/, '');
  const normalizedSession = String(session).trim();
  if (!normalizedBaseUrl) throw new Error('WAHA_LOCAL_PROBE_URL wajib diisi');
  if (!normalizedSession) throw new Error('WAHA_SESSION wajib diisi');
  new URL(normalizedBaseUrl);
  const encodedSession = encodeURIComponent(normalizedSession);
  const sessionUrl = `${normalizedBaseUrl}/api/sessions/${encodedSession}`;
  return {
    session: sessionUrl,
    timelock: `${sessionUrl}/timelock`,
    capping: `${sessionUrl}/capping`,
  };
}

export function readWahaEngine(payload) {
  const root = asRecord(payload) ?? {};
  const nestedPayload = asRecord(root.payload) ?? {};
  for (const candidate of [root.engine, nestedPayload.engine]) {
    const direct = stringValue(candidate);
    if (direct) return direct.toUpperCase();
    const nested = asRecord(candidate);
    const nestedEngine = stringValue(nested?.engine);
    if (nestedEngine) return nestedEngine.toUpperCase();
  }
  return null;
}

export function evaluateWahaHealth({
  expectedSession,
  expectedEngine,
  sessionPayload,
  timelockPayload,
  cappingPayload,
}) {
  const root = asRecord(sessionPayload) ?? {};
  const nestedPayload = asRecord(root.payload) ?? {};
  const session =
    stringValue(root.name) ??
    stringValue(nestedPayload.name) ??
    String(expectedSession).trim();
  const status = (
    stringValue(root.status) ??
    stringValue(nestedPayload.status) ??
    'UNKNOWN'
  ).toUpperCase();
  const engine = readWahaEngine(sessionPayload);
  const timelock = asRecord(timelockPayload) ?? {};
  const capping = asRecord(cappingPayload) ?? {};
  const reachoutTimelockActive = timelock.isActive === true;
  const reachoutTimelockKnown =
    timelock.isActive === false || reachoutTimelockActive;
  const messageCappingStatus = (
    stringValue(capping.cappingStatus) ?? 'UNKNOWN'
  ).toUpperCase();
  const normalizedExpectedSession = String(expectedSession).trim();
  const normalizedExpectedEngine = String(expectedEngine).trim().toUpperCase();
  const reasons = [];

  if (session !== normalizedExpectedSession) reasons.push('SESSION_MISMATCH');
  if (status !== 'WORKING') reasons.push('SESSION_NOT_WORKING');
  if (!engine || engine !== normalizedExpectedEngine) {
    reasons.push('ENGINE_MISMATCH');
  }
  if (reachoutTimelockActive) {
    reasons.push('REACHOUT_TIMELOCK_ACTIVE');
  } else if (!reachoutTimelockKnown) {
    reasons.push('REACHOUT_TIMELOCK_UNKNOWN');
  }
  if (messageCappingStatus === 'CAPPED') {
    reasons.push('MESSAGE_CAPPING_CAPPED');
  } else if (messageCappingStatus === 'UNKNOWN') {
    reasons.push('MESSAGE_CAPPING_UNKNOWN');
  }

  return {
    ready: reasons.length === 0,
    session,
    status,
    engine,
    reachoutTimelockActive,
    messageCappingStatus,
    reasons,
  };
}

async function fetchJson(url, apiKey, fetchImplementation = fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetchImplementation(url, {
      headers: {
        Accept: 'application/json',
        'X-Api-Key': apiKey,
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`WAHA_HEALTH_HTTP_${response.status}`);
    }
    try {
      return await response.json();
    } catch {
      throw new Error('WAHA_HEALTH_INVALID_JSON');
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('WAHA_HEALTH_TIMEOUT');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function probeWahaRuntime(
  { baseUrl, apiKey, session, expectedEngine },
  fetchImplementation = fetch,
) {
  const urls = buildWahaHealthUrls(baseUrl, session);
  const [sessionPayload, timelockPayload, cappingPayload] = await Promise.all([
    fetchJson(urls.session, apiKey, fetchImplementation),
    fetchJson(urls.timelock, apiKey, fetchImplementation),
    fetchJson(urls.capping, apiKey, fetchImplementation),
  ]);
  return evaluateWahaHealth({
    expectedSession: session,
    expectedEngine,
    sessionPayload,
    timelockPayload,
    cappingPayload,
  });
}

export async function probeSignedSipengsuiWebhook(
  { apiBaseUrl, hmacKey, session, engine, expectedEnabled },
  fetchImplementation = fetch,
) {
  const timestamp = Date.now();
  const rawBody = JSON.stringify({
    id: `evt_local_${randomUUID().replaceAll('-', '')}`,
    timestamp,
    event: 'local.probe',
    session,
    engine,
    payload: {},
  });
  const signature = createHmac('sha512', hmacKey).update(rawBody).digest('hex');
  const url = `${String(apiBaseUrl).trim().replace(/\/+$/, '')}/whatsapp/webhook`;
  const response = await fetchImplementation(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Webhook-Request-Id': `local-probe-${randomUUID()}`,
      'X-Webhook-Timestamp': String(timestamp),
      'X-Webhook-Hmac': signature,
      'X-Webhook-Hmac-Algorithm': 'sha512',
    },
    body: rawBody,
  });
  const body = await response.json().catch(() => null);
  if (
    response.status === 200 &&
    asRecord(body)?.status === 'ignored' &&
    expectedEnabled === true
  ) {
    return {
      reachable: true,
      httpStatus: 200,
      mode: 'ENABLED_SIGNED_HMAC_ACCEPTED',
      signedHmacVerified: true,
      synthetic: true,
    };
  }
  if (
    response.status === 200 &&
    asRecord(body)?.status === 'disabled' &&
    expectedEnabled === false
  ) {
    return {
      reachable: true,
      httpStatus: 200,
      mode: 'DISABLED_READY',
      signedHmacVerified: false,
      synthetic: true,
    };
  }
  if (
    response.status === 200 &&
    ((asRecord(body)?.status === 'disabled' && expectedEnabled === true) ||
      (asRecord(body)?.status === 'ignored' && expectedEnabled === false))
  ) {
    throw new Error('SIPENGSUI_KILL_SWITCH_MISMATCH');
  }
  throw new Error(`SIPENGSUI_SIGNED_WEBHOOK_HTTP_${response.status}`);
}

export function loadLocalEnvironmentFiles(
  apiEnvFile = '.env.api.waha.local',
  wahaEnvFile = '.env.waha.local',
) {
  const missingFiles = [
    ...(existsSync(apiEnvFile) ? [] : [apiEnvFile]),
    ...(existsSync(wahaEnvFile) ? [] : [wahaEnvFile]),
  ];
  if (missingFiles.length > 0) {
    throw new Error(
      `File environment lokal belum dibuat: ${missingFiles.join(', ')}`,
    );
  }
  const api = parseEnvText(readFileSync(apiEnvFile, 'utf8'));
  const waha = parseEnvText(readFileSync(wahaEnvFile, 'utf8'));
  const summary = validateLocalEnvironment(api, waha);
  return { api, waha, summary };
}

async function main() {
  const apiEnvFile =
    process.env.WHATSAPP_LOCAL_API_ENV_FILE ?? '.env.api.waha.local';
  const wahaEnvFile =
    process.env.WHATSAPP_LOCAL_PROVIDER_ENV_FILE ?? '.env.waha.local';
  const localEnvironment = loadLocalEnvironmentFiles(apiEnvFile, wahaEnvFile);

  if (process.argv.includes('--preflight')) {
    console.log(JSON.stringify(localEnvironment.summary, null, 2));
    return;
  }

  const apiConfig = localEnvironment.api;
  const wahaProbeUrl = assertLocalProbeUrl(
    process.env.WAHA_LOCAL_PROBE_URL ?? 'http://localhost:3002',
    3002,
    'WAHA_LOCAL_PROBE_URL',
  );
  const provider = await probeWahaRuntime({
    baseUrl: wahaProbeUrl,
    apiKey: apiConfig.WAHA_API_KEY,
    session: apiConfig.WAHA_SESSION,
    expectedEngine: apiConfig.WAHA_EXPECTED_ENGINE,
  });
  const apiBaseUrl = assertLocalProbeUrl(
    process.env.SIPENGSUI_LOCAL_API_URL ?? 'http://localhost:3000',
    3000,
    'SIPENGSUI_LOCAL_API_URL',
  );
  const api = await probeSignedSipengsuiWebhook({
    apiBaseUrl,
    hmacKey: apiConfig.WAHA_WEBHOOK_HMAC_KEY,
    session: apiConfig.WAHA_SESSION,
    engine: apiConfig.WAHA_EXPECTED_ENGINE,
    expectedEnabled: localEnvironment.summary.whatsappEnabled,
  });

  console.log(
    JSON.stringify(
      {
        localEnvironment: localEnvironment.summary,
        provider,
        api,
        safeProbe: true,
        messageSent: false,
      },
      null,
      2,
    ),
  );
  if (!provider.ready) process.exitCode = 1;
}

const entrypoint = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : '';
if (entrypoint && import.meta.url === entrypoint) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
    console.error(`Verifikasi WhatsApp lokal gagal: ${message}`);
    process.exitCode = 1;
  });
}
