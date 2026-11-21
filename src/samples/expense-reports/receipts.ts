// Type-checked by `npm run check`; the page shows the code after the marker.

// Stand-in for the instance returned by submit(); not shown on the page.
declare const instance: { id: string };

// @step
// Hold approval until receipts are attached (IAuthorizationPolicy)
import { ApprovalEngine } from 'hierarchical-approval';
import { PostgresAdapter } from 'hierarchical-approval/adapters/postgres';
import type { IAuthorizationPolicy, AuthorizationContext } from 'hierarchical-approval';

const MEAL_RECEIPT_THRESHOLD_USD = 25;

class ReceiptPolicy implements IAuthorizationPolicy {
  authorize(ctx: AuthorizationContext): string | undefined {
    if (ctx.operation !== 'approve') return undefined;

    const { receipts, category, amountUsd } = ctx.instance.data as {
      receipts: string[];
      category: string;
      amountUsd: number;
    };
    const requiresReceipt =
      category !== 'meals' || amountUsd > MEAL_RECEIPT_THRESHOLD_USD;

    if (requiresReceipt && receipts.length === 0) {
      return 'Receipt required for this expense category and amount';
    }
    return undefined; // allow
  }
}

const engine = new ApprovalEngine({
  adapter: new PostgresAdapter({ connectionString: process.env.DATABASE_URL }),
  tenantId: 'acme-corp',
  authorizationPolicy: new ReceiptPolicy(),
});

// approve() now throws ApprovalForbiddenError until the employee attaches them:
await engine.updateData(instance.id, {
  updatedBy: 'emp-4821',
  data: { receipts: ['receipt-001.pdf'] },
  mode: 'merge',
  // Receipts do not change who approves, so leave the chain as it is
  recomputeChain: false,
});
