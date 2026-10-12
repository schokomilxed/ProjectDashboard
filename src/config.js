import { existsSync } from 'node:fs';

/** Loads `.env` into process.env if present (existing variables win). */
export function loadEnvFile(path = '.env') {
  if (existsSync(path)) process.loadEnvFile(path);
}

/** Strips trailing slashes and a trailing `/api` so both forms are accepted. */
export function normalizeUrl(url) {
  return String(url ?? '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/api$/, '');
}

function optionalInt(value, name) {
  if (value === undefined || value === '') return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${name} muss eine positive ganze Zahl sein, ist aber "${value}".`);
  }
  return n;
}

export function readConfig(env = process.env) {
  const url = normalizeUrl(env.BASEROW_URL);
  if (!url) throw new Error('BASEROW_URL fehlt. Trage die Adresse deiner Baserow-Installation in .env ein.');
  if (!/^https?:\/\//.test(url)) {
    throw new Error(`BASEROW_URL muss mit http:// oder https:// beginnen, ist aber "${url}".`);
  }

  return {
    url,
    token: env.BASEROW_DATABASE_TOKEN || undefined,
    email: env.BASEROW_EMAIL || undefined,
    password: env.BASEROW_PASSWORD || undefined,
    workspaceId: optionalInt(env.BASEROW_WORKSPACE_ID, 'BASEROW_WORKSPACE_ID'),
    databaseId: optionalInt(env.BASEROW_DATABASE_ID, 'BASEROW_DATABASE_ID'),
    databaseName: env.BASEROW_DATABASE_NAME || 'Steckbriefe',
    tablesFile: env.BASEROW_TABLES_FILE || 'baserow.tables.json',
  };
}
