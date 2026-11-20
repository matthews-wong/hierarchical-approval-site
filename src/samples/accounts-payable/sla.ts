// Type-checked by `npm run check`; the page shows the code after the marker.

// Stand-in for the application's Redis client; not shown on the page.
declare const redisConnection: unknown;

// @step
// Wire a real job scheduler for the escalation scan (instead of polling)
import { ApprovalEngine } from 'hierarchical-approval';
import { PostgresAdapter } from 'hierarchical-approval/adapters/postgres';
import { BullMQScheduler } from './adapters/bullmq-scheduler';

const engine = new ApprovalEngine({
  adapter: new PostgresAdapter({ connectionString: process.env.DATABASE_URL }),
  schedulerAdapter: new BullMQScheduler({ redis: redisConnection }),
  // The engine calls scheduler.scheduleAt(id, runAt, callback) for each scan;
  // BullMQ fires the callback at that time instead of a setInterval poll
});
