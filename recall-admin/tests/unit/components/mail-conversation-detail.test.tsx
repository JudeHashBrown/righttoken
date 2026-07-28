// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  MailConversationDetail
} from "@/components/mail/mail-conversation-detail";

describe("MailConversationDetail", () => {
  afterEach(cleanup);

  it("shows safe inline images, downloadable attachments, and a remote-image notice", () => {
    render(
      <MailConversationDetail
        thread={{
          id: "thread-1",
          subject: "截图说明",
          user: {
            id: "user-1",
            externalUserId: "RT-001",
            displayName: "测试用户",
            email: "person@example.test",
            currentSegment: "B",
            countryCode: "CN",
            region: "广东",
            owner: null,
            unsubscribedAt: null,
            pausedAt: null,
            task: null
          },
          mailbox: {
            id: "mailbox-1",
            name: "客服邮箱",
            emailAddress: "support@righttoken.test",
            enabled: true
          },
          messages: [
            {
              id: "message-1",
              direction: "INBOUND",
              status: "RECEIVED",
              fromAddress: "person@example.test",
              toAddresses: ["support@righttoken.test"],
              subject: "截图说明",
              bodyText: "请查看截图。",
              bodyHtml:
                '<p>请查看截图。</p><img data-mail-asset-id="asset-inline" alt="正文截图">',
              externalImagesBlocked: true,
              assets: [
                {
                  id: "asset-inline",
                  fileName: "inline.png",
                  contentType: "image/png",
                  byteSize: 300,
                  width: 80,
                  height: 60,
                  previewUrl: "/api/mail/assets/asset-inline",
                  disposition: "INLINE",
                  cid: "inline@example.test",
                  sortOrder: 0
                },
                {
                  id: "asset-attachment",
                  fileName: "receipt.png",
                  contentType: "image/png",
                  byteSize: 500,
                  width: 80,
                  height: 60,
                  previewUrl: "/api/mail/assets/asset-attachment",
                  disposition: "ATTACHMENT",
                  cid: null,
                  sortOrder: 1
                }
              ],
              sentAt: null,
              receivedAt: "2026-07-28T08:00:00.000Z",
              createdAt: "2026-07-28T08:00:00.000Z"
            }
          ]
        }}
      />
    );

    expect(screen.getByAltText("正文截图")).toHaveAttribute(
      "src",
      "/api/mail/assets/asset-inline"
    );
    expect(screen.getByRole("link", { name: /receipt\.png/ }))
      .toHaveAttribute(
        "href",
        "/api/mail/assets/asset-attachment?download=1"
      );
    expect(
      screen.getByText("为保护隐私，已拦截邮件中的外部图片")
    ).toBeInTheDocument();
  });
});
