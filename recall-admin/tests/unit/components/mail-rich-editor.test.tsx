// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MailRichEditor,
  type MailRichContent
} from "@/components/mail/mail-rich-editor";

function Harness(): React.JSX.Element {
  const [value, setValue] = React.useState<MailRichContent>({
    bodyHtml: "<p>初始正文</p>",
    bodyText: "初始正文",
    assets: []
  });
  return (
    <>
      <MailRichEditor
        idPrefix="test-mail"
        label="邮件正文"
        onChange={setValue}
        value={value}
      />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </>
  );
}

import React from "react";

describe("MailRichEditor", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("uploads and inserts an inline image", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            asset: {
              id: "asset-inline",
              fileName: "guide.png",
              contentType: "image/png",
              byteSize: 300,
              width: 80,
              height: 60,
              previewUrl: "/api/mail/assets/asset-inline"
            }
          })
      })
    );
    render(<Harness />);

    fireEvent.change(screen.getByLabelText("选择正文图片"), {
      target: {
        files: [
          new File([Buffer.from("image")], "guide.png", {
            type: "image/png"
          })
        ]
      }
    });

    await waitFor(() => {
      expect(screen.getByAltText("guide.png")).toBeInTheDocument();
    });
    expect(screen.getByTestId("value")).toHaveTextContent(
      '"disposition":"INLINE"'
    );
    expect(screen.getByTestId("value")).toHaveTextContent(
      "data-mail-asset-id"
    );
  });

  it("adds and removes an ordinary image attachment", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            asset: {
              id: "asset-attachment",
              fileName: "receipt.webp",
              contentType: "image/webp",
              byteSize: 512,
              width: 100,
              height: 100,
              previewUrl: "/api/mail/assets/asset-attachment"
            }
          })
      })
    );
    render(<Harness />);

    fireEvent.change(screen.getByLabelText("选择图片附件"), {
      target: {
        files: [
          new File([Buffer.from("image")], "receipt.webp", {
            type: "image/webp"
          })
        ]
      }
    });

    await waitFor(() => {
      expect(screen.getByText("receipt.webp")).toBeInTheDocument();
    });
    expect(screen.getByTestId("value")).toHaveTextContent(
      '"disposition":"ATTACHMENT"'
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "删除附件 receipt.webp"
      })
    );
    expect(screen.queryByText("receipt.webp")).not.toBeInTheDocument();
  });

  it("shows a clear upload error and preserves the body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: () =>
          Promise.resolve({ code: "MAIL_IMAGE_TOO_LARGE" })
      })
    );
    render(<Harness />);

    fireEvent.change(screen.getByLabelText("选择正文图片"), {
      target: {
        files: [
          new File([Buffer.from("large")], "large.png", {
            type: "image/png"
          })
        ]
      }
    });

    expect(
      await screen.findByText("单张图片不能超过 5 MB")
    ).toBeInTheDocument();
    expect(screen.getByTestId("value")).toHaveTextContent(
      "初始正文"
    );
  });
});
