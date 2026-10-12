/**
 * Data model of the Steckbrief app as Baserow tables.
 *
 * `key` is the stable name used in code; `name` is what users see in Baserow.
 * Link fields reference other tables by `key`. The setup only adds what is
 * missing and never changes or deletes existing fields.
 *
 * Numbering (OZ, GAEB-style): Ebene 2 digits . Thema 2 digits . Element 4 digits
 * . Position 3 digits, e.g. 01.02.0030.010. Thema 99 is reserved for Technikräume.
 */

// Fixed trade colours: Grafik blue, Medien-HW magenta, Licht green. Never red (CI colour).
export const GEWERKE = [
  { value: 'Licht', color: 'green' },
  { value: 'Medien-Hardware', color: 'pink' },
  { value: 'Medien-Software', color: 'orange' },
  { value: 'Grafik', color: 'blue' },
  { value: 'Schnittstelle Gebäude', color: 'gray' },
];

const text = (name) => ({ name, type: 'text' });
const longText = (name) => ({ name, type: 'long_text' });
const bool = (name) => ({ name, type: 'boolean' });
const int = (name) => ({ name, type: 'number', number_decimal_places: 0, number_negative: false });
const decimal = (name, places = 2) => ({ name, type: 'number', number_decimal_places: places, number_negative: false });
const dateTime = (name) => ({ name, type: 'date', date_include_time: true, date_format: 'EU', date_time_format: '24' });
const link = (name, table) => ({ name, type: 'link_row', link: table });
const select = (name, options) => ({ name, type: 'single_select', select_options: options });
const multiSelect = (name, options) => ({ name, type: 'multiple_select', select_options: options });
const file = (name) => ({ name, type: 'file' });
const email = (name) => ({ name, type: 'email' });
const createdOn = (name) => ({ name, type: 'created_on', date_include_time: true, date_format: 'EU', date_time_format: '24' });
const lastModified = (name) => ({ name, type: 'last_modified', date_include_time: true, date_format: 'EU', date_time_format: '24' });

/** One toggle (ja/nein) plus the ATB wish text, for optional trades. */
const gewerk = (name) => [bool(`${name} ja/nein`), longText(name)];

export const TABLES = [
  {
    key: 'projekte',
    name: 'Projekte',
    primary: 'Projektnummer',
    fields: [
      text('Kürzel'),
      text('Name'),
      text('Auftraggeber'),
      text('Phase'),
      select('Status', [
        { value: 'aktiv', color: 'light-green' },
        { value: 'archiviert', color: 'light-gray' },
      ]),
      text('Angelegt von'),
      createdOn('Angelegt am'),
      lastModified('Geändert am'),
    ],
  },
  {
    key: 'ebenen',
    name: 'Ebenen',
    primary: 'OZ', // "01"
    fields: [link('Projekt', 'projekte'), int('Nummer'), text('Name')],
  },
  {
    key: 'themen',
    name: 'Themen',
    primary: 'OZ', // "01.02"
    fields: [link('Ebene', 'ebenen'), int('Nummer'), text('Name')],
  },
  {
    key: 'elemente',
    name: 'Elemente',
    primary: 'OZ', // "01.02.0030"
    fields: [
      link('Projekt', 'projekte'),
      link('Thema', 'themen'),
      int('Elementnummer'),
      select('Typ', [
        { value: 'Station', color: 'light-blue' },
        { value: 'Raum', color: 'light-orange' },
        { value: 'Architektur', color: 'light-gray' },
      ]),
      text('Name'),
      text('Raum, Bereich'),
      longText('Idee, Content'),
      file('Skizze'),
      longText('Funktion, Interaktion'),
      ...gewerk('Artefakt'),
      longText('Bau, Material, wichtige Details'),
      ...gewerk('Medien-Hardware'),
      ...gewerk('Medien-Software'),
      ...gewerk('Licht'),
      ...gewerk('Grafik'),
      ...gewerk('Steuerung'),
      longText('Schnittstelle Gebäude'),
      longText('Wer übernimmt was'),
      text('Plandatei'),
      int('Version'),
      bool('Archiviert'),
      text('Geändert von'),
      lastModified('Geändert am'),
    ],
  },
  {
    key: 'technikraeume',
    name: 'Technikräume',
    primary: 'OZ', // "01.99.0010"
    fields: [link('Ebene', 'ebenen'), int('Nummer'), text('Bezeichnung')],
  },
  {
    key: 'positionen',
    name: 'Positionen',
    primary: 'OZ', // "01.02.0030.010"
    fields: [
      link('Element', 'elemente'),
      link('Technikraum', 'technikraeume'),
      select('Gewerk', GEWERKE),
      int('Positionsnummer'),
      text('Bezeichnung'),
      longText('Typ, Fabrikat, technische Daten'),
      decimal('Menge'),
      text('Einheit'),
      longText('Bemerkung'),
      bool('Gelöscht'),
      text('Geändert von'),
      lastModified('Geändert am'),
    ],
  },
  {
    key: 'team',
    name: 'Team',
    primary: 'Name',
    fields: [
      link('Projekt', 'projekte'),
      text('Benutzer-ID'), // later: Entra ID object id
      email('E-Mail'),
      select('Rolle', [
        { value: 'Projektleitung', color: 'dark-blue' },
        { value: 'Mitarbeitende', color: 'light-blue' },
        { value: 'Fachplaner', color: 'light-gray' },
      ]),
      multiSelect('Gewerke', GEWERKE),
    ],
  },
  {
    key: 'admins',
    name: 'Admins',
    primary: 'Name',
    fields: [text('Benutzer-ID'), email('E-Mail')],
  },
  {
    key: 'verlauf',
    name: 'Verlauf',
    primary: 'Eintrag',
    fields: [
      link('Element', 'elemente'),
      dateTime('Zeitpunkt'),
      text('Person'),
      int('Version'),
      longText('Änderungen'), // JSON: [{ feld, vorher, jetzt }]
    ],
  },
  {
    key: 'staende',
    name: 'Stände',
    primary: 'Bezeichnung',
    fields: [
      link('Projekt', 'projekte'),
      text('Phase'),
      dateTime('Festgeschrieben am'),
      text('Festgeschrieben von'),
      file('Daten'), // frozen project as JSON file
    ],
  },
];
