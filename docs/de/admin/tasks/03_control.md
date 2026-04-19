# Steuerung & Zuweisung

Tasks müssen einem oder mehreren Agenten zugewiesen werden, um in der Anwendung nutzbar zu sein.

## 1. Zuweisung zu Agenten
Unter "Tasks pro Agent" sehen Sie eine Auflistung aller registrierten Agenten und die ihnen zugeordneten Aufgaben.
- **Neue Zuweisung:** Wählen Sie oben im Formular den gewünschten Agenten aus und füllen Sie die Task-Daten aus.
- **UUID:** Jeder Task erhält automatisch eine eindeutige ID, die für interne Verknüpfungen (z. B. in Chains) genutzt wird.

## 2. Sichtbarkeit im Composer
Über das Kontrollkästchen **"Im Composer anzeigen"** steuern Sie, ob dieser Task für den Endnutzer im Dropdown-Menü sichtbar ist.
- **Aktiviert (Standard):** Der Nutzer kann diesen Task explizit auswählen.
- **Deaktiviert:** Der Task ist "versteckt". Dies ist nützlich für Zwischenschritte in komplexen **Chains**, die nicht direkt vom Nutzer gestartet werden sollen.

## 3. Löschen von Tasks
Beim Löschen eines Tasks wird dieser unwiderruflich aus der Datenbank entfernt. Stellen Sie sicher, dass keine aktiven **Chains** mehr auf diesen Task verweisen, um Fehlermeldungen bei der Ausführung zu vermeiden.
