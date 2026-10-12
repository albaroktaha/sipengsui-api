import express from 'express';
import request from 'supertest';
import { configureApiBodyParsers } from './http-body-parsers';

describe('API JSON body parser limits', () => {
  function createApp() {
    const app = express();
    configureApiBodyParsers(app);
    app.put('/rekomtek/rejection-letter/settings', (_req, res) =>
      res.sendStatus(200),
    );
    app.put('/other-json-endpoint', (_req, res) => res.sendStatus(200));
    return app;
  }

  it('accepts a maximum-sized logo data URL on rejection-letter settings', async () => {
    const app = createApp();
    const logoDataUrl = `data:image/png;base64,${'A'.repeat(699_052)}`;
    await request(app)
      .put('/rekomtek/rejection-letter/settings')
      .send({ logoDataUrl })
      .expect(200);
  });

  it('keeps the default JSON limit on unrelated endpoints', async () => {
    const app = createApp();
    await request(app)
      .put('/other-json-endpoint')
      .send({ payload: 'A'.repeat(150_000) })
      .expect(413);
  });
});
