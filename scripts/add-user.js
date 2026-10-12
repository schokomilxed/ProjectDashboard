#!/usr/bin/env node
// Legt ein Konto für die Steckbrief-App in der Tabelle „Benutzer“ an oder
// aktualisiert es (Schlüssel ist die E-Mail-Adresse).
//   npm run benutzer -- --email a@b.de --name "Vorname Name" --rolle Admin [--passwort …] [--gewerke Licht,Grafik]
// Ohne --passwort wird bei neuen Konten eines erzeugt und einmal angezeigt.
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { loadEnvFile, readConfig } from '../src/config.js';
import { BaserowClient } from '../src/baserow/client.js';
import { ROLES } from '../src/baserow/app.js';

async function main() {
  loadEnvFile();
  const config = readConfig();
  const { values: args } = parseArgs({
    options: {
      email: { type: 'string' },
      name: { type: 'string' },
      rolle: { type: 'string' },
      passwort: { type: 'string' },
      gewerke: { type: 'string' },
      inaktiv: { type: 'boolean', default: false },
    },
  });
  if (!args.email) throw new Error('--email fehlt.');
  if (args.rolle && !ROLES.includes(args.rolle)) throw new Error(`--rolle muss eine von ${ROLES.join(', ')} sein.`);

  const { tables } = JSON.parse(readFileSync(config.tablesFile, 'utf8'));
  if (!tables.benutzer) throw new Error('Tabelle „Benutzer“ fehlt. Zuerst „npm run setup“ ausführen.');
  const client = new BaserowClient(config);

  const email = args.email.trim().toLowerCase();
  const rows = await client.listAllRows(tables.benutzer.id);
  const existing = rows.find((row) => String(row['E-Mail'] ?? '').toLowerCase() === email);

  const values = { 'E-Mail': email, Aktiv: !args.inaktiv };
  if (args.name) values.Name = args.name;
  if (args.rolle) values.Rolle = args.rolle;
  if (args.gewerke) values.Gewerke = args.gewerke.split(',').map((g) => g.trim()).filter(Boolean);
  let generated;
  if (args.passwort) values.Passwort = args.passwort;
  else if (!existing) values.Passwort = generated = randomBytes(12).toString('base64url');

  if (existing) {
    await client.updateRow(tables.benutzer.id, existing.id, values);
    console.log(`Aktualisiert: ${email} (Zeile ${existing.id})`);
  } else {
    if (!args.name || !args.rolle) throw new Error('Für ein neues Konto werden --name und --rolle benötigt.');
    const row = await client.createRow(tables.benutzer.id, values);
    console.log(`Angelegt: ${email} als ${args.rolle} (Zeile ${row.id})`);
  }
  if (generated) console.log(`Erstes Passwort: ${generated}\nBitte nach der ersten Anmeldung in der Tabelle „Benutzer“ ändern.`);
}

main().catch((error) => {
  console.error(`\nFehler: ${error.message}`);
  process.exitCode = 1;
});
