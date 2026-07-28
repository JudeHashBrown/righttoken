import { bootstrapPrimaryAdmin } from "@/modules/auth/bootstrap-primary-admin";

type BootstrapInput = {
  email: string;
  displayName?: string;
};

type BootstrapResult = {
  id: string;
  created: boolean;
};

type BootstrapCommandDependencies = {
  bootstrap(input: BootstrapInput): Promise<BootstrapResult>;
  disconnect(): Promise<void>;
};

const defaultDependencies: BootstrapCommandDependencies = {
  bootstrap: bootstrapPrimaryAdmin,
  async disconnect() {
    const { prisma } = await import("@/lib/db/prisma");
    await prisma.$disconnect();
  }
};

export async function runBootstrapPrimaryAdminCommand(
  input: BootstrapInput,
  dependencies: BootstrapCommandDependencies = defaultDependencies
): Promise<BootstrapResult> {
  try {
    return await dependencies.bootstrap(input);
  } finally {
    await dependencies.disconnect();
  }
}
