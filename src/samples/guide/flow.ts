// Each `// @step` marker starts the code shown for one section of the guide;
// the file as a whole is type-checked by `npm run check`.

// @step
import { ApprovalEngine } from 'hierarchical-approval';
import { MemoryAdapter } from 'hierarchical-approval/adapters/memory';

const engine = new ApprovalEngine({ adapter: new MemoryAdapter() });

await engine.defineTemplate({
  name: 'Purchase Order',
  documentType: 'purchase_order',
  levels: [
    { level: 1, name: 'Line Manager', approvers: [{ type: 'user', userId: 'manager_alice' }], mode: 'any' },
    { level: 2, name: 'Finance',      approvers: [{ type: 'user', userId: 'finance_bob' }],   mode: 'any' },
  ],
  // Orders over $10,000 automatically gain a CFO level:
  conditions: [{
    when: { field: 'amount', operator: '>', value: 10_000 },
    addLevels: [{ level: 3, name: 'CFO', approvers: [{ type: 'user', userId: 'cfo_carol' }], mode: 'any' }],
  }],
});

// @step
const po = await engine.submit({
  templateName: 'Purchase Order',
  documentId: 'PO-001',
  documentType: 'purchase_order',
  submittedBy: 'employee_jane',
  data: { amount: 4_000, vendor: 'Acme Corp' },
});

await engine.approve(po.id, { approverId: 'manager_alice', comment: 'Budget available' });
await engine.approve(po.id, { approverId: 'finance_bob' }); // → status: 'approved'

// @step
// Finance is on leave — hand the pending step to a colleague:
await engine.delegate(po.id, {
  fromApprover: 'finance_bob',
  toApprover: 'finance_charlie',
  reason: 'On leave until Monday',
});

// Or reject and stop the chain (only an approver of the open level can):
await engine.reject(po.id, { approverId: 'finance_charlie', reason: 'Not in this quarter budget' });

// @step
await engine.defineTemplate({
  name: 'Purchase Order',
  documentType: 'purchase_order',
  levels: [
    // The level decides when the first rung fires; the ladder decides who is added.
    { level: 1, name: 'Line Manager', approvers: [{ type: 'user', userId: 'manager_alice' }], mode: 'any', escalationAfterDays: 2 },
  ],
  escalationSteps: [
    { afterDays: 2, escalateTo: { type: 'user', userId: 'director_dana' } },
    { afterDays: 4, escalateTo: { type: 'user', userId: 'vp_victor' } },
    { afterDays: 7, escalateTo: { type: 'role', role: 'exec' } },
  ],
});

// @step
await engine.defineTemplate({
  name: 'Purchase Order',
  documentType: 'purchase_order',
  levels: [
    {
      level: 1,
      name: 'Line Manager',
      approvers: [{ type: 'user', userId: 'manager_alice' }],
      mode: 'any',
      reminderAfterDays: 2, // first nudge two days after the level opens
      reminderEveryDays: 1, // then daily
      maxReminders: 3,      // the default
    },
  ],
});

engine.on('approval:reminder', (event) => {
  console.log(event.level, event.recipients, event.reminderNumber);
});

// @step
// Store a reference to the quote, not the file itself.
const withQuote = await engine.addAttachment(po.id, {
  actorId: 'buyer-1',
  name: 'quote.pdf',
  uri: 's3://procurement/quotes/q-1.pdf',
  contentType: 'application/pdf',
  sizeBytes: 48_120,
});

// Detach it later; the audit entry keeps the name and URI.
const [quote] = withQuote.attachments ?? [];
await engine.removeAttachment(po.id, {
  actorId: 'buyer-1',
  attachmentId: quote.id,
  reason: 'Superseded by quote v2',
});

// @step
// A manager needs one fact before deciding. The instance stays pending.
await engine.requestInfo(po.id, {
  approverId: 'manager_alice',
  question: 'Which cost centre should this be booked to?',
});

// The submitter answers; every paused deadline moves out by the time it was open.
await engine.provideInfo(po.id, {
  respondedBy: 'buyer-1',
  response: 'CC-42',
});

// @step
// Why does a $25,000 order have a CFO level?
const why = await engine.explainChain('Purchase Order', { amount: 25_000 }, 'employee_jane');
// why.levels[2] → { level: 3, name: 'CFO', source: 'condition', addedByRule: 0, ... }
// why.rules     → [{ index: 0, matched: true, addsLevels: [3], skipsLevels: [] }]

// What happens if the CFO says no? Nothing is stored and nobody is notified.
const dryRun = await engine.simulate({
  templateName: 'Purchase Order',
  data: { amount: 25_000 },
  submittedBy: 'employee_jane',
  decisions: [
    { approve: 'manager_alice' },
    { approve: 'finance_bob' },
    { reject: 'cfo_carol', reason: 'Over budget' },
  ],
});
// dryRun.finalStatus → 'rejected'; dryRun.transcript has one step per decision

// @step
const history = await engine.getHistory(po.id);
// [
//   { action: 'submitted', actorId: 'employee_jane', level: 1, timestamp: ... },
//   { action: 'approved',  actorId: 'manager_alice', level: 1, timestamp: ... },
//   { action: 'delegated', actorId: 'finance_bob', ... },
//   ...
// ]
