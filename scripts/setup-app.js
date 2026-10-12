#!/usr/bin/env node
// Baut die Anwendung „Steckbriefe“ im Baserow Application Builder auf:
// Anmeldung über die Tabelle „Benutzer“, Seiten Projekte und Elemente.
//   npm run app          legt die Anwendung an, wenn es sie noch nicht gibt
//   npm run app -- --neu löscht eine vorhandene und baut sie neu auf
import { readFileSync, writeFileSync } from 'node:fs';
import { loadEnvFile, readConfig } from '../src/config.js';
import { BaserowClient } from '../src/baserow/client.js';
import { setupApp } from '../src/baserow/app.js';

const APP_FILE = 'baserow.app.json';

async function main() {
  loadEnvFile();
  const config = readConfig();
  const replace = process.argv.includes('--neu');
  const client = new BaserowClient(config);
  const { databaseId, tables } = JSON.parse(readFileSync(config.tablesFile, 'utf8'));

  let workspaceId = config.workspaceId;
  if (!workspaceId) {
    await client.login();
    const database = (await client.listApplications()).find((a) => a.id === databaseId);
    workspaceId = database?.workspace?.id;
    if (!workspaceId) throw new Error('Workspace der Datenbank nicht gefunden. BASEROW_WORKSPACE_ID setzen.');
  }

  console.log(`Baserow: ${config.url}\n`);
  const { created, app } = await setupApp(client, { workspaceId, tables, replace, log: (line) => console.log(`  ${line}`) });
  if (!created) return;

  writeFileSync(APP_FILE, `${JSON.stringify(app, null, 2)}\n`);
  console.log(`\nIDs gespeichert in ${APP_FILE}.`);
  console.log('Nächster Schritt: mit „npm run benutzer“ Konten anlegen, dann die App im Editor in der Vorschau öffnen.');
}

main().catch((error) => {
  console.error(`\nFehler: ${error.message}`);
  process.exitCode = 1;
});
