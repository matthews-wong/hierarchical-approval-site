// Type-checked by `npm run check`. Each `// @step` marker starts the code shown
// for one section, in order.

import type { ApprovalEngine, ApprovalInstance } from 'hierarchical-approval';

// Stand-ins for your own code; not shown on the page.
declare const engine: ApprovalEngine;
declare const hrSystem: { managerIdOf(userId: string): Promise<string> };
declare const vendorId: string;
declare const userId: string;
declare const amount: number;
declare const poInstance: ApprovalInstance;

// @step
engine.registerResolver('direct-manager', (submittedBy) => hrSystem.managerIdOf(submittedBy));

const department = (name: string) => ({ field: 'department', operator: '==', value: name });

await engine.defineTemplate({
  name: 'purchase-order',
  documentType: 'purchase-order',
  allowOverride: true, // required for engine.override() below
  levels: [
    {
      level: 1,
      name: 'Manager',
      approvers: [{ type: 'dynamic', resolver: 'direct-manager' }],
      mode: 'any',
    },
  ],
  conditions: [
    {
      when: department('it'),
      addLevels: [{ level: 2, name: 'IT director', approvers: [{ type: 'role', role: 'it-director' }], mode: 'any' }],
    },
    // Enterprise software also needs Security sign-off
    {
      when: { all: [department('it'), { field: 'isEnterpriseContract', operator: '==', value: true }] },
      addLevels: [{ level: 3, name: 'Security', approvers: [{ type: 'role', role: 'security-officer' }], mode: 'any' }],
    },
    {
      when: { all: [department('marketing'), { field: 'amount', operator: '>', value: 5_000 }] },
      addLevels: [{ level: 2, name: 'Marketing director', approvers: [{ type: 'role', role: 'marketing-director' }], mode: 'any' }],
    },
    {
      when: department('operations'),
      addLevels: [{ level: 2, name: 'Operations head', approvers: [{ type: 'role', role: 'operations-head' }], mode: 'any' }],
    },
    // Finance is a universal gate above $10,000
    {
      when: { field: 'amount', operator: '>', value: 10_000 },
      addLevels: [{ level: 4, name: 'Finance', approvers: [{ type: 'role', role: 'finance-controller' }], mode: 'any' }],
    },
  ],
});

// @step
// Sum the vendor's open POs from the same requester over the last 30 days
async function openTotalForVendor(vendorId: string, submittedBy: string): Promise<number> {
  const { items } = await engine.queryInstances(
    {
      documentType: 'purchase-order',
      status: 'pending',
      submittedBy,
      fromDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      data: { vendorId },
    },
    { limit: 500, offset: 0 }
  );
  return items.reduce((total, po) => total + Number(po.data.amount), 0);
}

// Call before engine.submit()
const combined = (await openTotalForVendor(vendorId, userId)) + amount;
if (amount <= 10_000 && combined > 10_000) {
  throw new Error(`Split PO detected: combined total ${combined}`);
}

// @step
// Emergency procurement: bypass the remaining levels
const instance = await engine.override(poInstance.id, {
  overriddenBy: 'admin-cso',
  justification: 'Emergency server replacement - P0 incident, board notified',
});
// instance.status === 'approved'

// The audit trail gets an 'overridden' entry:
// { action: 'overridden', actorId: 'admin-cso', reason: 'Emergency server replacement ...', ... }

// @step
await engine.reject(instance.id, {
  approverId: 'finance-fiona',
  reason: 'Hardware approved; remove the 3-year extended warranty line',
});

// The requester fixes the data and resubmits
const revised = await engine.resubmit(instance.id, {
  resubmittedBy: 'emp-0712',
  reason: 'Warranty line removed',
  updatedData: { amount: 7_000 },
});
// revised.status === 'pending', revised.parentInstanceId === instance.id
