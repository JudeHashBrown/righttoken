import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireUserActionAccess } from "@/modules/b-group/action-access";
import { z } from "zod";

type ContactInput = {
  wechatId?: string | null;
  telegramHandle?: string | null;
  phoneCountryCode?: string | null;
  phoneNumber?: string | null;
};

function trimmed(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

export function normalizeContact(input: ContactInput) {
  const telegram = trimmed(input.telegramHandle);
  const countryCode = trimmed(input.phoneCountryCode)?.replace(
    /^\+?/,
    "+"
  );
  return {
    wechatId: trimmed(input.wechatId),
    telegramHandle: telegram
      ? telegram.startsWith("@")
        ? telegram
        : `@${telegram}`
      : null,
    phoneCountryCode: countryCode ?? null,
    phoneNumber:
      trimmed(input.phoneNumber)?.replace(/[\s()-]/g, "") ?? null
  };
}

export const contactInputSchema = z
  .object({
    wechatId: z.string().max(100).nullish(),
    telegramHandle: z.string().max(100).nullish(),
    phoneCountryCode: z.string().max(8).nullish(),
    phoneNumber: z.string().max(40).nullish()
  })
  .strict()
  .transform(normalizeContact)
  .superRefine((value, context) => {
    if (
      !value.wechatId &&
      !value.telegramHandle &&
      !value.phoneNumber
    ) {
      context.addIssue({
        code: "custom",
        message: "CONTACT_METHOD_REQUIRED"
      });
    }
    if (
      value.telegramHandle &&
      !/^@[A-Za-z0-9_]{5,32}$/.test(value.telegramHandle)
    ) {
      context.addIssue({
        code: "custom",
        path: ["telegramHandle"],
        message: "INVALID_TELEGRAM_HANDLE"
      });
    }
    if (
      value.phoneCountryCode &&
      !/^\+\d{1,4}$/.test(value.phoneCountryCode)
    ) {
      context.addIssue({
        code: "custom",
        path: ["phoneCountryCode"],
        message: "INVALID_PHONE_COUNTRY_CODE"
      });
    }
    if (value.phoneNumber && !/^\d{5,20}$/.test(value.phoneNumber)) {
      context.addIssue({
        code: "custom",
        path: ["phoneNumber"],
        message: "INVALID_PHONE_NUMBER"
      });
    }
    if (value.phoneNumber && !value.phoneCountryCode) {
      context.addIssue({
        code: "custom",
        path: ["phoneCountryCode"],
        message: "PHONE_COUNTRY_CODE_REQUIRED"
      });
    }
  });

export async function saveUserContact(
  actorId: string,
  userId: string,
  input: ContactInput
) {
  const parsed = contactInputSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const { actor, user } = await requireUserActionAccess(
      tx,
      actorId,
      userId
    );
    const contact = await tx.userContact.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        updatedById: actor.id,
        ...parsed
      },
      update: {
        updatedById: actor.id,
        ...parsed
      }
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "user_contact.saved",
        entityType: "UserProfile",
        entityId: user.id,
        metadata: {
          contactId: contact.id,
          hasWechat: Boolean(contact.wechatId),
          hasTelegram: Boolean(contact.telegramHandle),
          hasPhone: Boolean(contact.phoneNumber)
        } satisfies Prisma.InputJsonValue
      }
    });
    return contact;
  });
}
