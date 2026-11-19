import type { ApprovalEngine } from 'hierarchical-approval';

// Stand-ins for the engines the snippet assumes; not shown on the page.
declare const sandbox: ApprovalEngine;
declare const production: ApprovalEngine;

// @step
// Author in a sandbox, promote to production.
const bundle = await sandbox.exportTemplates(['Purchase Order']);

// Report what would change before writing anything.
const preview = await production.importTemplates(bundle, { mode: 'upsert', dryRun: true });
console.log(preview.created, preview.updated, preview.errors);

await production.importTemplates(bundle, { mode: 'upsert' });
