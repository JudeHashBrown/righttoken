"use client";

import type {
  MailHtmlDiagnostics
} from "@/modules/mail/html-policy";
import styles from "@/components/workspaces/workspace.module.css";

export function MailHtmlPreview({
  html,
  loading,
  error,
  diagnostics,
  unresolvedVariables
}: {
  html: string;
  loading: boolean;
  error: string | null;
  diagnostics: MailHtmlDiagnostics | null;
  unresolvedVariables: string[];
}): React.JSX.Element {
  return (
    <div className={styles.mailPreviewLayout}>
      <div className={styles.mailPreviewCanvas}>
        {loading ? (
          <p className={styles.mailPreviewEmpty} role="status">
            正在生成最终发送预览…
          </p>
        ) : error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : html ? (
          <iframe
            className={styles.mailPreviewFrame}
            sandbox=""
            srcDoc={html}
            title="HTML 邮件发送预览"
          />
        ) : (
          <p className={styles.mailPreviewEmpty}>
            输入邮件内容后即可预览。
          </p>
        )}
      </div>
      <aside
        aria-label="发送检查"
        className={styles.mailPreviewChecks}
        role="status"
      >
        <strong>发送检查</strong>
        {diagnostics ? (
          <>
            <span className={styles.mailCheckGood}>
              HTML 安全检查完成
            </span>
            <span className={styles.mailCheckGood}>
              已生成纯文本版本
            </span>
            {diagnostics.hasDangerousContent ? (
              <span className={styles.mailCheckWarning}>
                已移除不安全内容
              </span>
            ) : (
              <span className={styles.mailCheckGood}>
                未发现主动内容
              </span>
            )}
            {diagnostics.externalImageCount > 0 ? (
              <span className={styles.mailCheckWarning}>
                含 {diagnostics.externalImageCount} 张 HTTPS
                外链图片
              </span>
            ) : (
              <span className={styles.mailCheckGood}>
                无外链图片风险
              </span>
            )}
            {unresolvedVariables.length > 0 ? (
              <span className={styles.mailCheckError}>
                仍有待填写内容：
                {unresolvedVariables.join("、")}
              </span>
            ) : (
              <span className={styles.mailCheckGood}>
                未发现待填写变量
              </span>
            )}
            {diagnostics.removedTags.length > 0 ||
            diagnostics.removedAttributes.length > 0 ||
            diagnostics.blockedUrls > 0 ? (
              <small>
                清理摘要：标签 {diagnostics.removedTags.length} 类、
                属性 {diagnostics.removedAttributes.length} 类、危险地址{" "}
                {diagnostics.blockedUrls} 个
              </small>
            ) : null}
            {diagnostics.externalImageCount > 0 ? (
              <small className={styles.mailPreviewGuidance}>
                收件方可能默认隐藏外链图片，关键图片建议上传为内嵌图片。
              </small>
            ) : null}
          </>
        ) : (
          <span>等待检查内容…</span>
        )}
      </aside>
    </div>
  );
}
