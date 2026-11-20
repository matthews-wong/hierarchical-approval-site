import type { ISchedulerAdapter } from 'hierarchical-approval';

// Stand-in for the application's own scheduler adapter; not shown on the page.
export declare class BullMQScheduler implements ISchedulerAdapter {
  constructor(options: { redis: unknown });
  scheduleAt: ISchedulerAdapter['scheduleAt'];
  cancel: ISchedulerAdapter['cancel'];
  shutdown: ISchedulerAdapter['shutdown'];
}
