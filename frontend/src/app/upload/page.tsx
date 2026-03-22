"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listSeries, uploadChapter, getLanguages, createSeries } from "@/lib/api";
import type { Series, Language } from "@/lib/types";
import { Upload, Loader2, ImagePlus } from "lucide-react";

export default function UploadPage() {
  const router = useRouter();
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [languages, setLanguages] = useState<Record<string, Language>>({});
  const [selectedSeries, setSelectedSeries] = useState("");
  const [chapterNum, setChapterNum] = useState(1);
  const [title, setTitle] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Quick create series
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [newSeriesTitle, setNewSeriesTitle] = useState("");
  const [newSourceLang, setNewSourceLang] = useState("ko");
  const [newTargetLang, setNewTargetLang] = useState("en");

  useEffect(() => {
    Promise.all([listSeries(), getLanguages()]).then(([s, l]) => {
      setSeriesList(s);
      setLanguages(l);
      if (s.length > 0) setSelectedSeries(s[0].id);
    });
  }, []);

  async function handleQuickCreate() {
    if (!newSeriesTitle.trim()) return;
    const s = await createSeries({ title: newSeriesTitle, source_language: newSourceLang, target_language: newTargetLang });
    setSeriesList((prev) => [...prev, s]);
    setSelectedSeries(s.id);
    setShowQuickCreate(false);
    setNewSeriesTitle("");
  }

  async function handleUpload() {
    if (!selectedSeries || files.length === 0) return;
    setUploading(true);
    try {
      const ch = await uploadChapter(selectedSeries, chapterNum, files, title || undefined);
      router.push(`/series/${selectedSeries}`);
    } catch (e) {
      alert("Upload failed: " + (e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"));
    setFiles(droppedFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })));
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || []);
    setFiles(selected.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })));
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Upload Chapter</h1>

      <div className="space-y-4">
        {/* Series selection */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">Series</label>
          <div className="flex gap-2">
            <select value={selectedSeries} onChange={(e) => setSelectedSeries(e.target.value)} className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm">
              <option value="">Select a series...</option>
              {seriesList.map((s) => (<option key={s.id} value={s.id}>{s.title}</option>))}
            </select>
            <button onClick={() => setShowQuickCreate(true)} className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm">+ New</button>
          </div>
        </div>

        {showQuickCreate && (
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 space-y-3">
            <input value={newSeriesTitle} onChange={(e) => setNewSeriesTitle(e.target.value)} placeholder="Series title" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <select value={newSourceLang} onChange={(e) => setNewSourceLang(e.target.value)} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm">
                {Object.entries(languages).map(([c, l]) => (<option key={c} value={c}>{l.name} (source)</option>))}
              </select>
              <select value={newTargetLang} onChange={(e) => setNewTargetLang(e.target.value)} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm">
                {Object.entries(languages).map(([c, l]) => (<option key={c} value={c}>{l.name} (target)</option>))}
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={handleQuickCreate} className="flex-1 bg-purple-600 hover:bg-purple-700 rounded-lg py-1.5 text-sm">Create</button>
              <button onClick={() => setShowQuickCreate(false)} className="flex-1 bg-gray-700 hover:bg-gray-600 rounded-lg py-1.5 text-sm">Cancel</button>
            </div>
          </div>
        )}

        {/* Chapter info */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Chapter Number</label>
            <input type="number" value={chapterNum} onChange={(e) => setChapterNum(Number(e.target.value))} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm" step="0.5" min="0" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Title (optional)</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm" placeholder="The Beginning" />
          </div>
        </div>

        {/* Drop zone */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">Page Images</label>
          <div
            className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer ${dragOver ? "border-purple-500 bg-purple-500/10" : "border-gray-700 hover:border-gray-600"}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => document.getElementById("file-upload")?.click()}
          >
            <input id="file-upload" type="file" multiple accept="image/*" className="hidden" onChange={handleFileSelect} />
            <ImagePlus size={40} className="mx-auto mb-3 text-gray-600" />
            {files.length > 0 ? (
              <div>
                <p className="text-purple-400 font-medium">{files.length} page{files.length > 1 ? "s" : ""} selected</p>
                <p className="text-xs text-gray-500 mt-1">{files.map(f => f.name).slice(0, 5).join(", ")}{files.length > 5 ? ` +${files.length - 5} more` : ""}</p>
              </div>
            ) : (
              <div>
                <p className="text-gray-400">Drop page images here</p>
                <p className="text-xs text-gray-600 mt-1">PNG, JPG, WEBP — sorted by filename</p>
              </div>
            )}
          </div>
        </div>

        {/* Upload button */}
        <button
          onClick={handleUpload}
          disabled={uploading || !selectedSeries || files.length === 0}
          className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-lg py-3 text-sm font-medium flex items-center justify-center gap-2"
        >
          {uploading ? (<><Loader2 size={16} className="animate-spin" /> Processing...</>) : (<><Upload size={16} /> Upload & Translate</>)}
        </button>
      </div>
    </div>
  );
}
