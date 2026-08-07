import { AGroupWorkspace } from "@/components/a-group/a-group-workspace";
import { prisma } from "@/lib/db/prisma";
import { requireWorkspaceMember } from "@/modules/admin/page-access";
import { getAGroupWorkspace } from "@/modules/a-group/workspace-query";

export default async function AGroupPage({
  searchParams
}: {
  searchParams: Promise<
    Record<string, string | string[] | undefined>
  >;
}) {
  const member = await requireWorkspaceMember("/groups/a");
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : "";
  const selectedId =
    typeof params.userId === "string" ? params.userId : null;
  const [data, mailboxes, templates] = await Promise.all([
    getAGroupWorkspace(member, query, selectedId),
    prisma.mailbox.findMany({
      where: { enabled: true, configurationDeletedAt: null },
      select: { id: true, name: true, emailAddress: true },
      orderBy: { name: "asc" }
    }),
    prisma.mailTemplate.findMany({
      where: {
        active: true,
        archivedAt: null,
        OR: [{ segment: "A" }, { segment: null }]
      },
      select: {
        id: true,
        name: true,
        subject: true,
        bodyText: true
      },
      orderBy: { name: "asc" }
    })
  ]);
  return (
    <AGroupWorkspace
      initialData={data}
      mailboxes={mailboxes}
      templates={templates}
    />
  );
}
