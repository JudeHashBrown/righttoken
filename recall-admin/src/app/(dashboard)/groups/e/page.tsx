import { EGroupWorkspace } from "@/components/e-group/e-group-workspace";
import { prisma } from "@/lib/db/prisma";
import { requireWorkspaceMember } from "@/modules/admin/page-access";
import { getEGroupWorkspace } from "@/modules/e-group/workspace-query";

export default async function EGroupPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const member = await requireWorkspaceMember("/groups/e");
  const params = await searchParams;
  const selectedId = typeof params.userId === "string" ? params.userId : null;
  const [data, mailboxes, templates] = await Promise.all([
    getEGroupWorkspace(member, selectedId),
    prisma.mailbox.findMany({
      where: { enabled: true, configurationDeletedAt: null },
      select: { id: true, name: true, emailAddress: true },
      orderBy: { name: "asc" }
    }),
    prisma.mailTemplate.findMany({
      where: { active: true, archivedAt: null, OR: [{ segment: "E" }, { segment: null }] },
      select: { id: true, name: true, subject: true, bodyText: true },
      orderBy: { name: "asc" }
    })
  ]);
  return <EGroupWorkspace initialData={data} mailboxes={mailboxes} templates={templates} />;
}
