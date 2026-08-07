import { SegmentGroupList } from "@/components/segment-group/segment-group-list";
import { requireWorkspaceMember } from "@/modules/admin/page-access";
import { getSegmentGroupUsers } from "@/modules/segment-group/list-query";

export default async function CGroupPage() {
  const member = await requireWorkspaceMember("/groups/c");
  const users = await getSegmentGroupUsers(member, "C");
  return <SegmentGroupList code="C" title="C-充值未调用" description="已完成充值，但尚未开始调用服务" users={users} />;
}
