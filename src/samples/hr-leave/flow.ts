// Type-checked by `npm run check`; the page shows the code after each marker.
// The config, quota and emergency steps share `engine`, so they are one file.

// Stand-ins for your own code; not shown on the page.
declare const directory: { usersWithRole(role: string): Promise<string[]> };
declare const hrSystem: { managerIdOf(userId: string): Promise<string> };
declare const departmentId: string;
declare const startDate: string;
declare const endDate: string;
declare function getTeamMaxConcurrent(departmentId: string): Promise<number>;

// @step
import { ApprovalEngine } from 'hierarchical-approval';
import { PostgresAdapter } from 'hierarchical-approval/adapters/postgres';

const engine = new ApprovalEngine({
  adapter: new PostgresAdapter({ connectionString: process.env.DATABASE_URL }),
  tenantId: 'acme-corp',
  // Resolves every { type: 'role' } approver below
  orgProvider: { getUsersByRole: (role) => directory.usersWithRole(role) },
});

// A { type: 'dynamic' } approver: look up the submitter's direct manager
engine.registerResolver('direct-manager', (submittedBy) => hrSystem.managerIdOf(submittedBy));

await engine.defineTemplate({
  name: 'hr-leave',
  documentType: 'leave-request',
  levels: [
    {
      level: 1,
      name: 'Manager',
      approvers: [{ type: 'dynamic', resolver: 'direct-manager' }],
      mode: 'any',
    },
    {
      level: 3,
      name: 'HR',
      approvers: [{ type: 'role', role: 'hr-admin' }],
      mode: 'any',
    },
  ],
  conditions: [
    // Extended leave (> 10 days) adds the department head between the two
    {
      when: { field: 'durationDays', operator: '>', value: 10 },
      addLevels: [
        {
          level: 2,
          name: 'Department head',
          approvers: [{ type: 'role', role: 'dept-head' }],
          mode: 'any',
        },
      ],
    },
    // Short sick leave (< 3 days) skips HR
    {
      when: {
        all: [
          { field: 'leaveType', operator: '==', value: 'sick' },
          { field: 'durationDays', operator: '<', value: 3 },
        ],
      },
      skipLevels: [3],
    },
    // Emergency leave skips the manager and goes straight to HR
    {
      when: { field: 'leaveType', operator: '==', value: 'emergency' },
      skipLevels: [1],
    },
  ],
});

// @step
// Count approved leave in the same department that overlaps the request
async function overlappingLeave(departmentId: string, startDate: string, endDate: string) {
  const { items } = await engine.queryInstances(
    { documentType: 'leave-request', status: 'approved', data: { departmentId } },
    { limit: 500, offset: 0 }
  );
  // ISO dates compare correctly as strings
  return items.filter(
    (leave) => String(leave.data.startDate) < endDate && String(leave.data.endDate) > startDate
  ).length;
}

// Call before engine.submit()
const onLeave = await overlappingLeave(departmentId, startDate, endDate);
if (onLeave >= (await getTeamMaxConcurrent(departmentId))) {
  throw new Error(`Team quota exceeded: ${onLeave} already on leave`);
}

// @step
// Emergency leave: the manager level is skipped, HR is the only approver
const instance = await engine.submit({
  templateName: 'hr-leave',
  documentType: 'leave-request',
  documentId: 'leave-2026-0412',
  submittedBy: 'emp-0712',
  data: {
    leaveType: 'emergency',
    startDate: '2026-11-02',
    endDate: '2026-11-02',
    durationDays: 1,
  },
});
// instance.status === 'pending', waiting on level 3 (HR) only

await engine.approve(instance.id, { approverId: 'hr-erin' });
// instance.status === 'approved' — no manager round trip
