import { ApprovalEngine } from 'hierarchical-approval';
import { MemoryAdapter } from 'hierarchical-approval/adapters/memory';

// @step
const engine = new ApprovalEngine({
  adapter: new MemoryAdapter(), // swap PostgresAdapter in prod
  // Resolves the 'finance-team' role used by the Finance level
  orgProvider: {
    getUsersByRole: (role) => (role === 'finance-team' ? ['fin-1'] : []),
  },
});

await engine.defineTemplate({
  name: 'purchase-order',
  documentType: 'purchase_order',
  levels: [
    { level: 1, name: 'Manager',
      approvers: [{ type: 'user', userId: 'mgr-1' }],
      mode: 'any' },
  ],
  conditions: [{
    when: { field: 'amount', operator: '>', value: 10000 },
    addLevels: [{
      level: 2, name: 'Finance',
      approvers: [{ type: 'role', role: 'finance-team' }],
      mode: 'any',
    }],
  }],
  slaDeadlineDays: 2,
});

// @step
const instance = await engine.submit({
  templateName: 'purchase-order',
  documentId: 'po-0042',
  documentType: 'purchase_order',
  submittedBy: 'alice',
  data: { amount: 15000, vendor: 'Acme Corp' },
});

// instance.levels has two levels because amount > 10000
// instance.status === 'pending'
// instance.idempotencyKey prevents duplicates on retry

// @step
// Listen for completion before the last approval lands
engine.on('approval:completed', (inst) => {
  console.log(inst.status); // 'approved'
  console.log(inst.auditLog.length); // 3 entries
});

// Manager approves
await engine.approve(instance.id, {
  approverId: 'mgr-1',
  comment: 'Looks good',
});

// The levels still collecting decisions: the approval frontier
await engine.getOpenLevels(instance.id); // [2]

// Finance approves — instance status is now 'approved'
await engine.approve(instance.id, { approverId: 'fin-1' });
await engine.getOpenLevels(instance.id); // [] once terminal
