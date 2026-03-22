import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "MangaLens",
  description: "AI-powered manga, manhwa & manhua translation platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} font-sans antialiased bg-gray-950 text-gray-100 min-h-screen`}>
        <nav className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-6">
            <Link href="/" className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              MangaLens
            </Link>
            <div className="flex gap-4 text-sm text-gray-400">
              <Link href="/" className="hover:text-white transition-colors">Library</Link>
              <Link href="/upload" className="hover:text-white transition-colors">Upload</Link>
              <Link href="/settings" className="hover:text-white transition-colors">Settings</Link>
            </div>
            <div className="ml-auto text-xs text-gray-600">
              <a href="https://ko-fi.com/therealsenzu" target="_blank" rel="noopener noreferrer" className="hover:text-purple-400 transition-colors">
                Support MangaLens
              </a>
            </div>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-4 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}
