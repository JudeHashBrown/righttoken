import { redirect } from "next/navigation";
import { DashboardOverview } from "@/components/dashboard/dashboard-overview";
import { getCurrentMember } from "@/modules/auth/guards";
import { getDashboardSnapshot } from "@/modules/reports/dashboard-query";

export default async function DashboardPage(): Promise<React.JSX.Element> {
  const member = await getCurrentMember();
  if (!member) {
    redirect("/login?next=/dashboard");
  }

  const now = new Date();
  const snapshot = await getDashboardSnapshot(member, now);

  return (
    <DashboardOverview
      memberName={member.displayName}
      now={now}
      snapshot={snapshot}
    />
  );
}
