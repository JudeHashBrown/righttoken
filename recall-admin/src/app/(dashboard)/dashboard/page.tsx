import { DashboardOverview } from "@/components/dashboard/dashboard-overview";
import { requireWorkspaceMember } from "@/modules/admin/page-access";
import { getDashboardSnapshot } from "@/modules/reports/dashboard-query";
import { dashboardFocusOrDefault } from "@/modules/reports/dashboard-recent-users";

type SearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

export default async function DashboardPage({
  searchParams
}: {
  searchParams: SearchParams;
}): Promise<React.JSX.Element> {
  const member = await requireWorkspaceMember("/dashboard");
  const params = await searchParams;
  const requestedFocus = Array.isArray(params.focus)
    ? params.focus[0]
    : params.focus;
  const focus = dashboardFocusOrDefault(requestedFocus);

  const now = new Date();
  const snapshot = await getDashboardSnapshot(member, now, focus);

  return (
    <DashboardOverview
      isAdministrator={member.role !== "OPERATOR"}
      snapshot={snapshot}
    />
  );
}
