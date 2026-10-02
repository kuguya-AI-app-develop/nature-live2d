import { createServer, request, type Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import configuration from '../vite.config.ts';

const servers: Server[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
});
async function listen(server: Server) {
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server.address() as {port: number}).port}`;
}
async function fixture(holdStreamOpen = false) {
  let upstreamCalls = 0;
  let cancelledUpstream = 0;
  const upstream = await listen(createServer((req, res) => {
    upstreamCalls++;
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const payload = JSON.parse(body);
      if (payload.stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        const event = `data: ${JSON.stringify({choices:[{delta:{content:'{"emotion":"happy"}\n'}}]})}\n\n`;
        if (holdStreamOpen) {
          res.write(event);
          const timeout = setTimeout(() => res.end('data: [DONE]\n\n'), 2000);
          res.on('close', () => {
            clearTimeout(timeout);
            if (!res.writableFinished) cancelledUpstream++;
          });
        } else {
          res.end(event + 'data: [DONE]\n\n');
        }
      } else {
        res.setHeader('Content-Type', 'application/json');
        const result = JSON.stringify({choices:[{message:{content:'{"emotion":"happy"}'}}]});
        if (holdStreamOpen) {
          const timeout = setTimeout(() => res.end(result), 2000);
          res.on('close', () => {
            clearTimeout(timeout);
            if (!res.writableFinished) cancelledUpstream++;
          });
        } else res.end(result);
      }
    });
  }));
  vi.stubEnv('LIVE2D_LLM_API_KEY', 'test-only-not-a-real-key');
  vi.stubEnv('LIVE2D_LLM_BASE_URL', upstream);
  vi.stubEnv('LIVE2D_LLM_MODEL', 'test-only');
  const config = await (configuration as Function)({mode: 'test', command: 'serve'});
  const routes = new Map();
  config.plugins[0].configureServer({middlewares:{use(path: string, handler: Function) { routes.set(path, handler); }}});
  const local = await listen(createServer((req, res) => {
    const handler = routes.get(req.url);
    if (handler) handler(req, res, () => {res.statusCode=404; res.end();});
    else {res.statusCode=404; res.end();}
  }));
  async function send(path: string, headers: Record<string,string>, method = 'POST') {
    return new Promise<{status:number,body:string}>((resolve, reject) => {
      const body = JSON.stringify({text:'synthetic fixture', messages:[{role:'user',content:'synthetic fixture'}]});
      const req = request(`${local}${path}`, {method, headers:{'Content-Length':Buffer.byteLength(body), ...headers}}, response => {
        let data=''; response.on('data', chunk => data+=chunk);
        response.on('end', () => resolve({status:response.statusCode!, body:data}));
      });
      req.on('error', reject); req.end(body);
    });
  }
  return {local, send, calls: () => upstreamCalls, cancelled: () => cancelledUpstream};
}

it('/api/analyze cancels an unfinished upstream request when the client disconnects', async () => {
  const app = await fixture(true);
  const body = JSON.stringify({text:'synthetic disconnect fixture'});
  const client = request(`${app.local}/api/analyze`, {method:'POST', headers:{
    'Content-Type':'application/json', 'Content-Length':Buffer.byteLength(body),
  }});
  client.on('error', () => {});
  client.end(body);
  await vi.waitFor(() => expect(app.calls()).toBe(1), {timeout:1000});
  client.destroy();
  await vi.waitFor(() => expect(app.cancelled()).toBe(1), {timeout:1000});
});

for (const route of ['/api/chat-stream', '/api/emotion-stream']) {
  it(`${route} cancels the upstream body when the response client disconnects`, async () => {
    const app = await fixture(true);
    const body = JSON.stringify({messages:[{role:'user',content:'synthetic disconnect fixture'}]});
    await new Promise<void>((resolve, reject) => {
      const client = request(`${app.local}${route}`, {method:'POST', headers:{
        'Content-Type':'application/json', 'Content-Length':Buffer.byteLength(body),
      }}, response => {
        response.once('data', () => { response.destroy(); client.destroy(); resolve(); });
        response.on('error', () => {});
      });
      client.on('error', reject);
      client.end(body);
    });
    await vi.waitFor(() => expect(app.cancelled()).toBe(1), {timeout:1000});
  });
}

for (const route of ['/api/analyze', '/api/chat-stream', '/api/emotion-stream']) {
  describe(route, () => {
    it('rejects unrelated and opaque origins without an upstream request', async () => {
      const app = await fixture();
      for (const origin of ['https://unrelated.example', 'null', `${app.local}.unrelated.example`]) {
        const response = await app.send(route, {'Origin':origin,'Content-Type':'text/plain'});
        expect(response.status).toBe(403);
      }
      expect(app.calls()).toBe(0);
    });
    it('rejects non-loopback Host values even with a matching Origin', async () => {
      const app = await fixture();
      const response = await app.send(route, {'Host':'unrelated.example','Origin':'http://unrelated.example','Content-Type':'application/json'});
      expect(response.status).toBe(403);
      expect(app.calls()).toBe(0);
    });
    it('requires JSON and does not treat text bodies as authorized JSON', async () => {
      const app = await fixture();
      for (const type of ['', 'text/plain', 'application/x-www-form-urlencoded']) {
        expect((await app.send(route, {'Origin':app.local,'Content-Type':type})).status).toBe(415);
      }
      expect(app.calls()).toBe(0);
    });
    it('allows same-origin JSON and origin-less local CLI JSON', async () => {
      const app = await fixture();
      for (const origin of [app.local, undefined]) {
        const headers: Record<string,string> = {'Content-Type':'application/json; charset=utf-8'};
        if (origin) headers.Origin = origin;
        const response = await app.send(route, headers);
        expect(response.status, response.body).toBe(200);
        expect(response.body).not.toContain('"type":"error"');
        expect(response.body).toContain(route === '/api/analyze' ? '"ok":true' : '"type":"done"');
      }
      expect(app.calls()).toBe(2);
    });
    it('validates preflight origins without contacting the model', async () => {
      const app = await fixture();
      expect((await app.send(route, {'Origin':'https://unrelated.example'}, 'OPTIONS')).status).toBe(403);
      expect((await app.send(route, {'Origin':app.local}, 'OPTIONS')).status).toBe(204);
      expect(app.calls()).toBe(0);
    });
  });
}
