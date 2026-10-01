-- Device consent outlives a browsing session; session_hash remains enrollment provenance.
-- Requires 017, 019 and 020. No keys, memberships or existing payloads are regenerated.
ALTER TABLE horacerta.push_subscriptions DROP CONSTRAINT IF EXISTS push_subscriptions_session_hash_fkey;
-- statement-break
ALTER TABLE horacerta.push_jobs ADD COLUMN IF NOT EXISTS lease_token uuid;
-- statement-break
ALTER TABLE horacerta.push_jobs ADD COLUMN IF NOT EXISTS last_reason text;
-- statement-break
CREATE INDEX IF NOT EXISTS push_subscriptions_session_provenance ON horacerta.push_subscriptions(session_hash);
-- statement-break
CREATE OR REPLACE FUNCTION horacerta.revoke_push_credentials() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.pin_hash IS DISTINCT FROM OLD.pin_hash OR (OLD.active AND NOT NEW.active) THEN
   DELETE FROM horacerta.push_subscriptions WHERE user_id=NEW.id;
 END IF;
 RETURN NEW;
END $$;
-- statement-break
CREATE OR REPLACE TRIGGER users_revoke_push AFTER UPDATE OF pin_hash,active ON horacerta.users
 FOR EACH ROW EXECUTE FUNCTION horacerta.revoke_push_credentials();
-- statement-break
CREATE OR REPLACE FUNCTION horacerta.queue_order_push() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO horacerta.push_jobs(order_id,user_id,subscription_id,kind)
 SELECT NEW.id,s.user_id,s.id,'assigned' FROM horacerta.push_subscriptions s
 JOIN horacerta.users u ON u.id=s.user_id AND u.active AND NOT u.pin_change_required
 WHERE s.user_id=ANY(NEW.members)
 ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
-- statement-break
CREATE OR REPLACE FUNCTION horacerta.queue_hours_reminder(p_order uuid) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE queued integer;
BEGIN
 INSERT INTO horacerta.push_jobs(order_id,user_id,subscription_id,kind)
 SELECT o.id,s.user_id,s.id,'hours' FROM horacerta.orders o
 JOIN horacerta.push_subscriptions s ON s.user_id=ANY(o.members)
 JOIN horacerta.users u ON u.id=s.user_id AND u.active AND NOT u.pin_change_required
 WHERE o.id=p_order AND o.status IN ('Concluída','Cancelada')
   AND NOT EXISTS(SELECT 1 FROM horacerta.entries e WHERE e.order_id=o.id AND e.user_id=s.user_id AND e.deleted_at IS NULL)
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS queued = ROW_COUNT;
 RETURN queued;
END $$;
-- statement-break
INSERT INTO horacerta.schema_migrations(name) VALUES('022-push-reliability') ON CONFLICT DO NOTHING;
