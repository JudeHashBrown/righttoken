import "dotenv/config";

import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import pg from "pg";

const { Client } = pg;

export function deriveTestDatabaseUrl(databaseUrl) {
  const parsed = new URL(databaseUrl);
  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  parsed.pathname = `/${encodeURIComponent(
    databaseName.endsWith("_test")
      ? databaseName
      : `${databaseName}_test`
  )}`;
  return parsed.toString();
}

export function assertSafeTestDatabaseUrl(databaseUrl) {
  const parsed = new URL(databaseUrl);
  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  if (!databaseName.endsWith("_test")) {
    throw new Error(
      "Integration test database name must end with _test"
    );
  }
  if (!/^[A-Za-z0-9_]+$/.test(databaseName)) {
    throw new Error(
      "Integration test database name contains unsafe characters"
    );
  }
  return { parsed, databaseName };
}

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env,
      stdio: "inherit"
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${command} ${args.join(" ")} exited with ${
            signal ? `signal ${signal}` : `code ${code}`
          }`
        )
      );
    });
  });
}

async function prepareTestDatabase(databaseUrl) {
  const { parsed, databaseName } =
    assertSafeTestDatabaseUrl(databaseUrl);
  const adminUrl = new URL(parsed);
  adminUrl.pathname = "/postgres";

  const admin = new Client({
    connectionString: adminUrl.toString()
  });
  await admin.connect();
  try {
    const existing = await admin.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [databaseName]
    );
    if (existing.rowCount === 0) {
      await admin.query(`CREATE DATABASE "${databaseName}"`);
    }
  } finally {
    await admin.end();
  }

  const testDatabase = new Client({ connectionString: databaseUrl });
  await testDatabase.connect();
  try {
    await testDatabase.query("DROP SCHEMA IF EXISTS public CASCADE");
    await testDatabase.query("CREATE SCHEMA public");
  } finally {
    await testDatabase.end();
  }
}

async function main() {
  const developmentUrl = process.env.DATABASE_URL?.trim();
  if (!developmentUrl) {
    throw new Error("DATABASE_URL is required");
  }
  const testDatabaseUrl =
    process.env.TEST_DATABASE_URL?.trim() ||
    deriveTestDatabaseUrl(developmentUrl);
  assertSafeTestDatabaseUrl(testDatabaseUrl);

  const testEnv = {
    ...process.env,
    DATABASE_URL: testDatabaseUrl,
    JOB_DATABASE_URL: testDatabaseUrl
  };

  await prepareTestDatabase(testDatabaseUrl);
  await run("npm", ["run", "db:deploy"], testEnv);
  await run("npm", ["run", "db:seed"], testEnv);
  await run(
    "npx",
    [
      "vitest",
      "run",
      "tests/integration",
      "tests/contract"
    ],
    testEnv
  );
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
