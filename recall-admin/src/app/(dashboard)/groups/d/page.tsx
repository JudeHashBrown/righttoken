import { SegmentGroupList } from "@/components/segment-group/segment-group-list";
import { requireWorkspaceMember } from "@/modules/admin/page-access";
import { getSegmentGroupUsers } from "@/modules/segment-group/list-query";

export default async function DGroupPage() {
  const member = await requireWorkspaceMember("/groups/d");
  const users = await getSegmentGroupUsers(member, "D");
  return <SegmentGroupList code="D" title="D-长期未调用" description="曾经调用过服务，但已长期没有新的调用" users={users} />;
}
