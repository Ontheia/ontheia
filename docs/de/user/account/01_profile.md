# Profil & Datenschutz

Verwalte deine Identität und kontrolliere den Zugriff auf deine Daten.

## 1. Persönliche Informationen
- **Anzeigename:** Der Name, mit dem du im System begrüßt wirst und der in Team-Funktionen (z. B. bei geteilten Agenten) sichtbar ist.
- **E-Mail:** Deine eindeutige Kennung. Hinweis: Die E-Mail-Adresse ist fest mit deinem Konto verknüpft und kann nur durch einen Administrator geändert werden.

## 2. Avatar
Personalisiere dein Profil mit einem Bild:
- **Upload:** Unterstützt gängige Bildformate bis zu einer Größe von 2 MB.
- **Initialen:** Falls kein Bild hochgeladen wurde, zeigt Ontheia automatisch deine Initialen basierend auf deinem Anzeigenamen an.

## 3. Datenschutz: Memory-Zugriff
Ontheia respektiert deine Privatsphäre. Über die Option **"Admin darf meine Memory-Namespaces verwalten"** entscheidest du selbst:
- **Deaktiviert (Standard):** Selbst Administratoren haben keinen Einblick in deine persönlichen Gedächtnis-Inhalte.
- **Aktiviert:** Ein Administrator kann dir bei Problemen helfen oder deine Wissensbasis strukturieren. Jeder Zugriff wird jedoch im System-Audit protokolliert.

## 4. Datenschutz: Meine Daten (DSGVO)

Ontheia gibt dir die vollständige Kontrolle über deine persönlichen Daten — ohne Administratoreingriff.

### Daten exportieren (Art. 20 DSGVO)

Du kannst jederzeit eine vollständige Kopie deiner Daten herunterladen. Der Export enthält:
- Dein Benutzerprofil
- Alle deine Chats inkl. Nachrichten
- Deine Ausführungshistorie (Run-Logs)
- Deine Memory-Einträge aus der Vektordatenbank

Der Export enthält: Profil, Einstellungen, Chats, Run-Logs, Cron-Jobs und Memory-Einträge. Die Datei wird als `ontheia-export.json` heruntergeladen.

### Konto löschen (Art. 17 DSGVO)

Du kannst dein Konto und alle damit verbundenen persönlichen Daten dauerhaft löschen. Vor der endgültigen Löschung erscheint ein Bestätigungsdialog.

**Was gelöscht wird:** Profil, Sessions, Einstellungen, Chats, Run-Logs, Cron-Jobs, Memory-Einträge.

**Was erhalten bleibt:** Agenten, Tasks, Chains und Provider — diese sind Systemressourcen, die dem gesamten System zugeordnet sind und nicht dir persönlich gehören.

> ⚠️ Die Löschung ist unwiderruflich. Erstelle vorher einen Export, wenn du deine Daten sichern möchtest.
