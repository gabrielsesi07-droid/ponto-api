-- Requires migrations through 019 and the quick-access columns.
ALTER TABLE horacerta.users ADD COLUMN IF NOT EXISTS credential_version integer NOT NULL DEFAULT 1;
-- statement-break
ALTER TABLE horacerta.users ADD COLUMN IF NOT EXISTS temporary_pin_expires_at timestamptz;
-- statement-break
ALTER TABLE horacerta.users ADD COLUMN IF NOT EXISTS temporary_pin_used_at timestamptz;
-- statement-break
ALTER TABLE horacerta.sessions ADD COLUMN IF NOT EXISTS credential_version integer NOT NULL DEFAULT 1;
-- statement-break
-- A PIN change/deactivation and session revocation share the same user row lock.
CREATE OR REPLACE FUNCTION horacerta.revoke_changed_credentials() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.pin_hash IS DISTINCT FROM OLD.pin_hash OR (OLD.active AND NOT NEW.active) THEN
   NEW.credential_version := OLD.credential_version + 1;
   DELETE FROM horacerta.sessions WHERE user_id=OLD.id;
 ELSE
   NEW.credential_version := OLD.credential_version;
 END IF;
 RETURN NEW;
END $$;
-- statement-break
CREATE OR REPLACE TRIGGER users_revoke_credentials BEFORE UPDATE ON horacerta.users
 FOR EACH ROW EXECUTE FUNCTION horacerta.revoke_changed_credentials();
-- statement-break
-- PBKDF2 verification occurs in the application; this atomic final check rejects stale proofs.
CREATE OR REPLACE FUNCTION horacerta.complete_pin_login(p_user uuid, p_hash text, p_version integer, p_token text, p_days numeric)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE u horacerta.users%ROWTYPE;
BEGIN
 SELECT * INTO u FROM horacerta.users WHERE id=p_user FOR UPDATE;
 IF NOT FOUND OR NOT u.active OR u.pin_hash IS DISTINCT FROM p_hash OR u.credential_version<>p_version THEN RETURN NULL; END IF;
 IF u.pin_change_required AND (u.temporary_pin_expires_at IS NULL OR u.temporary_pin_expires_at<=clock_timestamp() OR u.temporary_pin_used_at IS NOT NULL) THEN RETURN NULL; END IF;
 IF p_days NOT IN (0.5,30) OR length(p_token)<>64 THEN RETURN NULL; END IF;
 UPDATE horacerta.users SET login_attempts=0,attempt_window=NULL,
   temporary_pin_used_at=CASE WHEN u.pin_change_required THEN clock_timestamp() ELSE temporary_pin_used_at END WHERE id=p_user;
 INSERT INTO horacerta.sessions(token_hash,user_id,credential_version,expires_at)
 VALUES(p_token,p_user,u.credential_version,clock_timestamp()+((CASE WHEN u.pin_change_required THEN least(p_days,0.5) ELSE p_days END)*interval '1 day'));
 RETURN jsonb_build_object('name',u.name,'access_code',u.access_code,'job',u.job,'pin_change_required',u.pin_change_required);
END $$;
-- statement-break
-- Acquire before row locks, including direct SQL and legacy functions; the row guard then reads a fresh snapshot.
CREATE OR REPLACE FUNCTION horacerta.entries_serialize_month() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(2849061701);
 RETURN NULL;
END $$;
-- statement-break
CREATE OR REPLACE TRIGGER entries_month_serialization BEFORE INSERT OR UPDATE OR DELETE ON horacerta.entries
 FOR EACH STATEMENT EXECUTE FUNCTION horacerta.entries_serialize_month();
-- statement-break
CREATE TABLE IF NOT EXISTS horacerta.schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
-- statement-break
INSERT INTO horacerta.schema_migrations(name) VALUES('020-identity-integrity') ON CONFLICT DO NOTHING;
