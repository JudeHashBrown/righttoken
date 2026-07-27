import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { requireWorkspaceMember } from "@/modules/admin/page-access";
import { getDashboardSnapshot } from "@/modules/reports/dashboard-query";
import styles from "./shell.module.css";

export default async function DashboardLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>): Promise<React.JSX.Element> {
  const member = await requireWorkspaceMember("/dashboard");

  const snapshot = await getDashboardSnapshot(member);

  return (
    <div className={styles.shell}>
      <AppSidebar
        member={member}
        unreadTasks={snapshot.metrics.dueToday}
        unreadMail={snapshot.metrics.awaitingReply}
      />
      <div className={styles.content}>
        <AppHeader
          memberName={member.displayName}
          urgentCount={snapshot.metrics.urgent}
        />
        {children}
      </div>
    </div>
  );
}
