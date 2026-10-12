#!/usr/bin/env node
// Prüft die Verbindung zur Baserow-Installation: Erreichbarkeit, Datenbank-Token,
// Anmeldung und – falls eingerichtet – den Zugriff auf alle Tabellen.
import { existsSync, readFileSync } from 'node:fs';
import { loadEnvFile, readConfig } from '../src/config.js';
import { BaserowClient } from '../src/baserow/client.js';

const ok = (msg) => console.log(`  ✓ ${msg}`);
const fail = (msg) => console.log(`  ✗ ${msg}`);
const info = (msg) => console.log(`    ${msg}`);

async function main() {
  loadEnvFile();
  const config = readConfig();
  const client = new BaserowClient(config);
  let problems = 0;

  console.log(`Baserow: ${config.url}\n`);

  console.log('1. Erreichbarkeit');
  try {
    const settings = await client.getSettings();
    ok('Server antwortet');
    if (settings?.instance_id) info(`Instanz-ID: ${settings.instance_id}`);
  } catch (error) {
    fail(error.message);
    info('Stimmt die Adresse? Bei eigenem Zertifikat: NODE_EXTRA_CA_CERTS=/pfad/zur/ca.pem setzen.');
    process.exitCode = 1;
    return;
  }

  console.log('\n2. Datenbank-Token');
  if (!client.hasToken) {
    info('nicht gesetzt (BASEROW_DATABASE_TOKEN) – für den Betrieb der App nötig');
    if (await client.request('GET', '/api/database/tokens/check/', { auth: 'none' }).then(() => true, () => false)) {
      info('Ein Proxy hängt aber bereits ein gültiges Token an. Setze BASEROW_TOKEN_VIA_PROXY=1.');
    }
  } else if (await client.checkToken()) {
    ok(client.tokenViaProxy ? 'gültig (vom Proxy angehängt)' : 'gültig');
  } else {
    fail('ungültig oder abgelaufen');
    problems++;
  }

  console.log('\n3. Anmeldung (für die Einrichtung)');
  if (!client.hasLogin) {
    info('nicht gesetzt (BASEROW_EMAIL/BASEROW_PASSWORD) – nur für „npm run setup“ nötig');
  } else {
    try {
      const user = await client.login();
      ok(`angemeldet als ${user?.first_name ?? ''} <${user?.username ?? config.email}>`);
      const workspaces = await client.listWorkspaces();
      const databases = (await client.listApplications()).filter((a) => a.type === 'database');
      for (const ws of workspaces) {
        info(`Workspace ${ws.id}: ${ws.name}`);
        for (const db of databases.filter((d) => (d.workspace?.id ?? d.group?.id) === ws.id)) {
          info(`  Datenbank ${db.id}: ${db.name} (${db.tables?.length ?? 0} Tabellen)`);
        }
      }
    } catch (error) {
      fail(error.message);
      problems++;
    }
  }

  console.log('\n4. Tabellen der App');
  if (!existsSync(config.tablesFile)) {
    info(`${config.tablesFile} fehlt – noch nicht eingerichtet, dann „npm run setup“ ausführen`);
  } else if (!client.hasToken) {
    info('übersprungen, weil kein Datenbank-Token gesetzt ist');
  } else {
    const mapping = JSON.parse(readFileSync(config.tablesFile, 'utf8'));
    info(`Datenbank ${mapping.databaseId}: ${mapping.databaseName}`);
    for (const table of Object.values(mapping.tables)) {
      try {
        const page = await client.listRows(table.id, { size: 1 });
        ok(`${table.name} (${page.count} Zeilen)`);
      } catch (error) {
        fail(`${table.name}: ${error.status === 401 || error.status === 403
          ? 'kein Zugriff – Token-Rechte für diese Datenbank in Baserow prüfen'
          : error.message}`);
        problems++;
      }
    }
  }

  console.log(problems ? `\n${problems} Problem(e) gefunden.` : '\nAlles in Ordnung.');
  if (problems) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`\nFehler: ${error.message}`);
  process.exitCode = 1;
});
