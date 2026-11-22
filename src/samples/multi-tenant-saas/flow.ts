// Type-checked by `npm run check`; the page shows the code after each marker.
// The three steps share engineFor(), toTemplate() and TenantApprovalConfig,
// so they are one file.

// Stand-ins for your own code; not shown on the page.
declare const directory: { usersWithRole(role: string, tenantId: string): Promise<string[]> };
declare const db: { query(sql?: string, params?: unknown[]): Promise<{ rows: Array<{ status?: string }> }> };
declare const tenantId: string;
declare const config: TenantApprovalConfig | undefined;
interface Response {
  status(code: number): { json(body: unknown): void };
}

// @step
import { ApprovalEngine } from 'hierarchical-approval';
import type { ApprovalTemplateConfig } from 'hierarchical-approval';
import { PostgresAdapter } from 'hierarchical-approval/adapters/postgres';

// One engine per tenant: tenantId scopes templates and instances.
// Share the adapter (one pool) across all of them.
const adapter = new PostgresAdapter({ connectionString: process.env.DATABASE_URL });
const engines = new Map<string, ApprovalEngine>();

function engineFor(tenantId: string): ApprovalEngine {
  let engine = engines.get(tenantId);
  if (!engine) {
    engine = new ApprovalEngine({
      adapter,
      tenantId,
      // Resolves every { type: 'role' } approver. The engine calls this with
      // the role only, so close over the tenant here.
      orgProvider: { getUsersByRole: (role) => directory.usersWithRole(role, tenantId) },
    });
    engines.set(tenantId, engine);
  }
  return engine;
}

// The row your admin UI saves for each tenant
interface TenantApprovalConfig {
  levels: Array<{ approverRoles: string[]; requireAll: boolean }>;
}

const FALLBACK_CONFIG: TenantApprovalConfig = {
  levels: [{ approverRoles: ['admin'], requireAll: false }],
};

function toTemplate(config: TenantApprovalConfig): ApprovalTemplateConfig {
  return {
    name: 'tenant-document-approval',
    documentType: 'document',
    levels: config.levels.map((level, index) => ({
      level: index + 1,
      name: `Level ${index + 1}`,
      approvers: level.approverRoles.map((role) => ({ type: 'role', role })),
      mode: level.requireAll ? 'all' : 'any',
    })),
  };
}

// Run when the tenant saves their chain (and once for tenants that never did)
await engineFor(tenantId).defineTemplate(toTemplate(config ?? FALLBACK_CONFIG));

// @step
// Block new submissions from suspended tenants while
// allowing existing in-flight approvals to complete
async function submitDocument(tenantId: string, documentId: string, actorId: string, data: Record<string, unknown>) {
  const tenant = await db.query(
    'SELECT status FROM tenants WHERE id = $1',
    [tenantId]
  );
  if (tenant.rows[0]?.status === 'suspended') {
    throw new Error(`Tenant ${tenantId} is suspended. Contact support to reactivate.`);
  }

  return engineFor(tenantId).submit({
    templateName: 'tenant-document-approval',
    documentType: 'document',
    documentId,
    submittedBy: actorId,
    data,
  });
}

// approve() and reject() go straight to the engine, so instances that were
// already in flight finish normally.

// @step
// Validate tenant chain config before saving it
function validateChainConfig(tenantId: string, config: TenantApprovalConfig): string | null {
  const result = engineFor(tenantId).validateTemplate(toTemplate(config));
  if (result.valid) return null;
  return result.errors.map((e) => `${e.field}: ${e.message}`).join('; ');
}

// In your admin API endpoint:
async function saveChainConfig(tenantId: string, newConfig: TenantApprovalConfig, res: Response) {
  const error = validateChainConfig(tenantId, newConfig);
  if (error) {
    return res.status(400).json({ error });
  }
  await db.query(/* upsert config */);
  await engineFor(tenantId).updateTemplate(toTemplate(newConfig));
}
