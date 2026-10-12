#!/usr/bin/env node
// Legt Datenbank, Tabellen und Felder der Steckbrief-App in Baserow an.
// Mehrfach ausführbar: Vorhandenes bleibt unverändert, nur Fehlendes kommt dazu.
//   npm run setup:dry   zeigt nur, was angelegt würde
//   npm run setup       legt an und schreibt baserow.tables.json
import { writeFileSync } from 'node:fs';
import { loadEnvFile, readConfig } from '../src/config.js';
import { BaserowClient } from '../src/baserow/client.js';
import { setupSchema } from '../src/baserow/setup.js';

async function main() {
  loadEnvFile();
  const config = readConfig();
  const dryRun = process.argv.includes('--dry-run');
  const client = new BaserowClient(config);

  console.log(`Baserow: ${config.url}${dryRun ? ' (Probelauf, es wird nichts geändert)' : ''}\n`);
  const { mapping, created, warnings } = await setupSchema(client, {
    workspaceId: config.workspaceId,
    databaseId: config.databaseId,
    databaseName: config.databaseName,
    dryRun,
    log: (line) => console.log(`  ${line}`),
  });

  if (!created.length) console.log('  Alles schon vorhanden.');
  if (mapping) {
    writeFileSync(config.tablesFile, `${JSON.stringify(mapping, null, 2)}\n`);
    console.log(`\nTabellen-IDs gespeichert in ${config.tablesFile}.`);
  }
  console.log(`\n${created.length} ${dryRun ? 'würden angelegt' : 'angelegt'}, ${warnings.length} Hinweis(e).`);
  if (!dryRun && created.length) {
    console.log('Nächster Schritt: Datenbank-Token für diese Datenbank anlegen und „npm run check“ ausführen.');
  }
}

main().catch((error) => {
  console.error(`\nFehler: ${error.message}`);
  process.exitCode = 1;
});
