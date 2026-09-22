import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const sql = postgres(url, { max: 1, idle_timeout: 5 });

try {
  console.log("Dropping public schema...");
  await sql.unsafe("DROP SCHEMA public CASCADE");
  console.log("Creating fresh public schema...");
  await sql.unsafe("CREATE SCHEMA public");
  console.log("Granting permissions...");
  await sql.unsafe("GRANT ALL ON SCHEMA public TO postgres");
  await sql.unsafe("GRANT ALL ON SCHEMA public TO public");
  console.log("✓ schema reset complete");
} catch (err) {
  console.error("✗ reset failed:", err);
  process.exit(1);
} finally {
  await sql.end({ timeout: 5 });
}
