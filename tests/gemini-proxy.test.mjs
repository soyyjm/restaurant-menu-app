import test from 'node:test';
import assert from 'node:assert/strict';
import handler, { pickModel, buildRequests } from '../netlify/functions/gemini.mjs';

const FAKE_KEY = 'test-key-not-real';
const calls = [];
let geminiReply = () => ({ status: 200, body: { candidates: [{ content: { parts: [{ text: '{"es":"Jamón con patatas fritas","ca":"Pernil amb patates fregides"}' }] } }] } });
let authReply = () => ({ status: 200, body: { id: 'u1', email: 'owner@example.com' } });

globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init });
  const r = String(url).includes('/auth/v1/user') ? authReply(init) : geminiReply(init);
  return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json' } });
};

function req(body, { token = 'good-token', method = 'POST' } = {}) {
  return new Request('http://localhost/api/gemini', {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined
  });
}

test.beforeEach(() => {
  calls.length = 0;
  process.env.GEMINI_API_KEY = FAKE_KEY;
  delete process.env.GEMINI_MODEL;
  delete process.env.GEMINI_ALLOWED_EMAILS;
  authReply = () => ({ status: 200, body: { id: 'u1', email: 'owner@example.com' } });
});

test('rejects requests without a session and never calls Gemini', async () => {
  const res = await handler(req({ task: 'dish', text: 'Sopa' }, { token: '' }));
  assert.equal(res.status, 401);
  assert.equal(calls.length, 0);
});

test('rejects an invalid Supabase token', async () => {
  authReply = () => ({ status: 401, body: { msg: 'bad jwt' } });
  const res = await handler(req({ task: 'dish', text: 'Sopa' }));
  assert.equal(res.status, 401);
  assert.ok(!calls.some(c => c.url.includes('generativelanguage')));
});

test('optional email allowlist blocks other accounts', async () => {
  process.env.GEMINI_ALLOWED_EMAILS = 'boss@example.com';
  const res = await handler(req({ task: 'dish', text: 'Sopa' }));
  assert.equal(res.status, 403);
});

test('dish translation sends key in header only and returns text without the key', async () => {
  const res = await handler(req({ task: 'dish', text: 'Jamon con patats fritas', model: 'gemini-2.5-flash' }));
  assert.equal(res.status, 200);
  const raw = await res.text();
  assert.ok(!raw.includes(FAKE_KEY));
  const data = JSON.parse(raw);
  assert.equal(data.model, 'gemini-3.5-flash-lite');
  assert.match(data.text, /Pernil/);
  const g = calls.find(c => c.url.includes('generativelanguage'));
  assert.equal(g.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
  assert.equal(g.init.headers['x-goog-api-key'], FAKE_KEY);
  const body = JSON.parse(g.init.body);
  assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, 'minimal');
  assert.equal(body.generationConfig.temperature, undefined);
});

test('3.8 Flash uses low thinking; env default applies to unknown models', async () => {
  assert.equal(buildRequests({ task: 'text', text: 'x', model: 'gemini-3.8-flash', sourceLang: 'es', targetLang: 'en' })[0].generationConfig.thinkingConfig.thinkingLevel, 'low');
  process.env.GEMINI_MODEL = 'gemini-3.8-flash';
  assert.equal(pickModel('gemini-3.5-flash'), 'gemini-3.8-flash');
  process.env.GEMINI_MODEL = 'gemini-2.5-flash-lite';
  assert.equal(pickModel(undefined), 'gemini-3.5-flash-lite');
});

test('limits size, task and languages', async () => {
  assert.equal((await handler(req({ task: 'dish', text: 'x'.repeat(201) }))).status, 413);
  assert.equal((await handler(req('x'.repeat(5000)))).status, 413);
  assert.equal((await handler(req({ task: 'chat', text: 'hola' }))).status, 400);
  assert.equal((await handler(req({ task: 'text', text: 'hola', sourceLang: 'es', targetLang: 'fr' }))).status, 400);
  assert.equal((await handler(req(null, { method: 'GET' }))).status, 405);
  assert.equal(calls.length, 0);
});

test('missing server key gives a clear 503', async () => {
  delete process.env.GEMINI_API_KEY;
  const res = await handler(req({ task: 'dish', text: 'Sopa' }));
  assert.equal(res.status, 503);
  assert.equal((await res.json()).code, 'no_key');
});

test('400 on the first structured-output shape retries with the classic shape; Google errors are not forwarded', async () => {
  let n = 0;
  geminiReply = () => (++n === 1
    ? { status: 400, body: { error: { message: 'Unknown name "responseFormat" secret-detail' } } }
    : { status: 200, body: { candidates: [{ content: { parts: [{ text: '{"es":"Sopa","ca":"Sopa"}' }] } }] } });
  const ok = await handler(req({ task: 'dish', text: 'Sopa' }));
  assert.equal(ok.status, 200);
  const second = JSON.parse(calls.filter(c => c.url.includes('generativelanguage'))[1].init.body);
  assert.equal(second.generationConfig.responseMimeType, 'application/json');

  geminiReply = () => ({ status: 403, body: { error: { message: 'API key not valid secret-detail' } } });
  const bad = await handler(req({ task: 'dish', text: 'Sopa' }));
  assert.equal(bad.status, 502);
  assert.ok(!(await bad.text()).includes('secret-detail'));
});
