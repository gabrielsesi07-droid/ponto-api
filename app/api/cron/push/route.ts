import { dispatchPushJobs } from '@/lib/push-server';
import { createPushCronHandler } from '@/lib/push-policy';
import { runtimeEnv } from '@/lib/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const GET = createPushCronHandler({
  secret: () => runtimeEnv('CRON_SECRET'), dispatch: dispatchPushJobs,
  onError: () => console.error(JSON.stringify({ event: 'push_cron_error', reason: 'dispatch_unavailable' })),
});
