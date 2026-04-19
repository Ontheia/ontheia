# Verbindungstests & Diagnose

Um sicherzustellen, dass die konfigurierten Provider einsatzbereit sind, bietet Ontheia integrierte Test-Werkzeuge.

## 1. Konfiguration des Tests
In den Provider-Details können Sie festlegen, wie die Erreichbarkeit geprüft werden soll:
- **Test-Pfad:** Der Endpunkt für die Prüfung (Standard: `/v1/models`).
- **HTTP-Methode:** `GET` (Modelle auflisten) oder `POST` (einen kurzen Chat-Request senden).
- **Test-Modell-ID:** Bei `POST` wird diese ID für eine Test-Vervollständigung genutzt.

## 2. Status-Indikatoren
In der Liste der registrierten Provider sehen Sie sofort den Zustand:
- **Grün (Verbunden):** Der letzte Test war erfolgreich (Status 2xx).
- **Rot (Fehler):** Die API ist nicht erreichbar oder die Authentifizierung schlug fehl.
- **Grau (Unbekannt):** Es wurde noch kein Verbindungstest durchgeführt.

## 3. Performance-Metriken
Nach einem erfolgreichen Test zeigt Ontheia zusätzliche Informationen an:
- **Dauer (ms):** Die Latenz der API-Antwort.
- **Warnungen:** Hinweise der API (z. B. Deprecation-Warnungen).
- **Response-Preview:** Ein Ausschnitt der Roh-Antwort zur Validierung der API-Struktur.
