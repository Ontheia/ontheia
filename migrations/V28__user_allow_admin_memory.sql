-- V28: Flag, ob Admins auf den Memory des Users zugreifen dürfen (Privacy/Consent)

ALTER TABLE app.users
ADD COLUMN IF NOT EXISTS allow_admin_memory boolean NOT NULL DEFAULT false;

