# ProjectDashboard – Steckbriefe Ausstellungsplanung

Datenhaltung der Steckbrief-App in einer eigenen [Baserow](https://baserow.io)-Installation.
Dieser erste Baustein stellt die Verbindung her und legt die Tabellen an. Die Oberfläche folgt später.

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
über den Proxy der Umgebung laufen.

Eigenes oder internes Zertifikat? Dann vor den Befehlen
`export NODE_EXTRA_CA_CERTS=/pfad/zur/ca.pem` setzen.

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
| Verlauf      | Eintrag         | Änderungshistorie je Element (vorher/jetzt als JSON)         |
| Stände       | Bezeichnung     | festgeschriebene Projektstände als JSON-Datei                |

Das vollständige Schema steht in `src/baserow/schema.js`.

## Für die Entwicklung

- `src/baserow/client.js` – Baserow-Client (Zeilen über Token, Schema über Anmeldung,
  Seitenabruf, Stapelverarbeitung, Wiederholung bei kurzen Ausfällen)
- `src/baserow/setup.js` – Abgleich der Datenbank mit dem Schema
- `npm test` – Tests gegen eine nachgebildete Baserow-API (`test/mock-baserow.js`)
