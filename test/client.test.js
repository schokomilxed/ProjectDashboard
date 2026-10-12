import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { BaserowClient } from '../src/baserow/client.js';
import { normalizeUrl, readConfig } from '../src/config.js';
import { startMockBaserow } from './mock-baserow.js';

let mock;
before(async () => { mock = await startMockBaserow(); });
after(() => mock.close());

const makeClient = (extra = {}) =>
  new BaserowClient({ url: mock.url, token: mock.token, email: mock.email, password: mock.password, ...extra });

test('normalizeUrl strips trailing slash and /api', () => {
  assert.equal(normalizeUrl('https://br.example.com/api/'), 'https://br.example.com');
  assert.equal(normalizeUrl(' https://br.example.com// '), 'https://br.example.com');
});

test('readConfig validates required values', () => {
  assert.throws(() => readConfig({}), /BASEROW_URL fehlt/);
  assert.throws(() => readConfig({ BASEROW_URL: 'baserow.local' }), /http/);
  assert.throws(() => readConfig({ BASEROW_URL: 'https://x', BASEROW_WORKSPACE_ID: 'abc' }), /positive ganze Zahl/);
  const config = readConfig({ BASEROW_URL: 'https://x/api', BASEROW_DATABASE_ID: '12' });
  assert.equal(config.url, 'https://x');
  assert.equal(config.databaseId, 12);
  assert.equal(config.databaseName, 'Steckbriefe');
});

test('checkToken distinguishes valid and invalid tokens', async () => {
  assert.equal(await makeClient().checkToken(), true);
  assert.equal(await makeClient({ token: 'falsch' }).checkToken(), false);
});

test('login reports wrong credentials', async () => {
  await assert.rejects(makeClient({ password: 'x' }).login(), (e) => e.status === 400 && e.code === 'ERROR_INVALID_CREDENTIALS');
});

test('expired JWT triggers one new login', async () => {
  const client = makeClient();
  await client.login();
  mock.state.jwts.clear(); // server forgets the JWT
  const workspaces = await client.listWorkspaces();
  assert.equal(workspaces.length, 1);
});

test('GET requests are retried on 503, writes are not', async () => {
  const client = makeClient({ retries: 2 });
  mock.state.failNext.push(503);
  assert.ok(await client.getSettings());

  await client.login();
  const db = await client.createDatabase(mock.state.workspaces[0].id, 'Retry');
  const table = await client.createTable(db.id, 'T', 'Name');
  mock.state.failNext.push(503);
  await assert.rejects(client.createRow(table.id, { Name: 'a' }), (e) => e.status === 503);
  assert.equal(mock.state.rows.get(table.id).length, 0);
});

test('unreachable server gives a readable error', async () => {
  const client = new BaserowClient({ url: 'http://127.0.0.1:1', retries: 0 });
  await assert.rejects(client.getSettings(), (e) => e.code === 'NETWORK' && /Keine Verbindung/.test(e.message));
});

test('row CRUD and pagination with database token', async () => {
  const admin = makeClient();
  await admin.login();
  const db = await admin.createDatabase(mock.state.workspaces[0].id, 'Rows');
  const table = await admin.createTable(db.id, 'Elemente', 'OZ');

  const client = makeClient({ email: undefined, password: undefined });
  const row = await client.createRow(table.id, { OZ: '01.02.0010', Name: 'Eingang' });
  assert.equal((await client.getRow(table.id, row.id)).Name, 'Eingang');
  await client.updateRow(table.id, row.id, { Name: 'Foyer' });
  assert.equal((await client.getRow(table.id, row.id)).Name, 'Foyer');

  const many = Array.from({ length: 450 }, (_, i) => ({ OZ: `01.02.${String(i).padStart(4, '0')}` }));
  const created = await client.createRows(table.id, many);
  assert.equal(created.length, 450);
  assert.equal(mock.state.requests.filter((r) => r.path.endsWith('/batch/')).length, 3); // 200 + 200 + 50

  const all = await client.listAllRows(table.id);
  assert.equal(all.length, 451);
  assert.ok(mock.state.requests.at(-1).auth.startsWith('Token '));

  await client.updateRows(table.id, created.slice(0, 2).map((r) => ({ id: r.id, Name: 'x' })));
  await client.deleteRows(table.id, created.map((r) => r.id));
  await client.deleteRow(table.id, row.id);
  assert.equal((await client.listRows(table.id)).count, 0);
});

test('tokenViaProxy sends no Authorization header for row requests', async () => {
  const client = new BaserowClient({ url: mock.url, tokenViaProxy: true });
  assert.equal(client.hasToken, true);
  await assert.rejects(client.listRows(1), (e) => e.status === 401); // mock has no proxy
  assert.equal(mock.state.requests.at(-1).auth, '');
});

test('readConfig reads BASEROW_TOKEN_VIA_PROXY', () => {
  assert.equal(readConfig({ BASEROW_URL: 'https://x', BASEROW_TOKEN_VIA_PROXY: '1' }).tokenViaProxy, true);
  assert.equal(readConfig({ BASEROW_URL: 'https://x' }).tokenViaProxy, false);
});
