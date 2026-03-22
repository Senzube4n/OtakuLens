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
      <body className={`${geistSans.variable} font-sans antialiased bg-[#0a0b0f] text-gray-100 min-h-screen`}>
        {/* Ambient background gradient */}
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-600/5 rounded-full blur-[128px]" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-pink-600/5 rounded-full blur-[128px]" />
        </div>

        <nav className="border-b border-white/5 bg-[#0a0b0f]/80 backdrop-blur-xl sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-6 h-16 flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-sm font-bold shadow-lg shadow-purple-500/20 group-hover:shadow-purple-500/40 transition-shadow">
                M
              </div>
              <span className="text-lg font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                MangaLens
              </span>
            </Link>
            <div className="flex gap-1 text-sm">
              <Link href="/" className="px-3 py-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-all">Library</Link>
              <Link href="/upload" className="px-3 py-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-all">Upload</Link>
              <Link href="/settings" className="px-3 py-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-all">Settings</Link>
            </div>
            <div className="ml-auto flex items-center gap-4">
              <a href="https://ko-fi.com/therealsenzu" target="_blank" rel="noopener noreferrer"
                className="text-xs px-3 py-1.5 rounded-full border border-purple-500/30 text-purple-400 hover:bg-purple-500/10 hover:border-purple-500/50 transition-all">
                Support MangaLens
              </a>
            </div>
          </div>
        </nav>
        <main className="relative max-w-7xl mx-auto px-6 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
