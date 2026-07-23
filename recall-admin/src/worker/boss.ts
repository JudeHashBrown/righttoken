import { PgBoss } from "pg-boss";
import { JOBS } from "@/worker/job-names";

export function createBoss(
  connectionString = process.env.JOB_DATABASE_URL
): PgBoss {
  if (!connectionString) {
    throw new Error("JOB_DATABASE_URL is required");
  }
  const boss = new PgBoss({
    connectionString,
    schema: "pgboss",
    application_name: "righttoken-recall-worker"
  });
  boss.on("error", (error) => {
    console.error("pg-boss error", error);
  });
  return boss;
}

export async function ensureQueues(boss: PgBoss): Promise<void> {
  for (const name of Object.values(JOBS)) {
    await boss.createQueue(name, {
      retryLimit: 5,
      retryDelay: 30,
      retryBackoff: true
    });
  }
}
