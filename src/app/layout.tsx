import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CodeQuest AI — Learn by solving",
  description:
    "An AI coding mentor for guided missions, progressive hints, and stronger problem-solving skills.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
