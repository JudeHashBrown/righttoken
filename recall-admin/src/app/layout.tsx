import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "RightToken 用户运营",
  description: "用户跟踪、分组与召回管理后台"
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
