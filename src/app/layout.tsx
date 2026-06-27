import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Atoms Demo",
  description: "一个参考 Atoms 文档实现的 AI App Builder Demo",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
