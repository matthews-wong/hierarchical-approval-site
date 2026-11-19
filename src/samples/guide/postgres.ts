import { ApprovalEngine } from 'hierarchical-approval';

// @step
import { PostgresAdapter } from 'hierarchical-approval/adapters/postgres';

const adapter = new PostgresAdapter({ connectionString: process.env.DATABASE_URL });
await adapter.migrate(); // create tables once, at startup

const engine = new ApprovalEngine({ adapter });
