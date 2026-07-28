import { InvitationAcceptForm } from "@/components/members/invitation-accept-form";
import styles from "./invitation.module.css";

type InvitationAcceptPageProps = {
  searchParams: Promise<{ token?: string }>;
};

export default async function InvitationAcceptPage({
  searchParams
}: InvitationAcceptPageProps): Promise<React.JSX.Element> {
  const { token = "" } = await searchParams;

  return (
    <main className={styles.page}>
      <section className={styles.brandPanel} aria-label="RightToken">
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">
            RT
          </span>
          <span>RightToken 用户运营</span>
        </div>
        <div className={styles.brandCopy}>
          <h1>加入团队，开始处理用户运营任务。</h1>
          <p>
            设置成员姓名。完成后，管理员会按角色为你分配用户与任务权限。
          </p>
        </div>
        <p className={styles.restricted}>邀请链接仅可使用一次</p>
      </section>

      <section className={styles.formPanel}>
        <div className={styles.formShell}>
          <header className={styles.formHeading}>
            <h2>开通成员账号</h2>
            <p>
              {token.length >= 20
                ? "请填写成员姓名。"
                : "邀请链接不完整，请联系管理员重新发送。"}
            </p>
          </header>
          <InvitationAcceptForm token={token} />
        </div>
      </section>
    </main>
  );
}
