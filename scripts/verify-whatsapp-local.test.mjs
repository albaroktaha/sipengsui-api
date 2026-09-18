import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';

import {
  assertLocalProbeUrl,
  buildWahaHealthUrls,
  evaluateWahaHealth,
  parseEnvText,
  probeSignedSipengsuiWebhook,
  readWahaEngine,
  validateLocalEnvironment,
} from './verify-whatsapp-local.mjs';

test('assertLocalProbeUrl hanya menerima loopback dan port yang ditetapkan', () => {
  assert.doesNotThrow(() =>
    assertLocalProbeUrl('http://localhost:3002', 3002, 'WAHA_LOCAL_PROBE_URL'),
  );
  assert.doesNotThrow(() =>
    assertLocalProbeUrl(
      'http://127.0.0.1:3000/',
      3000,
      'SIPENGSUI_LOCAL_API_URL',
    ),
  );
  assert.throws(
    () =>
      assertLocalProbeUrl(
        'https://waha.example.test',
        3002,
        'WAHA_LOCAL_PROBE_URL',
      ),
    /WAHA_LOCAL_PROBE_URL_MUST_BE_LOOPBACK/,
  );
  assert.throws(
    () =>
      assertLocalProbeUrl(
        'http://localhost:3999',
        3002,
        'WAHA_LOCAL_PROBE_URL',
      ),
    /WAHA_LOCAL_PROBE_URL_PORT_MUST_BE_3002/,
  );
});

test('buildWahaHealthUrls membentuk tiga endpoint health tanpa double slash', () => {
  assert.deepEqual(buildWahaHealthUrls('http://localhost:3002/', 'default'), {
    session: 'http://localhost:3002/api/sessions/default',
    timelock: 'http://localhost:3002/api/sessions/default/timelock',
    capping: 'http://localhost:3002/api/sessions/default/capping',
  });
});

test('validateLocalEnvironment menerima pemisahan konfigurasi yang aman', () => {
  const api = parseEnvText(`
    JWT_SECRET=local-jwt-key
    WHATSAPP_ENABLED=false
    WHATSAPP_PROVIDER=waha
    WAHA_BASE_URL=http://waha:3000
    WAHA_API_KEY=local-api-key
    WAHA_SESSION=default
    WAHA_WEBHOOK_HMAC_KEY=local-hmac-key
    WAHA_EXPECTED_ENGINE=WEBJS
  `);
  const waha = parseEnvText(`
    WAHA_API_KEY=local-api-key
    WAHA_BASE_URL=http://localhost:3002
    WAHA_PUBLIC_URL=http://localhost:3002
    WAHA_DASHBOARD_ENABLED=true
    WAHA_DASHBOARD_USERNAME=admin
    WAHA_DASHBOARD_PASSWORD=dashboard-password
    WHATSAPP_DEFAULT_ENGINE=WEBJS
  `);

  assert.deepEqual(validateLocalEnvironment(api, waha), {
    valid: true,
    whatsappEnabled: false,
    provider: 'waha',
    session: 'default',
    engine: 'WEBJS',
    apiKeyConfigured: true,
    hmacConfigured: true,
    dashboardPasswordConfigured: true,
  });
});

test('validateLocalEnvironment menolak JWT secret kosong', () => {
  const api = parseEnvText(`
    JWT_SECRET=
    WHATSAPP_ENABLED=false
    WHATSAPP_PROVIDER=waha
    WAHA_BASE_URL=http://waha:3000
    WAHA_API_KEY=local-api-key
    WAHA_SESSION=default
    WAHA_WEBHOOK_HMAC_KEY=local-hmac-key
    WAHA_EXPECTED_ENGINE=WEBJS
  `);
  const waha = parseEnvText(`
    WAHA_API_KEY=local-api-key
    WAHA_BASE_URL=http://localhost:3002
    WAHA_PUBLIC_URL=http://localhost:3002
    WAHA_DASHBOARD_ENABLED=true
    WAHA_DASHBOARD_USERNAME=admin
    WAHA_DASHBOARD_PASSWORD=dashboard-password
    WHATSAPP_DEFAULT_ENGINE=WEBJS
  `);

  assert.throws(
    () => validateLocalEnvironment(api, waha),
    /JWT_SECRET_MISSING/,
  );
});

test('validateLocalEnvironment menolak Dashboard tanpa username atau status aktif', () => {
  const api = parseEnvText(`
    JWT_SECRET=local-jwt-key
    WHATSAPP_ENABLED=false
    WHATSAPP_PROVIDER=waha
    WAHA_BASE_URL=http://waha:3000
    WAHA_API_KEY=local-api-key
    WAHA_SESSION=default
    WAHA_WEBHOOK_HMAC_KEY=local-hmac-key
    WAHA_EXPECTED_ENGINE=WEBJS
  `);
  const waha = parseEnvText(`
    WAHA_API_KEY=local-api-key
    WAHA_BASE_URL=http://localhost:3002
    WAHA_PUBLIC_URL=http://localhost:3002
    WAHA_DASHBOARD_ENABLED=false
    WAHA_DASHBOARD_USERNAME=
    WAHA_DASHBOARD_PASSWORD=dashboard-password
    WHATSAPP_DEFAULT_ENGINE=WEBJS
  `);

  assert.throws(
    () => validateLocalEnvironment(api, waha),
    /WAHA_DASHBOARD_MUST_BE_ENABLED.*WAHA_DASHBOARD_USERNAME_MISSING/,
  );
});

test('validateLocalEnvironment menolak key provider berbeda dan HMAC yang dipakai ulang', () => {
  const api = parseEnvText(`
    JWT_SECRET=local-jwt-key
    WHATSAPP_ENABLED=false
    WHATSAPP_PROVIDER=waha
    WAHA_BASE_URL=http://waha:3000
    WAHA_API_KEY=same-secret
    WAHA_SESSION=default
    WAHA_WEBHOOK_HMAC_KEY=same-secret
    WAHA_EXPECTED_ENGINE=WEBJS
  `);
  const waha = parseEnvText(`
    WAHA_API_KEY=different-key
    WAHA_BASE_URL=http://localhost:3002
    WAHA_PUBLIC_URL=http://localhost:3002
    WAHA_DASHBOARD_ENABLED=true
    WAHA_DASHBOARD_USERNAME=admin
    WAHA_DASHBOARD_PASSWORD=dashboard-password
    WHATSAPP_DEFAULT_ENGINE=WEBJS
  `);

  assert.throws(
    () => validateLocalEnvironment(api, waha),
    /WAHA_API_KEY_MISMATCH.*WAHA_WEBHOOK_HMAC_KEY_MUST_DIFFER/,
  );
});

test('readWahaEngine membaca bentuk engine nested dari response session', () => {
  assert.equal(readWahaEngine({ engine: { engine: 'webjs' } }), 'WEBJS');
});

test('evaluateWahaHealth menerima session yang sepenuhnya siap', () => {
  assert.deepEqual(
    evaluateWahaHealth({
      expectedSession: 'default',
      expectedEngine: 'WEBJS',
      sessionPayload: {
        name: 'default',
        status: 'WORKING',
        engine: { engine: 'WEBJS' },
      },
      timelockPayload: { isActive: false },
      cappingPayload: { cappingStatus: 'NONE' },
    }),
    {
      ready: true,
      session: 'default',
      status: 'WORKING',
      engine: 'WEBJS',
      reachoutTimelockActive: false,
      messageCappingStatus: 'NONE',
      reasons: [],
    },
  );
});

test('evaluateWahaHealth menolak mismatch engine dan pembatasan provider', () => {
  const result = evaluateWahaHealth({
    expectedSession: 'default',
    expectedEngine: 'WEBJS',
    sessionPayload: {
      name: 'default',
      status: 'WORKING',
      engine: 'NOWEB',
    },
    timelockPayload: { isActive: true },
    cappingPayload: { cappingStatus: 'CAPPED' },
  });

  assert.equal(result.ready, false);
  assert.deepEqual(result.reasons, [
    'ENGINE_MISMATCH',
    'REACHOUT_TIMELOCK_ACTIVE',
    'MESSAGE_CAPPING_CAPPED',
  ]);
});

test('evaluateWahaHealth menolak timelock response yang tidak eksplisit', () => {
  const result = evaluateWahaHealth({
    expectedSession: 'default',
    expectedEngine: 'WEBJS',
    sessionPayload: {
      name: 'default',
      status: 'WORKING',
      engine: 'WEBJS',
    },
    timelockPayload: {},
    cappingPayload: { cappingStatus: 'NONE' },
  });

  assert.equal(result.ready, false);
  assert.deepEqual(result.reasons, ['REACHOUT_TIMELOCK_UNKNOWN']);
});

test('probeSignedSipengsuiWebhook menerima disabled hanya ketika file juga disabled', async () => {
  const result = await probeSignedSipengsuiWebhook(
    {
      apiBaseUrl: 'http://localhost:3000',
      hmacKey: 'local-hmac-test',
      session: 'default',
      engine: 'WEBJS',
      expectedEnabled: false,
    },
    async () =>
      new Response(JSON.stringify({ status: 'disabled' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  );

  assert.deepEqual(result, {
    reachable: true,
    httpStatus: 200,
    mode: 'DISABLED_READY',
    signedHmacVerified: false,
    synthetic: true,
  });
});

test('probeSignedSipengsuiWebhook menolak mismatch kill switch file dan proses', async () => {
  await assert.rejects(
    probeSignedSipengsuiWebhook(
      {
        apiBaseUrl: 'http://localhost:3000',
        hmacKey: 'local-hmac-test',
        session: 'default',
        engine: 'WEBJS',
        expectedEnabled: true,
      },
      async () =>
        new Response(JSON.stringify({ status: 'disabled' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    ),
    /SIPENGSUI_KILL_SWITCH_MISMATCH/,
  );
});

test('probeSignedSipengsuiWebhook menandatangani raw body dan menerima ignored', async () => {
  const secret = 'local-hmac-test';
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url, init });
    const expected = createHmac('sha512', secret)
      .update(init.body)
      .digest('hex');
    assert.equal(init.headers['X-Webhook-Hmac'], expected);
    assert.equal(init.headers['X-Webhook-Hmac-Algorithm'], 'sha512');
    assert.match(init.headers['X-Webhook-Request-Id'], /^local-probe-/);
    return new Response(JSON.stringify({ status: 'ignored' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const result = await probeSignedSipengsuiWebhook(
    {
      apiBaseUrl: 'http://localhost:3000/',
      hmacKey: secret,
      session: 'default',
      engine: 'WEBJS',
      expectedEnabled: true,
    },
    fakeFetch,
  );
  assert.deepEqual(result, {
    reachable: true,
    httpStatus: 200,
    mode: 'ENABLED_SIGNED_HMAC_ACCEPTED',
    signedHmacVerified: true,
    synthetic: true,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://localhost:3000/whatsapp/webhook');
});
