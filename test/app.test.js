import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setupApp, text, EDIT_ROLES } from '../src/baserow/app.js';

const { tables } = JSON.parse(readFileSync(new URL('../baserow.tables.json', import.meta.url), 'utf8'));

/** Records builder API calls and answers with fresh ids. */
function fakeClient({ apps = [] } = {}) {
  let next = 1;
  const calls = [];
  return {
    calls,
    login: async () => ({}),
    listApplications: async () => apps,
    async request(method, path, { body } = {}) {
      calls.push({ method, path, body });
      if (method === 'DELETE') return null;
      if (path.startsWith('/api/applications/workspace/')) return { id: next++, pages: [{ id: next++, shared: true }] };
      if (method === 'POST' && path.endsWith('/workflow_actions/')) return { id: next++, ...body };
      if (method === 'POST' && path.includes('/pages/')) return { id: next++, ...body };
      return { id: next++, ...body };
    },
  };
}

test('text() quotes formula strings', () => {
  assert.equal(text('Projekte'), "'Projekte'");
  assert.equal(text("it's"), "'it\\'s'");
});

test('builds app, login and pages', async () => {
  const client = fakeClient();
  const { created, app } = await setupApp(client, { workspaceId: 1, tables });
  assert.equal(created, true);
  assert.deepEqual(Object.keys(app.pages), ['anmeldung', 'projekte', 'projekt', 'elemente', 'element']);

  const userSource = client.calls.find((c) => c.path.endsWith('/user-sources/'));
  assert.equal(userSource.body.table_id, tables.benutzer.id);
  assert.equal(userSource.body.role_field_id, tables.benutzer.fields.Rolle);
  assert.equal(userSource.body.auth_providers[0].password_field_id, tables.benutzer.fields.Passwort);

  const loginPage = client.calls.find((c) => c.method === 'PATCH' && c.body?.login_page_id);
  assert.equal(loginPage.body.login_page_id, app.pages.anmeldung.id);

  // Nested lists on element create fail with HTTP 500 at api.baserow.io.
  const elementCreates = client.calls.filter((c) => c.method === 'POST' && c.path.endsWith('/elements/'));
  for (const { body } of elementCreates) {
    assert.ok(!('pages' in body) && !('menu_items' in body) && !('fields' in body), `${body.type}: Liste beim Anlegen`);
  }
  // Every element after the first in a container is placed below its predecessor.
  assert.ok(elementCreates.some((c) => c.body.position === 'south'));
  assert.ok(elementCreates.some((c) => c.body.position === 'child'));

  // Forms that change data are limited to editing roles.
  const forms = elementCreates.filter((c) => c.body.type === 'form_container');
  assert.equal(forms.length, 4);
  for (const { body } of forms) {
    assert.equal(body.role_type, 'disallow_all_except');
    assert.ok(body.roles.every((role) => EDIT_ROLES.includes(role)));
  }

  // Every row action writes to fields that exist.
  const known = new Set(Object.values(tables).flatMap((t) => Object.values(t.fields)));
  const services = client.calls.filter((c) => c.path.startsWith('/api/builder/workflow_action/')).map((c) => c.body.service);
  assert.equal(services.length, 4);
  for (const service of services) {
    for (const mapping of service.field_mappings) assert.ok(known.has(mapping.field_id), `Feld ${mapping.field_id}`);
  }
});

test('leaves an existing app alone unless replace is set', async () => {
  const apps = [{ id: 7, type: 'builder', name: 'Steckbriefe', workspace: { id: 1 } }];
  const keep = fakeClient({ apps });
  assert.equal((await setupApp(keep, { workspaceId: 1, tables })).created, false);
  assert.equal(keep.calls.length, 0);

  const replace = fakeClient({ apps });
  assert.equal((await setupApp(replace, { workspaceId: 1, tables, replace: true })).created, true);
  assert.deepEqual(replace.calls[0], { method: 'DELETE', path: '/api/applications/7/', body: undefined });
});
