"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getSeries, listChapters, getGlossary, getCharacters, uploadChapter, retryChapter } from "@/lib/api";
import { usePipelineStatus } from "@/hooks/use-pipeline-status";
import type { Series, Chapter, TermDecision, Character } from "@/lib/types";
import { STAGE_LABELS, STAGE_ORDER, formatDate } from "@/lib/utils";
import {
  Upload, BookOpen, RefreshCw, Loader2, ArrowLeft, ImagePlus, Eye, X, Globe,
  ChevronRight, Sparkles, User, Book, CheckCircle2, AlertCircle, Settings2, Zap, Network,
} from "lucide-react";

function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { bg: string; icon: React.ReactNode }> = {
    pending: { bg: "bg-gray-500/10 text-gray-400 border-gray-500/20", icon: <Settings2 size={10} className="text-gray-400" /> },
    completed: { bg: "bg-green-500/10 text-green-400 border-green-500/20", icon: <CheckCircle2 size={10} className="text-green-400" /> },
    failed: { bg: "bg-red-500/10 text-red-400 border-red-500/20", icon: <AlertCircle size={10} className="text-red-400" /> },
  };
  const config = configs[status] || { bg: "bg-purple-500/10 text-purple-400 border-purple-500/20", icon: <Loader2 size={10} className="text-purple-400 animate-spin" /> };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${config.bg}`}>
      {config.icon}
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
        <span className="text-pink-400 font-medium">{STAGE_LABELS[status.stage] || status.stage}</span>
        <span className="text-cyan-400">{Math.round(pct)}%</span>
      </div>
      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
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
    <div className="space-y-4 animate-fade-in">
      <div className="h-40 skeleton rounded-2xl" />
      <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 skeleton rounded-xl" />)}</div>
    </div>
  );

  const completedCount = chapters.filter(c => c.status === "completed").length;

  const tabItems = [
    { key: "chapters", label: "Chapters", icon: Book, count: chapters.length, color: "text-purple-400" },
    { key: "glossary", label: "Glossary", icon: Globe, count: glossary.length, color: "text-cyan-400" },
    { key: "characters", label: "Characters", icon: User, count: characters.length, color: "text-pink-400" },
  ] as const;

  // Color palette for character avatars
  const avatarGradients = [
    "from-purple-500 to-pink-500",
    "from-cyan-500 to-blue-500",
    "from-orange-500 to-red-500",
    "from-green-500 to-teal-500",
    "from-pink-500 to-rose-500",
    "from-indigo-500 to-purple-500",
  ];

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-pink-400 mb-4 transition-colors group">
          <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" /> Back to Library
        </Link>
        <div className="flex items-start gap-5 flex-wrap sm:flex-nowrap">
          {/* Cover */}
          <div className="w-28 h-40 rounded-xl overflow-hidden bg-gray-900 flex-shrink-0 shadow-xl hover-bounce card-playful p-0">
            {series.cover_image_path ? (
              <img src={`http://localhost:8000/${series.cover_image_path}`} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-900/30 to-pink-900/30">
                <BookOpen size={28} className="text-purple-400/50" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-extrabold gradient-text">{series.title}</h1>
            {series.title_original && <p className="text-gray-500 text-sm mt-0.5">{series.title_original}</p>}
            {series.description && <p className="text-gray-400 text-sm mt-2 line-clamp-2">{series.description}</p>}
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full bg-gradient-to-r from-purple-500/10 to-cyan-500/10 border border-purple-500/20 text-cyan-300 font-medium">
                <Globe size={11} /> {series.source_language.toUpperCase()} → {series.target_language.toUpperCase()}
              </span>
              <span className={`text-xs px-3 py-1 rounded-full border font-medium ${
                series.status === "ongoing" ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" : "bg-green-500/10 text-green-400 border-green-500/20"
              }`}>{series.status}</span>
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <BookOpen size={11} className="text-purple-400" /> {chapters.length} chapters
              </span>
              {completedCount > 0 && (
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <CheckCircle2 size={11} className="text-green-400" /> {completedCount} translated
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link href={`/series/${id}/wiki`}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-gradient-to-r from-cyan-600/20 to-purple-600/20 hover:from-cyan-600/30 hover:to-purple-600/30 border border-cyan-500/20 text-cyan-300 text-sm font-semibold transition-all hover:scale-105 whitespace-nowrap">
              <Network size={15} /> View Wiki
            </Link>
            <button onClick={() => { setShowUpload(true); setChapterNum(chapters.length > 0 ? Math.max(...chapters.map(c => c.chapter_number)) + 1 : 1); }}
              className="btn-playful flex items-center gap-2 whitespace-nowrap">
              <Upload size={15} /> Upload Chapter
            </button>
          </div>
        </div>
      </div>

      {/* Upload dialog */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in p-4" onClick={() => setShowUpload(false)}>
          <div className="bg-[#12131a] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl animate-slide-up relative overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-pink-500/10 via-purple-500/5 to-transparent rounded-bl-full" />
            <div className="flex items-center justify-between mb-5 relative">
              <h2 className="text-lg font-extrabold gradient-text">Upload Chapter</h2>
              <button onClick={() => setShowUpload(false)} className="p-1 text-gray-500 hover:text-white rounded-lg hover:bg-white/10"><X size={18} /></button>
            </div>
            <div className="space-y-4 relative">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Chapter Number</label>
                <input type="number" value={chapterNum} onChange={(e) => setChapterNum(Number(e.target.value))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-pink-500/50 focus:ring-2 focus:ring-pink-500/20" step="0.5" min="0" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Pages</label>
                <div className="border-2 border-dashed border-white/10 rounded-xl p-8 text-center hover:border-pink-500/30 transition-colors cursor-pointer group"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); setUploadFiles(Array.from(e.dataTransfer.files)); }}
                  onClick={() => document.getElementById("file-input")?.click()}>
                  <input id="file-input" type="file" multiple accept="image/*" className="hidden" onChange={(e) => setUploadFiles(Array.from(e.target.files || []))} />
                  <ImagePlus size={28} className="mx-auto mb-2 text-gray-600 group-hover:text-pink-400 transition-colors" />
                  {uploadFiles.length > 0 ? (
                    <p className="text-sm text-pink-400 font-semibold">{uploadFiles.length} page{uploadFiles.length > 1 ? "s" : ""} selected</p>
                  ) : (
                    <p className="text-sm text-gray-500">Drop images or click to select</p>
                  )}
                </div>
              </div>
              <button onClick={handleUpload} disabled={uploading || uploadFiles.length === 0}
                className="w-full btn-playful flex items-center justify-center gap-2 disabled:opacity-40">
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
            className={`flex items-center gap-2 px-4 py-2.5 text-sm rounded-lg flex-1 justify-center transition-all ${
              tab === t.key ? "bg-gradient-to-r from-purple-600/20 to-pink-600/20 text-white font-semibold shadow-sm border border-purple-500/20" : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
            }`}>
            <t.icon size={14} className={tab === t.key ? t.color : ""} />
            {t.label}
            {t.count > 0 && (
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                tab === t.key ? "bg-gradient-to-r from-purple-500/30 to-pink-500/30 text-purple-200" : "bg-white/10 text-gray-400"
              }`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Chapters */}
      {tab === "chapters" && (
        <div className="space-y-2">
          {chapters.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-3xl mb-3">{"(^_^)?"}</div>
              <p className="text-gray-500">No chapters yet</p>
              <p className="text-xs text-gray-600 mt-1">Upload pages to start translating</p>
            </div>
          ) : (
            chapters.sort((a, b) => a.chapter_number - b.chapter_number).map((ch, i) => (
              <div key={ch.id}
                className="group card-playful p-4 flex items-center gap-4"
                style={{ animationDelay: `${i * 30}ms` }}>
                {/* Chapter number with color */}
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-sm font-black flex-shrink-0 ${
                  ch.status === "completed" ? "bg-gradient-to-br from-green-500/20 to-cyan-500/20 text-green-400 border border-green-500/20" :
                  ch.status === "failed" ? "bg-gradient-to-br from-red-500/20 to-orange-500/20 text-red-400 border border-red-500/20" :
                  "bg-gradient-to-br from-purple-500/20 to-pink-500/20 text-purple-400 border border-purple-500/20"
                }`}>
                  {ch.chapter_number}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">Chapter {ch.chapter_number}</span>
                    {ch.title && <span className="text-gray-500 text-sm truncate">- {ch.title}</span>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-600 mt-0.5">
                    <span className="flex items-center gap-1"><BookOpen size={10} className="text-cyan-400" /> {ch.page_count} pages</span>
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
                      className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-gradient-to-r from-purple-600/20 to-pink-600/20 hover:from-purple-600/30 hover:to-pink-600/30 border border-purple-500/20 text-purple-300 text-xs font-semibold transition-all hover:scale-105">
                      <Eye size={12} /> Read
                    </Link>
                  )}
                  {ch.status === "failed" && (
                    <button onClick={() => handleRetry(ch.id)}
                      className="p-2 text-gray-500 hover:text-orange-400 rounded-full hover:bg-orange-500/10 transition-all hover:scale-110">
                      <RefreshCw size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}

          {/* Translate All button */}
          {chapters.length > 0 && chapters.some(ch => ch.status === "pending" || ch.status === "failed") && (
            <div className="pt-4 flex justify-center">
              <button className="btn-playful flex items-center gap-2">
                <Zap size={15} /> Translate All Pending
              </button>
            </div>
          )}
        </div>
      )}

      {/* Glossary */}
      {tab === "glossary" && (
        <div>
          {glossary.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-3xl mb-3">{"( ._.)"}</div>
              <p className="text-gray-500">No glossary terms yet</p>
              <p className="text-xs text-gray-600 mt-1">Terms are auto-generated when you translate a chapter</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {glossary.map((t, i) => (
                <div key={t.id}
                  className="flex items-center gap-4 px-4 py-3 card-playful"
                  style={{ animationDelay: `${i * 20}ms` }}>
                  <span className="font-semibold text-sm flex-1">{t.source_term}</span>
                  <ChevronRight size={14} className="text-pink-500/50" />
                  <span className="text-pink-400 text-sm font-medium flex-1">{t.translated_term}</span>
                  <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-semibold capitalize ${
                    t.category === "name" ? "bg-purple-500/10 text-purple-300 border border-purple-500/20" :
                    t.category === "technique" ? "bg-cyan-500/10 text-cyan-300 border border-cyan-500/20" :
                    t.category === "place" ? "bg-orange-500/10 text-orange-300 border border-orange-500/20" :
                    "bg-gray-500/10 text-gray-400 border border-gray-500/20"
                  }`}>{t.category}</span>
                  <span className="text-[10px] text-gray-600 w-12 text-right font-mono">{Math.round(t.confidence * 100)}%</span>
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
              <div className="text-3xl mb-3">{"(o_o)?"}</div>
              <p className="text-gray-500">No characters detected yet</p>
              <p className="text-xs text-gray-600 mt-1">Characters are identified during translation</p>
            </div>
          ) : (
            characters.map((c, i) => (
              <div key={c.id} className="card-playful p-4 animate-wobble" style={{ animationDelay: `${i * 50}ms` }}>
                <div className="flex items-start gap-3">
                  <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${avatarGradients[i % avatarGradients.length]} flex items-center justify-center text-base font-black text-white flex-shrink-0 shadow-lg`}>
                    {c.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-sm">{c.name}</h3>
                    {c.name_original && <p className="text-xs text-gray-500">{c.name_original}</p>}
                  </div>
                  {c.auto_generated && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-gradient-to-r from-purple-500/10 to-pink-500/10 text-purple-300 border border-purple-500/20 font-semibold flex items-center gap-1">
                      <Sparkles size={8} /> AI
                    </span>
                  )}
                </div>
                {c.description && <p className="text-sm text-gray-400 mt-3 line-clamp-2">{c.description}</p>}
                <div className="flex gap-2 mt-3 text-[11px] text-gray-500 font-medium">
                  {c.first_appearance_chapter != null && (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5">
                      <BookOpen size={9} className="text-cyan-400" /> Ch. {c.first_appearance_chapter}
                    </span>
                  )}
                  <span className={`px-2 py-0.5 rounded-full capitalize ${
                    c.status === "active" ? "bg-green-500/10 text-green-400" : "bg-gray-500/10 text-gray-500"
                  }`}>{c.status}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
