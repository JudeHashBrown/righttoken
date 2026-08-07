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

function Harness({
  initialValue = {
    bodyHtml: "<p>初始正文</p>",
    bodyText: "初始正文",
    assets: []
  }
}: {
  initialValue?: MailRichContent;
} = {}): React.JSX.Element {
  const [value, setValue] =
    React.useState<MailRichContent>(initialValue);
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

function selectEditorText(text: string): void {
  const editor = screen.getByRole("textbox", {
    name: "邮件正文"
  });
  const walker = document.createTreeWalker(
    editor,
    NodeFilter.SHOW_TEXT
  );
  let node = walker.nextNode();
  while (node && !node.textContent?.includes(text)) {
    node = walker.nextNode();
  }
  if (!node) throw new Error(`Text not found: ${text}`);
  const range = document.createRange();
  range.selectNodeContents(node);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  fireEvent.mouseUp(editor);
}

describe("MailRichEditor", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("offers ordered lists, alignment, and four fixed font sizes", () => {
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand
    });
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "有序编号" }));
    fireEvent.click(screen.getByRole("button", { name: "居中对齐" }));
    fireEvent.change(screen.getByRole("combobox", { name: "字号" }), {
      target: { value: "18px" }
    });

    expect(execCommand).toHaveBeenCalledWith(
      "insertOrderedList",
      false,
      undefined
    );
    expect(execCommand).toHaveBeenCalledWith(
      "justifyCenter",
      false,
      undefined
    );
    expect(execCommand).toHaveBeenCalledWith("fontSize", false, "5");
    expect(
      screen.getByRole("combobox", { name: "字号" })
    ).toHaveTextContent("小正常大标题");
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

    fireEvent.change(screen.getByLabelText("选择附件"), {
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

  it("adds a PDF as an ordinary attachment", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            asset: {
              id: "asset-pdf",
              fileName: "报价单.pdf",
              contentType: "application/pdf",
              byteSize: 1024,
              width: 0,
              height: 0,
              previewUrl: "/api/mail/assets/asset-pdf"
            }
          })
      })
    );
    render(<Harness />);

    const input = screen.getByLabelText("选择附件");
    expect(input).toHaveAttribute(
      "accept",
      expect.stringContaining(".pdf")
    );
    fireEvent.change(input, {
      target: {
        files: [
          new File([Buffer.from("%PDF-1.7")], "报价单.pdf", {
            type: "application/pdf"
          })
        ]
      }
    });

    expect(await screen.findByText("报价单.pdf")).toBeInTheDocument();
    expect(screen.getByTestId("value")).toHaveTextContent(
      '"contentType":"application/pdf"'
    );
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

  it("explains when image storage is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: () =>
          Promise.resolve({
            code: "MAIL_ASSET_STORAGE_UNAVAILABLE"
          })
      })
    );
    render(<Harness />);

    fireEvent.change(screen.getByLabelText("选择附件"), {
      target: {
        files: [
          new File([Buffer.from("image")], "receipt.png", {
            type: "image/png"
          })
        ]
      }
    });

    expect(
      await screen.findByText("附件存储暂不可用，请联系管理员")
    ).toBeInTheDocument();
  });

  it("edits complete HTML source and derives text through preview", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          html:
            "<!DOCTYPE html><html><body><h1>欢迎回来</h1></body></html>",
          text: "欢迎回来",
          diagnostics: {
            removedTags: [],
            removedAttributes: [],
            blockedUrls: 0,
            externalImageCount: 0,
            hasDangerousContent: false
          },
          visualEditorCompatible: false,
          unresolvedVariables: [],
          canSend: true
        })
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Harness />);

    fireEvent.click(
      screen.getByRole("button", { name: "HTML 源码" })
    );
    fireEvent.change(screen.getByLabelText("HTML 邮件源码"), {
      target: {
        value:
          "<!DOCTYPE html><html><body><h1>欢迎回来</h1></body></html>"
      }
    });

    await waitFor(() => {
      expect(screen.getByTestId("value")).toHaveTextContent(
        '"bodyText":"欢迎回来"'
      );
    });
    expect(screen.getByTestId("value")).toHaveTextContent(
      "<!DOCTYPE html>"
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/mail/preview",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("shows the server-rendered preview in a scriptless iframe", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            html: "<p>最终内容</p>",
            text: "最终内容",
            diagnostics: {
              removedTags: ["script"],
              removedAttributes: [],
              blockedUrls: 0,
              externalImageCount: 1,
              hasDangerousContent: true
            },
            visualEditorCompatible: true,
            unresolvedVariables: [],
            canSend: true
          })
      })
    );
    render(<Harness />);

    fireEvent.click(
      screen.getByRole("button", { name: "发送预览" })
    );

    const frame = await screen.findByTitle(
      "HTML 邮件发送预览"
    );
    expect(frame).toHaveAttribute("sandbox", "");
    expect(frame).toHaveAttribute("srcdoc", "<p>最终内容</p>");
    expect(
      screen.getByText("含 1 张 HTTPS 外链图片")
    ).toBeInTheDocument();
  });

  it("hydrates uploaded images in the final browser preview", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            html:
              '<p>图片说明</p><img data-mail-asset-id="asset-preview" alt="预览图">',
            text: "图片说明",
            diagnostics: {
              removedTags: [],
              removedAttributes: [],
              blockedUrls: 0,
              externalImageCount: 0,
              hasDangerousContent: false
            },
            visualEditorCompatible: true,
            unresolvedVariables: [],
            canSend: true
          })
      })
    );
    render(
      <Harness
        initialValue={{
          bodyHtml:
            '<p>图片说明</p><img data-mail-asset-id="asset-preview" alt="预览图">',
          bodyText: "图片说明",
          assets: [
            {
              id: "asset-preview",
              fileName: "preview.png",
              contentType: "image/png",
              byteSize: 300,
              width: 80,
              height: 60,
              previewUrl: "/api/mail/assets/asset-preview",
              disposition: "INLINE",
              cid: "asset-preview@righttoken",
              sortOrder: 0
            }
          ]
        }}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "发送预览" })
    );
    expect(
      await screen.findByTitle("HTML 邮件发送预览")
    ).toHaveAttribute(
      "srcdoc",
      expect.stringContaining(
        'src="/api/mail/assets/asset-preview"'
      )
    );
  });

  it("preserves the complete document while hydrating preview images", async () => {
    const completeHtml =
      '<!DOCTYPE html><html><head><style>.hero{display:block}</style></head><body><img class="hero" data-mail-asset-id="asset-document" alt="主图"></body></html>';
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            html: completeHtml,
            text: "主图",
            diagnostics: {
              removedTags: [],
              removedAttributes: [],
              blockedUrls: 0,
              externalImageCount: 0,
              hasDangerousContent: false
            },
            visualEditorCompatible: false,
            unresolvedVariables: [],
            canSend: true
          })
      })
    );
    render(
      <Harness
        initialValue={{
          bodyHtml: completeHtml,
          bodyText: "主图",
          assets: [
            {
              id: "asset-document",
              fileName: "hero.png",
              contentType: "image/png",
              byteSize: 300,
              width: 80,
              height: 60,
              previewUrl: "/api/mail/assets/asset-document",
              disposition: "INLINE",
              cid: "asset-document@righttoken",
              sortOrder: 0
            }
          ]
        }}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "发送预览" })
    );
    const frame = await screen.findByTitle(
      "HTML 邮件发送预览"
    );
    expect(frame.getAttribute("srcdoc")).toMatch(
      /^<!DOCTYPE html><html>/i
    );
    expect(frame).toHaveAttribute(
      "srcdoc",
      expect.stringContaining("<head>")
    );
    expect(frame).toHaveAttribute(
      "srcdoc",
      expect.stringContaining(
        'src="/api/mail/assets/asset-document"'
      )
    );
  });

  it("warns before a complex source is simplified in visual mode", async () => {
    const confirm = vi.fn().mockReturnValue(false);
    vi.stubGlobal("confirm", confirm);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            html:
              "<html><head><style>.x{color:red}</style></head><body><table><tbody><tr><td>复杂</td></tr></tbody></table></body></html>",
            text: "复杂",
            diagnostics: {
              removedTags: [],
              removedAttributes: [],
              blockedUrls: 0,
              externalImageCount: 0,
              hasDangerousContent: false
            },
            visualEditorCompatible: false,
            unresolvedVariables: [],
            canSend: true
          })
      })
    );
    const unsafeFileName = 'hero" onerror="alert(1).png';
    render(
      <Harness
        initialValue={{
          bodyHtml: "<p>初始正文</p>",
          bodyText: "初始正文",
          assets: [
            {
              id: "asset-lossy",
              fileName: unsafeFileName,
              contentType: "image/png",
              byteSize: 300,
              width: 80,
              height: 60,
              previewUrl: "/api/mail/assets/asset-lossy",
              disposition: "INLINE",
              cid: "asset-lossy@righttoken",
              sortOrder: 0
            }
          ]
        }}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "HTML 源码" })
    );
    fireEvent.change(screen.getByLabelText("HTML 邮件源码"), {
      target: {
        value:
          "<html><head><style>.x{color:red}</style></head><body><table><tr><td>复杂</td></tr></table></body></html>"
      }
    });
    await waitFor(() =>
      expect(screen.getByTestId("value")).toHaveTextContent(
        '"bodyText":"复杂"'
      )
    );

    fireEvent.click(
      screen.getByRole("button", { name: "可视化编辑" })
    );
    expect(confirm).toHaveBeenCalled();
    expect(
      screen.getByLabelText("HTML 邮件源码")
    ).toBeInTheDocument();

    confirm.mockReturnValue(true);
    fireEvent.click(
      screen.getByRole("button", { name: "可视化编辑" })
    );
    expect(
      screen.queryByLabelText("HTML 邮件源码")
    ).not.toBeInTheDocument();
    const simplifiedImage = await screen.findByAltText(
      unsafeFileName
    );
    expect(simplifiedImage).not.toHaveAttribute("onerror");
  });

  it("imports a local HTML document into source mode", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            html:
              "<!DOCTYPE html><html><body><p>导入内容</p></body></html>",
            text: "导入内容",
            diagnostics: {
              removedTags: [],
              removedAttributes: [],
              blockedUrls: 0,
              externalImageCount: 0,
              hasDangerousContent: false
            },
            visualEditorCompatible: false,
            unresolvedVariables: [],
            canSend: true
          })
      })
    );
    render(<Harness />);
    fireEvent.click(
      screen.getByRole("button", { name: "HTML 源码" })
    );

    fireEvent.change(screen.getByLabelText("选择 HTML 文件"), {
      target: {
        files: [
          new File(
            [
              "<!DOCTYPE html><html><body><p>导入内容</p></body></html>"
            ],
            "welcome.html",
            { type: "text/html" }
          )
        ]
      }
    });

    await waitFor(() =>
      expect(
        screen.getByLabelText("HTML 邮件源码")
      ).toHaveValue(
        "<!DOCTYPE html><html><body><p>导入内容</p></body></html>"
      )
    );
  });

  it("inserts, edits, and removes a safe hyperlink", async () => {
    render(<Harness />);

    selectEditorText("初始正文");
    fireEvent.click(
      screen.getByRole("button", { name: "超链接" })
    );
    fireEvent.change(screen.getByLabelText("链接地址"), {
      target: { value: "example.com/help" }
    });
    fireEvent.click(
      screen.getByRole("button", { name: "保存链接" })
    );
    await waitFor(() => {
      expect(screen.getByTestId("value")).toHaveTextContent(
        'href=\\"https://example.com/help\\"'
      );
    });
    expect(screen.getByTestId("value")).toHaveTextContent(
      'rel=\\"noopener noreferrer\\"'
    );

    selectEditorText("初始正文");
    fireEvent.click(
      screen.getByRole("button", { name: "超链接" })
    );
    expect(screen.getByLabelText("链接地址")).toHaveValue(
      "https://example.com/help"
    );
    fireEvent.change(screen.getByLabelText("链接地址"), {
      target: { value: "https://example.com/updated" }
    });
    fireEvent.click(
      screen.getByRole("button", { name: "保存链接" })
    );
    await waitFor(() => {
      expect(screen.getByTestId("value")).toHaveTextContent(
        "https://example.com/updated"
      );
    });

    selectEditorText("初始正文");
    fireEvent.click(
      screen.getByRole("button", { name: "超链接" })
    );
    fireEvent.click(
      screen.getByRole("button", { name: "移除链接" })
    );
    await waitFor(() => {
      expect(screen.getByTestId("value")).not.toHaveTextContent(
        "<a"
      );
    });
    expect(screen.getByText("初始正文")).toBeInTheDocument();
  });

  it("rejects unsafe hyperlink schemes without changing content", () => {
    render(<Harness />);
    selectEditorText("初始正文");
    fireEvent.click(
      screen.getByRole("button", { name: "超链接" })
    );
    fireEvent.change(screen.getByLabelText("链接地址"), {
      target: { value: "javascript:alert(1)" }
    });
    fireEvent.click(
      screen.getByRole("button", { name: "保存链接" })
    );

    expect(
      screen.getByRole("alert", {
        name: ""
      })
    ).toHaveTextContent("仅支持 HTTPS 或邮件地址链接");
    expect(screen.getByTestId("value")).not.toHaveTextContent(
      "javascript:"
    );
  });
});
