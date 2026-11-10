import type { Metadata } from "next";
import { Libre_Baskerville, Noto_Sans } from "next/font/google";
import "./globals.css";

// Free stand-ins for the classic statblock fonts, used by the review screen's statblock (see `.statblock` in globals.css).
const statblockTitle = Libre_Baskerville({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-statblock-title" });
const statblockBody = Noto_Sans({ subsets: ["latin"], weight: ["400", "700"], style: ["normal", "italic"], variable: "--font-statblock-body" });

export const metadata: Metadata = {
  title: "Monster Turn Advisor",
  description: "Rules-legal turn recommendations for a 5e monster",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${statblockTitle.variable} ${statblockBody.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
