import 'server-only';
import webpush from 'web-push';
import {db} from './server';
import {allowedPushEndpoint} from './push-validation';

/** Durable jobs are claimed with a lease. Provider acceptance is not proof of reading. */
export async function dispatchPushJobs() {
  const sql=db();
  const [keys]=await sql`SELECT public_key,private_key FROM horacerta.push_config WHERE id=1`;
  if (!keys) return;
  await sql`UPDATE horacerta.push_jobs SET status='failed' WHERE status='sending' AND attempts>=4 AND available_at<=now()`;
  await sql`UPDATE horacerta.push_jobs SET status='skipped' WHERE status IN ('pending','failed','sending') AND created_at<=now()-interval '24 hours'`;
  const deadline=Date.now()+40000;
  for (let batch=0;batch<10 && Date.now()<deadline;batch++) {
    const jobs=await sql`WITH picked AS (
      SELECT id FROM horacerta.push_jobs WHERE status IN ('pending','sending') AND available_at<=now() AND attempts<4
      AND created_at>now()-interval '24 hours' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 20
    ) UPDATE horacerta.push_jobs j SET status='sending',attempts=attempts+1,available_at=now()+interval '2 minutes'
    FROM picked WHERE j.id=picked.id RETURNING j.*`;
    if (!jobs.length) break;
    await Promise.all(jobs.map(async job=>{
      const [s]=await sql`SELECT s.endpoint,s.p256dh,s.auth,o.number,o.status FROM horacerta.push_subscriptions s
        JOIN horacerta.sessions session ON session.token_hash=s.session_hash AND session.expires_at>now()
        JOIN horacerta.users u ON u.id=s.user_id AND u.active
        JOIN horacerta.orders o ON o.id=${job.order_id}::uuid AND s.user_id=ANY(o.members)
          AND (${job.kind==='hours'} OR o.status IN ('Agendada','Em andamento'))
          -- Lembrete perde o sentido se a pessoa registrou horas enquanto o envio aguardava.
          AND NOT (${job.kind==='hours'} AND EXISTS(SELECT 1 FROM horacerta.entries e WHERE e.order_id=o.id AND e.user_id=s.user_id AND e.deleted_at IS NULL))
        WHERE s.id=${job.subscription_id}::uuid AND s.user_id=${job.user_id}::uuid`;
      if (!s || !allowedPushEndpoint(s.endpoint)) {
        await sql`UPDATE horacerta.push_jobs SET status='skipped' WHERE id=${job.id}::uuid`; return;
      }
      try {
        await webpush.sendNotification({endpoint:s.endpoint,keys:{p256dh:s.p256dh,auth:s.auth}},JSON.stringify({
          ...(job.kind==='hours'
            ? {title:'Registre suas horas',body:`A OS-${String(s.number).padStart(6,'0')} foi ${s.status==='Cancelada'?'cancelada':'concluída'} e ainda não há horas suas nela.`,
              url:`/?view=orders&order=${job.order_id}`,tag:`horas-${job.order_id}`}
            : {title:'Nova ordem de serviço',body:`Você foi designado para a OS-${String(s.number).padStart(6,'0')}. Abra para conferir.`,
              url:`/?view=orders&order=${job.order_id}`,tag:`os-${job.order_id}`}),
        }),{TTL:86400,timeout:4000,vapidDetails:{subject:'https://ponto-api-gold.vercel.app',publicKey:keys.public_key,privateKey:keys.private_key}});
        await sql`UPDATE horacerta.push_jobs SET status='sent',sent_at=now(),last_code=201 WHERE id=${job.id}::uuid`;
      } catch (error) {
        const code=Number((error as {statusCode?:number}).statusCode)||0;
        if (code===404 || code===410) await sql`DELETE FROM horacerta.push_subscriptions WHERE id=${job.subscription_id}::uuid`;
        else await sql`UPDATE horacerta.push_jobs SET status=${Number(job.attempts)>=4?'failed':'pending'},last_code=${code},available_at=now()+interval '5 minutes' WHERE id=${job.id}::uuid`;
      }
    }));
  }
}
export async function dispatchPushSafely() {
  try {await dispatchPushJobs();} catch {console.error('Push dispatch deferred; pending jobs retained.');}
}
