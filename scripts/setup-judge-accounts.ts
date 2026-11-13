/**
 * Set passwords for the seeded judge accounts (Admin, Teacher, S1, S2, Guardian).
 * Generates a fresh random password per run and prints each once; nothing is
 * hardcoded or committed. Requires NEXT_PUBLIC_SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY. Run after `supabase db reset` (seed loaded):
 *   npm run setup:judges
 *
 * Updates existing auth users by the fixed UUIDs from supabase/seed.sql so the
 * user_profiles / user_roles links stay intact.
 */
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.");
  process.exit(1);
}

const accounts = [
  { id: "00000000-0000-0000-0000-0000000000a1", email: "admin@judge.test", label: "Admin" },
  { id: "00000000-0000-0000-0000-0000000000a2", email: "teacher@judge.test", label: "Teacher" },
  { id: "00000000-0000-0000-0000-0000000000a3", email: "s1@judge.test", label: "Student S1" },
  { id: "00000000-0000-0000-0000-0000000000a4", email: "s2@judge.test", label: "Student S2" },
  { id: "00000000-0000-0000-0000-0000000000a5", email: "guardian@judge.test", label: "Guardian (S1)" },
];

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

for (const a of accounts) {
  const password = randomBytes(12).toString("base64url");
  const { error } = await admin.auth.admin.updateUserById(a.id, { password, email_confirm: true });
  if (error) {
    console.error(`FAILED ${a.label} (${a.email}): ${error.message}`);
    continue;
  }
  console.log(`${a.label.padEnd(14)} ${a.email.padEnd(20)} ${password}`);
}
console.log("\nGive these page addresses + credentials to the judges. Do not commit them.");
