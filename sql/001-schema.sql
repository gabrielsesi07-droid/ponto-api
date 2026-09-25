CREATE SCHEMA IF NOT EXISTS horacerta;
CREATE SEQUENCE IF NOT EXISTS horacerta.user_code_seq START WITH 1001;
CREATE TABLE IF NOT EXISTS horacerta.settings (
 id integer PRIMARY KEY CHECK(id=1), rules jsonb NOT NULL
);
INSERT INTO horacerta.settings(id,rules) VALUES(1,'{"daily_minutes":540,"weekday_bonus":50,"saturday_bonus":60,"sunday_bonus":100,"holiday_bonus":100,"allow_retro":true,"approval_required":true,"currency":"BRL","date_format":"dd/MM/yyyy","time_format":"24h"}') ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS horacerta.users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), subject text UNIQUE, access_code text NOT NULL UNIQUE DEFAULT ('HC-' || lpad(nextval('horacerta.user_code_seq')::text,6,'0')), name text NOT NULL,
 email text NOT NULL UNIQUE CHECK(email=lower(email)), role text NOT NULL CHECK(role IN ('coordinator','employee')),
 job text NOT NULL DEFAULT '', phone text NOT NULL DEFAULT '', hourly_rate numeric(12,2) NOT NULL CHECK(hourly_rate>=0),
 active boolean NOT NULL DEFAULT true, can_edit boolean NOT NULL DEFAULT true,
 pin_change_required boolean NOT NULL DEFAULT true, pin_change_prompted boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS one_coordinator ON horacerta.users(role) WHERE role='coordinator';
CREATE TABLE IF NOT EXISTS horacerta.clients (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, city text NOT NULL DEFAULT '', state text NOT NULL DEFAULT '',
 service_type text NOT NULL DEFAULT '', notes text NOT NULL DEFAULT '', active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS horacerta.entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES horacerta.users(id),
 client_id uuid NOT NULL REFERENCES horacerta.clients(id), date date NOT NULL, start time NOT NULL, "end" time,
 break_minutes integer NOT NULL DEFAULT 0 CHECK(break_minutes>=0 AND break_minutes<1440),
 service text NOT NULL, service_type text NOT NULL DEFAULT '', notes text NOT NULL DEFAULT '', holiday boolean NOT NULL DEFAULT false,
 status text NOT NULL CHECK(status IN ('Pendente','Aprovado','Revisado')), rate numeric(12,2) NOT NULL CHECK(rate>=0), rules jsonb NOT NULL,
 version integer NOT NULL DEFAULT 1, deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK("end" IS NULL OR ("end">start AND extract(epoch from ("end"-start))/60>break_minutes))
);
CREATE INDEX IF NOT EXISTS entries_period ON horacerta.entries(user_id,date) WHERE deleted_at IS NULL;
CREATE TABLE IF NOT EXISTS horacerta.audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, actor_id uuid NOT NULL REFERENCES horacerta.users(id),
 entry_id uuid REFERENCES horacerta.entries(id), action text NOT NULL, before_value jsonb, after_value jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
