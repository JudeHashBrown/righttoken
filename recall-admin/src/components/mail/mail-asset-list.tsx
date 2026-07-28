"use client";

import { Paperclip, Trash2 } from "lucide-react";
import styles from "@/components/workspaces/workspace.module.css";
import type {
  MailEditorAsset
} from "@/components/mail/mail-rich-editor";

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
}

export function MailAssetList({
  assets,
  onRemove
}: {
  assets: ReadonlyArray<MailEditorAsset>;
  onRemove?(assetId: string): void;
}): React.JSX.Element | null {
  const attachments = assets.filter(
    (asset) => asset.disposition === "ATTACHMENT"
  );
  if (!attachments.length) return null;
  return (
    <div
      aria-label="图片附件"
      className={styles.mailAttachmentList}
    >
      {attachments.map((asset) => (
        <div className={styles.mailAttachmentItem} key={asset.id}>
          <a
            href={`${asset.previewUrl}?download=1`}
            rel="noreferrer"
            target="_blank"
          >
            <Paperclip aria-hidden="true" size={16} />
            <span>
              <strong>{asset.fileName}</strong>
              <small>{fileSize(asset.byteSize)}</small>
            </span>
          </a>
          {onRemove ? (
            <button
              aria-label={`删除附件 ${asset.fileName}`}
              className={styles.iconButton}
              onClick={() => onRemove(asset.id)}
              type="button"
            >
              <Trash2 aria-hidden="true" size={16} />
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
