import { LoginForm } from "./login-form";
import styles from "./login.module.css";

type LoginPageProps = {
  searchParams: Promise<{ next?: string }>;
};

function safeRedirectPath(next?: string): string {
  if (next?.startsWith("/") && !next.startsWith("//")) {
    return next;
  }
  return "/dashboard";
}

export default async function LoginPage({
  searchParams
}: LoginPageProps): Promise<React.JSX.Element> {
  const params = await searchParams;

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
          <h1>把需要介入的用户，及时交给正确的人。</h1>
          <p>
            用户跟踪、分组变化与召回任务统一管理，让运营团队专注处理真正需要人工介入的事项。
          </p>
        </div>

        <p className={styles.restricted}>仅限获邀团队成员使用</p>
      </section>

      <section className={styles.formPanel}>
        <div className={styles.formShell}>
          <header className={styles.formHeading}>
            <h2>登录运营管理台</h2>
            <p>使用管理员为你开通的邮箱账号和密码。</p>
          </header>

          <LoginForm redirectTo={safeRedirectPath(params.next)} />

          <p className={styles.securityNote}>
            登录后，系统会根据账号要求继续完成二次验证。
          </p>
        </div>
      </section>
    </main>
  );
}
