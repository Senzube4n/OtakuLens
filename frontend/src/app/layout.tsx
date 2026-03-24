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
      <body className={`${geistSans.variable} font-sans antialiased bg-[#0a0b0f] text-gray-100 min-h-screen flex flex-col`}>
        {/* Animated ambient background */}
        <div className="fixed inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-600/[0.07] rounded-full blur-[128px] animate-float" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-pink-600/[0.06] rounded-full blur-[128px] animate-float" style={{ animationDelay: '1.5s' }} />
          <div className="absolute top-1/2 left-1/2 w-80 h-80 bg-cyan-500/[0.04] rounded-full blur-[128px] animate-float" style={{ animationDelay: '3s' }} />
          <div className="absolute bottom-1/4 left-1/6 w-64 h-64 bg-orange-500/[0.03] rounded-full blur-[128px] animate-float" style={{ animationDelay: '4.5s' }} />
        </div>

        {/* Navbar */}
        <nav className="border-b border-transparent bg-[#0a0b0f]/80 backdrop-blur-xl sticky top-0 z-50" style={{ borderImage: 'linear-gradient(90deg, transparent, #7c3aed, #ec4899, #06b6d4, transparent) 1' }}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4 sm:gap-8">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-9 h-9 rounded-xl rainbow-gradient-animated flex items-center justify-center text-white text-sm font-black shadow-lg shadow-purple-500/25 group-hover:shadow-purple-500/50 transition-all group-hover:scale-110 duration-300">
                M
              </div>
              <span className="text-lg font-extrabold gradient-text-animated hidden sm:inline">
                MangaLens
              </span>
            </Link>

            <div className="flex gap-1 text-sm">
              <Link href="/" className="px-3 py-1.5 rounded-full text-gray-400 hover:text-white hover:bg-white/5 transition-all hover:scale-105">
                Library
              </Link>
              <Link href="/upload" className="px-3 py-1.5 rounded-full text-gray-400 hover:text-white hover:bg-white/5 transition-all hover:scale-105">
                Upload
              </Link>
              <Link href="/settings" className="px-3 py-1.5 rounded-full text-gray-400 hover:text-white hover:bg-white/5 transition-all hover:scale-105">
                Settings
              </Link>
            </div>

            <div className="ml-auto flex items-center gap-3">
              {/* Colorful dots accent */}
              <div className="hidden sm:flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
                <span className="w-1.5 h-1.5 rounded-full bg-pink-500 animate-pulse" style={{ animationDelay: '0.3s' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" style={{ animationDelay: '0.6s' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" style={{ animationDelay: '0.9s' }} />
              </div>
              <a href="https://ko-fi.com/therealsenzu" target="_blank" rel="noopener noreferrer"
                className="text-xs px-3 py-1.5 rounded-full border border-pink-500/30 text-pink-400 hover:bg-pink-500/10 hover:border-pink-500/50 hover:scale-105 transition-all">
                Support Us
              </a>
            </div>
          </div>
        </nav>

        {/* Main content */}
        <main className="relative max-w-7xl mx-auto px-4 sm:px-6 py-8 flex-1 w-full page-transition">
          {children}
        </main>

        {/* Fun footer */}
        <footer className="relative border-t border-white/5 bg-[#0a0b0f]/90 backdrop-blur-sm mt-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg rainbow-gradient-animated flex items-center justify-center text-white text-xs font-black">
                  M
                </div>
                <span className="text-sm text-gray-500">
                  MangaLens — Read anything, in any language
                </span>
              </div>
              <div className="flex items-center gap-4">
                <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full bg-gradient-to-r from-purple-500/10 to-cyan-500/10 border border-purple-500/20 text-purple-300">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                  Powered by AI
                </span>
                <a href="https://ko-fi.com/therealsenzu" target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full bg-pink-500/10 border border-pink-500/20 text-pink-400 hover:bg-pink-500/20 transition-all hover:scale-105">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                  Ko-fi
                </a>
              </div>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
