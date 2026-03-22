"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getSeries, listChapters, getGlossary, getCharacters, uploadChapter, retryChapter } from "@/lib/api";
import { usePipelineStatus } from "@/hooks/use-pipeline-status";
import type { Series, Chapter, TermDecision, Character } from "@/lib/types";
import { STAGE_LABELS, STAGE_ORDER, formatDate } from "@/lib/utils";
import { Upload, BookOpen, RefreshCw, Loader2, ArrowLeft, ImagePlus, Eye, X, Globe, ChevronRight, Sparkles, User, Book } from "lucide-react";

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-gray-500/10 text-gray-400 border-gray-500/20",
    completed: "bg-green-500/10 text-green-400 border-green-500/20",
    failed: "bg-red-500/10 text-red-400 border-red-500/20",
  };
  return (
    <span className={`px-2.5 py-1 rounded-full text-[11px] font-medium border ${styles[status] || "bg-purple-500/10 text-purple-400 border-purple-500/20"}`}>
      {STAGE_LABELS[status] || status}
    </span>
  );
}

function PipelineProgressBar({ chapterId }: { chapterId: string }) {
  const { status } = usePipelineStatus(chapterId);
  if (!status || status.stage === "completed" || status.stage === "failed") return null;
  const stageIdx = STAGE_ORDER.indexOf(status.stage);
  const pct = ((stageIdx + status.progress) / STAGE_ORDER.length) * 100;
  return (
    <div className="mt-2">
      <div className="flex justify-between text-[10px] text-gray-500 mb-1">
        <span className="text-purple-400">{STAGE_LABELS[status.stage] || status.stage}</span>
        <span>{Math.round(pct)}%</span>
      </div>
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div className="h-full pipeline-gradient rounded-full transition-all duration-500 ease-out" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function SeriesDetail() {
  const { id } = useParams<{ id: string }>();
  const [series, setSeries] = useState<Series | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [glossary, setGlossary] = useState<TermDecision[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [tab, setTab] = useState<"chapters" | "glossary" | "characters">("chapters");
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [chapterNum, setChapterNum] = useState(1);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { loadData(); }, [id]);

  async function loadData() {
    try {
      const [s, ch] = await Promise.all([getSeries(id), listChapters(id)]);
      setSeries(s);
      setChapters(ch);
    } catch (e) { console.error(e); }
  }

  async function loadTab(t: string) {
    setTab(t as typeof tab);
    if (t === "glossary" && glossary.length === 0) {
      try { setGlossary(await getGlossary(id)); } catch {}
    }
    if (t === "characters" && characters.length === 0) {
      try { setCharacters(await getCharacters(id)); } catch {}
    }
  }

  async function handleUpload() {
    if (uploadFiles.length === 0) return;
    setUploading(true);
    try {
      await uploadChapter(id, chapterNum, uploadFiles);
      setShowUpload(false);
      setUploadFiles([]);
      setTimeout(loadData, 500);
    } catch (e) {
      alert("Upload failed: " + (e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function handleRetry(chapterId: string) {
    try { await retryChapter(chapterId); loadData(); } catch { alert("Retry failed"); }
  }

  if (!series) return (
    <div className="space-y-4">
      <div className="h-40 skeleton rounded-2xl" />
      <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 skeleton rounded-xl" />)}</div>
    </div>
  );

  const tabItems = [
    { key: "chapters", label: "Chapters", icon: Book, count: chapters.length },
    { key: "glossary", label: "Glossary", icon: Globe, count: glossary.length },
    { key: "characters", label: "Characters", icon: User, count: characters.length },
  ] as const;

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-white mb-4 transition-colors">
          <ArrowLeft size={14} /> Back to Library
        </Link>
        <div className="flex items-start gap-5">
          {/* Cover */}
          <div className="w-28 h-40 rounded-xl overflow-hidden bg-gray-900 border border-white/5 flex-shrink-0 shadow-xl">
            {series.cover_image_path ? (
              <img src={`http://localhost:8000/${series.cover_image_path}`} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center"><BookOpen size={28} className="text-gray-700" /></div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold">{series.title}</h1>
            {series.title_original && <p className="text-gray-500 text-sm mt-0.5">{series.title_original}</p>}
            {series.description && <p className="text-gray-400 text-sm mt-2 line-clamp-2">{series.description}</p>}
            <div className="flex items-center gap-3 mt-3">
              <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-gray-400">
                <Globe size={11} /> {series.source_language.toUpperCase()} → {series.target_language.toUpperCase()}
              </span>
              <span className={`text-xs px-2.5 py-1 rounded-full border ${
                series.status === "ongoing" ? "bg-green-500/10 text-green-400 border-green-500/20" : "bg-blue-500/10 text-blue-400 border-blue-500/20"
              }`}>{series.status}</span>
              <span className="text-xs text-gray-600">{chapters.length} chapters</span>
            </div>
          </div>
          <button onClick={() => { setShowUpload(true); setChapterNum(chapters.length > 0 ? Math.max(...chapters.map(c => c.chapter_number)) + 1 : 1); }}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 rounded-xl text-sm font-medium shadow-lg shadow-purple-500/10 transition-all flex-shrink-0">
            <Upload size={15} /> Upload Chapter
          </button>
        </div>
      </div>

      {/* Upload dialog */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" onClick={() => setShowUpload(false)}>
          <div className="bg-[#12131a] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold">Upload Chapter</h2>
              <button onClick={() => setShowUpload(false)} className="p-1 text-gray-500 hover:text-white rounded-lg hover:bg-white/10"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Chapter Number</label>
                <input type="number" value={chapterNum} onChange={(e) => setChapterNum(Number(e.target.value))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-purple-500/50" step="0.5" min="0" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Pages</label>
                <div className="border-2 border-dashed border-white/10 rounded-xl p-8 text-center hover:border-purple-500/30 transition-colors cursor-pointer"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); setUploadFiles(Array.from(e.dataTransfer.files)); }}
                  onClick={() => document.getElementById("file-input")?.click()}>
                  <input id="file-input" type="file" multiple accept="image/*" className="hidden" onChange={(e) => setUploadFiles(Array.from(e.target.files || []))} />
                  <ImagePlus size={28} className="mx-auto mb-2 text-gray-600" />
                  {uploadFiles.length > 0 ? (
                    <p className="text-sm text-purple-400 font-medium">{uploadFiles.length} page{uploadFiles.length > 1 ? "s" : ""} selected</p>
                  ) : (
                    <p className="text-sm text-gray-500">Drop images or click to select</p>
                  )}
                </div>
              </div>
              <button onClick={handleUpload} disabled={uploading || uploadFiles.length === 0}
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-40 disabled:hover:from-purple-600 disabled:hover:to-pink-600 rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-2 transition-all">
                {uploading ? (<><Loader2 size={15} className="animate-spin" /> Processing...</>) : (<><Sparkles size={15} /> Upload & Translate</>)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-white/[0.02] rounded-xl p-1 border border-white/5">
        {tabItems.map((t) => (
          <button key={t.key} onClick={() => loadTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg flex-1 justify-center transition-all ${
              tab === t.key ? "bg-white/10 text-white font-medium shadow-sm" : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
            }`}>
            <t.icon size={14} />
            {t.label}
            {t.count > 0 && <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded-full">{t.count}</span>}
          </button>
        ))}
      </div>

      {/* Chapters */}
      {tab === "chapters" && (
        <div className="space-y-2">
          {chapters.length === 0 ? (
            <div className="text-center py-16">
              <BookOpen size={36} className="mx-auto mb-3 text-gray-700" />
              <p className="text-gray-500">No chapters yet</p>
              <p className="text-xs text-gray-600 mt-1">Upload pages to start translating</p>
            </div>
          ) : (
            chapters.sort((a, b) => a.chapter_number - b.chapter_number).map((ch) => (
              <div key={ch.id} className="group bg-white/[0.02] border border-white/5 hover:border-white/10 rounded-xl p-4 flex items-center gap-4 transition-all">
                <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center text-sm font-bold text-gray-400 flex-shrink-0">
                  {ch.chapter_number}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">Chapter {ch.chapter_number}</span>
                    {ch.title && <span className="text-gray-500 text-sm truncate">— {ch.title}</span>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-600 mt-0.5">
                    <span>{ch.page_count} pages</span>
                    <span>{formatDate(ch.created_at)}</span>
                  </div>
                  {ch.status !== "completed" && ch.status !== "pending" && ch.status !== "failed" && (
                    <PipelineProgressBar chapterId={ch.id} />
                  )}
                  {ch.error_message && <p className="text-xs text-red-400 mt-1 truncate">{ch.error_message}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={ch.status} />
                  {ch.status === "completed" && (
                    <Link href={`/reader/${ch.id}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/20 text-purple-400 rounded-lg text-xs font-medium transition-colors">
                      <Eye size={12} /> Read
                    </Link>
                  )}
                  {ch.status === "failed" && (
                    <button onClick={() => handleRetry(ch.id)} className="p-1.5 text-gray-500 hover:text-white rounded-lg hover:bg-white/10 transition-colors">
                      <RefreshCw size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Glossary */}
      {tab === "glossary" && (
        <div>
          {glossary.length === 0 ? (
            <div className="text-center py-16">
              <Globe size={36} className="mx-auto mb-3 text-gray-700" />
              <p className="text-gray-500">No glossary terms yet</p>
              <p className="text-xs text-gray-600 mt-1">Terms are auto-generated when you translate a chapter</p>
            </div>
          ) : (
            <div className="space-y-1">
              {glossary.map((t) => (
                <div key={t.id} className="flex items-center gap-4 px-4 py-3 bg-white/[0.02] border border-white/5 rounded-xl">
                  <span className="font-medium text-sm flex-1">{t.source_term}</span>
                  <ChevronRight size={14} className="text-gray-600" />
                  <span className="text-purple-400 text-sm flex-1">{t.translated_term}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-gray-500 capitalize">{t.category}</span>
                  <span className="text-[10px] text-gray-600 w-12 text-right">{Math.round(t.confidence * 100)}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Characters */}
      {tab === "characters" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {characters.length === 0 ? (
            <div className="text-center py-16 col-span-full">
              <User size={36} className="mx-auto mb-3 text-gray-700" />
              <p className="text-gray-500">No characters detected yet</p>
              <p className="text-xs text-gray-600 mt-1">Characters are identified during translation</p>
            </div>
          ) : (
            characters.map((c) => (
              <div key={c.id} className="bg-white/[0.02] border border-white/5 rounded-xl p-4 hover:border-white/10 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/20 flex items-center justify-center text-sm font-bold text-purple-400 flex-shrink-0">
                    {c.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm">{c.name}</h3>
                    {c.name_original && <p className="text-xs text-gray-500">{c.name_original}</p>}
                  </div>
                  {c.auto_generated && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">AI</span>
                  )}
                </div>
                {c.description && <p className="text-sm text-gray-400 mt-3 line-clamp-2">{c.description}</p>}
                <div className="flex gap-2 mt-3 text-[11px] text-gray-600">
                  {c.first_appearance_chapter != null && <span>Ch. {c.first_appearance_chapter}</span>}
                  <span className="capitalize">{c.status}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
