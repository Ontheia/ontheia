# Der Composer (Eingabebereich)

Im Composer konfigurierst du deinen Run, bevor du die Nachricht abschickst.

## 1. Selektoren (Picker)
Bevor du eine Nachricht sendest, wählst du aus, wer antworten soll:
- **Agent oder Provider:** Wähle eine spezialisierte KI-Persona oder einen direkten AI-Provider (z. B. OpenAI).
- **Task oder Chain:** Wähle eine spezifische Aufgabe (Task) oder einen mehrstufigen Workflow (Chain) aus.
- **Vorauswahl:** Ontheia merkt sich deine letzte Auswahl für neue Chats. Du kannst diese Voreinstellung in deinen Benutzereinstellungen dauerhaft ändern.
- **Pro Chat gespeichert:** Innerhalb eines bestehenden Chats wird deine Auswahl für genau diesen Chat gespeichert und bleibt auch nach einem Chat-Wechsel oder Neuladen der Seite erhalten. Wechselst du dabei zu einem Agenten, übernimmt Ontheia automatisch dessen vom Administrator konfigurierte Tool-Freigabe (siehe Abschnitt 3) für diesen Chat — eine zuvor manuell gesetzte Freigabe wird dadurch überschrieben. Wechselst du stattdessen zu einem Provider, bleibt die aktuelle Tool-Freigabe unverändert.

## 2. Text-Eingabe
Das Eingabefeld unterstützt mehrzeiligen Text. 
- **Senden:** Drücke `Enter` zum Absenden oder `Shift + Enter` für einen Zeilenumbruch.
- **Abbruch:** Während ein Run läuft, verwandelt sich der Senden-Button in einen **Stop-Button**, mit dem du die Generierung sofort abbrechen kannst.
- **Parallele Runs:** Du kannst während eines laufenden Runs in einen anderen Chat wechseln und dort einen neuen Run starten. Jeder Chat führt seinen Run unabhängig fort. Der Streaming-Empfang wird beim Zurückwechseln automatisch wiederaufgenommen. Laufende Runs werden in der linken Sidebar mit einem blauen Spinner markiert.

## 3. Tool-Freigabe (Sicherheit)
Wenn ein Agent eine Aktion ausführen möchte (z. B. eine E-Mail senden oder im Kalender lesen), erscheint bei entsprechender Konfiguration ein **Freigabe-Banner** direkt über dem Eingabefeld.

- **Details:** Du siehst genau, welches Werkzeug (Tool) der Agent nutzen möchte und welche Daten (Argumente) er dabei übermittelt.
- **Entscheidung:**
    - **Einmalig erlauben:** Der Agent darf diese eine Aktion ausführen und macht danach weiter.
    - **Ablehnen:** Die Aktion wird blockiert. Der Agent erhält eine Fehlermeldung und versucht meist, die Aufgabe ohne dieses Tool zu lösen oder bricht ab.
    - **Immer erlauben:** (Nur falls verfügbar) Schaltet die Abfrage für dieses Tool dauerhaft für diesen Run frei.
- **Warteschlange:** Falls ein Agent mehrere Aktionen gleichzeitig plant (z. B. in einer Chain oder durch Delegation), siehst du eine Zähler-Anzeige (z. B. `+2`), die dir signalisiert, wie viele weitere Freigaben noch anstehen.

## 4. Prompt-Vorlagen
Über das Vorlagen-Icon im Composer kannst du häufig genutzte Texte speichern und wieder einfügen.

- **Speichern:** Gibt den aktuellen Eingabetext als neue Vorlage mit einem Titel ab.
- **Laden:** Fügt den Vorlagentext direkt in den Eingabebereich ein.
- **Template-Variablen:** Vorlagen unterstützen Variablen in der Form `${variable}` oder `{{variable}}`. Sie werden beim Einfügen automatisch durch aktuelle Werte ersetzt.

| Variable | Beispiel-Ausgabe |
|---|---|
| `${user_name}` | Max Mustermann |
| `${user_email}` | max@example.com |
| `${current_date}` | Mittwoch, 25. März 2026 |
| `${current_time}` | 14:30 |
| `${agent_label}` | Master-Assistent |
| `${chat_id}` | UUID des aktuellen Chats |

  Weitere Variablen (z. B. `${agent_id}`, `${task_id}`, `${role}`) sind ebenfalls verfügbar — die vollständige Liste findet sich in der Admin-Dokumentation unter *Tasks / Konfiguration*.

## 5. Token-Anzeige (Nutzung)
Nachdem der Agent geantwortet hat, erscheint rechtsbündig unter der Nachricht eine kleine Statistik in der Form `↑ 1,2k ↓ 80`.
- **↑ (Eingabe):** Gesamtzahl der Tokens, die für diesen Run an das Modell gesendet wurden — kumuliert über alle Zwischenschritte (z. B. mehrere Tool-Aufrufe, Chain-Schritte oder delegierte Sub-Agenten) inklusive eventuell wiederverwendeter Cache-Tokens.
- **↓ (Ausgabe):** Gesamtzahl der vom Agenten erzeugten Tokens, ebenfalls kumuliert über alle Zwischenschritte.
- **Kompaktnotation:** Werte ab 1.000 werden gerundet dargestellt (z. B. `12,4k`, `1,2M`).
- **Kopierbar:** Wie der Zeitstempel lässt sich auch diese Anzeige markieren und kopieren — praktisch, um Werte für Debugging oder Support weiterzugeben.
- **Sinn:** Hilft dir, den Token-Verbrauch und damit die Kosten/Last des Runs einzuschätzen — insbesondere bei Chains und Delegation, wo mehrere Modellaufrufe zusammengezählt werden.

## 6. Kontextgröße (Composer-Bar)
Rechts in der unteren Composer-Leiste, vor dem Tool-Freigabe-Symbol, zeigt Ontheia die aktuelle Kontextgröße als kompakte Zahl (z. B. `8,9k T`).
- **Bedeutung:** Anzahl der Tokens, die beim letzten Request tatsächlich als Prompt an das Modell gesendet wurden (inkl. Cache-Tokens) — unabhängig von Tokens, die durch delegierte Sub-Agenten verbraucht wurden.
- **Hover:** Ein Tooltip zeigt den genauen Wert in Tokens.
- **Sinn:** Gibt dir ein Gefühl dafür, wie nahe du am Kontextlimit des gewählten Modells bist — im Unterschied zur kumulierten Token-Anzeige an der Nachricht (siehe oben), die auf Kosten/Abrechnung des gesamten Runs abzielt.

