import { TABLES } from './schema.js';

/**
 * Brings a Baserow database in line with `TABLES`: creates the database,
 * missing tables and missing fields. Existing fields are never altered or
 * deleted; mismatches are reported as warnings instead.
 *
 * @param {import('./client.js').BaserowClient} client  client with email/password
 * @param {{ workspaceId?: number, databaseId?: number, databaseName: string, dryRun?: boolean, tables?: typeof TABLES, log?: (line: string) => void }} options
 * @returns {Promise<{ mapping: object|null, created: string[], warnings: string[] }>}
 */
export async function setupSchema(client, { workspaceId, databaseId, databaseName, dryRun = false, tables = TABLES, log = () => {} }) {
  const created = [];
  const warnings = [];
  const note = (line) => {
    created.push(line);
    log(`${dryRun ? '[Probelauf] würde anlegen' : 'angelegt'}: ${line}`);
  };
  const warn = (line) => {
    warnings.push(line);
    log(`Hinweis: ${line}`);
  };

  await client.login();
  // `null` only in a dry run when the database does not exist yet.
  const database = await resolveDatabase(client, { workspaceId, databaseId, databaseName, dryRun, note });

  // 1. Tables first, so link fields can point to any of them.
  const existingTables = database ? await client.listTables(database.id) : [];
  const tableIds = {};
  for (const table of tables) {
    const found = existingTables.find((t) => t.name === table.name);
    if (found) {
      tableIds[table.key] = found.id;
    } else if (dryRun) {
      note(`Tabelle „${table.name}“`);
    } else {
      const made = await client.createTable(database.id, table.name, table.primary);
      tableIds[table.key] = made.id;
      note(`Tabelle „${table.name}“`);
    }
  }

  // 2. Fields.
  const mapping = { databaseId: database?.id, databaseName: database?.name, tables: {} };
  for (const table of tables) {
    const tableId = tableIds[table.key];
    if (!tableId) {
      for (const field of table.fields) note(`Feld „${table.name}.${field.name}“`);
      continue;
    }

    const fields = await client.listFields(tableId);
    const primary = fields.find((f) => f.primary);
    if (primary && primary.name !== table.primary) {
      warn(`Tabelle „${table.name}“: Hauptfeld heißt „${primary.name}“, erwartet „${table.primary}“.`);
    }

    const fieldIds = {};
    if (primary) fieldIds[table.primary] = primary.id;
    for (const field of table.fields) {
      const found = fields.find((f) => f.name === field.name);
      if (found) {
        if (found.type !== field.type) {
          warn(`Feld „${table.name}.${field.name}“ hat Typ „${found.type}“, erwartet „${field.type}“. Bitte in Baserow prüfen.`);
        } else if (field.type === 'link_row' && tableIds[field.link] && found.link_row_table_id !== undefined
          && found.link_row_table_id !== tableIds[field.link]) {
          warn(`Feld „${table.name}.${field.name}“ verknüpft eine andere Tabelle als „${field.link}“.`);
        }
        fieldIds[field.name] = found.id;
        continue;
      }

      if (field.type === 'link_row' && !tableIds[field.link]) {
        note(`Feld „${table.name}.${field.name}“`); // only possible in a dry run
        continue;
      }
      if (dryRun) {
        note(`Feld „${table.name}.${field.name}“`);
        continue;
      }
      const made = await client.createField(tableId, toBaserowField(field, tableIds));
      fieldIds[field.name] = made.id;
      note(`Feld „${table.name}.${field.name}“`);
    }

    mapping.tables[table.key] = { id: tableId, name: table.name, fields: fieldIds };
  }

  return { mapping: dryRun ? null : mapping, created, warnings };
}

async function resolveDatabase(client, { workspaceId, databaseId, databaseName, dryRun, note }) {
  const databases = (await client.listApplications()).filter((app) => app.type === 'database');
  const workspaceOf = (db) => db.workspace?.id ?? db.group?.id;

  if (databaseId) {
    const db = databases.find((d) => d.id === databaseId);
    if (!db) throw new Error(`Datenbank mit ID ${databaseId} nicht gefunden oder kein Zugriff.`);
    return db;
  }

  const workspaces = await client.listWorkspaces();
  let workspace;
  if (workspaceId) {
    workspace = workspaces.find((w) => w.id === workspaceId);
    if (!workspace) throw new Error(`Workspace mit ID ${workspaceId} nicht gefunden oder kein Zugriff.`);
  } else if (workspaces.length === 1) {
    workspace = workspaces[0];
  } else if (workspaces.length === 0) {
    throw new Error('Der Benutzer hat keinen Workspace. Lege in Baserow zuerst einen an.');
  } else {
    const list = workspaces.map((w) => `  ${w.id}: ${w.name}`).join('\n');
    throw new Error(`Mehrere Workspaces gefunden. Setze BASEROW_WORKSPACE_ID auf einen davon:\n${list}`);
  }

  const existing = databases.find((d) => d.name === databaseName && workspaceOf(d) === workspace.id);
  if (existing) return existing;

  note(`Datenbank „${databaseName}“ im Workspace „${workspace.name}“`);
  if (dryRun) return null;
  return client.createDatabase(workspace.id, databaseName);
}

/** Turns a schema field into the request body Baserow expects. */
export function toBaserowField(field, tableIds) {
  const { link, ...body } = field;
  if (field.type === 'link_row') {
    // `link_row_table_id` since Baserow 1.17, `link_row_table` before.
    body.link_row_table_id = tableIds[link];
    body.link_row_table = tableIds[link];
  }
  return body;
}
