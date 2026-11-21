// Each `// @step` marker starts the code shown for one section of the page;
// the file as a whole is type-checked by `npm run check`.

// Stand-ins for the application code the snippets call; not shown on the page.
declare const directory: { usersWithRole(role: string): Promise<string[]> };
declare const employeeId: string;
declare const category: string;
declare const amount: number;
declare const currency: string;

// @step
import { ApprovalEngine } from 'hierarchical-approval';
import { PostgresAdapter } from 'hierarchical-approval/adapters/postgres';

const engine = new ApprovalEngine({
  adapter: new PostgresAdapter({ connectionString: process.env.DATABASE_URL }),
  tenantId: 'acme-corp',
  // Resolves every { type: 'role' } approver below
  orgProvider: { getUsersByRole: (role) => directory.usersWithRole(role) },
});

// Conditions read plain data fields, so convert to USD before submitting
// and store the result as data.amountUsd (see edge case 03).
await engine.defineTemplate({
  name: 'expense-report',
  documentType: 'expense',
  levels: [
    {
      level: 1,
      name: 'Direct manager',
      approvers: [{ type: 'role', role: 'direct-manager' }],
      mode: 'any',
    },
  ],
  conditions: [
    {
      when: { field: 'amountUsd', operator: '>', value: 500 },
      addLevels: [
        {
          level: 2,
          name: 'Finance',
          approvers: [{ type: 'role', role: 'finance-controller' }],
          mode: 'any',
        },
      ],
    },
    {
      when: { field: 'amountUsd', operator: '>', value: 2_000 },
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
      when: { field: 'isInternational', operator: '==', value: true },
      addLevels: [
        {
          level: 4,
          name: 'Compliance',
          approvers: [{ type: 'role', role: 'compliance-officer' }],
          mode: 'any',
        },
      ],
    },
  ],
});

// @step
// Detect duplicate expense reports before submitting
const DUPLICATE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

async function isDuplicate(
  employeeId: string,
  category: string,
  totalAmount: number,
  currency: string
): Promise<boolean> {
  const recent = await engine.queryInstances({
    documentType: 'expense',
    submittedBy: employeeId,
    fromDate: new Date(Date.now() - DUPLICATE_WINDOW_MS),
    // Matches instances whose data contains all of these pairs
    data: { category, totalAmount, currency },
  });
  return recent.items.some((instance) => instance.status !== 'rejected');
}

if (await isDuplicate(employeeId, category, amount, currency)) {
  throw new Error('Duplicate expense report detected within the last 7 days');
}
