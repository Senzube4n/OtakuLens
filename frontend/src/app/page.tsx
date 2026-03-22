"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listSeries, createSeries, getLanguages } from "@/lib/api";
import type { Series, Language } from "@/lib/types";
import { BookOpen, Globe, Plus } from "lucide-react";

export default function Dashboard() {
  const [series, setSeries] = useState<Series[]>([]);
  const [languages, setLanguages] = useState<Record<string, Language>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [newSourceLang, setNewSourceLang] = useState("ko");
  const [newTargetLang, setNewTargetLang] = useState("en");
  const [newDescription, setNewDescription] = useState("");

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      const [s, l] = await Promise.all([listSeries(), getLanguages()]);
      setSeries(s);
      setLanguages(l);
    } catch (e) {
      console.error("Failed to load:", e);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!newTitle.trim()) return;
    try {
      await createSeries({ title: newTitle, source_language: newSourceLang, target_language: newTargetLang, description: newDescription || undefined });
      setShowCreate(false);
      setNewTitle("");
      setNewDescription("");
      loadData();
    } catch (e) {
      alert("Failed: " + (e as Error).message);
    }
  }

  if (loading) return <div className="text-center py-20 text-gray-500">Loading library...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Library</h1>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-sm font-medium transition-colors">
          <Plus size={16} /> Add Series
        </button>
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">Add New Series</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Title</label>
                <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500" placeholder="Solo Leveling" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Source Language</label>
                  <select value={newSourceLang} onChange={(e) => setNewSourceLang(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm">
                    {Object.entries(languages).map(([code, lang]) => (<option key={code} value={code}>{lang.name}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Target Language</label>
                  <select value={newTargetLang} onChange={(e) => setNewTargetLang(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm">
                    {Object.entries(languages).map(([code, lang]) => (<option key={code} value={code}>{lang.name}</option>))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Description (optional)</label>
                <textarea value={newDescription} onChange={(e) => setNewDescription(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm h-20 resize-none" />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={handleCreate} className="flex-1 bg-purple-600 hover:bg-purple-700 rounded-lg py-2 text-sm font-medium">Create</button>
                <button onClick={() => setShowCreate(false)} className="flex-1 bg-gray-700 hover:bg-gray-600 rounded-lg py-2 text-sm">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {series.length === 0 ? (
        <div className="text-center py-20">
          <BookOpen size={48} className="mx-auto mb-4 text-gray-600" />
          <p className="text-gray-500 mb-2">No series yet</p>
          <p className="text-sm text-gray-600">Click &quot;Add Series&quot; to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {series.map((s) => (
            <Link key={s.id} href={`/series/${s.id}`} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden hover:border-purple-500/50 transition-colors group">
              <div className="aspect-[3/4] bg-gray-800 flex items-center justify-center">
                {s.cover_image_path ? (<img src={`http://localhost:8000/${s.cover_image_path}`} alt={s.title} className="w-full h-full object-cover" />) : (<BookOpen size={48} className="text-gray-700" />)}
              </div>
              <div className="p-3">
                <h3 className="font-medium text-sm truncate group-hover:text-purple-400 transition-colors">{s.title}</h3>
                {s.title_original && <p className="text-xs text-gray-500 truncate">{s.title_original}</p>}
                <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                  <Globe size={12} />
                  <span>{languages[s.source_language]?.name || s.source_language} → {languages[s.target_language]?.name || s.target_language}</span>
                </div>
                <div className="flex items-center justify-between mt-1 text-xs text-gray-500">
                  <span>{s.chapter_count} ch.</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${s.status === "ongoing" ? "bg-green-900/50 text-green-400" : s.status === "completed" ? "bg-blue-900/50 text-blue-400" : "bg-yellow-900/50 text-yellow-400"}`}>{s.status}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
