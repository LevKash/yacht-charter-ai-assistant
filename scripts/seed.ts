/**
 * Seed script: creates the owner account (from ADMIN_EMAIL / ADMIN_PASSWORD)
 * and the "Demo Yacht" with 5 sample cards. Safe to run repeatedly.
 *
 *   npx tsx scripts/seed.ts
 */
import "dotenv/config";
import { ensureOwner } from "../src/lib/auth";
import { createDemoBoat } from "../src/lib/demo";
import { pool } from "../src/db";

async function main() {
  const owner = await ensureOwner();
  console.log(`✓ Owner account: ${owner.email}${owner.usedDefault ? " (default password — change it in Settings)" : ""}`);
  const id = await createDemoBoat(null);
  console.log(`✓ Demo Yacht ready (boat id ${id}) → /b/demo-yacht`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
