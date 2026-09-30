CREATE TABLE IF NOT EXISTS horacerta.push_config (
 id integer PRIMARY KEY CHECK(id=1), public_key text NOT NULL, private_key text NOT NULL
);
-- statement-break
CREATE TABLE IF NOT EXISTS horacerta.push_subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES horacerta.users(id) ON DELETE CASCADE,
 session_hash text NOT NULL REFERENCES horacerta.sessions(token_hash) ON DELETE CASCADE,
 endpoint text UNIQUE NOT NULL, p256dh text NOT NULL, auth text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
-- statement-break
CREATE TABLE IF NOT EXISTS horacerta.push_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES horacerta.orders(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES horacerta.users(id) ON DELETE CASCADE,
 subscription_id uuid NOT NULL REFERENCES horacerta.push_subscriptions(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed','skipped')),
 attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(),
 sent_at timestamptz, last_code integer, UNIQUE(order_id,subscription_id)
);
-- statement-break
CREATE INDEX IF NOT EXISTS push_jobs_pending ON horacerta.push_jobs(status,available_at);
-- statement-break
CREATE OR REPLACE FUNCTION horacerta.queue_order_push() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO horacerta.push_jobs(order_id,user_id,subscription_id)
 SELECT NEW.id,s.user_id,s.id FROM horacerta.push_subscriptions s
 JOIN horacerta.sessions session ON session.token_hash=s.session_hash AND session.expires_at>now()
 JOIN horacerta.users u ON u.id=s.user_id AND u.active
 WHERE s.user_id=ANY(NEW.members)
 ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
-- statement-break
CREATE OR REPLACE TRIGGER orders_queue_push AFTER INSERT ON horacerta.orders
 FOR EACH ROW EXECUTE FUNCTION horacerta.queue_order_push();
