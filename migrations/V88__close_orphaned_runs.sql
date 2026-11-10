BEGIN;

-- Ein Lauf lebt im Host-Prozess, der ihn gestartet hat. Lief er beim Beenden
-- des Hosts noch, fehlt seinem Protokoll das Abschluss-Ereignis, und alles, was
-- das Protokoll liest — zuerst der Run-Status in der Seitenleiste —, hält
-- "kein Abschluss" eine Stunde lang für "läuft noch".
--
-- Der Host ruft diese Funktion einmal beim Start auf, bevor er selbst Läufe
-- startet; jedes offene Protokoll ist dann ein Überbleibsel.
--
-- SECURITY DEFINER, weil run_logs strikt dem Besitzer gehört (V45) und der
-- Host beim Start für keinen Benutzer handelt. Die Funktion liest nichts
-- heraus: sie hängt nur das Abschluss-Ereignis an und gibt die Anzahl zurück.
--
-- Auf die letzten zwei Tage begrenzt: Ältere Protokolle gelten ohnehin als
-- fehlgeschlagen, und die Ereignisse der ganzen Tabelle bei jedem Start zu
-- durchsuchen wäre es nicht wert.
CREATE OR REPLACE FUNCTION app.close_orphaned_runs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = app, pg_catalog
AS $$
DECLARE
  closed integer;
BEGIN
  UPDATE app.run_logs
     SET events = COALESCE(events, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
           'type', 'error',
           'code', 'host_restarted',
           'message', 'The host was restarted while this run was active.',
           'timestamp', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
         ))
   WHERE created_at > now() - interval '2 days'
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(COALESCE(events, '[]'::jsonb)) e
        WHERE e->>'type' = 'complete'
     )
     AND COALESCE(events->-1->>'type', '') <> 'error';
  GET DIAGNOSTICS closed = ROW_COUNT;
  RETURN closed;
END;
$$;

REVOKE ALL ON FUNCTION app.close_orphaned_runs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.close_orphaned_runs() TO ontheia_app;

COMMIT;
