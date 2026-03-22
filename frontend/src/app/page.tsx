"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listSeries, createSeries, getLanguages } from "@/lib/api";
import type { Series, Language } from "@/lib/types";
import { BookOpen, Globe, Plus, Search, Sparkles, ArrowRight, X } from "lucide-react";

export default function Dashboard() {
  const [series, setSeries] = useState<Series[]>([]);
  const [languages, setLanguages] = useState<Record<string, Language>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
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

  const filtered = series.filter(s =>
    s.title.toLowerCase().includes(search.toLowerCase()) ||
    (s.title_original || "").toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-32 skeleton rounded-2xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="aspect-[3/4] skeleton rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Hero section for empty state */}
      {series.length === 0 ? (
        <div className="text-center py-24">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-xs font-medium mb-6">
            <Sparkles size={12} /> AI-Powered Translation
          </div>
          <h1 className="text-4xl font-bold mb-3 bg-gradient-to-b from-white to-gray-400 bg-clip-text text-transparent">
            Translate any comic, any language
          </h1>
          <p className="text-gray-500 max-w-md mx-auto mb-8">
            Upload manga, manhwa, or manhua pages and get professional translations with auto-generated character wikis and glossaries.
          </p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded-xl text-sm font-semibold shadow-lg shadow-purple-500/25 transition-all hover-lift">
              <Plus size={16} /> Add Your First Series
            </button>
            <Link href="/upload"
              className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium border border-white/10 hover:bg-white/5 transition-all">
              Quick Upload <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* Header with search */}
          <div className="flex items-center justify-between mb-6 gap-4">
            <div>
              <h1 className="text-2xl font-bold">Library</h1>
              <p className="text-sm text-gray-500 mt-0.5">{series.length} series</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search series..."
                  className="pl-8 pr-3 py-2 w-48 bg-white/5 border border-white/10 rounded-lg text-sm placeholder:text-gray-600 focus:outline-none focus:border-purple-500/50 focus:w-64 transition-all"
                />
              </div>
              <button onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 rounded-lg text-sm font-medium shadow-lg shadow-purple-500/10 transition-all">
                <Plus size={15} /> Add Series
              </button>
            </div>
          </div>

          {/* Series grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filtered.map((s, i) => (
              <Link key={s.id} href={`/series/${s.id}`}
                className="group rounded-xl overflow-hidden bg-white/[0.02] border border-white/5 hover:border-purple-500/30 transition-all hover-lift"
                style={{ animationDelay: `${i * 50}ms` }}>
                <div className="aspect-[3/4] bg-gray-900 relative overflow-hidden">
                  {s.cover_image_path ? (
                    <img src={`http://localhost:8000/${s.cover_image_path}`} alt={s.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800">
                      <BookOpen size={40} className="text-gray-700" />
                    </div>
                  )}
                  {/* Gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  {/* Status badge */}
                  <div className="absolute top-2 right-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium backdrop-blur-sm ${
                      s.status === "ongoing" ? "bg-green-500/20 text-green-400 border border-green-500/30" :
                      s.status === "completed" ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" :
                      "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                    }`}>
                      {s.status}
                    </span>
                  </div>
                  {/* Language badge */}
                  <div className="absolute bottom-2 left-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="flex items-center gap-1.5 text-[10px] text-gray-300">
                      <Globe size={10} />
                      <span>{languages[s.source_language]?.name || s.source_language} → {languages[s.target_language]?.name || s.target_language}</span>
                    </div>
                  </div>
                </div>
                <div className="p-3">
                  <h3 className="font-medium text-sm truncate group-hover:text-purple-400 transition-colors">{s.title}</h3>
                  <p className="text-xs text-gray-600 mt-0.5">{s.chapter_count} chapter{s.chapter_count !== 1 ? "s" : ""}</p>
                </div>
              </Link>
            ))}
          </div>

          {filtered.length === 0 && search && (
            <div className="text-center py-16 text-gray-500">
              <p>No series matching &quot;{search}&quot;</p>
            </div>
          )}
        </>
      )}

      {/* Create dialog */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" onClick={() => setShowCreate(false)}>
          <div className="bg-[#12131a] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold">Add New Series</h2>
              <button onClick={() => setShowCreate(false)} className="p-1 text-gray-500 hover:text-white rounded-lg hover:bg-white/10 transition-colors"><X size={18} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Title</label>
                <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 transition-all"
                  placeholder="Solo Leveling" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">From</label>
                  <select value={newSourceLang} onChange={(e) => setNewSourceLang(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-purple-500/50">
                    {Object.entries(languages).map(([code, lang]) => (<option key={code} value={code}>{lang.name}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">To</label>
                  <select value={newTargetLang} onChange={(e) => setNewTargetLang(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-purple-500/50">
                    {Object.entries(languages).map(([code, lang]) => (<option key={code} value={code}>{lang.name}</option>))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Description <span className="text-gray-600 normal-case">(optional)</span></label>
                <textarea value={newDescription} onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm h-20 resize-none focus:outline-none focus:border-purple-500/50" />
              </div>
              <button onClick={handleCreate}
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded-xl py-2.5 text-sm font-semibold shadow-lg shadow-purple-500/20 transition-all">
                Create Series
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
