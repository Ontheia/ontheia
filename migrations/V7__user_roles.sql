BEGIN;

ALTER TABLE app.users
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user'
  CHECK (role IN ('user','admin'));

UPDATE app.users
   SET role = 'admin'
 WHERE role IS NULL AND email IN (SELECT email FROM app.users ORDER BY created_at LIMIT 1);

COMMIT;
