"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  getChapter, listPages, getPageImageUrl, listAllSeriesChapters, updateReadingProgress,
} from "@/lib/api";
import type { Chapter, Page } from "@/lib/types";
import {
  ArrowLeft, ArrowRight, Columns, List, Eye, EyeOff, ChevronUp, ChevronDown,
  Sun, Moon, Minus, Square, Maximize2, Settings2,
} from "lucide-react";

type ViewMode = "infinite-scroll" | "page-by-page" | "side-by-side";
type PageGap = "compact" | "normal" | "wide";

interface ChapterWithPages {
  chapter: Chapter;
  pages: Page[];
}

export default function Reader() {
  const { chapterId } = useParams<{ chapterId: string }>();

  // Core state
  const [initialChapter, setInitialChapter] = useState<Chapter | null>(null);
  const [allChapters, setAllChapters] = useState<ChapterWithPages[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("infinite-scroll");
  const [showRegions, setShowRegions] = useState(false);

  // Page-by-page mode
  const [currentPage, setCurrentPage] = useState(0);
  const [currentChapterIdx, setCurrentChapterIdx] = useState(0);

  // UI controls
  const [darkBg, setDarkBg] = useState(true);
  const [pageGap, setPageGap] = useState<PageGap>("normal");
  const [showToolbar, setShowToolbar] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  // Reading progress
  const [visibleChapter, setVisibleChapter] = useState<number>(0);
  const [visiblePage, setVisiblePage] = useState<number>(0);
  const [totalPagesInChapter, setTotalPagesInChapter] = useState<number>(0);

  // Refs
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollY = useRef(0);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pageVisibilityTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const readPages = useRef<Set<string>>(new Set());
  const seriesIdRef = useRef<string>("");

  // Load initial chapter, then all chapters in the series
  useEffect(() => {
    async function load() {
      try {
        const ch = await getChapter(chapterId);
        setInitialChapter(ch);
        seriesIdRef.current = ch.series_id;

        // Load all chapters for infinite scroll
        const chaptersWithPages = await listAllSeriesChapters(ch.series_id);
        setAllChapters(chaptersWithPages);

        // Find which index our starting chapter is
        const idx = chaptersWithPages.findIndex(c => c.chapter.id === chapterId);
        if (idx >= 0) {
          setCurrentChapterIdx(idx);
          setVisibleChapter(chaptersWithPages[idx].chapter.chapter_number);
          setTotalPagesInChapter(chaptersWithPages[idx].pages.length);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [chapterId]);

  // Scroll direction detection for toolbar auto-hide
  useEffect(() => {
    if (viewMode !== "infinite-scroll") return;

    function handleScroll() {
      const currentY = window.scrollY;
      if (currentY > lastScrollY.current + 20) {
        setShowToolbar(false);
      } else if (currentY < lastScrollY.current - 10) {
        setShowToolbar(true);
      }
      lastScrollY.current = currentY;
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [viewMode]);

  // Save reading progress every 10 seconds
  useEffect(() => {
    progressTimer.current = setInterval(() => {
      if (seriesIdRef.current && visibleChapter > 0) {
        updateReadingProgress(seriesIdRef.current, visibleChapter, visiblePage).catch(() => {});
      }
    }, 10000);
    return () => {
      if (progressTimer.current) clearInterval(progressTimer.current);
    };
  }, [visibleChapter, visiblePage]);

  // Intersection Observer for tracking visible pages
  const observerCallback = useCallback((entries: IntersectionObserverEntry[]) => {
    entries.forEach(entry => {
      const el = entry.target as HTMLElement;
      const pageKey = el.dataset.pageKey || "";
      const chNum = Number(el.dataset.chapterNumber || 0);
      const pgNum = Number(el.dataset.pageNumber || 0);
      const totalPages = Number(el.dataset.totalPages || 0);

      if (entry.isIntersecting) {
        // Update visible chapter/page for progress indicator
        setVisibleChapter(chNum);
        setVisiblePage(pgNum);
        setTotalPagesInChapter(totalPages);

        // Start 2-second timer for marking as "read"
        if (!readPages.current.has(pageKey)) {
          const timer = setTimeout(() => {
            readPages.current.add(pageKey);
          }, 2000);
          pageVisibilityTimers.current.set(pageKey, timer);
        }
      } else {
        // Clear timer if user scrolled away before 2 seconds
        const timer = pageVisibilityTimers.current.get(pageKey);
        if (timer) {
          clearTimeout(timer);
          pageVisibilityTimers.current.delete(pageKey);
        }
      }
    });
  }, []);

  useEffect(() => {
    if (viewMode !== "infinite-scroll") return;

    const observer = new IntersectionObserver(observerCallback, {
      root: null,
      rootMargin: "0px",
      threshold: 0.5,
    });

    const images = document.querySelectorAll("[data-page-key]");
    images.forEach(img => observer.observe(img));

    return () => observer.disconnect();
  }, [viewMode, allChapters, observerCallback]);

  // Scroll to top
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Gap classes
  const gapClass = pageGap === "compact" ? "gap-0" : pageGap === "normal" ? "gap-1" : "gap-4";

  // Background class
  const bgClass = darkBg ? "bg-[#0a0b0f]" : "bg-gray-200";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl rainbow-gradient-animated animate-spin-slow" />
          <span className="text-sm text-gray-500">Loading reader...</span>
        </div>
      </div>
    );
  }

  if (!initialChapter || allChapters.length === 0) {
    return (
      <div className="text-center py-20 text-gray-500">
        <div className="text-3xl mb-3">{"(T_T)"}</div>
        <p>Could not load chapter</p>
      </div>
    );
  }

  // Get chapters starting from the current one for infinite scroll
  const startIdx = allChapters.findIndex(c => c.chapter.id === chapterId);
  const chaptersToRender = startIdx >= 0 ? allChapters.slice(startIdx) : allChapters;

  // Page-by-page: current data
  const currentChapterData = allChapters[currentChapterIdx];
  const currentPages = currentChapterData?.pages || [];
  const currentPageData = currentPages[currentPage];

  return (
    <div className={`min-h-screen ${bgClass} transition-colors duration-300`}>
      {/* Floating toolbar */}
      <div className={`fixed top-0 left-0 right-0 z-50 transition-transform duration-300 ${showToolbar ? "translate-y-0" : "-translate-y-full"}`}>
        <div className="bg-[#0a0b0f]/90 backdrop-blur-xl border-b border-white/5" style={{ borderImage: 'linear-gradient(90deg, transparent, #7c3aed40, #ec489940, transparent) 1' }}>
          <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-3">
            {/* Back button */}
            <Link href={`/series/${initialChapter.series_id}`}
              className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-all">
              <ArrowLeft size={18} />
            </Link>

            {/* Chapter title */}
            <div className="flex-1 min-w-0">
              <h1 className="text-sm font-bold truncate">
                Chapter {initialChapter.chapter_number}
                {initialChapter.title && <span className="text-gray-500 font-normal ml-2">- {initialChapter.title}</span>}
              </h1>
            </div>

            {/* View mode toggle */}
            <div className="flex items-center gap-1 bg-white/5 rounded-full p-0.5">
              <button onClick={() => setViewMode("infinite-scroll")}
                className={`p-1.5 rounded-full transition-all ${viewMode === "infinite-scroll" ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg" : "text-gray-500 hover:text-white"}`}
                title="Infinite Scroll">
                <List size={14} />
              </button>
              <button onClick={() => setViewMode("page-by-page")}
                className={`p-1.5 rounded-full transition-all ${viewMode === "page-by-page" ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg" : "text-gray-500 hover:text-white"}`}
                title="Page by Page">
                <Square size={14} />
              </button>
              <button onClick={() => setViewMode("side-by-side")}
                className={`p-1.5 rounded-full transition-all ${viewMode === "side-by-side" ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg" : "text-gray-500 hover:text-white"}`}
                title="Side by Side">
                <Columns size={14} />
              </button>
            </div>

            {/* Settings */}
            <button onClick={() => setShowSettings(!showSettings)}
              className={`p-2 rounded-lg transition-all ${showSettings ? "bg-purple-600 text-white" : "text-gray-400 hover:text-white hover:bg-white/10"}`}>
              <Settings2 size={16} />
            </button>

            {/* Chapter jump dropdown */}
            <select
              value={currentChapterIdx}
              onChange={(e) => {
                const idx = Number(e.target.value);
                setCurrentChapterIdx(idx);
                setCurrentPage(0);
                if (viewMode === "infinite-scroll") {
                  const el = document.getElementById(`chapter-${allChapters[idx].chapter.id}`);
                  if (el) el.scrollIntoView({ behavior: "smooth" });
                }
              }}
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-gray-300 focus:outline-none focus:border-purple-500/50 max-w-[120px]"
            >
              {allChapters.map((c, i) => (
                <option key={c.chapter.id} value={i}>Ch. {c.chapter.chapter_number}</option>
              ))}
            </select>
          </div>

          {/* Settings panel */}
          {showSettings && (
            <div className="border-t border-white/5 px-4 py-3 animate-slide-up">
              <div className="max-w-7xl mx-auto flex items-center gap-6 flex-wrap text-xs">
                {/* Background toggle */}
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">Background:</span>
                  <button onClick={() => setDarkBg(!darkBg)}
                    className={`p-1.5 rounded-lg transition-all ${darkBg ? "bg-gray-800 text-yellow-400" : "bg-gray-200 text-gray-800"}`}>
                    {darkBg ? <Moon size={14} /> : <Sun size={14} />}
                  </button>
                </div>

                {/* Page gap */}
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">Gap:</span>
                  <div className="flex gap-0.5 bg-white/5 rounded-lg p-0.5">
                    {(["compact", "normal", "wide"] as PageGap[]).map(g => (
                      <button key={g} onClick={() => setPageGap(g)}
                        className={`px-2 py-1 rounded-md capitalize transition-all ${pageGap === g ? "bg-purple-600 text-white" : "text-gray-500 hover:text-white"}`}>
                        {g}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Text regions toggle */}
                <button onClick={() => setShowRegions(!showRegions)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all ${showRegions ? "bg-cyan-600/20 text-cyan-400 border border-cyan-500/30" : "bg-white/5 text-gray-500"}`}>
                  {showRegions ? <EyeOff size={12} /> : <Eye size={12} />}
                  Regions
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Floating progress indicator */}
      {viewMode === "infinite-scroll" && (
        <div className="fixed bottom-6 right-6 z-40 progress-float animate-bounce-in">
          Ch.{visibleChapter} p.{visiblePage}/{totalPagesInChapter}
        </div>
      )}

      {/* Scroll to top button */}
      <button onClick={scrollToTop}
        className="fixed bottom-6 left-6 z-40 w-10 h-10 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 text-white flex items-center justify-center shadow-lg shadow-purple-500/25 hover:scale-110 transition-all opacity-70 hover:opacity-100">
        <ChevronUp size={18} />
      </button>

      {/* Content area - push down for toolbar */}
      <div className="pt-16">
        {/* === INFINITE SCROLL MODE === */}
        {viewMode === "infinite-scroll" && (
          <div className={`max-w-2xl mx-auto ${gapClass} flex flex-col`}>
            {chaptersToRender.map((chData, chIdx) => (
              <div key={chData.chapter.id} id={`chapter-${chData.chapter.id}`}>
                {/* Chapter divider (skip for the first) */}
                {chIdx > 0 && (
                  <div className="chapter-divider my-4">
                    <span className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-[#0a0b0f] border border-purple-500/20 text-sm font-bold gradient-text relative z-10">
                      Chapter {chData.chapter.chapter_number}
                      {chData.chapter.title && <span className="text-gray-500 font-normal text-xs">- {chData.chapter.title}</span>}
                    </span>
                  </div>
                )}

                {/* Pages */}
                {chData.pages.map((p) => (
                  <div
                    key={p.id}
                    data-page-key={`${chData.chapter.id}-${p.page_number}`}
                    data-chapter-number={chData.chapter.chapter_number}
                    data-page-number={p.page_number}
                    data-total-pages={chData.pages.length}
                    className="relative"
                  >
                    <img
                      src={getPageImageUrl(p.id, p.translated_path ? "translated" : "original")}
                      alt={`Ch.${chData.chapter.chapter_number} Page ${p.page_number}`}
                      className="w-full"
                      loading="lazy"
                    />
                    {showRegions && p.text_regions?.map((r) => (
                      <div
                        key={r.id}
                        className="absolute border-2 border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20 cursor-pointer group rounded"
                        style={{
                          left: `${(r.bbox_x / p.width) * 100}%`,
                          top: `${(r.bbox_y / p.height) * 100}%`,
                          width: `${(r.bbox_w / p.width) * 100}%`,
                          height: `${(r.bbox_h / p.height) * 100}%`,
                        }}
                      >
                        <div className="hidden group-hover:block absolute bottom-full left-0 bg-[#12131a] border border-purple-500/20 rounded-xl p-3 text-xs max-w-xs z-10 mb-1 shadow-xl">
                          <p className="text-gray-400">{r.original_text}</p>
                          <p className="text-pink-400 mt-1 font-medium">{r.translated_text || "Not translated"}</p>
                          {r.speaker && <p className="text-cyan-400/70 mt-1">Speaker: {r.speaker}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}

            {/* End of all chapters */}
            <div className="text-center py-12">
              <div className="text-3xl mb-3">{"\\( ^o^ )/"}</div>
              <p className="text-gray-500 text-sm">You have reached the end!</p>
              <Link href={`/series/${initialChapter.series_id}`}
                className="inline-flex items-center gap-2 mt-4 btn-playful text-xs">
                <ArrowLeft size={14} /> Back to Series
              </Link>
            </div>
          </div>
        )}

        {/* === PAGE BY PAGE / SIDE BY SIDE MODE === */}
        {(viewMode === "page-by-page" || viewMode === "side-by-side") && currentPageData && (
          <div className="max-w-5xl mx-auto px-4">
            <div className={`flex gap-4 ${viewMode === "page-by-page" ? "justify-center" : ""}`}>
              {viewMode === "side-by-side" && (
                <div className="flex-1 rounded-xl overflow-hidden border-2 border-white/5 hover:border-purple-500/20 transition-colors">
                  <div className="text-xs text-gray-500 text-center py-1.5 bg-white/[0.02] font-semibold">Original</div>
                  <img src={getPageImageUrl(currentPageData.id, "original")} alt={`Original page ${currentPageData.page_number}`} className="w-full" />
                </div>
              )}
              <div className={`${viewMode === "page-by-page" ? "max-w-2xl w-full" : "flex-1"} rounded-xl overflow-hidden border-2 border-white/5 hover:border-pink-500/20 transition-colors`}>
                <div className="text-xs text-gray-500 text-center py-1.5 bg-white/[0.02] font-semibold">Translated</div>
                <div className="relative">
                  <img
                    src={getPageImageUrl(currentPageData.id, currentPageData.translated_path ? "translated" : "original")}
                    alt={`Translated page ${currentPageData.page_number}`}
                    className="w-full"
                  />
                  {showRegions && currentPageData.text_regions?.map((r) => (
                    <div
                      key={r.id}
                      className="absolute border-2 border-cyan-500/40 bg-cyan-500/10 hover:bg-cyan-500/20 cursor-pointer group rounded"
                      style={{
                        left: `${(r.bbox_x / currentPageData.width) * 100}%`,
                        top: `${(r.bbox_y / currentPageData.height) * 100}%`,
                        width: `${(r.bbox_w / currentPageData.width) * 100}%`,
                        height: `${(r.bbox_h / currentPageData.height) * 100}%`,
                      }}
                    >
                      <div className="hidden group-hover:block absolute bottom-full left-0 bg-[#12131a] border border-purple-500/20 rounded-xl p-3 text-xs max-w-xs z-10 mb-1 shadow-xl">
                        <p className="text-gray-400">{r.original_text}</p>
                        <p className="text-pink-400 mt-1 font-medium">{r.translated_text || "Not translated"}</p>
                        {r.speaker && <p className="text-cyan-400/70 mt-1">Speaker: {r.speaker}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Page navigation */}
            <div className="flex items-center justify-center gap-4 mt-6 mb-8">
              <button
                onClick={() => {
                  if (currentPage > 0) {
                    setCurrentPage(currentPage - 1);
                  } else if (currentChapterIdx > 0) {
                    const prevIdx = currentChapterIdx - 1;
                    setCurrentChapterIdx(prevIdx);
                    setCurrentPage(allChapters[prevIdx].pages.length - 1);
                  }
                }}
                disabled={currentPage === 0 && currentChapterIdx === 0}
                className="p-3 rounded-full bg-white/5 hover:bg-purple-600/20 border border-white/10 hover:border-purple-500/30 disabled:opacity-20 transition-all hover:scale-110 disabled:hover:scale-100"
              >
                <ArrowLeft size={18} />
              </button>

              <div className="text-sm text-gray-400 px-4 py-2 rounded-full bg-white/5 border border-white/10">
                <span className="text-purple-400 font-bold">Ch.{currentChapterData.chapter.chapter_number}</span>
                {" "} Page {currentPage + 1} of {currentPages.length}
              </div>

              <button
                onClick={() => {
                  if (currentPage < currentPages.length - 1) {
                    setCurrentPage(currentPage + 1);
                  } else if (currentChapterIdx < allChapters.length - 1) {
                    setCurrentChapterIdx(currentChapterIdx + 1);
                    setCurrentPage(0);
                  }
                }}
                disabled={currentPage === currentPages.length - 1 && currentChapterIdx === allChapters.length - 1}
                className="p-3 rounded-full bg-white/5 hover:bg-pink-600/20 border border-white/10 hover:border-pink-500/30 disabled:opacity-20 transition-all hover:scale-110 disabled:hover:scale-100"
              >
                <ArrowRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
