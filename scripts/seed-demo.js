#!/usr/bin/env node
// Füllt die Datenbank mit Beispieldaten zum Ausprobieren der App.
//   npm run beispieldaten               legt die Beispieldaten an (nur wenn noch keine da sind)
//   npm run beispieldaten -- --neu      löscht vorhandene Beispieldaten und legt sie neu an
//   npm run beispieldaten -- --loeschen entfernt alle Beispieldaten
// Beispielprojekte erkennt man an „DEMO-“ in der Projektnummer, Beispielkonten an
// der Adresse @demo.example.com. Echte Daten werden nie angefasst.
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { loadEnvFile, readConfig } from '../src/config.js';
import { BaserowClient } from '../src/baserow/client.js';

const PREFIX = 'DEMO-';
const DEMO_DOMAIN = '@demo.example.com';

// ------------------------------------------------------------------- Inhalte

const PROJEKTE = [
  {
    Projektnummer: 'DEMO-2401',
    Kürzel: 'SMB',
    Name: 'Stadtmuseum Beispielstadt – Neue Dauerausstellung',
    Auftraggeber: 'Stadt Beispielstadt, Kulturamt',
    Phase: 'LPH 3 Entwurf',
    Status: 'aktiv',
    ebenen: [
      {
        Name: 'Erdgeschoss – Ankommen und Frühe Stadt',
        technikraum: 'Medientechnik EG, Raum 0.14',
        themen: [
          {
            Name: 'Ankommen',
            elemente: [
              ['Raum', 'Foyer mit Stadtmodell', 'Foyer', 'Großes Stadtmodell im Maßstab 1:500 als Einstieg. Besucher verorten sich und finden die Stationen der Ausstellung.', 'Umlaufbar, Projektion auf das Modell zeigt das Wachstum der Stadt in fünf Epochen.', { Artefakt: 'Historisches Stadtmodell aus dem Depot, restauriert', 'Medien-Hardware': 'Projektor von oben, 2 Stück, Edge-Blending', 'Medien-Software': 'Projektionsmapping, 5 Epochen à 60 s, Loop', Licht: 'Grundlicht gedimmt, Akzentlicht Modellkante', Grafik: 'Orientierungsplan, Wandtitel' }, 'Vitrine Glas ESG 12 mm, Sockel MDF lackiert RAL 9016'],
              ['Station', 'Begrüßung und Leitsystem', 'Foyer, Kasse', 'Erste Orientierung: Was erwartet mich, wie lange dauert der Rundgang?', 'Statisch, mehrsprachig (DE/EN/Leichte Sprache).', { Grafik: 'Begrüßungstext, Piktogramme, Raumplan' }, 'Wandabwicklung Dibond, direkt verklebt'],
            ],
          },
          {
            Name: 'Gründung und Mittelalter',
            elemente: [
              ['Station', 'Die Gründungsurkunde', 'Raum 0.02', 'Original der Urkunde von 1238, daneben Transkription und Übersetzung.', 'Lupe zum Heranzoomen am Touchscreen, Vorlesefunktion.', { Artefakt: 'Gründungsurkunde, Leihgabe Stadtarchiv, Klimavitrine', 'Medien-Hardware': 'Touchscreen 24", in Pult eingebaut', 'Medien-Software': 'Zoom-Anwendung mit Transkription, 3 Sprachen', Licht: 'max. 50 lx auf Objekt, UV-frei', Grafik: 'Objekttext, Zeitstrahl' }, 'Klimavitrine mit Feuchtepuffer, Pult Eiche geölt'],
              ['Station', 'Stadtmauer zum Anfassen', 'Raum 0.02', 'Originalsteine der Stadtmauer, Werkzeuge der Steinmetze.', 'Hands-on: Steine heben, Werkzeugspuren ertasten.', { Artefakt: '3 Mauersteine aus Grabungsfund 1998', Licht: 'Streiflicht zur Betonung der Oberflächen', Grafik: 'Taktile Grafik, Brailleschrift' }, 'Sockel Stahl geschwärzt, Steine gesichert'],
              ['Architektur', 'Durchgang Stadttor', 'Übergang Raum 0.02 / 0.03', 'Inszenierter Durchgang als Torbogen, akustischer Wechsel ins Marktgeschehen.', 'Bewegungsmelder startet Klangkulisse.', { 'Medien-Hardware': 'Richtlautsprecher 2 Stück, Bewegungsmelder', 'Medien-Software': 'Klangkulisse Markt, 90 s', Steuerung: 'Auslösung über Bewegungsmelder, Zeitsperre 2 min', Licht: 'Lichtwechsel kalt/warm beim Durchschreiten' }, 'Torbogen Holzkonstruktion, Oberfläche Putz strukturiert'],
            ],
          },
          {
            Name: 'Handel und Hanse',
            elemente: [
              ['Station', 'Waage und Maße', 'Raum 0.03', 'Historische Marktwaage, Spiel: Was kostet ein Pfund Salz?', 'Mechanisches Hands-on mit Gewichten, Ergebnisanzeige analog.', { Artefakt: 'Marktwaage 16. Jh. (Replik für Hands-on)', Grafik: 'Spielanleitung, Preistabelle' }, 'Robuste Ausführung, Gewichte an Stahlseil gesichert'],
              ['Station', 'Handelsrouten', 'Raum 0.03', 'Karte der Handelswege, Waren aus aller Welt.', 'Touchtisch: Waren auf Routen ziehen, Reisedauer erfahren.', { 'Medien-Hardware': 'Touchtisch 55", 4K', 'Medien-Software': 'Interaktive Karte, Mehrbenutzer', Licht: 'Blendfreies Umgebungslicht über Tisch', Grafik: 'Tischrahmen, Legende' }, 'Tischkorpus MDF, Kanten Massivholz'],
            ],
          },
        ],
      },
      {
        Name: 'Obergeschoss – Stadt im Wandel',
        technikraum: 'Medientechnik OG, Raum 1.08',
        themen: [
          {
            Name: 'Industrialisierung',
            elemente: [
              ['Raum', 'Fabrikhalle', 'Raum 1.01', 'Raumbild einer Textilfabrik um 1890, Lärm und Enge erfahrbar.', 'Webstuhl wird stündlich in Gang gesetzt, Zeitzeugenstimmen.', { Artefakt: 'Webstuhl 1885, funktionsfähig', 'Medien-Hardware': 'Lautsprecher 6 Stück, Mediaplayer', 'Medien-Software': 'Zeitzeugen-Audio, 8 Spuren', Licht: 'Oberlicht-Simulation, tageslichtweiß', Steuerung: 'Showsteuerung, Zeitplan stündlich' }, 'Boden Industrieparkett, Wandverkleidung Ziegeloptik'],
              ['Station', 'Arbeiterwohnung', 'Raum 1.02', 'Wohnküche einer Arbeiterfamilie, 6 Personen auf 20 m².', 'Begehbar bis zur Absperrung, Hörstationen.', { Artefakt: 'Möbel und Hausrat aus Sammlung', 'Medien-Hardware': 'Hörstation 2 Stück', Licht: 'Petroleumlicht-Imitation, 2200 K', Grafik: 'Grundriss, Familienbiografie' }, 'Absperrung Messing, Bodenbelag Dielen'],
            ],
          },
          {
            Name: 'Stadt heute',
            elemente: [
              ['Station', 'Meine Stadt – Mitmachwand', 'Raum 1.05', 'Besucher hinterlassen Wünsche für die Zukunft der Stadt.', 'Eingabe am Terminal, Anzeige auf großer LED-Wand, Moderation durch Museum.', { 'Medien-Hardware': 'LED-Wand 4 × 2 m, Terminal 2 Stück', 'Medien-Software': 'Eingabe, Moderations-Backend, Anzeige', Steuerung: 'Ein/Aus über Haustechnik-Zeitplan', Grafik: 'Wandtitel, Anleitung' }, 'Unterkonstruktion LED-Wand Aluprofil'],
              ['Station', 'Abschlussfilm', 'Raum 1.06', 'Kurzfilm 6 min, Stadtentwicklung im Zeitraffer.', 'Sitzstufen, Film läuft im Loop.', { 'Medien-Hardware': 'Laserprojektor, Leinwand 5 m, Soundbar', 'Medien-Software': 'Film 6 min, Untertitel DE/EN', Licht: 'Raum abdunkelbar, Orientierungslicht Stufen' }, 'Sitzstufen Holz, Akustikvorhang'],
            ],
          },
        ],
      },
    ],
  },
  {
    Projektnummer: 'DEMO-2402',
    Kürzel: 'SCN',
    Name: 'Science Center Nord – Wechselausstellung Energie',
    Auftraggeber: 'Science Center Nord gGmbH',
    Phase: 'LPH 2 Vorentwurf',
    Status: 'aktiv',
    ebenen: [
      {
        Name: 'Ausstellungshalle',
        technikraum: 'Technikraum Halle',
        themen: [
          {
            Name: 'Was ist Energie?',
            elemente: [
              ['Station', 'Strom selbst erzeugen', 'Halle, Zone A', 'Fahrradgenerator: Wie viel Energie braucht ein Föhn?', 'Treten, Leistung wird live angezeigt, Geräte schalten zu.', { 'Medien-Hardware': 'Leistungsanzeige 32", Messtechnik', 'Medien-Software': 'Anzeige Watt/Joule, Vergleichsgeräte', Steuerung: 'SPS für Gerätezuschaltung' }, 'Fahrrad fest verankert, Gehäuse Edelstahl'],
              ['Station', 'Energie-Formen', 'Halle, Zone A', 'Fünf Experimente zu Lage-, Bewegungs-, Wärme-, Licht- und elektrischer Energie.', 'Hands-on-Tische, je ein Experiment.', { Grafik: 'Experimentanleitungen, Formeln', Licht: 'Arbeitslicht auf Tische' }, 'Modulare Experimenttische'],
            ],
          },
          {
            Name: 'Energie speichern',
            elemente: [
              ['Station', 'Pumpspeicher im Modell', 'Halle, Zone B', 'Wasser hochpumpen, später Strom zurückgewinnen.', 'Kurbel und Ventil, Füllstand sichtbar.', { Artefakt: 'Funktionsmodell Pumpspeicherwerk (Neubau)', Licht: 'Hinterleuchtung Wasserbehälter', Grafik: 'Schnittzeichnung Kraftwerk' }, 'Acrylbehälter, Auffangwanne'],
              ['Station', 'Batterie-Labor', 'Halle, Zone B', 'Zitronenbatterie bis Lithium-Akku.', 'Messgeräte ablesen, Zellen in Reihe schalten.', { 'Medien-Hardware': 'Bildschirm 43" mit Erklärfilm', 'Medien-Software': 'Erklärfilm 3 min', Grafik: 'Zellaufbau als Explosionsgrafik' }, 'Labortisch mit Säurewanne'],
            ],
          },
          {
            Name: 'Energiewende',
            elemente: [
              ['Raum', 'Stadt der Zukunft', 'Halle, Zone C', 'Begehbares Stadtmodell mit Wind, Sonne und Speicher.', 'Besucher steuern Wetter und Verbrauch, das Netz muss stabil bleiben.', { 'Medien-Hardware': 'Projektion auf Modell, 3 Bedienpulte', 'Medien-Software': 'Netzsimulation, Mehrspieler', Licht: 'Tag-Nacht-Simulation', Steuerung: 'Showsteuerung, Reset nach 10 min' }, 'Modell auf Podest, Kantenschutz'],
            ],
          },
        ],
      },
    ],
  },
  {
    Projektnummer: 'DEMO-2303',
    Kürzel: 'BMR',
    Name: 'Burgmuseum – Sonderausstellung Ritter',
    Auftraggeber: 'Burgverein e. V.',
    Phase: 'LPH 8 abgeschlossen',
    Status: 'archiviert',
    ebenen: [
      {
        Name: 'Rittersaal',
        themen: [
          {
            Name: 'Rüstung und Waffen',
            elemente: [
              ['Station', 'Rüstung anprobieren', 'Rittersaal', 'Kinder probieren Helm und Kettenhemd (Repliken).', 'Spiegel, Foto-Ecke.', { Artefakt: 'Repliken Helm, Kettenhemd, Schild', Grafik: 'Gewichtsangaben, Fotohintergrund' }, 'Garderobenständer, Spiegel bruchsicher'],
              ['Station', 'Turnierfilm', 'Rittersaal', 'Kurzfilm Turnier 1490.', 'Loop, Sitzbank.', { 'Medien-Hardware': 'Bildschirm 65"', 'Medien-Software': 'Film 4 min' }, 'Wandhalterung, Kabelkanal'],
            ],
          },
        ],
      },
    ],
  },
];

// Positionen je Gewerk: [Bezeichnung, Typ/Fabrikat, Menge, Einheit]
const POSITIONEN = {
  Licht: [
    ['LED-Strahler Stromschiene', 'z. B. ERCO Optec, 3000 K, CRI 95, 12 W, Spot', 4, 'Stk'],
    ['Stromschiene 3-Phasen', 'weiß, inkl. Einspeisung', 6, 'm'],
  ],
  'Medien-Hardware': [
    ['Mediaplayer', 'Industrie-PC, lüfterlos, 4K-Ausgang', 1, 'Stk'],
    ['Lautsprecher aktiv', 'Kompaktlautsprecher, Wandmontage', 2, 'Stk'],
  ],
  'Medien-Software': [['Medienproduktion', 'Konzept, Gestaltung, Programmierung', 1, 'psch']],
  Grafik: [
    ['Wandgrafik', 'Digitaldruck auf Folie, matt laminiert', 3.5, 'm²'],
    ['Objektschild', 'Dibond 3 mm, A5', 4, 'Stk'],
  ],
};
const TECHNIKRAUM_POSITIONEN = [
  ['Medienrack 19"', '42 HE, belüftet, abschließbar', 1, 'Stk', 'Medien-Hardware'],
  ['USV', '3 kVA, Online, Rackeinbau', 1, 'Stk', 'Medien-Hardware'],
  ['Unterverteilung Licht', 'DALI-Steuerung, 4 Linien', 1, 'Stk', 'Licht'],
  ['Netzwerk-Switch', '24 Port PoE+, managed', 1, 'Stk', 'Schnittstelle Gebäude'],
];

const DEMO_KONTEN = [
  { Name: 'Anna Beispiel (Demo)', 'E-Mail': `anna.atb${DEMO_DOMAIN}`, Rolle: 'ATB', Gewerke: [], team: 'Mitarbeitende' },
  { Name: 'Lukas Licht (Demo)', 'E-Mail': `lukas.licht${DEMO_DOMAIN}`, Rolle: 'Fachplaner', Gewerke: ['Licht'], team: 'Fachplaner' },
  { Name: 'Mia Medien (Demo)', 'E-Mail': `mia.medien${DEMO_DOMAIN}`, Rolle: 'Fachplaner', Gewerke: ['Medien-Hardware', 'Medien-Software'], team: 'Fachplaner' },
  { Name: 'Gerd Gast (Demo)', 'E-Mail': `gerd.gast${DEMO_DOMAIN}`, Rolle: 'Gast', Gewerke: [] },
];

const BEARBEITER = ['Anna Beispiel (Demo)', 'Bjoern Mueller-Weippert'];

// --------------------------------------------------------------------- Ablauf

const pad = (n, width) => String(n).padStart(width, '0');
const ids = (rows) => rows.map((r) => r.id);
const linked = (row, field) => (row[field] ?? []).map((l) => l.id);

async function main() {
  loadEnvFile();
  const config = readConfig();
  const args = process.argv.slice(2);
  const { tables: T } = JSON.parse(readFileSync(config.tablesFile, 'utf8'));
  const client = new BaserowClient(config);

  const removed = await findDemo(client, T);
  const count = Object.values(removed).reduce((n, list) => n + list.length, 0);

  if (args.includes('--loeschen') || args.includes('--neu')) {
    await removeDemo(client, T, removed);
    console.log(`Beispieldaten entfernt (${count} Zeilen).`);
    if (args.includes('--loeschen')) return;
  } else if (removed.projekte.length) {
    console.log('Es gibt schon Beispieldaten. Neu anlegen mit „--neu“, entfernen mit „--loeschen“.');
    return;
  }

  await createDemo(client, T);
}

/** Collects all demo rows, starting from projects with the DEMO- prefix. */
async function findDemo(client, T) {
  const all = async (key) => client.listAllRows(T[key].id);
  const projekte = (await all('projekte')).filter((r) => String(r.Projektnummer).startsWith(PREFIX));
  const projektIds = new Set(ids(projekte));
  const inProjekt = (row) => linked(row, 'Projekt').some((id) => projektIds.has(id));

  const ebenen = (await all('ebenen')).filter(inProjekt);
  const ebenenIds = new Set(ids(ebenen));
  const inEbene = (row) => linked(row, 'Ebene').some((id) => ebenenIds.has(id));
  const themen = (await all('themen')).filter(inEbene);
  const technikraeume = (await all('technikraeume')).filter(inEbene);
  const elemente = (await all('elemente')).filter(inProjekt);
  const elementIds = new Set(ids(elemente));
  const raumIds = new Set(ids(technikraeume));
  const positionen = (await all('positionen')).filter(
    (r) => linked(r, 'Element').some((id) => elementIds.has(id)) || linked(r, 'Technikraum').some((id) => raumIds.has(id)),
  );
  const verlauf = (await all('verlauf')).filter((r) => linked(r, 'Element').some((id) => elementIds.has(id)));
  const team = (await all('team')).filter(inProjekt);
  const benutzer = (await all('benutzer')).filter((r) => String(r['E-Mail'] ?? '').endsWith(DEMO_DOMAIN));
  return { positionen, verlauf, elemente, technikraeume, themen, ebenen, team, projekte, benutzer };
}

async function removeDemo(client, T, found) {
  for (const [key, rows] of Object.entries(found)) {
    if (rows.length) await client.deleteRows(T[key].id, ids(rows));
  }
}

async function createDemo(client, T) {
  const create = (key, rows) => (rows.length ? client.createRows(T[key].id, rows) : []);
  const stats = {};
  const add = (key, rows) => {
    stats[key] = (stats[key] ?? 0) + rows.length;
    return rows;
  };

  // Accounts: demo users plus the existing admin(s).
  const passwort = randomBytes(9).toString('base64url');
  const konten = add(
    'benutzer',
    await create(
      'benutzer',
      DEMO_KONTEN.map(({ team, ...k }) => ({ ...k, Passwort: passwort, Aktiv: true })),
    ),
  );
  const admins = (await client.listAllRows(T.benutzer.id)).filter((r) => r.Rolle?.value === 'Admin');

  let bearbeitet = 0;
  for (const projekt of PROJEKTE) {
    const { ebenen, ...felder } = projekt;
    const [p] = add('projekte', await create('projekte', [{ ...felder, 'Angelegt von': admins[0]?.Name ?? '' }]));

    // Team
    add(
      'team',
      await create('team', [
        ...admins.map((a) => ({ Name: a.Name, Projekt: [p.id], Benutzer: [a.id], 'E-Mail': a['E-Mail'], Rolle: 'Projektleitung' })),
        ...DEMO_KONTEN.filter((k) => k.team).map((k) => {
          const konto = konten.find((x) => x['E-Mail'] === k['E-Mail']);
          return { Name: k.Name, Projekt: [p.id], Benutzer: [konto.id], 'E-Mail': k['E-Mail'], Rolle: k.team, Gewerke: k.Gewerke };
        }),
      ]),
    );

    for (const [ei, ebene] of ebenen.entries()) {
      const ebenenOz = pad(ei + 1, 2);
      const [e] = add('ebenen', await create('ebenen', [{ OZ: ebenenOz, Projekt: [p.id], Nummer: ei + 1, Name: ebene.Name }]));

      if (ebene.technikraum) {
        const [raum] = add(
          'technikraeume',
          await create('technikraeume', [{ OZ: `${ebenenOz}.99.0010`, Ebene: [e.id], Nummer: 10, Bezeichnung: ebene.technikraum }]),
        );
        add(
          'positionen',
          await create(
            'positionen',
            TECHNIKRAUM_POSITIONEN.map(([Bezeichnung, typ, Menge, Einheit, Gewerk], i) => ({
              OZ: `${raum.OZ}.${pad((i + 1) * 10, 3)}`,
              Technikraum: [raum.id],
              Gewerk,
              Positionsnummer: (i + 1) * 10,
              Bezeichnung,
              'Typ, Fabrikat, technische Daten': typ,
              Menge,
              Einheit,
            })),
          ),
        );
      }

      for (const [ti, thema] of ebene.themen.entries()) {
        const themenOz = `${ebenenOz}.${pad(ti + 1, 2)}`;
        const [t] = add('themen', await create('themen', [{ OZ: themenOz, Ebene: [e.id], Nummer: ti + 1, Name: thema.Name }]));

        const rows = thema.elemente.map(([Typ, Name, raum, idee, funktion, gewerke, bau], i) => {
          const nummer = (i + 1) * 10;
          const version = 1 + ((bearbeitet + i) % 3);
          const row = {
            OZ: `${themenOz}.${pad(nummer, 4)}`,
            Projekt: [p.id],
            Thema: [t.id],
            Elementnummer: nummer,
            Typ,
            Name,
            'Raum, Bereich': raum,
            'Idee, Content': idee,
            'Funktion, Interaktion': funktion,
            'Bau, Material, wichtige Details': bau,
            'Schnittstelle Gebäude': gewerke['Medien-Hardware'] || gewerke.Licht ? 'Strom 230 V am Element, Netzwerk Cat 7 aus Technikraum' : '',
            'Wer übernimmt was': 'ATB: Gestaltung, Ausschreibung. Fachplaner: Ausführungsplanung je Gewerk.',
            Plandatei: `${projekt.Kürzel}_${themenOz}.${pad(nummer, 4)}_Ansicht.pdf`,
            Version: version,
            Archiviert: projekt.Status === 'archiviert',
            'Geändert von': BEARBEITER[(bearbeitet + i) % BEARBEITER.length],
          };
          for (const [gewerk, wunsch] of Object.entries(gewerke)) {
            row[`${gewerk} ja/nein`] = true;
            row[gewerk] = wunsch;
          }
          return row;
        });
        const elemente = add('elemente', await create('elemente', rows));
        bearbeitet += rows.length;

        // Positions of the specialist planners, per trade wish.
        const positionen = [];
        for (const [i, el] of elemente.entries()) {
          let n = 0;
          for (const gewerk of Object.keys(thema.elemente[i][5])) {
            for (const [Bezeichnung, typ, Menge, Einheit] of POSITIONEN[gewerk] ?? []) {
              n += 10;
              positionen.push({
                OZ: `${el.OZ}.${pad(n, 3)}`,
                Element: [el.id],
                Gewerk: gewerk,
                Positionsnummer: n,
                Bezeichnung,
                'Typ, Fabrikat, technische Daten': typ,
                Menge,
                Einheit,
                'Geändert von': gewerk === 'Licht' ? 'Lukas Licht (Demo)' : 'Mia Medien (Demo)',
              });
            }
          }
        }
        add('positionen', await create('positionen', positionen));

        // History for elements beyond version 1.
        const verlauf = elemente
          .filter((el) => Number(el.Version) > 1)
          .map((el) => ({
            Eintrag: `${el.OZ} v${el.Version}`,
            Element: [el.id],
            Zeitpunkt: new Date(Date.now() - 86400000 * Number(el.Version)).toISOString(),
            Person: el['Geändert von'],
            Version: Number(el.Version),
            Änderungen: JSON.stringify([{ feld: 'Idee, Content', vorher: 'Erster Entwurf', jetzt: el['Idee, Content'] }]),
          }));
        add('verlauf', await create('verlauf', verlauf));
      }
    }
  }

  console.log('Beispieldaten angelegt:');
  for (const [key, n] of Object.entries(stats)) console.log(`  ${T[key].name}: ${n}`);
  console.log(`\nDemo-Konten (Passwort für alle: ${passwort}):`);
  for (const k of DEMO_KONTEN) console.log(`  ${k['E-Mail']}  ${k.Rolle}${k.Gewerke.length ? ` (${k.Gewerke.join(', ')})` : ''}`);
}

main().catch((error) => {
  console.error(`\nFehler: ${error.message}`);
  process.exitCode = 1;
});
