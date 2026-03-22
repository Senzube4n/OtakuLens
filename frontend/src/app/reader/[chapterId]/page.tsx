"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getChapter, listPages, getPageImageUrl } from "@/lib/api";
import type { Chapter, Page } from "@/lib/types";
import { ArrowLeft, ArrowRight, Columns, List, Eye, EyeOff } from "lucide-react";

type ViewMode = "side-by-side" | "vertical" | "translated-only";

export default function Reader() {
  const { chapterId } = useParams<{ chapterId: string }>();
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("side-by-side");
  const [showRegions, setShowRegions] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [ch, pg] = await Promise.all([getChapter(chapterId), listPages(chapterId)]);
        setChapter(ch);
        setPages(pg.sort((a, b) => a.page_number - b.page_number));
      } catch (e) { console.error(e); }
    }
    load();
  }, [chapterId]);

  if (!chapter || pages.length === 0) return <div className="text-center py-20 text-gray-500">Loading...</div>;

  const page = pages[currentPage];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 gap-4">
        <div className="flex items-center gap-3">
          <Link href={`/series/${chapter.series_id}`} className="text-gray-400 hover:text-white"><ArrowLeft size={20} /></Link>
          <div>
            <h1 className="text-lg font-bold">Chapter {chapter.chapter_number}</h1>
            {chapter.title && <p className="text-xs text-gray-500">{chapter.title}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setViewMode("side-by-side")} className={`p-2 rounded ${viewMode === "side-by-side" ? "bg-purple-600" : "bg-gray-800 hover:bg-gray-700"}`} title="Side by side"><Columns size={16} /></button>
          <button onClick={() => setViewMode("vertical")} className={`p-2 rounded ${viewMode === "vertical" ? "bg-purple-600" : "bg-gray-800 hover:bg-gray-700"}`} title="Vertical scroll"><List size={16} /></button>
          <button onClick={() => setViewMode("translated-only")} className={`p-2 rounded ${viewMode === "translated-only" ? "bg-purple-600" : "bg-gray-800 hover:bg-gray-700"}`} title="Translated only"><Eye size={16} /></button>
          <button onClick={() => setShowRegions(!showRegions)} className={`p-2 rounded ${showRegions ? "bg-purple-600" : "bg-gray-800 hover:bg-gray-700"}`} title="Show text regions">{showRegions ? <EyeOff size={16} /> : <Eye size={16} />}</button>
        </div>
      </div>

      {/* Vertical scroll mode */}
      {viewMode === "vertical" ? (
        <div className="space-y-1 max-w-2xl mx-auto">
          {pages.map((p) => (
            <div key={p.id}>
              <img
                src={getPageImageUrl(p.id, p.translated_path ? "translated" : "original")}
                alt={`Page ${p.page_number}`}
                className="w-full"
                loading="lazy"
              />
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Page view */}
          <div className={`flex gap-4 ${viewMode === "translated-only" ? "justify-center" : ""}`}>
            {viewMode === "side-by-side" && (
              <div className="flex-1 bg-gray-900 rounded-lg overflow-hidden border border-gray-800">
                <div className="text-xs text-gray-500 text-center py-1 bg-gray-800/50">Original</div>
                <img src={getPageImageUrl(page.id, "original")} alt={`Original page ${page.page_number}`} className="w-full" />
              </div>
            )}
            <div className={`${viewMode === "translated-only" ? "max-w-2xl w-full" : "flex-1"} bg-gray-900 rounded-lg overflow-hidden border border-gray-800`}>
              <div className="text-xs text-gray-500 text-center py-1 bg-gray-800/50">Translated</div>
              <div className="relative">
                <img
                  src={getPageImageUrl(page.id, page.translated_path ? "translated" : "original")}
                  alt={`Translated page ${page.page_number}`}
                  className="w-full"
                />
                {showRegions && page.text_regions?.map((r) => (
                  <div
                    key={r.id}
                    className="absolute border border-purple-500/50 bg-purple-500/10 hover:bg-purple-500/20 cursor-pointer group"
                    style={{
                      left: `${(r.bbox_x / page.width) * 100}%`,
                      top: `${(r.bbox_y / page.height) * 100}%`,
                      width: `${(r.bbox_w / page.width) * 100}%`,
                      height: `${(r.bbox_h / page.height) * 100}%`,
                    }}
                    title={`${r.original_text} → ${r.translated_text || "..."}`}
                  >
                    <div className="hidden group-hover:block absolute bottom-full left-0 bg-gray-900 border border-gray-700 rounded p-2 text-xs max-w-xs z-10 mb-1">
                      <p className="text-gray-400">{r.original_text}</p>
                      <p className="text-purple-400 mt-1">{r.translated_text || "Not translated"}</p>
                      {r.speaker && <p className="text-gray-500 mt-1">Speaker: {r.speaker}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Page navigation */}
          <div className="flex items-center justify-center gap-4 mt-4">
            <button onClick={() => setCurrentPage(Math.max(0, currentPage - 1))} disabled={currentPage === 0} className="p-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-30 rounded"><ArrowLeft size={16} /></button>
            <span className="text-sm text-gray-400">Page {currentPage + 1} of {pages.length}</span>
            <button onClick={() => setCurrentPage(Math.min(pages.length - 1, currentPage + 1))} disabled={currentPage === pages.length - 1} className="p-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-30 rounded"><ArrowRight size={16} /></button>
          </div>
        </>
      )}
    </div>
  );
}
