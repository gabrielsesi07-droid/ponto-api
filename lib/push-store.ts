import type { NeonQueryFunction } from '@neondatabase/serverless';
import { PUSH_MAX_AGE_HOURS, PUSH_MAX_ATTEMPTS, PUSH_LEASE_SECONDS, PUSH_RETRY_SECONDS,
  type PushStore, type PushJob, type PushRecipient } from './push-policy';

/** The caller validates the subscription; lock account then session, each in a fresh statement, before rechecking credentials. */
export async function registerPushDevice(sql: NeonQueryFunction<false, false>, userId: string, sessionHash: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  const authorized = () => sql`SELECT u.id FROM horacerta.users u JOIN horacerta.sessions s ON s.user_id=u.id
    AND s.credential_version=u.credential_version WHERE s.token_hash=${sessionHash} AND s.expires_at>clock_timestamp()
    AND u.id=${userId}::uuid AND u.active AND NOT u.pin_change_required`;
  const results = await sql.transaction([
    sql`SELECT id FROM horacerta.users WHERE id=${userId}::uuid FOR SHARE`,
    sql`SELECT token_hash FROM horacerta.sessions WHERE token_hash=${sessionHash} AND user_id=${userId}::uuid FOR SHARE`,
    sql`DELETE FROM horacerta.push_jobs WHERE subscription_id IN (SELECT id FROM horacerta.push_subscriptions
      WHERE endpoint=${subscription.endpoint} AND user_id<>${userId}::uuid) AND EXISTS(${authorized()})`,
    sql`INSERT INTO horacerta.push_subscriptions(user_id,session_hash,endpoint,p256dh,auth)
      SELECT id,${sessionHash},${subscription.endpoint},${subscription.keys.p256dh},${subscription.keys.auth} FROM (${authorized()}) eligible
      ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,session_hash=excluded.session_hash,
      p256dh=excluded.p256dh,auth=excluded.auth,updated_at=now() RETURNING id`,
  ]);
  return results[3].length > 0;
}

/** SQL adapter only: caller supplies the connection and owns its lifecycle. */
export function createPushStore(sql: NeonQueryFunction<false, false>): PushStore {
  return {
    async configuration() {
      const [keys] = await sql`SELECT public_key,private_key FROM horacerta.push_config WHERE id=1`;
      return keys?.public_key && keys?.private_key ? { public_key: keys.public_key, private_key: keys.private_key } : null;
    },
    async expire() {
      const expired = await sql`UPDATE horacerta.push_jobs SET status='skipped',last_reason='expired',lease_token=NULL
        WHERE status IN ('pending','failed','sending') AND created_at<=now()-(${PUSH_MAX_AGE_HOURS}*interval '1 hour') RETURNING id`;
      const exhausted = await sql`UPDATE horacerta.push_jobs SET status='failed',last_reason='attempt_limit',lease_token=NULL
        WHERE status='sending' AND attempts>=${PUSH_MAX_ATTEMPTS} AND available_at<=now() RETURNING id`;
      return { expired: expired.length, exhausted: exhausted.length };
    },
    async claim(limit) {
      const jobs = await sql`WITH picked AS (
        SELECT id FROM horacerta.push_jobs WHERE status IN ('pending','sending') AND available_at<=now() AND attempts<${PUSH_MAX_ATTEMPTS}
        AND created_at>now()-(${PUSH_MAX_AGE_HOURS}*interval '1 hour') ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT ${limit}
      ) UPDATE horacerta.push_jobs j SET status='sending',attempts=attempts+1,
        available_at=now()+(${PUSH_LEASE_SECONDS}*interval '1 second'),lease_token=gen_random_uuid(),last_reason='claimed'
        FROM picked WHERE j.id=picked.id RETURNING j.*`;
      return jobs as PushJob[];
    },
    async recipient(job) {
      // Keep PostgreSQL's full timestamp precision for renewal-safe revocation; JS dates truncate microseconds.
      const [row] = await sql`SELECT s.endpoint,s.p256dh,s.auth,s.updated_at::text updated_at,o.number,o.status,
        u.active,u.pin_change_required,s.user_id=ANY(o.members) assigned,
        EXISTS(SELECT 1 FROM horacerta.entries e WHERE e.order_id=o.id AND e.user_id=s.user_id AND e.deleted_at IS NULL) hours_recorded
        FROM horacerta.push_subscriptions s JOIN horacerta.users u ON u.id=s.user_id
        JOIN horacerta.orders o ON o.id=${job.order_id}::uuid
        WHERE s.id=${job.subscription_id}::uuid AND s.user_id=${job.user_id}::uuid`;
      if (!row) return { reason: 'subscription_missing' };
      if (!row.active) return { reason: 'user_inactive' };
      if (row.pin_change_required) return { reason: 'pin_required' };
      if (!row.assigned) return { reason: 'unassigned' };
      if (job.kind === 'assigned' && !['Agendada', 'Em andamento'].includes(row.status)) return { reason: 'order_closed' };
      if (job.kind === 'hours' && !['Concluída', 'Cancelada'].includes(row.status)) return { reason: 'order_open' };
      if (job.kind === 'hours' && row.hours_recorded) return { reason: 'hours_recorded' };
      return { recipient: { endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth, updated_at: row.updated_at, number: row.number, status: row.status } };
    },
    async finalize(job, result) {
      const updated = await sql`UPDATE horacerta.push_jobs SET status=${result.status},last_reason=${result.reason},last_code=${result.code},
        lease_token=NULL,sent_at=CASE WHEN ${result.status === 'sent'} THEN now() ELSE sent_at END,
        available_at=CASE WHEN ${result.status === 'pending'} THEN now()+(${PUSH_RETRY_SECONDS}*interval '1 second') ELSE available_at END
        WHERE id=${job.id}::uuid AND status='sending' AND lease_token=${job.lease_token}::uuid RETURNING id`;
      return updated.length > 0;
    },
    async revoke(job, recipient: PushRecipient) {
      const removed = await sql`DELETE FROM horacerta.push_subscriptions WHERE id=${job.subscription_id}::uuid AND user_id=${job.user_id}::uuid
        AND endpoint=${recipient.endpoint} AND updated_at=${recipient.updated_at}::timestamptz RETURNING id`;
      return removed.length > 0;
    },
  };
}
