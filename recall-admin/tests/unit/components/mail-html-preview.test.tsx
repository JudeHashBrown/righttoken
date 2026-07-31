// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  MailHtmlPreview
} from "@/components/mail/mail-html-preview";

describe("MailHtmlPreview", () => {
  afterEach(cleanup);

  it("shows safety checks and external image guidance", () => {
    render(
      <MailHtmlPreview
        diagnostics={{
          removedTags: ["script"],
          removedAttributes: ["onclick"],
          blockedUrls: 1,
          externalImageCount: 2,
          hasDangerousContent: true
        }}
        error={null}
        html="<p>安全正文</p>"
        loading={false}
        unresolvedVariables={[]}
      />
    );

    expect(
      screen.getByText("已移除不安全内容")
    ).toBeInTheDocument();
    expect(
      screen.getByText("含 2 张 HTTPS 外链图片")
    ).toBeInTheDocument();
    expect(
      screen.getByTitle("HTML 邮件发送预览")
    ).toHaveAttribute("sandbox", "");
  });
});
