// Explicit out-of-band recovery. Never imported by the migration or the web application.
import { neon } from '@neondatabase/serverless';
import { hashPin, randomTemporaryPin, TEMPORARY_PIN_HOURS } from '../lib/pin.ts';
const code = process.argv[2];
const operator = process.env.HORACERTA_RECOVERY_OPERATOR?.trim();
if (!process.env.DATABASE_URL || !/^HC-\d{6}$/.test(code || '') || !operator || operator.length < 3 || operator.length > 120) throw new Error('Usage: set HORACERTA_RECOVERY_OPERATOR to the authorized operator name; node --env-file=.env scripts/reset-pin.mjs HC-XXXXXX (after security migration).');
const sql = neon(process.env.DATABASE_URL), pin = randomTemporaryPin();
const [person] = await sql`WITH changed AS (UPDATE horacerta.users SET pin_hash=${await hashPin(pin)},pin_change_required=true,pin_change_prompted=false,temporary_pin_expires_at=now()+(${TEMPORARY_PIN_HOURS}*interval '1 hour'),temporary_pin_used_at=NULL,login_attempts=0,attempt_window=NULL WHERE access_code=${code} AND active=true RETURNING id,access_code,temporary_pin_expires_at,credential_version), logged AS (INSERT INTO horacerta.audit(actor_id,action,after_value) SELECT id,'Recuperação por operador (fora da aplicação)',jsonb_build_object('user_id',id,'access_code',access_code,'credential_version',credential_version,'via','operator_cli','operator',${operator}::text) FROM changed RETURNING actor_id) SELECT changed.access_code,changed.temporary_pin_expires_at FROM changed JOIN logged ON logged.actor_id=changed.id`;
if (!person) throw new Error('Active account not found.');
console.log(JSON.stringify({ access_code: person.access_code, temporary_pin: pin, temporary_pin_expires_at: person.temporary_pin_expires_at }));
