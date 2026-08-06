import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { getServerEnv } from "@/lib/env/runtime";
import { requireWorkspaceMember } from "@/modules/admin/page-access";
import { resolveRightTokenDashboardUrl } from "@/modules/integrations/righttoken/dashboard-url";
import { getDashboardNavigationMetrics } from "@/modules/reports/dashboard-query";
import styles from "./shell.module.css";

export default async function DashboardLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>): Promise<React.JSX.Element> {
  const member = await requireWorkspaceMember("/dashboard");

  const navigationMetrics = await getDashboardNavigationMetrics(member);
  const mainSiteUrl = resolveRightTokenDashboardUrl(
    getServerEnv()
  );

  return (
    <div className={styles.shell}>
      <AppSidebar
        member={member}
        unreadTasks={navigationMetrics.dueToday}
        unreadMail={navigationMetrics.awaitingReply}
      />
      <div className={styles.content}>
        <AppHeader
          memberName={member.displayName}
          urgentCount={navigationMetrics.urgent}
          mainSiteUrl={mainSiteUrl}
        />
        {children}
      </div>
    </div>
  );
}
