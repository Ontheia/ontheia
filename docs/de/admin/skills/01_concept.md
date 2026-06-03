# Agent Skills — Konzept

Agent Skills sind wiederverwendbare Fähigkeitsmodule, die erweitern was ein Agent leisten kann. Ein Skill ist ein Verzeichnis mit einer `SKILL.md`-Datei, die YAML-Frontmatter (Metadaten) und einen Markdown-Body (Instruktionen) enthält. Skills können zusätzlich ausführbare Scripts, Referenzdokumentation und Assets bündeln.

Ontheia implementiert den offenen [Agent Skills Standard](https://agentskills.io) von Anthropic, der auch von Claude Code, GitHub Copilot, Cursor, Gemini CLI und vielen anderen Tools verwendet wird. In Ontheia erstellte Skills sind direkt mit diesen Plattformen kompatibel.

---

## Wie Skills funktionieren

Skills nutzen **Progressive Disclosure** — es wird nur geladen was benötigt wird:

| Stufe | Inhalt | Wann |
| --- | --- | --- |
| **1 — Katalog** | `name` + `description` + `when_to_use` | Bei jedem Run (als System-Message injiziert) |
| **2 — Instruktionen** | Vollständiger SKILL.md-Body | Bei Aktivierung via `activate_skill`-Tool |
| **3 — Ressourcen** | `scripts/`, `references/`, `assets/` | Auf Anforderung wenn die Instruktionen darauf verweisen |

Der Agent sieht den Skill-Katalog am Anfang jeder Session. Wenn eine Aufgabe zur Beschreibung eines Skills passt, ruft der Agent `activate_skill(name)` auf um die vollständigen Instruktionen zu laden.

---

## Zwei Skill-Klassen

| Klasse | Inhalt | CLI-Zugang nötig | Beispiel |
| --- | --- | --- | --- |
| **Instruktions-Skill** | Nur Anweisungen, kein Code | Nein | Stilregeln, Domänenwissen, Verhaltensregeln |
| **Code-Library-Skill** | Anweisungen + eingebettete Code-Vorlagen | Ja (cli-tools Server) | PDF-Verarbeitung, Datenanalyse, Datei-Konvertierung |

Bei Code-Library-Skills liest der Agent das Code-Muster aus dem Skill, passt es auf die konkrete Aufgabe an und führt es über den `cli-tools`-MCP-Server aus — mit `uv run --with <paket>` für automatisches Dependency-Management.

---

## Verzeichnisstruktur eines Skills

```
skill-name/
├── SKILL.md          ← Pflicht: Frontmatter + Instruktionen
├── scripts/          ← Optional: ausführbare Scripts
├── references/       ← Optional: Referenzdokumentation
└── assets/           ← Optional: Templates, Datendateien
```

### SKILL.md Format

```markdown
---
name: skill-name
description: Was der Skill tut und wann er verwendet werden soll.
when_to_use: Zusätzliche Trigger-Hinweise (optional).
license: Apache-2.0
---

# Skill-Instruktionen

[Markdown-Body mit Anweisungen für den Agenten]
```

---

## Verfügbare Tools

Der interne MCP-Server `skills` stellt fünf Tools bereit:

| Tool | Beschreibung |
| --- | --- |
| `list_skills` | Listet alle für diesen Agenten verfügbaren Skills. |
| `activate_skill(name)` | Lädt den vollständigen Skill-Body in den Kontext. |
| `read_skill_resource(skill_name, path)` | Liest eine Datei aus dem Skill-Verzeichnis. |
| `write_skill_resource(skill_name, path, content)` | Schreibt eine Datei in das Skill-Verzeichnis. |
| `create_skill(name, scope, content)` | Legt einen neuen Skill an. |

---

## Abgrenzung zu anderen Konzepten

| Konzept | Granularität | Bindung | Zweck |
| --- | --- | --- | --- |
| **Task** | Groß, monolithisch | 1 Agent | Agenten-Identität und Domänen-Kontext |
| **Chain** | Komplex, mehrstufig | Workflow | Automatisierung |
| **Skill** | Klein, fokussiert | n Agenten | Wiederverwendbare Expertise |
| **MCP-Server** | Extern | n Agenten | Tool-Verbindungen |

Skills ergänzen Tasks: ein Task definiert die Identität des Agenten, Skills fügen quer einsetzbare Fähigkeiten hinzu.

```
Vorher: Agent → Task (1:1)
Nachher: Agent → Task + [Skill A, Skill B, Skill C] (1:n)
```
