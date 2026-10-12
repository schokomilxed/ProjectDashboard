/**
 * Builds the Steckbrief application in the Baserow Application Builder.
 *
 * Stage 1: login against the table „Benutzer“ (user source with roles),
 * the pages „Projekte“ and „Elemente“ with lists and input forms, and one
 * detail page each to edit a row.
 *
 * Unlike the schema setup, this is not incremental: an existing application
 * with the same name is either left alone or, with `replace`, deleted and
 * built again. Changes made by hand in the editor are lost on `replace`.
 *
 * Notes on the builder API (Baserow 2.4, api.baserow.io):
 * - Element order is a graph: a child is placed with `reference_element_id`
 *   and `position: 'child'`, the next sibling with `position: 'south'`.
 * - Formulas are passed as strings (`"'Text'"`, `"get('page_parameter.id')"`).
 * - Formulas in data sources (`row_id`, filters) are rejected on create and
 *   must be set with a PATCH afterwards.
 * - The menu element and table columns of type `tags` with colour formulas
 *   currently fail with HTTP 500, so the header uses links and a button.
 */

export const APP_NAME = 'Steckbriefe';

/** Roles from the select field Benutzer.Rolle. */
export const ROLES = ['Admin', 'ATB', 'Fachplaner', 'Gast'];
/** Roles that may create and edit. Everyone else reads. */
export const EDIT_ROLES = ['Admin', 'ATB'];
/** Roles that may create projects. */
export const PROJECT_ROLES = ['Admin'];

/** Optional trades on the Steckbrief: toggle „X ja/nein“ plus wish text „X“. */
export const GEWERK_FELDER = ['Artefakt', 'Medien-Hardware', 'Medien-Software', 'Licht', 'Grafik', 'Steuerung'];

/** A string literal in Baserow formula syntax. */
export const text = (value) => `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

const onlyRoles = (roles) => ({ role_type: 'disallow_all_except', roles });
const exceptRoles = (roles) => ({ role_type: 'allow_all_except', roles });

/**
 * Adds elements to one page and keeps track of the last element per
 * container, so consecutive calls end up in the order they are made.
 */
class PageBuilder {
  constructor(api, page) {
    this.api = api;
    this.page = page;
    this.last = new Map(); // `${parentId}:${place}` → last element id
  }

  /**
   * @param {string} type   element type, e.g. 'heading'
   * @param {object} props  element properties
   * @param {{ in?: { id: number }, place?: string }} [where]  container and column (as string)
   */
  async add(type, props = {}, { in: parent, place = '' } = {}) {
    const key = `${parent?.id ?? 'root'}:${place}`;
    const previous = this.last.get(key);
    const position = previous
      ? { reference_element_id: previous, position: 'south', place_in_container: place }
      : parent
        ? { reference_element_id: parent.id, position: 'child', place_in_container: place }
        : {};
    const element = await this.api('POST', `/api/builder/page/${this.page.id}/elements/`, { type, ...position, ...props });
    this.last.set(key, element.id);
    return element;
  }

  heading(value, level = 1, props = {}, where) {
    return this.add('heading', { value: text(value), level, ...props }, where);
  }

  /** Data source. Formula properties are set afterwards, see module notes. */
  async dataSource(type, name, { integrationId, tableId, ...formulas }) {
    const source = await this.api('POST', `/api/builder/page/${this.page.id}/data-sources/`, {
      type,
      name,
      integration_id: integrationId,
      table_id: tableId,
    });
    if (Object.keys(formulas).length) {
      return this.api('PATCH', `/api/builder/data-source/${source.id}/`, formulas);
    }
    return source;
  }

  /** Workflow action; `service` (for row actions) is set with a PATCH. */
  async action(element, event, type, { service, ...props } = {}) {
    const action = await this.api('POST', `/api/builder/page/${this.page.id}/workflow_actions/`, {
      type,
      event,
      element_id: element.id,
      ...props,
    });
    if (service) return this.api('PATCH', `/api/builder/workflow_action/${action.id}/`, { service });
    return action;
  }
}

/**
 * @param {import('./client.js').BaserowClient} client  client with email/password
 * @param {{ workspaceId: number, tables: object, name?: string, replace?: boolean, log?: (line: string) => void }} options
 *   `tables` is the `tables` object from baserow.tables.json.
 * @returns {Promise<{ created: boolean, app: object }>}  `app` holds the ids for baserow.app.json
 */
export async function setupApp(client, { workspaceId, tables, name = APP_NAME, replace = false, log = () => {} }) {
  const api = (method, path, body) => client.request(method, path, { auth: 'jwt', body });
  for (const key of ['benutzer', 'projekte', 'elemente']) {
    if (!tables[key]) throw new Error(`Tabelle „${key}“ fehlt in baserow.tables.json. Zuerst „npm run setup“ ausführen.`);
  }
  const fieldId = (table, field) => {
    const id = tables[table].fields[field];
    if (!id) throw new Error(`Feld „${tables[table].name}.${field}“ fehlt in baserow.tables.json.`);
    return id;
  };
  const F = (table, field) => `field_${fieldId(table, field)}`;

  await client.login();
  const existing = (await client.listApplications()).find(
    (a) => a.type === 'builder' && a.name === name && a.workspace?.id === workspaceId,
  );
  if (existing && !replace) {
    log(`Anwendung „${name}“ gibt es schon (ID ${existing.id}). Neu aufbauen mit --neu.`);
    return { created: false, app: { id: existing.id, name } };
  }
  if (existing) {
    await api('DELETE', `/api/applications/${existing.id}/`);
    log(`gelöscht: Anwendung „${name}“ (ID ${existing.id})`);
  }

  // ------------------------------------------------------------ application
  const app = await api('POST', `/api/applications/workspace/${workspaceId}/`, { type: 'builder', name });
  log(`angelegt: Anwendung „${name}“ (ID ${app.id})`);
  const integration = await api('POST', `/api/application/${app.id}/integrations/`, {
    type: 'local_baserow',
    name: 'Baserow',
  });
  const db = { integrationId: integration.id };

  const userSource = await api('POST', `/api/application/${app.id}/user-sources/`, {
    type: 'local_baserow',
    name: 'Benutzer',
    integration_id: integration.id,
    table_id: tables.benutzer.id,
    email_field_id: fieldId('benutzer', 'E-Mail'),
    name_field_id: fieldId('benutzer', 'Name'),
    role_field_id: fieldId('benutzer', 'Rolle'),
    auth_providers: [{ type: 'local_baserow_password', password_field_id: fieldId('benutzer', 'Passwort') }],
  });
  log('angelegt: Anmeldung über Tabelle „Benutzer“ (Rolle aus Feld „Rolle“)');

  // Pages first, so links can point to any of them.
  const newPage = async (pageName, path, props = {}) => {
    const page = await api('POST', `/api/builder/${app.id}/pages/`, { name: pageName, path, path_params: props.path_params ?? [] });
    const { path_params, ...rest } = props;
    const updated = Object.keys(rest).length ? await api('PATCH', `/api/builder/pages/${page.id}/`, rest) : page;
    log(`angelegt: Seite „${pageName}“ (${path})`);
    return updated;
  };
  const idParam = { path_params: [{ name: 'id', type: 'numeric' }] };
  const pages = {
    anmeldung: await newPage('Anmeldung', '/anmeldung'),
    projekte: await newPage('Projekte', '/projekte', { visibility: 'logged-in' }),
    projekt: await newPage('Projekt', '/projekt/:id', { ...idParam, visibility: 'logged-in', ...onlyRoles(EDIT_ROLES) }),
    elemente: await newPage('Elemente', '/elemente', {
      visibility: 'logged-in',
      query_params: [{ name: 'projekt', type: 'numeric' }],
    }),
    element: await newPage('Element', '/element/:id', { ...idParam, visibility: 'logged-in' }),
  };
  await api('PATCH', `/api/applications/${app.id}/`, { name, login_page_id: pages.anmeldung.id });

  const openPage = (page, { params = [], query = [] } = {}) => ({
    navigation_type: 'page',
    navigate_to_page_id: page.id,
    page_parameters: params,
    query_parameters: query,
    target: 'self',
  });

  // ------------------------------------------------------- shared header
  const shared = app.pages?.find((p) => p.shared) ?? (await api('GET', `/api/applications/${app.id}/`)).pages.find((p) => p.shared);
  {
    const b = new PageBuilder(api, shared);
    // Passing `pages` on create fails with HTTP 500; a PATCH works.
    const header = await b.add('header', { share_type: 'except' });
    await api('PATCH', `/api/builder/element/${header.id}/`, { pages: [pages.anmeldung.id] });
    const row = await b.add('column', { column_amount: 4, alignment: 'center' }, { in: header });
    await b.add('link', { value: text('Projekte'), variant: 'link', ...openPage(pages.projekte) }, { in: row, place: '0' });
    await b.add('link', { value: text('Elemente'), variant: 'link', ...openPage(pages.elemente) }, { in: row, place: '1' });
    await b.add('text', { value: "concat(get('user.username'), ' · ', get('user.role'))" }, { in: row, place: '2' });
    const logout = await b.add('button', { value: text('Abmelden'), visibility: 'logged-in' }, { in: row, place: '3' });
    await b.action(logout, 'click', 'logout');
  }

  // ------------------------------------------------------------- Anmeldung
  {
    const b = new PageBuilder(api, pages.anmeldung);
    await b.heading('Steckbriefe Ausstellungsplanung');
    await b.add('text', { value: text('Bitte mit E-Mail und Passwort anmelden.') });
    const form = await b.add('auth_form', { user_source_id: userSource.id, login_button_label: text('Anmelden') });
    await b.action(form, 'after_login', 'open_page', openPage(pages.projekte));
  }

  // --------------------------------------------------------------- Projekte
  const projektFelder = ['Projektnummer', 'Kürzel', 'Name', 'Auftraggeber', 'Phase'];
  {
    const b = new PageBuilder(api, pages.projekte);
    await b.heading('Projekte');
    const list = await b.dataSource('local_baserow_list_rows', 'Projekte', { ...db, tableId: tables.projekte.id });
    await api('PATCH', `/api/builder/data-source/${list.id}/`, {
      sortings: [{ field: fieldId('projekte', 'Projektnummer'), order_by: 'ASC' }],
    });
    const cell = (field) => `get('current_record.${F('projekte', field)}')`;
    const table = await b.add('table', { data_source_id: list.id, items_per_page: 50 });
    await api('PATCH', `/api/builder/element/${table.id}/`, {
      is_publicly_filterable: true,
      is_publicly_searchable: true,
      is_publicly_sortable: true,
      fields: [
        ...projektFelder.map((field) => ({ name: field, type: 'text', value: cell(field) })),
        { name: 'Status', type: 'text', value: `get('current_record.${F('projekte', 'Status')}.value')` },
        {
          name: 'Elemente',
          type: 'link',
          link_name: text('Elemente'),
          variant: 'link',
          ...openPage(pages.elemente, { query: [{ name: 'projekt', value: "get('current_record.id')" }] }),
        },
        {
          name: 'Bearbeiten',
          type: 'link',
          link_name: text('Bearbeiten'),
          variant: 'link',
          ...openPage(pages.projekt, { params: [{ name: 'id', value: "get('current_record.id')" }] }),
        },
      ],
    });

    // Input form for new projects.
    const visible = onlyRoles(PROJECT_ROLES);
    await b.heading('Neues Projekt', 2, visible);
    const form = await b.add('form_container', {
      submit_button_label: text('Projekt anlegen'),
      reset_initial_values_post_submission: true,
      ...visible,
    });
    const inputs = {};
    for (const field of projektFelder) {
      inputs[field] = await b.add('input_text', { label: text(field), required: field === 'Projektnummer' }, { in: form });
    }
    inputs.Status = await b.add(
      'choice',
      {
        label: text('Status'),
        options: ['aktiv', 'archiviert'].map((v) => ({ name: v, value: v })),
        default_value: text('aktiv'),
        required: true,
      },
      { in: form },
    );
    await b.action(form, 'submit', 'create_row', {
      service: {
        ...rowService(db, tables.projekte.id),
        field_mappings: [
          ...mapForm(inputs, (field) => fieldId('projekte', field)),
          { field_id: fieldId('projekte', 'Angelegt von'), enabled: true, value: "get('user.username')" },
        ],
      },
    });
    await b.action(form, 'submit', 'refresh_data_source', { data_source_id: list.id });
    await b.action(form, 'submit', 'notification', { title: text('Projekt angelegt'), description: '' });
  }

  // ------------------------------------------------------- Projekt (Detail)
  {
    const b = new PageBuilder(api, pages.projekt);
    const row = await b.dataSource('local_baserow_get_row', 'Projekt', {
      ...db,
      tableId: tables.projekte.id,
      row_id: "get('page_parameter.id')",
    });
    const value = (field) => `get('data_source.${row.id}.${F('projekte', field)}')`;
    await b.add('heading', { value: `concat('Projekt ', ${value('Projektnummer')})`, level: 1 });
    await b.add('link', { value: text('← Alle Projekte'), variant: 'link', ...openPage(pages.projekte) });
    const form = await b.add('form_container', { submit_button_label: text('Speichern'), ...onlyRoles(EDIT_ROLES) });
    const inputs = {};
    for (const field of projektFelder) {
      inputs[field] = await b.add(
        'input_text',
        { label: text(field), required: field === 'Projektnummer', default_value: value(field) },
        { in: form },
      );
    }
    inputs.Status = await b.add(
      'choice',
      {
        label: text('Status'),
        options: ['aktiv', 'archiviert'].map((v) => ({ name: v, value: v })),
        default_value: `get('data_source.${row.id}.${F('projekte', 'Status')}.value')`,
        required: true,
      },
      { in: form },
    );
    await b.action(form, 'submit', 'update_row', {
      service: {
        ...rowService(db, tables.projekte.id),
        row_id: "get('page_parameter.id')",
        field_mappings: mapForm(inputs, (field) => fieldId('projekte', field)),
      },
    });
    await b.action(form, 'submit', 'notification', { title: text('Gespeichert'), description: '' });
  }

  // --------------------------------------------------------------- Elemente
  const kopfFelder = ['OZ', 'Name', 'Raum, Bereich'];
  {
    const b = new PageBuilder(api, pages.elemente);
    await b.heading('Elemente');
    const list = await b.dataSource('local_baserow_list_rows', 'Elemente', { ...db, tableId: tables.elemente.id });
    // Without ?projekt=… the filter value is empty and Baserow ignores the filter.
    await api('PATCH', `/api/builder/data-source/${list.id}/`, {
      filters: [
        {
          field: fieldId('elemente', 'Projekt'),
          type: 'link_row_has',
          value: "get('page_parameter.projekt')",
          value_is_formula: true,
        },
      ],
      sortings: [{ field: fieldId('elemente', 'OZ'), order_by: 'ASC' }],
    });
    const projekte = await b.dataSource('local_baserow_list_rows', 'Projektauswahl', {
      ...db,
      tableId: tables.projekte.id,
    });
    await api('PATCH', `/api/builder/data-source/${projekte.id}/`, {
      sortings: [{ field: fieldId('projekte', 'Projektnummer'), order_by: 'ASC' }],
    });

    const table = await b.add('table', { data_source_id: list.id, items_per_page: 50 });
    await api('PATCH', `/api/builder/element/${table.id}/`, {
      is_publicly_filterable: true,
      is_publicly_searchable: true,
      is_publicly_sortable: true,
      fields: [
        { name: 'OZ', type: 'text', value: `get('current_record.${F('elemente', 'OZ')}')` },
        { name: 'Projekt', type: 'text', value: `get('current_record.${F('elemente', 'Projekt')}.0.value')` },
        { name: 'Typ', type: 'text', value: `get('current_record.${F('elemente', 'Typ')}.value')` },
        { name: 'Name', type: 'text', value: `get('current_record.${F('elemente', 'Name')}')` },
        { name: 'Raum, Bereich', type: 'text', value: `get('current_record.${F('elemente', 'Raum, Bereich')}')` },
        { name: 'Version', type: 'text', value: `get('current_record.${F('elemente', 'Version')}')` },
        {
          name: 'Steckbrief',
          type: 'link',
          link_name: text('Öffnen'),
          variant: 'link',
          ...openPage(pages.element, { params: [{ name: 'id', value: "get('current_record.id')" }] }),
        },
      ],
    });

    // Short form: create the element, then continue on its Steckbrief page.
    const visible = onlyRoles(EDIT_ROLES);
    await b.heading('Neues Element', 2, visible);
    const form = await b.add('form_container', { submit_button_label: text('Element anlegen'), ...visible });
    const inputs = {};
    inputs.Projekt = await b.add(
      'record_selector',
      {
        label: text('Projekt'),
        data_source_id: projekte.id,
        required: true,
        default_value: "get('page_parameter.projekt')",
      },
      { in: form },
    );
    inputs.OZ = await b.add(
      'input_text',
      { label: text('OZ'), placeholder: text('01.02.0030'), required: true },
      { in: form },
    );
    inputs.Typ = await b.add('choice', typChoice(), { in: form });
    for (const field of kopfFelder.slice(1)) inputs[field] = await b.add('input_text', { label: text(field) }, { in: form });
    const create = await b.action(form, 'submit', 'create_row', {
      service: {
        ...rowService(db, tables.elemente.id),
        field_mappings: [
          ...mapForm(inputs, (field) => fieldId('elemente', field)),
          { field_id: fieldId('elemente', 'Version'), enabled: true, value: '1' },
          { field_id: fieldId('elemente', 'Geändert von'), enabled: true, value: "get('user.username')" },
        ],
      },
    });
    await b.action(
      form,
      'submit',
      'open_page',
      openPage(pages.element, { params: [{ name: 'id', value: `get('previous_action.${create.id}.id')` }] }),
    );
  }

  // ------------------------------------------------- Element (Steckbrief)
  {
    const b = new PageBuilder(api, pages.element);
    const row = await b.dataSource('local_baserow_get_row', 'Element', {
      ...db,
      tableId: tables.elemente.id,
      row_id: "get('page_parameter.id')",
    });
    const projekte = await b.dataSource('local_baserow_list_rows', 'Projektauswahl', {
      ...db,
      tableId: tables.projekte.id,
    });
    const value = (field) => `get('data_source.${row.id}.${F('elemente', field)}')`;

    await b.add('heading', { value: `concat(${value('OZ')}, ' ', ${value('Name')})`, level: 1 });
    await b.add('text', {
      value: `concat('Version ', ${value('Version')}, ' · zuletzt geändert von ', ${value('Geändert von')})`,
    });
    await b.add('link', { value: text('← Alle Elemente'), variant: 'link', ...openPage(pages.elemente) });

    // Read-only view for roles that may not edit.
    const leseFelder = [
      'Raum, Bereich',
      'Idee, Content',
      'Funktion, Interaktion',
      ...GEWERK_FELDER,
      'Bau, Material, wichtige Details',
      'Schnittstelle Gebäude',
      'Wer übernimmt was',
      'Plandatei',
    ];
    const parts = [
      text('**Typ:** '),
      `get('data_source.${row.id}.${F('elemente', 'Typ')}.value')`,
      ...leseFelder.flatMap((field) => [text(`\n\n**${field}:** `), value(field)]),
    ];
    await b.add('text', { format: 'markdown', value: `concat(${parts.join(', ')})`, ...exceptRoles(EDIT_ROLES) });

    // Eingabemaske (Steckbrief).
    const form = await b.add('form_container', { submit_button_label: text('Speichern'), ...onlyRoles(EDIT_ROLES) });
    const inputs = {};
    const section = (title) => b.heading(title, 3, {}, { in: form });
    const line = (field, props = {}) =>
      b.add('input_text', { label: text(field), default_value: value(field), ...props }, { in: form });
    const area = (field, rows = 4) => line(field, { is_multiline: true, rows });

    await section('Kopf');
    inputs.Projekt = await b.add(
      'record_selector',
      {
        label: text('Projekt'),
        data_source_id: projekte.id,
        required: true,
        default_value: `get('data_source.${row.id}.${F('elemente', 'Projekt')}.0.id')`,
      },
      { in: form },
    );
    inputs.OZ = await line('OZ', { required: true });
    inputs.Typ = await b.add(
      'choice',
      typChoice({ default_value: `get('data_source.${row.id}.${F('elemente', 'Typ')}.value')` }),
      { in: form },
    );
    inputs.Name = await line('Name');
    inputs['Raum, Bereich'] = await line('Raum, Bereich');

    await section('Idee und Funktion');
    inputs['Idee, Content'] = await area('Idee, Content', 6);
    inputs['Funktion, Interaktion'] = await area('Funktion, Interaktion');

    await section('Gewerke');
    for (const gewerk of GEWERK_FELDER) {
      const toggle = `${gewerk} ja/nein`;
      inputs[toggle] = await b.add('checkbox', { label: text(gewerk), default_value: value(toggle) }, { in: form });
      inputs[gewerk] = await area(gewerk, 3);
    }

    await section('Bau und Schnittstellen');
    inputs['Bau, Material, wichtige Details'] = await area('Bau, Material, wichtige Details');
    inputs['Schnittstelle Gebäude'] = await area('Schnittstelle Gebäude', 3);
    inputs['Wer übernimmt was'] = await area('Wer übernimmt was', 3);
    inputs.Plandatei = await line('Plandatei');
    inputs.Archiviert = await b.add(
      'checkbox',
      { label: text('Archiviert'), default_value: value('Archiviert') },
      { in: form },
    );

    await b.action(form, 'submit', 'update_row', {
      service: {
        ...rowService(db, tables.elemente.id),
        row_id: "get('page_parameter.id')",
        field_mappings: [
          ...mapForm(inputs, (field) => fieldId('elemente', field)),
          { field_id: fieldId('elemente', 'Geändert von'), enabled: true, value: "get('user.username')" },
        ],
      },
    });
    await b.action(form, 'submit', 'notification', { title: text('Steckbrief gespeichert'), description: '' });
  }

  return {
    created: true,
    app: {
      id: app.id,
      name,
      integrationId: integration.id,
      userSourceId: userSource.id,
      pages: Object.fromEntries(Object.entries(pages).map(([key, page]) => [key, { id: page.id, path: page.path }])),
    },
  };
}

function rowService({ integrationId }, tableId) {
  return { integration_id: integrationId, table_id: tableId };
}

/** Maps each form input to its table field: `{ Feld: element }` → field_mappings. */
function mapForm(inputs, fieldIdOf) {
  return Object.entries(inputs).map(([field, element]) => ({
    field_id: fieldIdOf(field),
    enabled: true,
    value: `get('form_data.${element.id}')`,
  }));
}

function typChoice(props = {}) {
  return {
    label: text('Typ'),
    options: ['Station', 'Raum', 'Architektur'].map((v) => ({ name: v, value: v })),
    ...props,
  };
}
