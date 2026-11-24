import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Business OS", description: "Team chat and approved reports", appleWebApp: { capable: true, title: "Business OS", statusBarStyle: "default" }, icons: { apple: "/icon-192.png" } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#145C43" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = `try{var t=localStorage.getItem("bos.theme")||"light";document.documentElement.dataset.theme=t==="system"?(matchMedia("(prefers-color-scheme:dark)").matches?"dark":"light"):t}catch(e){document.documentElement.dataset.theme="light"}`;
  return (<html lang="fr" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: theme }} /></head><body>{children}</body></html>);
}
