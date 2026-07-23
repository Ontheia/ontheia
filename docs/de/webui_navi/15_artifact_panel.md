# Dateikarten & Artefakt-Panel

Dateien erscheinen im Chat als **Karte** statt als Textblock. Ein Klick öffnet das **Artefakt-Panel** — ein Fenster am rechten Bildschirmrand, das den Chat überlagert.

---

## Dateikarte (im Chat)

Erscheint automatisch, sobald ein Agent eine Datei liest oder anlegt. Bleibt nach dem Neuladen erhalten.

```
┌────────────────────────────────────────────┐
│ [Icon]  dateiname.md            [✎ Öffnen] │
│         /pfad/zur/dateiname.md · 5.4 KB    │
└────────────────────────────────────────────┘
```

| Element | Bedeutung |
| --- | --- |
| **Icon links** | Dokument-Symbol bei Textdateien · anderes Symbol bei PDF |
| **Aktion rechts** | Stift = zum Bearbeiten öffnen · Auge = zum Ansehen öffnen (PDF) |
| **Zusatz „Teilansicht"** | Nur ein Ausschnitt geladen (sehr große Datei) — Bearbeiten gesperrt |

---

## Artefakt-Panel (rechter Rand)

```
┌─ ⇔ ────────────────────────────────────────┐
│ dateiname.md   [Bearbeiten|Vorschau]    [×] │
│ /pfad/zur/dateiname.md                      │
│ ┌─────────────────────────────────────────┐ │
│ │                                         │ │
│ │   Editor  oder  Vorschau  oder  PDF     │ │
│ │                                         │ │
│ └─────────────────────────────────────────┘ │
│ sha256 a1b2c3d4e5f6…          [Speichern]   │
└─────────────────────────────────────────────┘
```

| Element | Beschreibung |
| --- | --- |
| **Griff am linken Rand (⇔)** | Panelbreite ziehen; die Breite bleibt gespeichert. Auf Mobilgeräten volle Breite, kein Griff. |
| **Bearbeiten \| Vorschau** | Nur bei Markdown und Mermaid. Vorschau ist die Standardansicht und zeigt immer den aktuellen Editor-Stand. |
| **×** | Panel schließen. Ungespeicherte Änderungen gehen verloren. |
| **sha256-Zeile** | Prüfsumme des zuletzt gelesenen Dateistands. |
| **Speichern** | Nur aktiv, wenn ungespeicherte Änderungen vorliegen. |

Der Composer bleibt über dem Panel bedienbar; das Panel hält den unteren Bereich dafür frei.

### Ansichtsarten nach Dateityp

| Dateityp | Ansicht |
| --- | --- |
| `.md`, `.markdown` | Vorschau (gerendertes Markdown) ↔ Editor |
| `.mmd`, `.mermaid` | Vorschau (gerendertes Diagramm mit Zoom) ↔ Editor |
| `.pdf` | Leseansicht: Seiten scrollen, Zoom-Buttons, Text markierbar und kopierbar. Kein Bearbeiten. Inhalt auf Nachfrage auswertbar (siehe unten). |
| alle anderen Textdateien | Nur Editor, kein Umschalter |

### Speichern und Konflikte

Beim Öffnen liest Ontheia die Datei frisch von der Platte. Beim Speichern wird geprüft, ob sie sich zwischenzeitlich geändert hat:

| Fall | Verhalten |
| --- | --- |
| Datei unverändert | Wird geschrieben, die Vorgängerfassung wandert nach `.trash/` |
| Datei extern geändert | **Roter Hinweis** mit Button **Neu laden** — kein Überschreiben |
| Nur Teilansicht geladen | Editor gesperrt, Speichern nicht möglich |

---

## Entwurf aus einem Codeblock

Jeder Codeblock in einer Antwort — auch ein gerendertes Mermaid-Diagramm — trägt in der Kopfzeile ein **Stift-Symbol**: „Im Panel bearbeiten".

Ablauf: Stift klicken → Inhalt öffnet sich als **Entwurf** im Panel (Titel „Entwurf") → bearbeiten → Pfad in das Eingabefeld am unteren Rand eintragen → **Speichern unter…**

| Situation | Verhalten |
| --- | --- |
| Erfolg | Datei wird angelegt, eine Dateikarte erscheint im Chat, das Panel wechselt in den normalen Datei-Modus |
| Datei existiert bereits | Hinweis „anderen Namen wählen" — vorhandene Datei wird **nicht** überschrieben |
| Pfad außerhalb der erlaubten Verzeichnisse | Hinweis mit Auflistung der erlaubten Wurzelverzeichnisse |
| Panel ohne Speichern geschlossen | Nichts wird angelegt; der Codeblock in der Nachricht bleibt unverändert |

Das Eingabefeld wird mit dem zuletzt verwendeten Verzeichnis vorbelegt.

---

## Was der Agent sieht

- Zu jeder Anfrage erhält der Agent eine kompakte Liste der Dateien dieses Chats (Pfad, Kennung, Prüfsumme) — **nicht** deren Inhalt.
- Nach dem Speichern im Panel bekommt er den geänderten Text **wortgetreu** übermittelt, mit der Vorgabe, ihn nicht umzuformulieren.
- Dateiinhalte lädt er bei Bedarf gezielt nach.

> **Grenze:** Änderungen, die außerhalb von Ontheia am Dateisystem vorgenommen werden, bemerkt der Agent erst, wenn er die Datei erneut liest. In dem Fall ausdrücklich darum bitten.

### PDF-Inhalte

Die Bytes einer PDF sieht der Agent nie — nur Name, Pfad und Größe. Wird nach dem **Inhalt** gefragt, wandelt Ontheia die PDF in Text um und übergibt diesen.

| Frage des Nutzers | Was passiert |
| --- | --- |
| „öffne/zeige die PDF" | Karte im Chat, Leseansicht im Panel — keine Umwandlung |
| „was steht in der PDF …" | Umwandlung in Text, der Agent antwortet inhaltlich |

Die Umwandlung läuft **erst bei der ersten Inhaltsfrage** und wird danach zwischengespeichert; Folgefragen im selben Chat sind ohne Wartezeit. Wird die Datei ausgetauscht, wird automatisch neu ausgewertet.

> **Grenze:** Ausgewertet wird die Textebene. **Eingescannte oder reine Bild-PDFs** haben keine — der Agent meldet dann, dass er den Inhalt nicht lesen kann (dafür wäre OCR nötig). Bei mehrspaltigen Seiten, Diagrammen und Tabellen geht das Layout verloren: Die Angaben sind vollständig, aber anders angeordnet als im Original.
