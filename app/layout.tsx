import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Monster Turn Advisor",
  description: "Rules-legal turn recommendations for a 5e monster",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
