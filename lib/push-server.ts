import 'server-only';
import webpush from 'web-push';
import { db } from './server';
import { allowedPushEndpoint } from './push-validation';
import { runPushDispatch } from './push-policy';
import { createPushStore } from './push-store';

/** Provider acceptance is not delivery/read confirmation. Never log keys or recipients. */
export async function dispatchPushJobs() {
  const report = await runPushDispatch({
    store: createPushStore(db()), endpointAllowed: allowedPushEndpoint,
    send: async (subscription, payload, options) => { await webpush.sendNotification(subscription, payload, options); },
  });
  console.info(JSON.stringify({ event: 'push_dispatch', ...report }));
  return report;
}

/** Event-triggered work keeps jobs durable if invocation/storage fails. Cron uses the strict function. */
export async function dispatchPushSafely() {
  try { await dispatchPushJobs(); }
  catch { console.error(JSON.stringify({ event: 'push_dispatch_error', reason: 'dispatch_unavailable' })); }
}
