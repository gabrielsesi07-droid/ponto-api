-- Keep the client name snapshot without requiring a separate client record.
ALTER TABLE horacerta.orders ALTER COLUMN client_id DROP NOT NULL;
