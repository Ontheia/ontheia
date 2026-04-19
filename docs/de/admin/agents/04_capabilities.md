# Fähigkeiten & Tool-Konfiguration

Agenten werden durch die Zuweisung von MCP-Servern und spezifischen Werkzeugen funktional erweitert.

## 1. MCP-Server Zuweisung
Einem Agenten können mehrere laufende MCP-Server zugewiesen werden.
- **Wirkung:** Der Agent "sieht" alle vom Server angebotenen Tools in seinem System-Kontext.
- **Aktualisierung:** Über den Link "Tool-Liste aktualisieren" können neue Funktionen eines laufenden Servers sofort in die Konfiguration übernommen werden.

## 2. Selektive Tools
Anstatt einen gesamten Server freizugeben, können Sie im Feld "Tools" gezielt einzelne Funktionen auswählen. Dies erhöht die Sicherheit und reduziert die Token-Last (kürzerer System-Prompt).

## 3. Toolfreigabe (Default)
Dieser Modus bestimmt, wie das System reagiert, wenn die KI eine Aktion ausführen möchte:
- **Freigabe anfragen (Standard):** Der Nutzer erhält im Chat eine Karte und muss jeden Tool-Aufruf manuell bestätigen.
- **Voller Zugriff:** Die KI darf Aktionen ohne Rückfrage ausführen (nur für vertrauenswürdige interne Tools empfohlen).
- **Blockiert:** Tool-Aufrufe werden grundsätzlich abgelehnt.

## 4. Bulk-Aktionen
Um die Konfiguration bei vielen Tools zu beschleunigen, stehen Schaltflächen wie "Alle auswählen" oder "Server-bezogene Auswahl" zur Verfügung.
