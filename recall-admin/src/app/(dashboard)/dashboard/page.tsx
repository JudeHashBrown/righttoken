import { DashboardOverview } from "@/components/dashboard/dashboard-overview";
import { requireWorkspaceMember } from "@/modules/admin/page-access";
import { getDashboardSnapshot } from "@/modules/reports/dashboard-query";

export default async function DashboardPage(): Promise<React.JSX.Element> {
  const member = await requireWorkspaceMember("/dashboard");

  const now = new Date();
  const snapshot = await getDashboardSnapshot(member, now);

  return (
    <DashboardOverview
      isAdministrator={member.role !== "OPERATOR"}
      memberName={member.displayName}
      now={now}
      snapshot={snapshot}
    />
  );
}
