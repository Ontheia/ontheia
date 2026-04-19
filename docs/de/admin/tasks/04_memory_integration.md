# Integration mit dem Langzeitgedächtnis

Jeder Task kann eine eigene **Memory-Policy** besitzen, die den Zugriff auf den Vektorspeicher regelt.

## Individuelle Wissensbasen

Über die Task-Ebene können Sie den Zugriff sehr fein steuern:
- **Lesen:** Definieren Sie, aus welchen Namespaces dieser spezifische Task Informationen abrufen darf (z. B. nur Projektdaten, aber kein allgemeines Firmenwissen).
- **Schreiben:** Legen Sie fest, wo die KI Erkenntnisse aus diesem speziellen Task speichern soll.

## Querverweis
Die detaillierte Konfiguration dieser Regeln finden Sie im Bereich **"Memory & Audit"** der Admin-Konsole sowie in der zugehörigen Dokumentation unter `docs/admin/namespaces/`.
