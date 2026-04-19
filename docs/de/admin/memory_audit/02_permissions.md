# Sichtbarkeit & Berechtigungen

Ontheia nutzt ein hybrides Berechtigungsmodell für das Gedächtnis, das Isolation mit Kollaboration vereint.

## 1. Private Namespaces (Isoliert)
Namespaces wie `vector.user.*` oder `vector.agent.*` sind **personenbezogen**.
- **Lesen/Schreiben:** Nur der Besitzer (`owner_id`) oder ein Administrator hat Zugriff.
- **Unterscheidung:** 
  - `vector.user.*` enthält Daten, die der Nutzer explizit als privat markiert hat.
  - `vector.agent.*` enthält vom System generierte Verläufe und Profile, die für den Nutzer optimiert wurden.

## 2. Globale Namespaces (`vector.global.*`)
Inhalte in diesem Bereich dienen der gemeinsamen Wissensbasis und Zusammenarbeit.
- **Lesen:** Alle autorisierten Nutzer können `vector.global.*`-Namespaces lesen, sofern sie in der Memory-Policy des Agenten/Tasks eingetragen sind.
- **Schreiben:** Schreibzugriff auf globale Namespaces ist **nicht automatisch erlaubt**. Er muss in der Policy-Konfiguration explizit in `allowedWriteNamespaces` eingetragen sein (und `allowToolWrite` muss aktiviert sein).
- **Hierarchie:** Unterbereiche wie `global.business`, `global.privat` oder `global.knowledge` ermöglichen eine thematische Trennung bei gleichbleibender Lesbarkeit.
- **Zweck:** Gemeinsame Rezepte, Business-Projekte, Firmen-Handbücher und technisches Fachwissen.

## 3. Administrator-Zugriff & Datenschutz

Administratoren haben über die Konsole die technische Möglichkeit, Namespaces einzusehen. Ontheia verfolgt hier jedoch einen "Privacy First"-Ansatz:

- **Nutzer-Freigabe:** In ihren persönlichen Einstellungen können Nutzer die Option *"Admin darf meine Memory-Namespaces verwalten"* aktivieren oder deaktivieren.
- **Erzwingung:** Ohne diese explizite Freigabe werden Zugriffe des Administrators auf private Nutzer-Namespaces durch RLS-Regeln blockiert (sofern nicht die globale Admin-Übersteuerung in der DB aktiv ist).
- **Transparenz (Audit):**
  - Wurde der Zugriff **verweigert** (keine `allow_admin_memory`-Freigabe), wird die Aktion `warning` ins Audit-Log geschrieben.
  - Wurde der Zugriff **erlaubt** (Freigabe vorhanden), wird die Aktion `read` protokolliert – mit dem Zusatzfeld `admin_actor_id`, das die Identität des Administrators festhält.

