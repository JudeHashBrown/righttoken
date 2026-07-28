import { z } from "zod";

type PrimaryAdminRecord = {
  id: string;
  email: string;
};

type UpsertPrimaryAdminInput = {
  email: string;
  displayName: string;
  passwordHash: string;
};

export interface PrimaryAdminStore {
  listPrimaryAdmins(): Promise<PrimaryAdminRecord[]>;
  findMemberByEmail(email: string): Promise<{ id: string } | null>;
  upsertPrimaryAdmin(
    input: UpsertPrimaryAdminInput
  ): Promise<{ id: string }>;
}

type BootstrapDependencies = {
  store: PrimaryAdminStore;
};

const bootstrapInputSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),
  displayName: z.string().trim().min(1).max(120).default("主管理员")
});

async function getDefaultDependencies(): Promise<BootstrapDependencies> {
  const { prisma } = await import("@/lib/db/prisma");
  return {
    store: {
      listPrimaryAdmins: () =>
        prisma.member.findMany({
          where: { role: "PRIMARY_ADMIN" },
          select: { id: true, email: true }
        }),
      findMemberByEmail: (email) =>
        prisma.member.findUnique({
          where: { email },
          select: { id: true }
        }),
      upsertPrimaryAdmin: ({
        email,
        displayName,
        passwordHash
      }) =>
        prisma.member.upsert({
          where: { email },
          create: {
            email,
            displayName,
            passwordHash,
            role: "PRIMARY_ADMIN"
          },
          update: {
            displayName,
            passwordHash,
            role: "PRIMARY_ADMIN",
            active: true
          },
          select: { id: true }
        })
    }
  };
}

export async function bootstrapPrimaryAdmin(
  input: {
    email: string;
    displayName?: string;
  },
  dependencies?: BootstrapDependencies
): Promise<{ id: string; created: boolean }> {
  const parsed = bootstrapInputSchema.parse(input);
  const resolvedDependencies =
    dependencies ?? (await getDefaultDependencies());
  const primaryAdmins =
    await resolvedDependencies.store.listPrimaryAdmins();

  if (primaryAdmins.length > 1) {
    throw new Error("database contains more than one primary admin");
  }

  const existingPrimary = primaryAdmins[0];
  if (
    existingPrimary &&
    existingPrimary.email.toLowerCase() !== parsed.email
  ) {
    throw new Error(
      "a different primary admin already exists; refusing to create another"
    );
  }

  const existingMember =
    await resolvedDependencies.store.findMemberByEmail(parsed.email);
  const member = await resolvedDependencies.store.upsertPrimaryAdmin({
    email: parsed.email,
    displayName: parsed.displayName,
    passwordHash: "RIGHTTOKEN_MANAGED_IDENTITY"
  });

  return {
    id: member.id,
    created: !existingMember
  };
}
