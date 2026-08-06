import { BGroupWorkspace } from "@/components/b-group/b-group-workspace";
import { prisma } from "@/lib/db/prisma";
import { requireWorkspaceMember } from "@/modules/admin/page-access";
import { getBGroupWorkspace } from "@/modules/b-group/workspace-query";

export default async function BGroupPage({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> }) {
  const member = await requireWorkspaceMember("/groups/b"); const params = await searchParams; const query = typeof params.q === "string" ? params.q : ""; const selectedId = typeof params.userId === "string" ? params.userId : null;
  const [data,mailboxes,templates]=await Promise.all([getBGroupWorkspace(member,query,selectedId),prisma.mailbox.findMany({where:{enabled:true,configurationDeletedAt:null},select:{id:true,name:true,emailAddress:true},orderBy:{name:"asc"}}),prisma.mailTemplate.findMany({where:{active:true,archivedAt:null,OR:[{segment:"B"},{segment:null}]},select:{id:true,name:true,subject:true,bodyText:true},orderBy:{name:"asc"}})]);
  return <BGroupWorkspace initialData={data} mailboxes={mailboxes} templates={templates}/>;
}
