"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { getSeries, listChapters, getGlossary, getCharacters, uploadChapter, retryChapter } from "@/lib/api";
import { usePipelineStatus } from "@/hooks/use-pipeline-status";
import type { Series, Chapter, TermDecision, Character } from "@/lib/types";
import { STAGE_LABELS, STAGE_ORDER, formatDate } from "@/lib/utils";
import { Upload, BookOpen, RefreshCw, CheckCircle, XCircle, Clock, Loader2 } from "lucide-react";

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "bg-gray-700 text-gray-300",
    completed: "bg-green-900/50 text-green-400",
    failed: "bg-red-900/50 text-red-400",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs ${colors[status] || "bg-purple-900/50 text-purple-400"}`}>
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
    <div className="mt-1">
      <div className="flex justify-between text-[10px] text-gray-500 mb-0.5">
        <span>{STAGE_LABELS[status.stage] || status.stage}</span>
        <span>{Math.round(pct)}%</span>
      </div>
      <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
        <div className="h-full bg-purple-500 transition-all duration-300" style={{ width: `${pct}%` }} />
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
    try {
      await retryChapter(chapterId);
      loadData();
    } catch (e) { alert("Retry failed"); }
  }

  if (!series) return <div className="text-center py-20 text-gray-500">Loading...</div>;

  return (
    <div>
      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{series.title}</h1>
          {series.title_original && <p className="text-gray-500 text-sm">{series.title_original}</p>}
          {series.description && <p className="text-gray-400 text-sm mt-2">{series.description}</p>}
          <div className="flex gap-3 mt-3 text-xs text-gray-500">
            <span>{series.source_language.toUpperCase()} → {series.target_language.toUpperCase()}</span>
            <span>{series.chapter_count} chapters</span>
            <span className="capitalize">{series.status}</span>
          </div>
        </div>
        <button onClick={() => { setShowUpload(true); setChapterNum(chapters.length > 0 ? Math.max(...chapters.map(c => c.chapter_number)) + 1 : 1); }} className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm">
          <Upload size={16} /> Upload Chapter
        </button>
      </div>

      {/* Upload dialog */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowUpload(false)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">Upload Chapter</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Chapter Number</label>
                <input type="number" value={chapterNum} onChange={(e) => setChapterNum(Number(e.target.value))} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm" step="0.5" min="0" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Page Images</label>
                <div
                  className="border-2 border-dashed border-gray-700 rounded-lg p-6 text-center hover:border-purple-500/50 transition-colors cursor-pointer"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); setUploadFiles(Array.from(e.dataTransfer.files)); }}
                  onClick={() => document.getElementById("file-input")?.click()}
                >
                  <input id="file-input" type="file" multiple accept="image/*" className="hidden" onChange={(e) => setUploadFiles(Array.from(e.target.files || []))} />
                  {uploadFiles.length > 0 ? (
                    <p className="text-sm text-purple-400">{uploadFiles.length} file{uploadFiles.length > 1 ? "s" : ""} selected</p>
                  ) : (
                    <p className="text-sm text-gray-500">Drop images here or click to select</p>
                  )}
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={handleUpload} disabled={uploading || uploadFiles.length === 0} className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-lg py-2 text-sm font-medium flex items-center justify-center gap-2">
                  {uploading && <Loader2 size={14} className="animate-spin" />}
                  {uploading ? "Uploading..." : "Upload & Translate"}
                </button>
                <button onClick={() => setShowUpload(false)} className="flex-1 bg-gray-700 hover:bg-gray-600 rounded-lg py-2 text-sm">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-800 mb-4">
        {(["chapters", "glossary", "characters"] as const).map((t) => (
          <button key={t} onClick={() => loadTab(t)} className={`px-4 py-2 text-sm border-b-2 transition-colors capitalize ${tab === t ? "border-purple-500 text-white" : "border-transparent text-gray-500 hover:text-gray-300"}`}>
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "chapters" && (
        <div className="space-y-2">
          {chapters.length === 0 ? (
            <p className="text-gray-500 text-center py-10">No chapters yet. Upload one to get started.</p>
          ) : (
            chapters.sort((a, b) => a.chapter_number - b.chapter_number).map((ch) => (
              <div key={ch.id} className="bg-gray-900 border border-gray-800 rounded-lg p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">Ch. {ch.chapter_number}</span>
                    {ch.title && <span className="text-gray-400 text-sm truncate">{ch.title}</span>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
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
                    <Link href={`/reader/${ch.id}`} className="px-3 py-1 bg-purple-600 hover:bg-purple-700 rounded text-xs">Read</Link>
                  )}
                  {ch.status === "failed" && (
                    <button onClick={() => handleRetry(ch.id)} className="p-1 text-gray-400 hover:text-white"><RefreshCw size={14} /></button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "glossary" && (
        <div className="overflow-x-auto">
          {glossary.length === 0 ? (
            <p className="text-gray-500 text-center py-10">No glossary terms yet. Translate a chapter to auto-generate.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-500 border-b border-gray-800">
                <th className="pb-2 pr-4">Source</th><th className="pb-2 pr-4">Translation</th><th className="pb-2 pr-4">Category</th><th className="pb-2">Confidence</th>
              </tr></thead>
              <tbody>
                {glossary.map((t) => (
                  <tr key={t.id} className="border-b border-gray-800/50">
                    <td className="py-2 pr-4 font-medium">{t.source_term}</td>
                    <td className="py-2 pr-4 text-purple-400">{t.translated_term}</td>
                    <td className="py-2 pr-4 text-gray-500 capitalize">{t.category}</td>
                    <td className="py-2 text-gray-500">{Math.round(t.confidence * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "characters" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {characters.length === 0 ? (
            <p className="text-gray-500 text-center py-10 col-span-full">No characters detected yet.</p>
          ) : (
            characters.map((c) => (
              <div key={c.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                <h3 className="font-medium">{c.name}</h3>
                {c.name_original && <p className="text-xs text-gray-500">{c.name_original}</p>}
                {c.description && <p className="text-sm text-gray-400 mt-2 line-clamp-3">{c.description}</p>}
                <div className="flex gap-2 mt-2 text-xs text-gray-500">
                  {c.first_appearance_chapter && <span>First: Ch. {c.first_appearance_chapter}</span>}
                  <span className="capitalize">{c.status}</span>
                  {c.auto_generated && <span className="text-purple-400">AI-generated</span>}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
