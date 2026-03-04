import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";

const sans = Nunito({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["300", "400", "500", "600"],
});

export const metadata: Metadata = {
  title: "12ozsticke.rs | Premium Custom Stickers",
  description: "Upload your photo, peel the preview, and order premium stickers in 30 seconds.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={sans.variable}>
      <body>{children}</body>
    </html>
  );
}
