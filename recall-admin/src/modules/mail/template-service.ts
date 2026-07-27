import { randomUUID } from "node:crypto";
import {
  Prisma,
  type MailTemplate
} from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  assertMemberPermission,
  ForbiddenError
} from "@/modules/auth/guards";
import type { Permission } from "@/modules/auth/permissions";

export class MailTemplateConflictError extends Error {
  constructor() {
    super("mail template version conflict");
    this.name = "MailTemplateConflictError";
  }
}

export class MailTemplateNotFoundError extends Error {
  constructor() {
    super("mail template not found");
    this.name = "MailTemplateNotFoundError";
  }
}

type TemplateContent = {
  actorId: string;
  name: string;
  subject: string;
  bodyText: string;
};

type CreateTemplateInput = TemplateContent & {
  locale?: string;
};

type PublishTemplateVersionInput = TemplateContent & {
  key: string;
};

async function requireActiveActor(
  actorId: string,
  permission: Permission
) {
  const actor = await prisma.member.findUniqueOrThrow({
    where: { id: actorId },
    select: {
      id: true,
      role: true,
      active: true
    }
  });
  if (!actor.active) {
    throw new ForbiddenError(permission);
  }
  return assertMemberPermission(actor, permission);
}

function templateKey(): string {
  return `mail-template-${randomUUID()}`;
}

export async function listActiveMailTemplates(): Promise<
  MailTemplate[]
> {
  return prisma.mailTemplate.findMany({
    where: {
      active: true,
      archivedAt: null
    },
    orderBy: [{ name: "asc" }, { version: "desc" }]
  });
}

export async function createMailTemplate(
  input: CreateTemplateInput
): Promise<MailTemplate> {
  await requireActiveActor(input.actorId, "mail:manage-templates");
  return prisma.mailTemplate.create({
    data: {
      key: templateKey(),
      version: 1,
      name: input.name.trim(),
      locale: input.locale?.trim() || "zh-CN",
      subject: input.subject.trim(),
      bodyText: input.bodyText.trim(),
      active: true,
      createdById: input.actorId
    }
  });
}

export async function publishMailTemplateVersion(
  input: PublishTemplateVersionInput
): Promise<MailTemplate> {
  await requireActiveActor(input.actorId, "mail:manage-templates");
  try {
    return await prisma.$transaction(async (tx) => {
      const latest = await tx.mailTemplate.findFirst({
        where: {
          key: input.key,
          archivedAt: null
        },
        orderBy: { version: "desc" }
      });
      if (!latest) {
        throw new MailTemplateNotFoundError();
      }
      await tx.mailTemplate.updateMany({
        where: {
          key: input.key,
          active: true
        },
        data: { active: false }
      });
      return tx.mailTemplate.create({
        data: {
          key: latest.key,
          version: latest.version + 1,
          name: input.name.trim(),
          locale: latest.locale,
          subject: input.subject.trim(),
          bodyText: input.bodyText.trim(),
          segment: latest.segment,
          active: true,
          createdById: input.actorId
        }
      });
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new MailTemplateConflictError();
    }
    throw error;
  }
}

export async function setMailTemplateEnabled(input: {
  actorId: string;
  key: string;
  enabled: boolean;
}): Promise<MailTemplate> {
  await requireActiveActor(input.actorId, "mail:manage-templates");
  return prisma.$transaction(async (tx) => {
    const latest = await tx.mailTemplate.findFirst({
      where: {
        key: input.key,
        archivedAt: null
      },
      orderBy: { version: "desc" }
    });
    if (!latest) {
      throw new MailTemplateNotFoundError();
    }
    await tx.mailTemplate.updateMany({
      where: {
        key: input.key,
        active: true
      },
      data: { active: false }
    });
    if (!input.enabled) {
      return tx.mailTemplate.findUniqueOrThrow({
        where: { id: latest.id }
      });
    }
    return tx.mailTemplate.update({
      where: { id: latest.id },
      data: { active: true }
    });
  });
}

export async function archiveMailTemplateVersion(input: {
  actorId: string;
  templateId: string;
  now?: Date;
}): Promise<MailTemplate> {
  await requireActiveActor(
    input.actorId,
    "mail:archive-template-version"
  );
  const template = await prisma.mailTemplate.findUnique({
    where: { id: input.templateId }
  });
  if (!template) {
    throw new MailTemplateNotFoundError();
  }
  if (template.archivedAt) {
    return template;
  }
  return prisma.mailTemplate.update({
    where: { id: input.templateId },
    data: {
      active: false,
      archivedAt: input.now ?? new Date(),
      archivedById: input.actorId
    }
  });
}
