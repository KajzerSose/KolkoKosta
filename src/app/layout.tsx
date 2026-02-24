import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Kolko Kosta - Usporedba cijena u hrvatskim supermarketima",
  description:
    "Usporedite cijene proizvoda u svim hrvatskim supermarketima. Konzum, Spar, Lidl, Kaufland, Plodine, Tommy i još mnogo više.",
  keywords:
    "cijene, supermarketi, Hrvatska, usporedba cijena, Konzum, Spar, Lidl, Kaufland",
  openGraph: {
    title: "Kolko Kosta",
    description: "Usporedba cijena u hrvatskim supermarketima",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="hr">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-50 min-h-screen`}
      >
        {children}
      </body>
    </html>
  );
}
