import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {allowedPushEndpoint,pushSubscriptionSchema} from '../lib/push-validation.ts';
test('push destinations cannot target arbitrary servers or private network',()=>{
 for(const host of ['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com','wns.notify.windows.com']) assert.ok(allowedPushEndpoint(`https://${host}/token`));
 for(const url of ['http://fcm.googleapis.com/x','https://127.0.0.1/x','https://example.com/x','https://fcm.googleapis.com.attacker.test/x','https://user:pass@fcm.googleapis.com/x','https://fcm.googleapis.com:444/x']) assert.equal(allowedPushEndpoint(url),false);
 assert.equal(pushSubscriptionSchema.safeParse({endpoint:'https://fcm.googleapis.com/x',keys:{p256dh:'bad',auth:'bad'}}).success,false);
});
test('notification click opens only same-origin OS, with a generic fallback',async()=>{
 const events={},shown=[],opened=[];
 const context={URL,self:{location:{origin:'https://ponto-api-gold.vercel.app'},addEventListener:(name,fn)=>events[name]=fn,registration:{showNotification:async(...args)=>shown.push(args)},clients:{openWindow:async url=>opened.push(url)}}};
 vm.runInNewContext(await readFile(new URL('../public/sw.js',import.meta.url),'utf8'),context);
 let result;const waitUntil=p=>result=p;
 events.push({data:{json:()=>({url:'https://attacker.test',body:'Aviso'})},waitUntil});await result;
 assert.equal(shown[0][1].data.url,'/?view=orders');
 events.notificationclick({notification:{close(){},data:shown[0][1].data},waitUntil});await result;
 assert.deepEqual(opened,['https://ponto-api-gold.vercel.app/?view=orders']);
 const path='/?view=orders&order=00000000-0000-4000-8000-000000000001';
 events.push({data:{json:()=>({url:path})},waitUntil});await result;
 assert.equal(shown[1][1].data.url,path);
});
