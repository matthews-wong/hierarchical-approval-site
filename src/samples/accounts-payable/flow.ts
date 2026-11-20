// Each `// @step` marker starts the code shown for one section of the page;
// the file as a whole is type-checked by `npm run check`.

// Stand-ins for the application code the snippets call; not shown on the page.
declare const directory: { usersWithRole(role: string): Promise<string[]> };
declare const instanceId: string;

// @step
import { ApprovalEngine } from 'hierarchical-approval';
import { PostgresAdapter } from 'hierarchical-approval/adapters/postgres';

const engine = new ApprovalEngine({
  adapter: new PostgresAdapter({ connectionString: process.env.DATABASE_URL }),
  tenantId: 'acme-corp',
  // Resolves every { type: 'role' } approver below
  orgProvider: { getUsersByRole: (role) => directory.usersWithRole(role) },
});

await engine.defineTemplate({
  name: 'accounts-payable',
  documentType: 'invoice',
  // Level 1: department head, always required
  levels: [
    {
      level: 1,
      name: 'Department head',
      approvers: [{ type: 'role', role: 'dept-head' }],
      mode: 'any',
    },
  ],
  // Each rule adds its level when the invoice data matches
  conditions: [
    {
      when: { field: 'amount', operator: '>', value: 1_000 },
      addLevels: [
        {
          level: 2,
          name: 'Finance manager',
          approvers: [{ type: 'role', role: 'finance-manager' }],
          mode: 'any',
        },
      ],
    },
    {
      when: { field: 'amount', operator: '>', value: 10_000 },
      addLevels: [
        {
          level: 3,
          name: 'CFO',
          approvers: [{ type: 'role', role: 'cfo' }],
          mode: 'any',
        },
      ],
    },
    {
      when: { field: 'amount', operator: '>', value: 50_000 },
      addLevels: [
        {
          level: 4,
          name: 'Board',
          approvers: [{ type: 'role', role: 'board-member' }],
          mode: 'any', // any one board member approves
        },
      ],
    },
  ],
  slaDeadlineDays: 7,
});

// @step
// Submit an invoice for approval
const instance = await engine.submit({
  templateName: 'accounts-payable',
  documentId: 'INV-2847',
  documentType: 'invoice',
  submittedBy: 'emp-4821',
  data: {
    vendorId: 'vendor-99',
    amount: 15_000,
    currency: 'USD',
    departmentId: 'dept-engineering',
  },
});

// instance.status === 'pending'
// instance.currentLevel === 1  (awaiting the department head)
// instance.levels.length === 3 (amount > 10,000 adds Finance and CFO)
console.log(instance.id);

// @step
// Department head approves (level 1)
await engine.approve(instance.id, {
  approverId: 'user-dept-head-42',
  comment: 'Approved - valid vendor contract',
});

// The instance advances to level 2 (Finance manager)
// INotificationAdapter receives approval:level_advanced

// Finance manager approves (level 2)
await engine.approve(instance.id, {
  approverId: 'user-finance-mgr',
  comment: 'Within Q3 budget',
});

// The CFO is now the open level (level 3)...

// @step
import { ApprovalConflictError } from 'hierarchical-approval';

// Two approvers act on the same instance at the same moment.
// The storage adapter rejects the stale write; the engine retries it
// (3 attempts by default) before giving up.

try {
  await engine.approve(instanceId, { approverId: 'approver-a' });
} catch (err) {
  if (err instanceof ApprovalConflictError) {
    // Still conflicting after every retry. Re-fetch to see the current state.
    const current = await engine.getInstance(instanceId);
    console.log('Current level:', current.currentLevel);
  }
}

// @step
// Dept head going on leave: hand the open level to a colleague
await engine.delegate(instance.id, {
  fromApprover: 'user-dept-head-42',
  toApprover: 'user-backup-head',
  reason: 'On leave until 15 Aug',
  until: new Date('2027-08-15'),
});

// 'user-backup-head' can now approve this instance's open level.
// When 'until' passes, the scheduled scan reassigns the seat back to
// 'user-dept-head-42'. The audit trail records the delegation.
