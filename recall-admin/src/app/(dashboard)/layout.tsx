import { redirect } from "next/navigation";
import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { getCurrentMember } from "@/modules/auth/guards";
import { getDashboardSnapshot } from "@/modules/reports/dashboard-query";
import styles from "./shell.module.css";

export default async function DashboardLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>): Promise<React.JSX.Element> {
  const member = await getCurrentMember();
  if (!member) {
    redirect("/login?next=/dashboard");
  }

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
