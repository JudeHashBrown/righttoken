import { TwoFactorForm } from "./two-factor-form";
import styles from "./two-factor.module.css";

type TwoFactorPageProps = {
  searchParams: Promise<{ mode?: string }>;
};

export default async function TwoFactorSetupPage({
  searchParams
}: TwoFactorPageProps): Promise<React.JSX.Element> {
  const params = await searchParams;
  const mode = params.mode === "verify" ? "verify" : "enroll";

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <span className={styles.brandMark} aria-hidden="true">
          RT
        </span>
        <span>RightToken 用户运营</span>
      </header>

      <section className={styles.content}>
        <header className={styles.heading}>
          <h1>
            {mode === "enroll" ? "设置二次验证" : "完成二次验证"}
          </h1>
          <p>
            {mode === "enroll"
              ? "管理员账号必须完成二次验证后才能进入管理台。"
              : "为保护用户数据，请验证你的动态验证码。"}
          </p>
        </header>

        <TwoFactorForm mode={mode} />
      </section>
    </main>
  );
}
