"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bot,
  ChevronRight,
  CircleUserRound,
  LayoutDashboard,
  Mail,
  Settings,
  SlidersHorizontal,
  Sparkles,
  UsersRound,
  Workflow
} from "lucide-react";
import styles from "./app-sidebar.module.css";

type SidebarMember = {
  id: string;
  displayName: string;
  email: string;
  role: "PRIMARY_ADMIN" | "ADMIN" | "OPERATOR";
};

type AppSidebarProps = {
  member: SidebarMember;
  unreadTasks: number;
  unreadMail: number;
};

type NavigationItem = {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  badge?: number;
  administratorOnly?: boolean;
};

type NavigationGroup = {
  label: string;
  items: NavigationItem[];
};

function roleLabel(role: SidebarMember["role"]): string {
  if (role === "PRIMARY_ADMIN") return "主管理员";
  if (role === "ADMIN") return "管理员";
  return "运营人员";
}

export function AppSidebar({
  member,
  unreadTasks,
  unreadMail
}: AppSidebarProps): React.JSX.Element {
  const pathname = usePathname();
  const navigation: NavigationGroup[] = [
    {
      label: "运营工作",
      items: [
        {
          label: "运营驾驶舱",
          href: "/dashboard",
          icon: LayoutDashboard
        },
        {
          label: "任务中心",
          href: "/tasks",
          icon: Workflow,
          badge: unreadTasks
        },
        {
          label: "用户中心",
          href: "/users",
          icon: UsersRound
        },
        {
          label: "邮件中心",
          href: "/mail",
          icon: Mail,
          badge: unreadMail
        }
      ]
    },
    {
      label: "自动化",
      items: [
        {
          label: "分组规则",
          href: "/automation/segments",
          icon: Sparkles
        },
        {
          label: "分配规则",
          href: "/automation/assignment",
          icon: SlidersHorizontal,
          administratorOnly: true
        },
        {
          label: "通知策略",
          href: "/automation/notifications",
          icon: Bot,
          administratorOnly: true
        }
      ]
    },
    {
      label: "管理",
      items: [
        {
          label: "数据报表",
          href: "/reports",
          icon: BarChart3
        },
        {
          label: "成员与权限",
          href: "/members",
          icon: CircleUserRound,
          administratorOnly: true
        },
        {
          label: "系统设置",
          href: "/settings",
          icon: Settings,
          administratorOnly: true
        }
      ]
    }
  ];
  const isAdministrator = member.role !== "OPERATOR";

  return (
    <aside className={styles.sidebar} aria-label="主导航">
      <Link className={styles.brand} href="/dashboard">
        <span className={styles.brandMark} aria-hidden="true">
          R
        </span>
        <span className={styles.brandName}>RightToken</span>
      </Link>

      <nav className={styles.navigation}>
        {navigation.map((group) => {
          const visibleItems = group.items.filter(
            (item) => !item.administratorOnly || isAdministrator
          );
          if (visibleItems.length === 0) return null;

          return (
            <section className={styles.group} key={group.label}>
              <h2>{group.label}</h2>
              <div className={styles.groupItems}>
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/dashboard" &&
                      pathname.startsWith(`${item.href}/`));

                  return (
                    <Link
                      className={`${styles.item} ${
                        isActive ? styles.active : ""
                      }`}
                      href={item.href}
                      key={item.href}
                      aria-current={isActive ? "page" : undefined}
                    >
                      <Icon
                        className={styles.itemIcon}
                        aria-hidden="true"
                        size={18}
                        strokeWidth={1.8}
                      />
                      <span className={styles.itemLabel}>{item.label}</span>
                      {item.badge ? (
                        <span className={styles.badge}>{item.badge}</span>
                      ) : null}
                      <ChevronRight
                        className={styles.itemChevron}
                        aria-hidden="true"
                        size={14}
                      />
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </nav>

      <div className={styles.member}>
        <span className={styles.avatar} aria-hidden="true">
          {member.displayName.slice(0, 1)}
        </span>
        <span className={styles.memberCopy}>
          <strong>{member.displayName}</strong>
          <small>{roleLabel(member.role)}</small>
        </span>
      </div>
    </aside>
  );
}
