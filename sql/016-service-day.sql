DO $$
BEGIN
 PERFORM pg_advisory_xact_lock(2849061701);
 IF EXISTS(SELECT 1 FROM horacerta.schema_migrations WHERE name='016-service-day') THEN RETURN; END IF;
 -- This product records technical service only. Office hours determine the monthly divisor, not the service quota.
 UPDATE horacerta.settings SET rules=jsonb_set(rules,'{daily_minutes}','540'::jsonb) WHERE id=1;
 INSERT INTO horacerta.schema_migrations(name) VALUES('016-service-day');
END $$;
