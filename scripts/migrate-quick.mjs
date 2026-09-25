import {neon} from '@neondatabase/serverless';
import {readFile} from 'node:fs/promises';
const sql=neon(process.env.DATABASE_URL);
const ddl=[
 'CREATE SEQUENCE IF NOT EXISTS horacerta.user_code_seq START WITH 1001',
 'ALTER TABLE horacerta.users ADD COLUMN IF NOT EXISTS access_code text DEFAULT (\'HC-\' || lpad(nextval(\'horacerta.user_code_seq\')::text,6,\'0\'))',
 'ALTER TABLE horacerta.users ALTER COLUMN access_code SET DEFAULT (\'HC-\' || lpad(nextval(\'horacerta.user_code_seq\')::text,6,\'0\'))',
 'UPDATE horacerta.users SET access_code=(\'HC-\' || lpad(nextval(\'horacerta.user_code_seq\')::text,6,\'0\')) WHERE access_code IS NULL',
 'ALTER TABLE horacerta.users ALTER COLUMN access_code SET NOT NULL',
 'CREATE UNIQUE INDEX IF NOT EXISTS users_access_code_key ON horacerta.users(access_code)',
 'ALTER TABLE horacerta.users ADD COLUMN IF NOT EXISTS username text UNIQUE',
 'ALTER TABLE horacerta.entries ALTER COLUMN client_id DROP NOT NULL',
 'ALTER TABLE horacerta.entries ADD COLUMN IF NOT EXISTS company text NOT NULL DEFAULT \'\'',
 'ALTER TABLE horacerta.users ADD COLUMN IF NOT EXISTS pin_hash text',
 'ALTER TABLE horacerta.users ADD COLUMN IF NOT EXISTS login_attempts integer NOT NULL DEFAULT 0',
 'ALTER TABLE horacerta.users ADD COLUMN IF NOT EXISTS attempt_window timestamptz',
 'ALTER TABLE horacerta.users ADD COLUMN IF NOT EXISTS pin_change_required boolean NOT NULL DEFAULT true',
 'ALTER TABLE horacerta.users ADD COLUMN IF NOT EXISTS pin_change_prompted boolean NOT NULL DEFAULT false',
 'CREATE TABLE IF NOT EXISTS horacerta.sessions (token_hash text PRIMARY KEY,user_id uuid NOT NULL REFERENCES horacerta.users(id),expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now())',
 'CREATE TABLE IF NOT EXISTS horacerta.timers (user_id uuid PRIMARY KEY REFERENCES horacerta.users(id), started_at timestamptz NOT NULL,paused_at timestamptz,pauses jsonb NOT NULL DEFAULT \'[]\',rate numeric(12,2) NOT NULL,rules jsonb NOT NULL)',
 'ALTER TABLE horacerta.timers ADD COLUMN IF NOT EXISTS company text NOT NULL DEFAULT \'\'',
 'ALTER TABLE horacerta.timers ADD COLUMN IF NOT EXISTS service text NOT NULL DEFAULT \'Serviço técnico\'',
 'ALTER TABLE horacerta.timers ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT \'\'',
 // The original generated check name is resolved before changing only the duration check.
 'ALTER TABLE horacerta.entries DROP CONSTRAINT IF EXISTS entries_check',
 'ALTER TABLE horacerta.entries DROP CONSTRAINT IF EXISTS entry_duration',
 'ALTER TABLE horacerta.entries ADD CONSTRAINT entry_duration CHECK("end" IS NULL OR ("end">=start AND extract(epoch from ("end"-start))/60>=break_minutes))'
];
await sql.transaction(ddl.map(q=>sql.query(q)));
await sql.query(await readFile(new URL('../sql/002-clock-start-function.sql',import.meta.url),'utf8'));
await sql.query(await readFile(new URL('../sql/002-clock-function.sql',import.meta.url),'utf8'));
console.log('Acesso rápido e relógio de serviço preparados.');
