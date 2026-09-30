-- Existing accounts keep their hourly rate until they explicitly set a salary.
ALTER TABLE horacerta.users ADD COLUMN IF NOT EXISTS monthly_salary numeric(12,2)
 CONSTRAINT users_monthly_salary_valid CHECK (monthly_salary >= 0 AND monthly_salary <= 1000000);
-- statement-break
ALTER TABLE horacerta.users ADD COLUMN IF NOT EXISTS monthly_hours numeric(7,2) NOT NULL DEFAULT 220
 CONSTRAINT users_monthly_hours_valid CHECK (monthly_hours >= 1 AND monthly_hours <= 744);
-- statement-break
CREATE OR REPLACE FUNCTION horacerta.derive_hourly_rate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.monthly_salary IS NOT NULL THEN
  NEW.hourly_rate := round(NEW.monthly_salary / NEW.monthly_hours, 2);
 END IF;
 RETURN NEW;
END $$;
-- statement-break
CREATE OR REPLACE TRIGGER users_derive_hourly_rate
 BEFORE INSERT OR UPDATE OF monthly_salary, monthly_hours, hourly_rate ON horacerta.users
 FOR EACH ROW EXECUTE FUNCTION horacerta.derive_hourly_rate();
