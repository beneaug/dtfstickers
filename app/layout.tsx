import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
