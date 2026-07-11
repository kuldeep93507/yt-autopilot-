/**
 * Run once to create admin user:
 *   node src/seed.js
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const email    = process.env.ADMIN_EMAIL    || "admin@ytautopilot.com";
const password = process.env.ADMIN_PASSWORD || "Admin@123";
const name     = process.env.ADMIN_NAME     || "Admin";

const hash = await bcrypt.hash(password, 10);

const { data, error } = await supabase
  .from("users")
  .upsert([{ email, password: hash, name, role: "admin" }], { onConflict: "email" })
  .select("id, email, role")
  .single();

if (error) {
  console.error("❌ Seed failed:", error.message);
  process.exit(1);
}

console.log("✅ Admin user ready:", data);
console.log(`   Email:    ${email}`);
console.log(`   Password: ${password}`);
console.log("\nAb backend start karo: npm run dev");
