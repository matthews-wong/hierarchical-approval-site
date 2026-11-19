import { ApprovalEngine } from 'hierarchical-approval';
import type { IStorageAdapter } from 'hierarchical-approval';

// Stand-ins for the objects the snippet assumes; not shown on the page.
declare const adapter: IStorageAdapter;
declare const hr: { coverFor(userId: string, at: Date): Promise<string | null> };

// @step
const engine = new ApprovalEngine({
  adapter,
  outOfOfficeProvider: {
    // Return the stand-in's user id, or null when the approver is available.
    getDelegateFor: async (userId, at) => hr.coverFor(userId, at),
  },
});
