const { createClient } = require("@supabase/supabase-js");

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_KEY environment variables");
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  }
);

// Test connection
supabase.from("users").select("count", { count: "exact", head: true })
  .then(() => console.log("✓ Supabase connection successful"))
  .catch(err => console.error("✗ Supabase connection failed:", err.message));

module.exports = supabase;
