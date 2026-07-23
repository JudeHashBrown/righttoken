import "dotenv/config";

import { bootstrapPrimaryAdmin } from "@/modules/auth/bootstrap-primary-admin";

function requireValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

async function main(): Promise<void> {
  const result = await bootstrapPrimaryAdmin({
    email: requireValue("BOOTSTRAP_PRIMARY_ADMIN_EMAIL"),
    password: requireValue("BOOTSTRAP_PRIMARY_ADMIN_PASSWORD"),
    displayName:
      process.env.BOOTSTRAP_PRIMARY_ADMIN_NAME?.trim() || "主管理员"
  });

  console.log(
    JSON.stringify({
      memberId: result.id,
      created: result.created
    })
  );
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? `primary admin bootstrap failed: ${error.message}`
      : "primary admin bootstrap failed"
  );
  process.exitCode = 1;
});
