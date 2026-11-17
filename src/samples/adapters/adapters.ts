import type {
  ApprovalInstance,
  AuditEntry,
  AuthorizationContext,
  IAuditAdapter,
  IAuthorizationPolicy,
  IMetricsAdapter,
  INotificationAdapter,
  IOperationMiddleware,
  ISchedulerAdapter,
  MetricName,
  NotificationEvent,
  OperationContext,
} from 'hierarchical-approval';

// Stand-ins for the client libraries the snippets call; not shown on the page.
declare const slack: { post(to: string[], text: string): Promise<void> };
declare const producer: { send(message: { topic: string; messages: { value: string }[] }): Promise<void> };
declare const counters: Record<MetricName, { labels(l: Record<string, string>): { inc(): void } }>;
declare const histograms: Record<MetricName, { observe(seconds: number): void }>;
declare const queue: {
  add(name: string, data: { id: string }, opts: { delay: number }): Promise<{ id: string }>;
  remove(id: string): Promise<void>;
  close(): Promise<void>;
};
declare const budgetSystem: { getSigningCap(actorId: string): Promise<number> };
declare const tracer: { startSpan(name: string): { finish(): void } };

// Each `// @adapter` marker starts the code shown for one adapter card; the
// file as a whole is type-checked by `npm run check`.

// @adapter
class SlackNotifier implements INotificationAdapter {
  async notify(event: NotificationEvent) {
    // event.type, event.recipients, event.instanceId
    if (event.type === 'approval:level_advanced') {
      await slack.post(event.recipients, 'Approval needed');
    }
  }
}

// @adapter
class KafkaAudit implements IAuditAdapter {
  async append(tenantId: string, instanceId: string, entry: AuditEntry, instance: Readonly<ApprovalInstance>) {
    await producer.send({
      topic: 'approvals.audit',
      messages: [{ value: JSON.stringify({
        entry, version: instance.version
      }) }],
    });
  }
}

// @adapter
class PrometheusAdapter implements IMetricsAdapter {
  increment(metric: MetricName, labels?: Record<string, string>) {
    counters[metric].labels(labels ?? {}).inc();
  }
  timing(metric: MetricName, durationMs: number) {
    histograms[metric].observe(durationMs / 1000);
  }
}

// @adapter
class BullMQScheduler implements ISchedulerAdapter {
  async scheduleAt(id: string, runAt: Date) {
    const job = await queue.add('tick', { id },
      { delay: runAt.getTime() - Date.now() });
    return job.id;
  }
  async cancel(handle: string) { await queue.remove(handle); }
  async shutdown() { await queue.close(); }
}

// @adapter
class SigningPolicy implements IAuthorizationPolicy {
  async authorize(ctx: AuthorizationContext) {
    if (ctx.operation === 'override') {
      const cap = await budgetSystem.getSigningCap(ctx.actorId);
      if (Number(ctx.instance.data.amount) > cap)
        return 'Signing cap exceeded';
    }
    return undefined; // allow
  }
}

// @adapter
class TracingMiddleware implements IOperationMiddleware {
  private readonly spans = new Map<string, { finish(): void }>();
  async before(ctx: OperationContext) {
    const span = tracer.startSpan('approval.' + ctx.operation);
    this.spans.set(ctx.instanceId ?? '', span);
  }
  async after(ctx: OperationContext) {
    this.spans.get(ctx.instanceId ?? '')?.finish();
  }
}
