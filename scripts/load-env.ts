/**
 * Loads environment variables for the fleet scripts.
 *
 * Order of precedence (dotenv never overrides an already-set variable):
 *   1. real process environment
 *   2. .env.local  (where the owner keeps DATABASE_URL / ADMIN_EMAIL — git-ignored)
 *   3. .env        (same file `scripts/seed.ts` uses via `dotenv/config`)
 *
 * Import this module FIRST (as a side-effect import) in any script that
 * later imports `../src/db`, because that module reads DATABASE_URL at load time.
 */
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
