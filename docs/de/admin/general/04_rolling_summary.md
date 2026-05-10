# Kontext-Komprimierung (Rolling Summary)

Der Rolling Summary komprimiert ältere Chat-Verläufe automatisch, sobald der Kontext einen konfigurierten Token-Schwellenwert überschreitet. Dadurch bleibt der Chat auch bei sehr langen Gesprächen flüssig, ohne dass der Nutzer manuell eingreifen muss.

---

## Funktionsprinzip

Jede neue Nutzereingabe durchläuft folgende Prüfung:

```
Gesamttokens > Schwellenwert?
  └─ Nein → keine Aktion, Original-Kontext wird übergeben
  └─ Ja →
       Vorhandene Summary + Gap ≤ minRecent UND Tokens(Summary + Gap + Klartext) ≤ Schwellenwert?
         └─ Ja → REUSE — bestehende Summary wird wiederverwendet, kein LLM-Aufruf
         └─ Nein → COMPRESS — neuer LLM-Aufruf, Summary wird erstellt und in DB gespeichert
```

**Begriffe:**

| Begriff | Bedeutung |
| --- | --- |
| `thresholdTokens` | Gesamttoken-Grenze; erst darüber wird komprimiert |
| `minRecent` | Anzahl der letzten Nachrichten, die immer als Klartext erhalten bleiben |
| Gap | Nachrichten zwischen `covers_until`-Zähler und dem Klartextfenster |
| `covers_until` | Zähler (keine ID): wie viele Nachrichten die aktuelle Summary abdeckt |
| Reuse | Bestehende Summary passt noch → kein neuer LLM-Aufruf |
| Compress | Neue Summary wird erzeugt und in der DB gespeichert |

### Einbettung der Summary

Die komprimierte Summary wird dem LLM als synthetisches `user`/`assistant`-Paar vorangestellt:

```
[User]:      [Context Summary — compressed history of this conversation]
             ## Chat Summary … (strukturierter Text)
[Assistant]: Understood. I will use this summary as context for our conversation.
[User]:      <letzte minRecent Nachrichten als Klartext>
…
```

System-Messages und die eigentlichen Agenten-Prompts bleiben davon unberührt.

---

## Einstellungen

**Pfad:** Administration → Allgemein → Summarizer

| Feld | Standard | Beschreibung |
| --- | --- | --- |
| Provider | — | KI-Provider für den Summarizer-LLM-Aufruf. Muss im Tab *AI-Provider* konfiguriert sein. |
| Modell | — | Modell innerhalb des gewählten Providers. |
| Token-Schwellenwert | 32 000 | Gesamttokens (chars ÷ 4) aller Chat-Nachrichten, ab dem komprimiert wird. |
| Mindest-Klartextfenster | 20 | Anzahl der letzten Nachrichten, die immer im Volltext an den LLM übergeben werden. |

> **Wichtig:** Ohne Provider und Modell bleibt die Komprimierung inaktiv. Die Einstellungen werden global für alle Nutzer gespeichert.

---

## Richtwerte

| Modell-Klasse | Kontextfenster | Empfohlener Schwellenwert | Empfohlenes Klartextfenster |
| --- | --- | --- | --- |
| Kleine Cloud-Modelle (z. B. Haiku 4.5) | 200k Token | 32 000 | 20 |
| Mittlere Cloud-Modelle (z. B. Sonnet 4.6, GPT-5 mini) | 400k Token | 64 000 | 20 |
| Große Cloud-Modelle (z. B. GPT-5, Claude Opus) | ≥ 1M Token | 128 000 | 30 |
| Lokale Modelle (Ollama, llama.cpp) | 8k – 128k Token | 4 000 – 16 000 | 10 |

> Die Token-Schätzung erfolgt über `chars ÷ 4`. Für präzisere Ergebnisse kann der Schwellenwert konservativ (etwas niedriger als das tatsächliche Kontextlimit) gesetzt werden.

---

## Chain-Konsole

Wenn eine echte Komprimierung stattfindet (kein Reuse), erscheint in der Chain-Konsole eine Zeile:

```
rolling_summary: 56 compressed → summary, 5 plaintext
```

- **compressed:** Anzahl der Nachrichten, die in der Summary zusammengefasst wurden
- **plaintext:** Anzahl der Nachrichten, die im Volltext erhalten bleiben

Bei Reuse erscheint kein Eintrag.

---

## Technische Hinweise

- **Provider-Kompatibilität:** Der Summarizer-Aufruf läuft über dieselbe Provider-Infrastruktur wie normale Agenten-Runs. Alle Provider (OpenAI, Anthropic, Google Gemini, xAI, lokale CLI-Provider) werden unterstützt.
- **Fehlertoleranz:** Schlägt der Summarizer-Aufruf fehl, wird der Original-Kontext unverändert übergeben. Der Run wird nicht blockiert.
- **DSGVO-Hinweis:** Die Summary wird in der Spalte `rolling_summary` der Tabelle `app.chats` gespeichert. Bei der Kontolöschung (`DELETE /auth/me`) werden Chat-Daten einschließlich der Summary vollständig entfernt.
- **Sub-Agenten:** Bei Agent-zu-Agent-Delegation greift die Komprimierung nur im `RunService.run()`, nicht im internen `ChainRunner`. Im Normalbetrieb hat das keine Auswirkung.
- **Hard Cap:** Die Summary wird auf maximal 8 000 Zeichen begrenzt, um den Overhead zu kontrollieren.
