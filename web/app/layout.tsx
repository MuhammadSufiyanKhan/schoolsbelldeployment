import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import SW from "@/components/sw";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Schoolwell · School management",
  description: "Students, staff, HR, attendance, exams, fees and more in one system.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Schoolwell" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};
export const viewport: Viewport = { themeColor: "#0f766e", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">{children}<SW /></body>
    </html>
  );
}
