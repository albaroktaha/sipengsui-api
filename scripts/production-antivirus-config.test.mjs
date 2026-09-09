import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, root), "utf8");
}

test("production image installs and enables the ClamAV scanner", async () => {
  const dockerfile = await read("Dockerfile");

  assert.match(dockerfile, /apk add --no-cache[^\n]*clamav-scanner[^\n]*freshclam/);
  assert.match(dockerfile, /ENV REKOMTEK_ANTIVIRUS_COMMAND=clamscan/);
  assert.match(dockerfile, /ENV REKOMTEK_ANTIVIRUS_TIMEOUT_MS=120000/);
});

test("entrypoint refreshes signatures and fails closed without a virus database", async () => {
  const entrypoint = await read("docker-entrypoint.sh");

  assert.match(entrypoint, /command -v "\$scanner"/);
  assert.match(entrypoint, /freshclam --quiet/);
  assert.match(entrypoint, /Tidak ada database signature ClamAV/);
  assert.match(entrypoint, /freshclam --daemon --foreground/);
});

test("compose persists signatures and passes complete scanner configuration", async () => {
  const compose = await read("compose.yaml");

  assert.match(
    compose,
    /REKOMTEK_ANTIVIRUS_COMMAND: \$\{REKOMTEK_ANTIVIRUS_COMMAND:-clamscan\}/,
  );
  assert.match(compose, /REKOMTEK_ANTIVIRUS_ARGS:/);
  assert.match(compose, /clamav-definitions:\/var\/lib\/clamav/);
  assert.match(compose, /^  clamav-definitions:$/m);
});

test("Coolify environment template enables ClamAV without host-specific paths", async () => {
  const template = await read("sipengsui-api_coolify_env.example");

  assert.match(template, /^REKOMTEK_ANTIVIRUS_COMMAND=clamscan$/m);
  assert.match(
    template,
    /^REKOMTEK_ANTIVIRUS_ARGS='\["--infected","--no-summary","\{file\}"\]'$/m,
  );
  assert.match(template, /^REKOMTEK_ANTIVIRUS_TIMEOUT_MS=120000$/m);
  assert.doesNotMatch(
    template,
    /^REKOMTEK_ANTIVIRUS_COMMAND=.*(?:Windows Defender|MpCmdRun)/im,
  );
});
