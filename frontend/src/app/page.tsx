"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listSeries, createSeries, getLanguages } from "@/lib/api";
import type { Series, Language } from "@/lib/types";
import { BookOpen, Globe, Plus, Search, Sparkles, ArrowRight, X, Zap, Star, Heart } from "lucide-react";

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

  // Find the most recently updated series for "Continue Reading"
  const lastRead = series.length > 0 ? [...series].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0] : null;

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
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
        <div className="text-center py-20 sm:py-24 relative">
          {/* Floating decorative elements */}
          <div className="absolute top-8 left-1/4 animate-float" style={{ animationDelay: '0s' }}>
            <Star size={20} className="text-yellow-400/30" />
          </div>
          <div className="absolute top-16 right-1/4 animate-float" style={{ animationDelay: '1s' }}>
            <Sparkles size={18} className="text-pink-400/30" />
          </div>
          <div className="absolute bottom-12 left-1/3 animate-float" style={{ animationDelay: '2s' }}>
            <Zap size={16} className="text-cyan-400/30" />
          </div>
          <div className="absolute bottom-20 right-1/3 animate-float" style={{ animationDelay: '0.5s' }}>
            <Heart size={14} className="text-orange-400/30" />
          </div>

          {/* AI Badge with sparkles */}
          <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-gradient-to-r from-purple-500/10 via-pink-500/10 to-cyan-500/10 border border-purple-500/20 text-purple-300 text-xs font-semibold mb-6 relative animate-bounce-in">
            <span className="absolute -top-1 -right-1 animate-sparkle">
              <Star size={10} className="text-yellow-400" fill="currentColor" />
            </span>
            <span className="absolute -bottom-0.5 -left-0.5 animate-sparkle" style={{ animationDelay: '1s' }}>
              <Star size={8} className="text-pink-400" fill="currentColor" />
            </span>
            <Sparkles size={14} className="text-pink-400" /> AI-Powered Translation
          </div>

          <h1 className="text-4xl sm:text-5xl font-extrabold mb-4 gradient-text-animated leading-tight">
            Translate any comic,<br />any language
          </h1>
          <p className="text-gray-400 max-w-md mx-auto mb-8 text-base">
            Upload manga, manhwa, or manhua pages and get professional translations with auto-generated character wikis and glossaries.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <button onClick={() => setShowCreate(true)}
              className="btn-playful flex items-center gap-2">
              <Plus size={16} /> Add Your First Series
            </button>
            <Link href="/upload"
              className="flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-medium border border-white/10 hover:bg-white/5 hover:border-cyan-500/30 hover:text-cyan-300 transition-all hover:scale-105">
              Quick Upload <ArrowRight size={14} />
            </Link>
          </div>

          {/* Fun empty state hint */}
          <div className="mt-16 p-6 rounded-2xl bg-white/[0.02] border border-white/5 max-w-sm mx-auto">
            <div className="text-3xl mb-3">{"( >_< )"}</div>
            <p className="text-sm text-gray-500">Your library is empty! Add a series to start your translation adventure.</p>
          </div>
        </div>
      ) : (
        <>
          {/* Continue Reading section */}
          {lastRead && (
            <div className="mb-8 animate-bounce-in">
              <div className="relative overflow-hidden rounded-2xl card-playful p-5 sm:p-6">
                <div className="absolute inset-0 bg-gradient-to-r from-purple-600/5 via-pink-600/5 to-cyan-600/5" />
                <div className="relative flex items-center gap-4 sm:gap-5">
                  <div className="w-16 h-22 sm:w-20 sm:h-28 rounded-xl overflow-hidden bg-gray-900 border border-white/10 flex-shrink-0 shadow-lg">
                    {lastRead.cover_image_path ? (
                      <img src={`http://localhost:8000/${lastRead.cover_image_path}`} alt={lastRead.title}
                        className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <BookOpen size={24} className="text-gray-700" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-pink-400 uppercase tracking-wider mb-1">Continue Reading</p>
                    <h2 className="text-lg sm:text-xl font-bold truncate">{lastRead.title}</h2>
                    <p className="text-sm text-gray-500 mt-0.5">{lastRead.chapter_count} chapter{lastRead.chapter_count !== 1 ? "s" : ""}</p>
                  </div>
                  <Link href={`/series/${lastRead.id}`}
                    className="btn-playful flex items-center gap-2 flex-shrink-0 whitespace-nowrap">
                    <BookOpen size={15} /> Read Now
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Header with search */}
          <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold gradient-text">Library</h1>
              <p className="text-sm text-gray-500 mt-0.5">{series.length} series in your collection</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search series..."
                  className="pl-8 pr-3 py-2 w-48 bg-white/5 border border-white/10 rounded-full text-sm placeholder:text-gray-600 focus:outline-none focus:border-purple-500/50 focus:w-64 transition-all focus:ring-2 focus:ring-purple-500/20"
                />
              </div>
              <button onClick={() => setShowCreate(true)}
                className="btn-playful flex items-center gap-2 text-xs sm:text-sm">
                <Plus size={15} /> Add Series
              </button>
            </div>
          </div>

          {/* Series grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filtered.map((s, i) => (
              <Link key={s.id} href={`/series/${s.id}`}
                className="group rounded-xl overflow-hidden card-playful animate-wobble"
                style={{ animationDelay: `${i * 50}ms` }}>
                <div className="aspect-[3/4] bg-gray-900 relative overflow-hidden">
                  {s.cover_image_path ? (
                    <img src={`http://localhost:8000/${s.cover_image_path}`} alt={s.title}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
                      <BookOpen size={40} className="text-gray-700 group-hover:text-purple-500/50 transition-colors" />
                    </div>
                  )}
                  {/* Colorful gradient overlay on hover */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-purple-900/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  {/* Status badge */}
                  <div className="absolute top-2 right-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold backdrop-blur-sm ${
                      s.status === "ongoing" ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30" :
                      s.status === "completed" ? "bg-green-500/20 text-green-300 border border-green-500/30" :
                      "bg-orange-500/20 text-orange-300 border border-orange-500/30"
                    }`}>
                      {s.status}
                    </span>
                  </div>
                  {/* Language badge */}
                  <div className="absolute bottom-2 left-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div className="flex items-center gap-1.5 text-[10px] text-gray-200">
                      <Globe size={10} className="text-cyan-400" />
                      <span>{languages[s.source_language]?.name || s.source_language} → {languages[s.target_language]?.name || s.target_language}</span>
                    </div>
                  </div>
                </div>
                <div className="p-3">
                  <h3 className="font-semibold text-sm truncate group-hover:text-pink-400 transition-colors">{s.title}</h3>
                  <p className="text-xs text-gray-600 mt-0.5 flex items-center gap-1">
                    <BookOpen size={10} className="text-purple-400" />
                    {s.chapter_count} chapter{s.chapter_count !== 1 ? "s" : ""}
                  </p>
                </div>
              </Link>
            ))}
          </div>

          {filtered.length === 0 && search && (
            <div className="text-center py-16 text-gray-500">
              <div className="text-3xl mb-3">{"(._. )"}</div>
              <p>No series matching &quot;{search}&quot;</p>
            </div>
          )}
        </>
      )}

      {/* Create dialog */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-[#12131a] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl animate-slide-up relative overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Decorative gradient corner */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-purple-500/10 via-pink-500/5 to-transparent rounded-bl-full" />

            <div className="flex items-center justify-between mb-5 relative">
              <h2 className="text-lg font-extrabold gradient-text">Add New Series</h2>
              <button onClick={() => setShowCreate(false)} className="p-1 text-gray-500 hover:text-white rounded-lg hover:bg-white/10 transition-colors"><X size={18} /></button>
            </div>
            <div className="space-y-4 relative">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Title</label>
                <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-pink-500/50 focus:ring-2 focus:ring-pink-500/20 transition-all"
                  placeholder="Solo Leveling" autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">From</label>
                  <select value={newSourceLang} onChange={(e) => setNewSourceLang(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-500/50">
                    {Object.entries(languages).map(([code, lang]) => (<option key={code} value={code}>{lang.name}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">To</label>
                  <select value={newTargetLang} onChange={(e) => setNewTargetLang(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-cyan-500/50">
                    {Object.entries(languages).map(([code, lang]) => (<option key={code} value={code}>{lang.name}</option>))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">Description <span className="text-gray-600 normal-case">(optional)</span></label>
                <textarea value={newDescription} onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm h-20 resize-none focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20" />
              </div>
              <button onClick={handleCreate}
                className="w-full btn-playful flex items-center justify-center gap-2">
                <Sparkles size={15} /> Create Series
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
