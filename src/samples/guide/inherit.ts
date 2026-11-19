import { ApprovalEngine } from 'hierarchical-approval';
import type { IStorageAdapter } from 'hierarchical-approval';

declare const adapter: IStorageAdapter;
const engine = new ApprovalEngine({ adapter });

// @step
// PO-base holds the shared spine; the EU variant swaps one level.
await engine.defineTemplate({
  name: 'PO-EU',
  extends: 'PO-base',
  documentType: 'purchase_order',
  removeLevels: [2], // drop an inherited level
  levels: [
    {
      level: 3, // same number as a base level: overrides it field by field
      name: 'EU Finance',
      mode: 'any',
      approvers: [{ type: 'user', userId: 'eu-fin' }],
    },
  ],
});
