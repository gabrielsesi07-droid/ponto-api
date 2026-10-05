ALTER TABLE horacerta.orders ADD COLUMN IF NOT EXISTS official_number text CHECK (official_number IS NULL OR (length(official_number) BETWEEN 1 AND 80 AND official_number=btrim(official_number)));
-- statement-break
INSERT INTO horacerta.schema_migrations(name) VALUES ('023-official-order-number') ON CONFLICT DO NOTHING;
