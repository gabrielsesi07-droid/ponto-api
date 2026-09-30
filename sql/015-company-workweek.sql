CREATE TABLE IF NOT EXISTS horacerta.schema_migrations (
 name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()
);
-- statement-break
DO $$
BEGIN
 PERFORM pg_advisory_xact_lock(2849061701);
 IF EXISTS(SELECT 1 FROM horacerta.schema_migrations WHERE name='015-company-workweek') THEN RETURN; END IF;
 ALTER TABLE horacerta.users ALTER COLUMN monthly_hours SET DEFAULT 200;
 UPDATE horacerta.settings SET rules=jsonb_set(rules,'{daily_minutes}','480'::jsonb) WHERE id=1;
 -- Salary trigger recalculates current rates only; entries and legacy timers retain snapshots.
 UPDATE horacerta.users SET monthly_hours=200 WHERE monthly_hours<>200;
 INSERT INTO horacerta.schema_migrations(name) VALUES('015-company-workweek');
END $$;
