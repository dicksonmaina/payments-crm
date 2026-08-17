import http from 'node:http';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';

process.env.STRIPE_SECRET_KEY = 'sk_test';
process.env.RESEND_API_KEY = 're_test';
process.env.BASE_URL = 'http://localhost:3000';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';

let server;
let baseUrl;

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const req = http.request({ method, hostname: url.hostname, port: url.port, path: url.pathname + url.search }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

describe('payments-crm', () => {
  before(async () => {
    const mod = await import('../src/server.js');
    const app = mod.default || mod;
    server = app.listen(0, () => {
      const addr = server.address();
      baseUrl = `http://127.0.0.1:${addr.port}`;
    });
    await new Promise((resolve) => server.on('listening', resolve));
  });

  after((done) => {
    server.close(done);
  });

  it('GET /health returns ok', async () => {
    const res = await request('GET', '/health');
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.data, { ok: true });
  });

  it('POST /customers without email returns 400', async () => {
    const res = await request('POST', '/customers', { name: 'Test' });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.data.error, 'validation failed');
  });

  it('POST /customers with email returns 201', async () => {
    const res = await request('POST', '/customers', { name: 'Test', email: 'test@example.com' });
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.data.email, 'test@example.com');
  });

  it('POST /invoices without required fields returns 400', async () => {
    const res = await request('POST', '/invoices', {});
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.data.error, 'validation failed');
  });

  it('GET /success without session_id returns 302', async () => {
    const res = await request('GET', '/success');
    assert.ok([300, 301, 302].includes(res.status));
  });
});
