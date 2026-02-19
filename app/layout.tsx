import type { Metadata } from "next";
import { VT323, Noto_Sans_JP, Press_Start_2P } from "next/font/google";
import "./globals.css";
import { Providers } from "@/lib/providers";

const vt323 = VT323({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-vt323",
});

const notoSansJP = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
  display: "swap",
});

const pressStart2P = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-press-start-2p",
});

export const metadata: Metadata = {
  title: "Sake Saturday - 酒の土曜日",
  description: "Track, rate, and explore sake tastings with friends",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${vt323.className} ${notoSansJP.variable} ${pressStart2P.variable} antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
