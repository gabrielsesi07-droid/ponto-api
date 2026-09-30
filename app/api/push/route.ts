import {cookies} from 'next/headers';
import {db,member,coordinator,payload,failure,ApiError} from '@/lib/server';
import {after} from 'next/server';
import {dispatchPushSafely} from '@/lib/push-server';
import {digest} from '@/lib/pin';
import {pushSubscriptionSchema} from '@/lib/push-validation';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET() {
  try {
    const me=await member(),sql=db();
    const [config]=await sql`SELECT public_key FROM horacerta.push_config WHERE id=1`;
    const [count]=await sql`SELECT count(*)::int n FROM horacerta.push_subscriptions p JOIN horacerta.sessions s ON s.token_hash=p.session_hash AND s.expires_at>now() WHERE p.user_id=${me.id}::uuid`;
    return Response.json({publicKey:config?.public_key || null,devices:count.n},{headers:{'Cache-Control':'private, no-store'}});
  } catch(e){return failure(e);}
}
export async function POST(req:Request) {
  try {
    const me=await member(),body=await payload(req),sql=db();
    if(body.action==='retry') {
      coordinator(me);
      await sql`UPDATE horacerta.push_jobs SET status='pending',attempts=0,available_at=now() WHERE status IN ('pending','failed') AND created_at>now()-interval '24 hours'`;
      after(dispatchPushSafely);
      return Response.json({ok:true});
    }
    const p=pushSubscriptionSchema.parse(body);
    const token=(await cookies()).get('hc_session')?.value;
    if (!token) throw new ApiError(401,'Entre novamente para ativar.');
    const hash=await digest(token);
    await sql.transaction([
      sql`DELETE FROM horacerta.push_jobs WHERE subscription_id IN (SELECT id FROM horacerta.push_subscriptions WHERE endpoint=${p.endpoint} AND user_id<>${me.id}::uuid)`,
      sql`INSERT INTO horacerta.push_subscriptions(user_id,session_hash,endpoint,p256dh,auth)
        VALUES(${me.id}::uuid,${hash},${p.endpoint},${p.keys.p256dh},${p.keys.auth})
        ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,session_hash=excluded.session_hash,p256dh=excluded.p256dh,auth=excluded.auth,updated_at=now()`
    ]);
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
