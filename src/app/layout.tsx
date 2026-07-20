import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Yasi Words — 雅思单词拼写训练",
  description: "通过闪现-拼写模式训练雅思词汇真实拼写能力",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}