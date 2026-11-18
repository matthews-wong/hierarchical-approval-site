import { ApprovalEngine } from 'hierarchical-approval';
import type { IStorageAdapter } from 'hierarchical-approval';
import type { Tracer } from 'hierarchical-approval/plugins/tracing';

// Stand-ins for the objects the snippets assume; not shown on the page.
declare const adapter: IStorageAdapter;
declare const tenantId: string;
declare const instanceId: string;
declare const roleProvider: (actorId: string, tenantId: string) => Promise<string[]>;
declare const emailGateway: { send(event: unknown): Promise<void> };
declare const otel: { trace: { getTracer(name: string): Tracer } };
declare const res: { type(mime: string): { send(body: string): void } };

// Each `// @plugin` marker starts the code shown for one card, in card order;
// the file as a whole is type-checked by `npm run check`.

// @plugin
import { HashChainAuditAdapter } from
  'hierarchical-approval/plugins/audit';

const audit = new HashChainAuditAdapter();
const engine = new ApprovalEngine({ adapter, auditAdapter: audit });

// Prove the log was never altered:
await audit.verify(tenantId, instanceId);
// → { ok: true } | { ok: false, brokenAt: 3 }

// @plugin
import { PrometheusMetricsAdapter } from
  'hierarchical-approval/plugins/metrics';

const metrics = new PrometheusMetricsAdapter();
new ApprovalEngine({ adapter, metricsAdapter: metrics });

// Expose on /metrics:
res.type('text/plain').send(metrics.scrape());

// @plugin
import { RbacAuthorizationPolicy, RateLimitMiddleware }
  from 'hierarchical-approval/plugins/resilience';

new ApprovalEngine({
  adapter,
  authorizationPolicy: new RbacAuthorizationPolicy({
    defaultMode: 'deny',
    rules: { override: { roles: ['admin'] } },
    roleProvider,
  }),
  middleware: [new RateLimitMiddleware({
    capacity: 20, refillTokensPerSecond: 5,
  })],
});

// @plugin
import { OutboxNotificationAdapter } from
  'hierarchical-approval/plugins/notify';

const outbox = new OutboxNotificationAdapter({
  transport: (event) => emailGateway.send(event),
  maxAttempts: 5,
});
new ApprovalEngine({ adapter, notificationAdapter: outbox });

await outbox.drain();        // deliver due items
await outbox.deadLettered(); // inspect failures

// @plugin
import { TracingMiddleware } from
  'hierarchical-approval/plugins/tracing';

// A real OTel tracer satisfies the port structurally —
// no adapter, no extra dependency.
new ApprovalEngine({
  adapter,
  middleware: [new TracingMiddleware({
    tracer: otel.trace.getTracer('approvals'),
  })],
});

// @plugin
import { WebhookNotificationAdapter } from
  'hierarchical-approval/plugins/webhook';

new ApprovalEngine({
  adapter,
  notificationAdapter: new WebhookNotificationAdapter({
    url: 'https://erp.example.com/hooks/approvals',
    secret: process.env.WEBHOOK_SECRET,
  }),
});

// Receiver verifies: HMAC over `<timestamp>.<body>`
// sent as  X-Approval-Signature: t=...,v1=...

// @plugin
import { InMemorySchedulerAdapter } from
  'hierarchical-approval/plugins/scheduler';

// Or implement ISchedulerAdapter over BullMQ / Temporal
// to survive restarts across a fleet.
new ApprovalEngine({
  adapter,
  schedulerAdapter: new InMemorySchedulerAdapter(),
});
