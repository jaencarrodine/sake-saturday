import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sake Saturday - Tasting Tracker",
  description: "Track and share your sake tasting experiences",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-background`}
      >
        <div className="flex min-h-screen flex-col">
          <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container flex h-14 max-w-screen-2xl items-center">
              <div className="mr-4 flex">
                <Link href="/" className="mr-6 flex items-center space-x-2">
                  <span className="font-bold sm:inline-block text-xl">
                    🍶 Sake Saturday
                  </span>
                </Link>
                <nav className="flex items-center space-x-6 text-sm font-medium">
                  <Link
                    href="/"
                    className="transition-colors hover:text-foreground/80 text-foreground/60"
                  >
                    Home
                  </Link>
                  <Link
                    href="/tasting/new"
                    className="transition-colors hover:text-foreground/80 text-foreground/60"
                  >
                    New Tasting
                  </Link>
                </nav>
              </div>
            </div>
          </header>
          <main className="flex-1">
            {children}
          </main>
          <footer className="border-t py-6 md:py-0">
            <div className="container flex flex-col items-center justify-between gap-4 md:h-16 md:flex-row">
              <p className="text-center text-sm leading-loose text-muted-foreground md:text-left">
                Built for sake enthusiasts
              </p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
