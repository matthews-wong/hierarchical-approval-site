// Type-checked by `npm run check`. It redeclares `engine`, so it cannot share
// a file with flow.ts.

import { ApprovalEngine } from 'hierarchical-approval';
import type { ApprovalInstance, IStorageAdapter, OrgProvider } from 'hierarchical-approval';

// Stand-ins for your own code; not shown on the page.
declare const adapter: IStorageAdapter;
declare const orgProvider: OrgProvider;
declare const instance: ApprovalInstance;
declare const hrSystem: { coverFor(userId: string, at: Date): Promise<string | null> };

// @step
// Standing cover: consulted whenever a level's approvers are resolved,
// so a manager who is away is replaced before the request reaches them
const engine = new ApprovalEngine({
  adapter,
  tenantId: 'acme-corp',
  orgProvider,
  outOfOfficeProvider: {
    getDelegateFor: (userId, at) => hrSystem.coverFor(userId, at), // string | null
  },
});

// One-off hand-off of a request that is already waiting on someone
await engine.delegate(instance.id, {
  fromApprover: 'manager-bob',
  toApprover: 'manager-carol',
  reason: 'Away 2-13 November',
  until: new Date('2026-11-13'),
});

// manager-carol can now call engine.approve(instance.id, { approverId: 'manager-carol' })
