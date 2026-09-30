import {z} from 'zod';
export function allowedPushEndpoint(value: string) {
  try {
    const u=new URL(value);
    return u.protocol==='https:' && !u.username && !u.password && !u.port && !u.hash &&
      (u.hostname==='fcm.googleapis.com' || u.hostname==='updates.push.services.mozilla.com' ||
       u.hostname==='web.push.apple.com' || u.hostname.endsWith('.push.apple.com') || u.hostname.endsWith('.notify.windows.com'));
  } catch {return false;}
}
export const pushSubscriptionSchema=z.object({
  endpoint:z.string().max(2048).refine(allowedPushEndpoint,'Serviço de notificações não compatível.'),
  keys:z.object({p256dh:z.string().regex(/^[A-Za-z0-9_-]{87}=?$/),auth:z.string().regex(/^[A-Za-z0-9_-]{22}={0,2}$/)})
});
