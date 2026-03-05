import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "12oz Stickers — Custom Vinyl Stickers, Fast",
  description:
    "Upload your design, preview it in 3D, and order premium weatherproof vinyl stickers. Die-cut, kiss-cut, or square. Matte, gloss, or holographic. Ships in 3–5 days.",
  keywords: [
    "custom stickers",
    "vinyl stickers",
    "die-cut stickers",
    "holographic stickers",
    "sticker printing",
    "laptop stickers",
  ],
  openGraph: {
    title: "12oz Stickers — Custom Vinyl Stickers, Fast",
    description:
      "Upload, preview, peel. Premium weatherproof stickers from your camera roll in 30 seconds.",
    siteName: "12oz Stickers",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "12oz Stickers — Custom Vinyl Stickers, Fast",
    description:
      "Upload, preview, peel. Premium weatherproof stickers in 30 seconds.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
