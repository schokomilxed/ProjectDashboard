# ProjectDashboard – Steckbriefe Ausstellungsplanung

Steckbrief-App auf [Baserow](https://baserow.io): Datenhaltung in einer Baserow-Datenbank,
Oberfläche als Anwendung im Baserow Application Builder. Beides wird per Skript angelegt.

Voraussetzung: Node.js 20.12 oder neuer. Weitere Pakete braucht es nicht.

## Einrichtung

1. `.env.example` nach `.env` kopieren und ausfüllen:
   - `BASEROW_URL`: Adresse der Installation, z. B. `https://baserow.atelier-brueckner.de`
   - `BASEROW_EMAIL` / `BASEROW_PASSWORD`: ein Baserow-Konto, das im Workspace Datenbanken anlegen darf
   - `BASEROW_WORKSPACE_ID`: nur nötig, wenn das Konto mehrere Workspaces hat
2. Verbindung prüfen:
   ```sh
   npm run check
   ```
   Hier stehen auch die Workspaces und Datenbanken mit ihren IDs.
3. Erst ansehen, was angelegt würde, dann anlegen:
   ```sh
   npm run setup:dry
   npm run setup
   ```
   Das legt die Datenbank „Steckbriefe“ (oder `BASEROW_DATABASE_NAME`) mit allen Tabellen an
   und schreibt die IDs nach `baserow.tables.json` (wird mit eingecheckt, die App braucht sie). Mehrfaches Ausführen ist unbedenklich:
   Vorhandenes bleibt, wie es ist, nur Fehlendes kommt dazu. Abweichende Feldtypen werden
   gemeldet, aber nicht geändert.
4. In Baserow unter **Einstellungen → Datenbank-Tokens** ein Token für diese Datenbank
   anlegen (Rechte: anlegen, lesen, ändern, löschen), als `BASEROW_DATABASE_TOKEN` eintragen
   und `npm run check` erneut ausführen. Danach `BASEROW_EMAIL` und `BASEROW_PASSWORD`
   wieder aus `.env` entfernen – die App selbst arbeitet nur mit dem Token.

In einer Claude-Code-Cloud-Umgebung braucht Node `NODE_USE_ENV_PROXY=1`, damit die Anfragen
über den Proxy der Umgebung laufen. Liegt das Token dort als „Network secret“ (Header
`Authorization`, Prefix `Token`, Host `api.baserow.io`), zusätzlich `BASEROW_TOKEN_VIA_PROXY=1`
setzen. Der Proxy überschreibt dann jeden Anmelde-Header; `npm run setup` mit E-Mail/Passwort
funktioniert in dieser Umgebung erst wieder, wenn das Secret entfernt ist.

Eigenes oder internes Zertifikat? Dann vor den Befehlen
`export NODE_EXTRA_CA_CERTS=/pfad/zur/ca.pem` setzen.

## Anwendung „Steckbriefe“ (Application Builder)

Erste Ausbaustufe: Anmeldung mit Rollen, Seiten „Projekte“ und „Elemente“ mit Eingabemasken.

1. Konten anlegen (Tabelle „Benutzer“, Schlüssel ist die E-Mail):
   ```sh
   npm run benutzer -- --email name@atelier-brueckner.com --name "Vorname Name" --rolle ATB
   ```
   Ohne `--passwort` wird für neue Konten ein Passwort erzeugt und einmal angezeigt. Ändern
   lässt es sich jederzeit direkt im Feld „Passwort“ der Tabelle. Weitere Optionen:
   `--gewerke Licht,Grafik`, `--inaktiv`.
2. Anwendung aufbauen:
   ```sh
   npm run app            # legt „Steckbriefe“ an, wenn es sie noch nicht gibt
   npm run app -- --neu   # löscht die vorhandene und baut sie neu auf
   ```
   Die IDs stehen danach in `baserow.app.json`. Achtung: `--neu` verwirft alles, was im
   Editor von Hand an der Anwendung geändert wurde.
3. In Baserow die Anwendung öffnen und über **Vorschau** testen. Für eine eigene Adresse unter
   **Einstellungen → Domains** eine Domain anlegen und veröffentlichen.

| Seite      | Pfad           | Inhalt                                                                  |
| ---------- | -------------- | ----------------------------------------------------------------------- |
| Anmeldung  | `/anmeldung`   | E-Mail und Passwort aus der Tabelle „Benutzer“, danach weiter zu Projekte |
| Projekte   | `/projekte`    | Liste aller Projekte, Formular „Neues Projekt“                          |
| Projekt    | `/projekt/:id` | Projekt bearbeiten                                                      |
| Elemente   | `/elemente`    | Liste nach OZ, mit `?projekt=<id>` gefiltert; Formular „Neues Element“  |
| Element    | `/element/:id` | Steckbrief: Eingabemaske mit Kopf, Idee, Gewerken, Bau und Schnittstellen |

Rollen (Feld „Rolle“ in „Benutzer“):

| Rolle      | darf                                                       |
| ---------- | ---------------------------------------------------------- |
| Admin      | alles, als einzige Rolle neue Projekte anlegen             |
| ATB        | Projekte und Elemente bearbeiten, Elemente anlegen         |
| Fachplaner | lesen (Steckbrief als Leseansicht); Positionen folgen      |
| Gast       | lesen                                                      |

Noch offen in dieser Stufe: Skizzen hochladen, Ebenen/Themen und automatische OZ, Versionszähler
und Verlauf beim Speichern, Projektzuordnung über „Team“, Sperre über das Feld „Aktiv“ (bis dahin
ein Konto über Rolle oder Passwort sperren).

## Tabellen

| Tabelle      | Hauptfeld       | Inhalt                                                       |
| ------------ | --------------- | ------------------------------------------------------------ |
| Projekte     | Projektnummer   | Kürzel, Name, Auftraggeber, Phase, Status aktiv/archiviert   |
| Ebenen       | OZ `01`         | 1. Ordnungszahl, je Projekt                                  |
| Themen       | OZ `01.02`      | 2. Ordnungszahl, je Ebene (99 reserviert für Technikräume)   |
| Elemente     | OZ `01.02.0030` | Steckbrief mit allen Feldern, Gewerke mit ja/nein und Wunsch |
| Technikräume | OZ `01.99.0010` | je Ebene, von den Fachplanern angelegt                       |
| Positionen   | OZ `…0030.010`  | Positionen der Fachplaner je Element/Technikraum und Gewerk  |
| Team         | Name            | Projektleitung, Mitarbeitende, Fachplaner mit Gewerken       |
| Admins       | Name            | Personen mit Admin-Rechten                                   |
| Benutzer     | Name            | Konten der App: E-Mail, Passwort, Rolle, Gewerke, aktiv      |
| Verlauf      | Eintrag         | Änderungshistorie je Element (vorher/jetzt als JSON)         |
| Stände       | Bezeichnung     | festgeschriebene Projektstände als JSON-Datei                |

Das vollständige Schema steht in `src/baserow/schema.js`.

## Für die Entwicklung

- `src/baserow/client.js` – Baserow-Client (Zeilen über Token, Schema über Anmeldung,
  Seitenabruf, Stapelverarbeitung, Wiederholung bei kurzen Ausfällen)
- `src/baserow/setup.js` – Abgleich der Datenbank mit dem Schema
- `src/baserow/app.js` – Aufbau der Anwendung im Application Builder (Hinweise zur
  Builder-API stehen oben in der Datei)
- `npm test` – Tests gegen eine nachgebildete Baserow-API (`test/mock-baserow.js`) und
  Prüfung der Aufrufe beim App-Aufbau
