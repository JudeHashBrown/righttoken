import { DGroupWorkspace } from "@/components/d-group/d-group-workspace";
import { prisma } from "@/lib/db/prisma";
import { requireWorkspaceMember } from "@/modules/admin/page-access";
import { getDGroupWorkspace } from "@/modules/d-group/workspace-query";

export default async function DGroupPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const member = await requireWorkspaceMember("/groups/d");
  const params = await searchParams;
  const selectedId = typeof params.userId === "string" ? params.userId : null;
  const [data, mailboxes, templates] = await Promise.all([
    getDGroupWorkspace(member, selectedId),
    prisma.mailbox.findMany({
      where: { enabled: true, configurationDeletedAt: null },
      select: { id: true, name: true, emailAddress: true },
      orderBy: { name: "asc" }
    }),
    prisma.mailTemplate.findMany({
      where: { active: true, archivedAt: null, OR: [{ segment: "D" }, { segment: null }] },
      select: { id: true, name: true, subject: true, bodyText: true },
      orderBy: { name: "asc" }
    })
  ]);
  return <DGroupWorkspace initialData={data} mailboxes={mailboxes} templates={templates} />;
}
