import pg from "pg";

const connectionString = process.env.JOB_DATABASE_URL;
if (!connectionString) {
  console.error("worker health check failed: JOB_DATABASE_URL is required");
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  connectionTimeoutMillis: 5_000,
  application_name: "righttoken-recall-worker-health"
});

try {
  await client.connect();
  await client.query("SELECT 1");
  await client.end();
} catch {
  await client.end().catch(() => undefined);
  console.error("worker health check failed");
  process.exit(1);
}
