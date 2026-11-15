import { ApprovalEngine } from 'hierarchical-approval';
import { MemoryAdapter } from 'hierarchical-approval/adapters/memory';

const engine = new ApprovalEngine({
  adapter: new MemoryAdapter(),
  tenantId: 'acme',
  // Resolves the 'finance-team' role used by the Finance level below
  orgProvider: {
    getUsersByRole: (role) => (role === 'finance-team' ? ['fin-1'] : []),
  },
});

// 1 — Define a reusable template
await engine.defineTemplate({
  name: 'purchase-order',
  documentType: 'purchase_order',
  levels: [
    {
      level: 1,
      name: 'Manager',
      approvers: [{ type: 'user', userId: 'mgr-1' }],
      mode: 'any',
    },
  ],
  // Finance level only activates above $10k
  conditions: [
    {
      when: { field: 'amount', operator: '>', value: 10000 },
      addLevels: [
        {
          level: 2,
          name: 'Finance',
          approvers: [{ type: 'role', role: 'finance-team' }],
          mode: 'any',
        },
      ],
    },
  ],
  slaDeadlineDays: 2,
  allowOverride: true,
});

// 2 — Submit a document
const instance = await engine.submit({
  templateName: 'purchase-order',
  documentId: 'po-0042',
  documentType: 'purchase_order',
  submittedBy: 'alice',
  data: { amount: 15000, vendor: 'Acme Corp' },
});
// instance.levels has two levels because amount > 10000

// 3 — Manager approves
await engine.approve(instance.id, {
  approverId: 'mgr-1',
  comment: 'Looks good',
});

// 4 — Finance approves — instance is now 'approved'
await engine.approve(instance.id, { approverId: 'fin-1' });

await engine.shutdown();
