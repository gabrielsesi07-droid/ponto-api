import {cookies} from 'next/headers';
import {db,member,coordinator,payload,failure,ApiError} from '@/lib/server';
import {after} from 'next/server';
import {dispatchPushSafely} from '@/lib/push-server';
import {digest} from '@/lib/pin';
import {pushSubscriptionSchema} from '@/lib/push-validation';
import {PUSH_MAX_AGE_HOURS} from '@/lib/push-policy';
import {registerPushDevice} from '@/lib/push-store';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET(req: Request) {
  try {
    const me=await member(),sql=db();
    const [config]=await sql`SELECT public_key FROM horacerta.push_config WHERE id=1`;
    const rawEndpoint=new URL(req.url).searchParams.get('endpoint');
    const endpoint=rawEndpoint === null ? null : pushSubscriptionSchema.shape.endpoint.parse(rawEndpoint);
    const [count]=await sql`SELECT count(*)::int n,coalesce(bool_or(endpoint=${endpoint}),false) registered
      FROM horacerta.push_subscriptions WHERE user_id=${me.id}::uuid`;
    const delivery=me.role==='coordinator' ? (await sql`SELECT
      count(*) FILTER(WHERE status='pending')::int pending,count(*) FILTER(WHERE status='sending')::int sending,
      count(*) FILTER(WHERE status='failed')::int failed,count(*) FILTER(WHERE last_reason='expired')::int expired,
      count(*) FILTER(WHERE status='sent' AND sent_at>now()-interval '24 hours')::int sent_last_24h,
      max(sent_at) last_sent_at FROM horacerta.push_jobs`)[0] : undefined;
    return Response.json({publicKey:config?.public_key || null,devices:count.n,registered:count.registered,
      ...(delivery ? {delivery} : {})},{headers:{'Cache-Control':'private, no-store'}});
  } catch(e){return failure(e);}
}
export async function POST(req:Request) {
  try {
    const me=await member(),body=await payload(req),sql=db();
    if(body.action==='retry') {
      coordinator(me);
      await sql`UPDATE horacerta.push_jobs SET status='pending',attempts=0,available_at=now(),lease_token=NULL,last_reason='manual_retry'
        WHERE status IN ('pending','failed') AND created_at>now()-(${PUSH_MAX_AGE_HOURS}*interval '1 hour')`;
      after(dispatchPushSafely);
      return Response.json({ok:true});
    }
    const p=pushSubscriptionSchema.parse(body);
    const token=(await cookies()).get('hc_session')?.value;
    if (!token) throw new ApiError(401,'Entre novamente para ativar.');
    const hash=await digest(token);
    if (!await registerPushDevice(sql,me.id,hash,p)) throw new ApiError(401,'Sua sessão mudou. Entre novamente para ativar este aparelho.');
    return Response.json({ok:true});
  } catch(e){return failure(e);}
}
export async function DELETE(req:Request) {
  try {
    const me=await member(),p=await payload(req);
    if (typeof p.endpoint!=='string' || p.endpoint.length>2048) throw new ApiError(400,'Aparelho inválido.');
    await db()`DELETE FROM horacerta.push_subscriptions WHERE user_id=${me.id}::uuid AND endpoint=${p.endpoint}`;
    return Response.json({ok:true});
  } catch(e){return failure(e);}
}
