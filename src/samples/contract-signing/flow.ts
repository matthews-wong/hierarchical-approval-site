// Type-checked by `npm run check`. Each `// @step` marker starts the code shown
// for one section, in order.

import type { ApprovalEngine } from 'hierarchical-approval';

// Stand-ins for your own code; not shown on the page.
declare const engine: ApprovalEngine;
interface Contract {
  contractId: string;
  instanceId: string;
  submittedBy: string;
  data: Record<string, unknown>;
}
declare const app: {
  post(path: string, handler: (req: { body: { envelopeId: string; status: string; signerEmail: string } }, res: { sendStatus(code: number): void }) => Promise<void>): void;
};
declare const db: { query(sql: string, params: unknown[]): Promise<{ rows: { instance_id: string }[] }> };

// @step
// The counterparty's signer comes from the contract data
engine.registerResolver('counterparty-signatory', (_submittedBy, data) => String(data.counterpartySignerId));

const totalValue = (min: number) => ({ field: 'totalValue', operator: '>', value: min });

await engine.defineTemplate({
  name: 'contract-signing',
  documentType: 'contract',
  levels: [
    { level: 1, name: 'Department head', approvers: [{ type: 'role', role: 'department-head' }], mode: 'any' },
    // Legal review is part of every chain; either counsel can clear it
    {
      level: 2,
      name: 'Legal',
      approvers: [{ type: 'role', role: 'legal-counsel' }, { type: 'role', role: 'legal-reviewer' }],
      mode: 'any',
    },
  ],
  conditions: [
    // Finance for high-value or long-duration contracts
    {
      when: { any: [totalValue(50_000), { field: 'durationMonths', operator: '>', value: 24 }] },
      addLevels: [{ level: 3, name: 'CFO', approvers: [{ type: 'role', role: 'cfo' }], mode: 'any' }],
    },
    // Board for very high-value contracts: both must sign
    {
      when: totalValue(250_000),
      addLevels: [
        {
          level: 4,
          name: 'Board',
          approvers: [{ type: 'role', role: 'ceo' }, { type: 'role', role: 'board-chair' }],
          mode: 'all',
        },
      ],
    },
    // The counterparty signs last
    {
      when: { field: 'requiresCounterSignature', operator: '==', value: true },
      addLevels: [
        { level: 5, name: 'Counterparty', approvers: [{ type: 'dynamic', resolver: 'counterparty-signatory' }], mode: 'any' },
      ],
    },
  ],
});

// @step
// Withdraw the in-flight contract, then submit the amended one
async function submitAmendment(original: Contract, amended: Contract) {
  await engine.cancel(original.instanceId, {
    cancelledBy: amended.submittedBy,
    reason: 'Superseded by amendment',
  });

  // The new instance evaluates the conditions against the amended value:
  // 45k -> 60k adds the CFO level
  return engine.submit({
    templateName: 'contract-signing',
    documentType: 'contract',
    documentId: `${original.contractId}-A1`,
    submittedBy: amended.submittedBy,
    data: { ...amended.data, isAmendment: true, originalContractId: original.contractId },
  });
}

// @step
// Receive the counter-signature from DocuSign / Adobe Sign
app.post('/webhooks/docusign', async (req, res) => {
  const { envelopeId, status, signerEmail } = req.body;
  if (status !== 'completed') return res.sendStatus(200);

  // Your own table maps the envelope to the approval instance
  const { instance_id } = (await db.query(
    'SELECT instance_id FROM contract_envelopes WHERE envelope_id = $1',
    [envelopeId]
  )).rows[0];

  // signerEmail must match the id the resolver returned: `external:${email}`
  await engine.approve(instance_id, {
    approverId: `external:${signerEmail}`,
    comment: `Counter-signed via DocuSign envelope ${envelopeId}`,
  });

  res.sendStatus(200);
});
