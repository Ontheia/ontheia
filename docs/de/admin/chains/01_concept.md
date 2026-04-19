# Chains Konzept

Chains (Ketten) sind automatisierte Workflows, die mehrere Einzelschritte zu einem Gesamtablauf verbinden. Sie ermöglichen es, komplexe Probleme zu lösen, die ein einzelner Prompt nicht bewältigen könnte.

## Funktionsweise

Eine Chain orchestriert die Zusammenarbeit von Agenten und Tools. Sie definiert:
1. **Die Reihenfolge:** Was passiert nacheinander oder parallel?
2. **Den Datenfluss:** Wie wird die Ausgabe von Schritt A zur Eingabe von Schritt B?
3. **Die Logik:** Unter welchen Bedingungen sollen Schritte ausgeführt oder wiederholt werden?

## Anwendungsbeispiele

- **Recherche & Bericht:** Schritt 1 sucht via Web-Tool nach Daten -> Schritt 2 analysiert die Funde -> Schritt 3 schreibt eine Zusammenfassung.
- **Code-Pipeline:** Schritt 1 generiert Code -> Schritt 2 führt einen Linter/Test aus -> Schritt 3 korrigiert Fehler basierend auf dem Test-Output.
- **Multi-Agent-Gespräch:** Ein "Manager-Agent" delegiert Teilaufgaben an spezialisierte "Experten-Agenten" und führt die Ergebnisse zusammen.
