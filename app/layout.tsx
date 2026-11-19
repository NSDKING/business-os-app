import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Business OS", description: "Team chat and approved reports", appleWebApp: { capable: true, title: "Business OS", statusBarStyle: "black-translucent" }, icons: { apple: "/icon-192.png" } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: [{ media: "(prefers-color-scheme: dark)", color: "#000000" }, { media: "(prefers-color-scheme: light)", color: "#ffffff" }] };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="fr"><body>{children}</body></html>);
}
