import { json, raw, urlencoded } from 'express';
import type { Express, Request } from 'express';

type RawBodyRequest = Request & { rawBody?: Buffer };

export function configureApiBodyParsers(app: Express): void {
  const webhookBodyLimit = Number.parseInt(
    process.env.WHATSAPP_WEBHOOK_MAX_BODY_BYTES ?? '262144',
    10,
  );
  const jsonLimit =
    Number.isInteger(webhookBodyLimit) && webhookBodyLimit > 0
      ? webhookBodyLimit
      : 262_144;

  app.use(
    '/whatsapp/webhook',
    raw({
      type: 'application/json',
      limit: jsonLimit,
      verify: (request, _response, rawBody) => {
        (request as RawBodyRequest).rawBody = Buffer.from(rawBody);
      },
    }),
  );
  // A logo is stored as a Base64 data URL, so its JSON body is larger than the
  // 512 KB source-file limit. Keep the larger parser scoped to this one endpoint.
  app.use('/rekomtek/rejection-letter/settings', json({ limit: '1mb' }));
  // Keep the standard body-size limit for every other JSON endpoint.
  app.use(json());
  app.use(urlencoded({ extended: true }));
}
