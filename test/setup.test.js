import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { BaserowClient } from '../src/baserow/client.js';
import { setupSchema } from '../src/baserow/setup.js';
import { TABLES } from '../src/baserow/schema.js';
import { startMockBaserow } from './mock-baserow.js';

let mock;
let client;
beforeEach(async () => {
  mock = await startMockBaserow();
  client = new BaserowClient({ url: mock.url, email: mock.email, password: mock.password });
});
afterEach(() => mock.close());

const fieldCount = TABLES.reduce((n, t) => n + t.fields.length, 0);

test('dry run on an empty instance changes nothing', async () => {
  const result = await setupSchema(client, { databaseName: 'Steckbriefe', dryRun: true });
  assert.equal(result.mapping, null);
  assert.equal(result.created.length, 1 + TABLES.length + fieldCount);
  assert.equal(mock.state.databases.length, 0);
  assert.ok(mock.state.requests.every((r) => r.method === 'GET' || r.path === '/api/user/token-auth/'));
});

test('setup creates everything, second run creates nothing', async () => {
  const first = await setupSchema(client, { databaseName: 'Steckbriefe' });
  assert.equal(first.created.length, 1 + TABLES.length + fieldCount);
  assert.deepEqual(first.warnings, []);

  const { mapping } = first;
  assert.equal(Object.keys(mapping.tables).length, TABLES.length);
  for (const table of TABLES) {
    const entry = mapping.tables[table.key];
    assert.ok(entry.fields[table.primary], `${table.name}: Hauptfeld fehlt`);
    for (const field of table.fields) assert.ok(entry.fields[field.name], `${table.name}.${field.name} fehlt`);
  }

  // Link fields point to the right tables.
  const link = mock.state.fields.find((f) => f.table_id === mapping.tables.positionen.id && f.name === 'Element');
  assert.equal(link.link_row_table_id, mapping.tables.elemente.id);

  const before = mock.state.requests.length;
  const second = await setupSchema(client, { databaseName: 'Steckbriefe' });
  assert.equal(second.created.length, 0);
  assert.deepEqual(second.mapping, mapping);
  assert.ok(mock.state.requests.slice(before).every((r) => r.method === 'GET' || r.path === '/api/user/token-auth/'));
});

test('missing fields are added, type mismatches only warned', async () => {
  const { mapping } = await setupSchema(client, { databaseName: 'Steckbriefe' });
  const elemente = mapping.tables.elemente.id;
  mock.state.fields = mock.state.fields.filter((f) => !(f.table_id === elemente && f.name === 'Plandatei'));
  mock.state.fields.find((f) => f.table_id === elemente && f.name === 'Version').type = 'text';

  const result = await setupSchema(client, { databaseName: 'Steckbriefe' });
  assert.deepEqual(result.created, ['Feld „Elemente.Plandatei“']);
  assert.equal(result.warnings.length, 1);
  assert.match(result.warnings[0], /Elemente\.Version.*text/);
});

test('several workspaces require BASEROW_WORKSPACE_ID', async () => {
  mock.state.workspaces.push({ id: 999, name: 'Privat' });
  await assert.rejects(setupSchema(client, { databaseName: 'Steckbriefe' }), /BASEROW_WORKSPACE_ID/);
  const result = await setupSchema(client, { databaseName: 'Steckbriefe', workspaceId: 999 });
  assert.equal(mock.state.databases[0].workspaceId, 999);
  assert.ok(result.mapping);
});

test('unknown database id is reported', async () => {
  await assert.rejects(setupSchema(client, { databaseName: 'x', databaseId: 4242 }), /4242 nicht gefunden/);
});
