"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { getSeries, listChapters, getRelationshipMap } from "@/lib/api";
import type {
  Series,
  Chapter,
  RelationshipMapNode,
  RelationshipMapEdge,
  RelationshipMapData,
} from "@/lib/types";
import {
  ArrowLeft,
  Search,
  Maximize2,
  Minimize2,
  RotateCcw,
  BookOpen,
  User,
  Sword,
  MapPin,
  Shield,
  Sparkles,
  X,
  ChevronRight,
  Eye,
  EyeOff,
} from "lucide-react";

// Dynamic import for Three.js component (no SSR)
const RelationshipGraph3D = dynamic(
  () => import("@/components/RelationshipGraph3D"),
  { ssr: false, loading: () => <GraphPlaceholder /> }
);

// Also import the color maps for use in the page
import { ENTITY_COLORS, RELATIONSHIP_COLORS } from "@/components/RelationshipGraph3D";

function GraphPlaceholder() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-[#0a0b0f]/50">
      <div className="text-center">
        <div className="w-12 h-12 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-500">Loading 3D graph...</p>
      </div>
    </div>
  );
}

// ─── Entity Type Config ──────────────────────────────────────────────────────

const ENTITY_TYPE_CONFIG: Record<string, { label: string; icon: typeof User; color: string }> = {
  character: { label: "Characters", icon: User, color: ENTITY_COLORS.character },
  item: { label: "Items", icon: Sword, color: ENTITY_COLORS.item },
  location: { label: "Locations", icon: MapPin, color: ENTITY_COLORS.location },
  faction: { label: "Factions", icon: Shield, color: ENTITY_COLORS.faction },
  concept: { label: "Concepts", icon: Sparkles, color: ENTITY_COLORS.concept },
};

const RELATIONSHIP_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  ally: { label: "Ally", color: RELATIONSHIP_COLORS.ally },
  enemy: { label: "Enemy", color: RELATIONSHIP_COLORS.enemy },
  romantic: { label: "Romantic", color: RELATIONSHIP_COLORS.romantic },
  family: { label: "Family", color: RELATIONSHIP_COLORS.family },
  mentor: { label: "Mentor", color: RELATIONSHIP_COLORS.mentor },
  rival: { label: "Rival", color: RELATIONSHIP_COLORS.rival },
  member_of: { label: "Member Of", color: RELATIONSHIP_COLORS.member_of },
};

// ─── Sidebar Panel ───────────────────────────────────────────────────────────

function NodeDetailPanel({
  node,
  edges,
  allNodes,
  onClose,
}: {
  node: RelationshipMapNode;
  edges: RelationshipMapEdge[];
  allNodes: RelationshipMapNode[];
  onClose: () => void;
}) {
  const color = ENTITY_COLORS[node.entity_type] || "#888";
  const nodeMap = new Map(allNodes.map((n) => [n.id, n]));

  // Relationships involving this node
  const relatedEdges = edges.filter(
    (e) => e.source === node.id || e.target === node.id
  );

  // Parse JSON fields safely
  const parseJSON = (s: string | null): string[] => {
    if (!s) return [];
    try {
      const parsed = JSON.parse(s);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return s.split(",").map((x) => x.trim()).filter(Boolean);
    }
  };

  const aliases = parseJSON(node.aliases);
  const traits = parseJSON(node.personality_traits);
  let properties: Record<string, string> = {};
  if (node.properties) {
    try { properties = JSON.parse(node.properties); } catch {}
  }

  return (
    <div className="w-full h-full overflow-y-auto custom-scrollbar">
      {/* Header */}
      <div className="sticky top-0 bg-[#12131a]/95 backdrop-blur-sm z-10 pb-3 border-b border-white/5 mb-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-black shadow-lg"
              style={{ background: `linear-gradient(135deg, ${color}, ${color}88)`, boxShadow: `0 4px 12px ${color}44` }}
            >
              {node.name[0]}
            </div>
            <div>
              <h3 className="font-extrabold text-lg leading-tight">{node.name}</h3>
              {node.name_original && (
                <p className="text-xs text-gray-500">{node.name_original}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-500 hover:text-white rounded-lg hover:bg-white/10 transition-all"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex items-center gap-2 mt-2">
          <span
            className="text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider border"
            style={{
              color: color,
              borderColor: `${color}33`,
              background: `${color}15`,
            }}
          >
            {node.entity_type}
          </span>
          {node.status && (
            <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-semibold capitalize ${
              node.status === "alive" || node.status === "active"
                ? "bg-green-500/10 text-green-400 border border-green-500/20"
                : "bg-gray-500/10 text-gray-400 border border-gray-500/20"
            }`}>
              {node.status}
            </span>
          )}
          {node.first_appearance_chapter != null && (
            <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-medium flex items-center gap-1">
              <BookOpen size={9} /> Ch. {node.first_appearance_chapter}
            </span>
          )}
        </div>
      </div>

      {/* Description */}
      {node.description && (
        <div className="mb-4">
          <h4 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Description</h4>
          <p className="text-sm text-gray-300 leading-relaxed">{node.description}</p>
        </div>
      )}

      {/* Aliases */}
      {aliases.length > 0 && (
        <div className="mb-4">
          <h4 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Aliases</h4>
          <div className="flex flex-wrap gap-1.5">
            {aliases.map((a, i) => (
              <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-white/5 text-gray-300 border border-white/10">
                {a}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Personality Traits */}
      {traits.length > 0 && (
        <div className="mb-4">
          <h4 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Personality</h4>
          <div className="flex flex-wrap gap-1.5">
            {traits.map((t, i) => (
              <span
                key={i}
                className="text-xs px-2.5 py-1 rounded-full font-medium border"
                style={{ color: color, borderColor: `${color}33`, background: `${color}10` }}
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Voice Profile */}
      {node.voice_profile && (
        <div className="mb-4">
          <h4 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Voice Profile</h4>
          <p className="text-sm text-gray-400 italic">{node.voice_profile}</p>
        </div>
      )}

      {/* Properties (for world entities) */}
      {Object.keys(properties).length > 0 && (
        <div className="mb-4">
          <h4 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">Properties</h4>
          <div className="space-y-1">
            {Object.entries(properties).map(([key, val]) => (
              <div key={key} className="flex items-start gap-2 text-sm">
                <span className="text-gray-500 font-medium capitalize">{key}:</span>
                <span className="text-gray-300">{val}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Relationships */}
      {relatedEdges.length > 0 && (
        <div>
          <h4 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">
            Relationships ({relatedEdges.length})
          </h4>
          <div className="space-y-1.5">
            {relatedEdges.map((edge) => {
              const otherId = edge.source === node.id ? edge.target : edge.source;
              const other = nodeMap.get(otherId);
              const relColor = RELATIONSHIP_COLORS[edge.relationship_type] || "#666";
              return (
                <div
                  key={edge.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] transition-colors"
                >
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: relColor }}
                  />
                  <span
                    className="text-[10px] font-bold uppercase tracking-wider flex-shrink-0"
                    style={{ color: relColor }}
                  >
                    {edge.relationship_type}
                  </span>
                  <ChevronRight size={10} className="text-gray-600 flex-shrink-0" />
                  <span className="text-sm text-gray-300 font-medium truncate">
                    {other?.name || "Unknown"}
                  </span>
                  {edge.started_chapter && (
                    <span className="text-[10px] text-gray-600 ml-auto flex-shrink-0">
                      Ch.{edge.started_chapter}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Edge Detail Panel ───────────────────────────────────────────────────────

function EdgeDetailPanel({
  edge,
  allNodes,
  onClose,
}: {
  edge: RelationshipMapEdge;
  allNodes: RelationshipMapNode[];
  onClose: () => void;
}) {
  const nodeMap = new Map(allNodes.map((n) => [n.id, n]));
  const source = nodeMap.get(edge.source);
  const target = nodeMap.get(edge.target);
  const color = RELATIONSHIP_COLORS[edge.relationship_type] || "#666";

  return (
    <div className="w-full">
      <div className="flex items-start justify-between mb-4">
        <h3 className="font-extrabold text-lg gradient-text">Relationship</h3>
        <button onClick={onClose} className="p-1.5 text-gray-500 hover:text-white rounded-lg hover:bg-white/10 transition-all">
          <X size={16} />
        </button>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="text-sm font-bold text-gray-200">{source?.name || "?"}</div>
        <div className="flex-1 flex items-center gap-2">
          <div className="flex-1 h-px" style={{ background: color }} />
          <span
            className="text-[11px] px-3 py-1 rounded-full font-bold uppercase tracking-wider border"
            style={{ color, borderColor: `${color}44`, background: `${color}15` }}
          >
            {edge.relationship_type}
          </span>
          <div className="flex-1 h-px" style={{ background: color }} />
        </div>
        <div className="text-sm font-bold text-gray-200">{target?.name || "?"}</div>
      </div>

      {edge.description && (
        <div className="mb-3">
          <h4 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">Details</h4>
          <p className="text-sm text-gray-400">{edge.description}</p>
        </div>
      )}

      <div className="flex gap-3 text-xs text-gray-500">
        {edge.started_chapter && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5">
            <BookOpen size={9} className="text-cyan-400" /> Started Ch. {edge.started_chapter}
          </span>
        )}
        {edge.ended_chapter && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5">
            <BookOpen size={9} className="text-red-400" /> Ended Ch. {edge.ended_chapter}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Main Wiki Page ──────────────────────────────────────────────────────────

export default function WikiPage() {
  const { id } = useParams<{ id: string }>();

  const [series, setSeries] = useState<Series | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [graphData, setGraphData] = useState<RelationshipMapData | null>(null);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_error, setError] = useState<string | null>(null);

  // UI state
  const [maxChapter, setMaxChapter] = useState<number>(999);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<RelationshipMapEdge | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [resetCameraTrigger, setResetCameraTrigger] = useState(0);
  const [showControls, setShowControls] = useState(true);

  // Filters
  const [visibleEntityTypes, setVisibleEntityTypes] = useState<Set<string>>(
    new Set(["character", "item", "location", "faction", "concept", "power_system", "skill"])
  );
  const [visibleRelTypes, setVisibleRelTypes] = useState<Set<string>>(
    new Set(["ally", "enemy", "romantic", "family", "mentor", "rival", "member_of"])
  );

  // Load series + chapters
  useEffect(() => {
    async function load() {
      try {
        const [s, ch] = await Promise.all([getSeries(id), listChapters(id)]);
        setSeries(s);
        setChapters(ch.sort((a, b) => a.chapter_number - b.chapter_number));
        const maxCh = ch.length > 0 ? Math.max(...ch.map((c) => c.chapter_number)) : 1;
        setMaxChapter(maxCh);
      } catch {
        setError("Failed to load series data");
      }
    }
    load();
  }, [id]);

  // Load relationship map whenever maxChapter changes
  useEffect(() => {
    async function loadGraph() {
      setLoading(true);
      try {
        const data = await getRelationshipMap(id, maxChapter);
        setGraphData(data);
      } catch {
        // Might 404 if no data yet, that's fine
        setGraphData({ nodes: [], edges: [] });
      } finally {
        setLoading(false);
      }
    }
    loadGraph();
  }, [id, maxChapter]);

  // Total chapter count for slider
  const totalChapters = useMemo(() => {
    if (chapters.length === 0) return 1;
    return Math.max(...chapters.map((c) => c.chapter_number));
  }, [chapters]);

  // Entity types present in data
  const presentEntityTypes = useMemo(() => {
    if (!graphData) return new Set<string>();
    return new Set(graphData.nodes.map((n) => n.entity_type));
  }, [graphData]);

  const presentRelTypes = useMemo(() => {
    if (!graphData) return new Set<string>();
    return new Set(graphData.edges.map((e) => e.relationship_type));
  }, [graphData]);

  // Selected node data
  const selectedNode = useMemo(() => {
    if (!selectedNodeId || !graphData) return null;
    return graphData.nodes.find((n) => n.id === selectedNodeId) || null;
  }, [selectedNodeId, graphData]);

  const toggleEntityType = useCallback((type: string) => {
    setVisibleEntityTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const toggleRelType = useCallback((type: string) => {
    setVisibleRelTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  // Fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((v) => !v);
  }, []);

  if (!series) {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="h-10 skeleton rounded-xl w-48" />
        <div className="h-[600px] skeleton rounded-2xl" />
      </div>
    );
  }

  const showSidebar = selectedNode || selectedEdge;

  return (
    <div className={`animate-fade-in ${isFullscreen ? "fixed inset-0 z-50 bg-[#0a0b0f] p-4" : ""}`}>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          {!isFullscreen && (
            <Link
              href={`/series/${id}`}
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-pink-400 transition-colors group"
            >
              <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" />
              Back
            </Link>
          )}
          <h1 className="text-xl sm:text-2xl font-extrabold gradient-text">
            {series.title} <span className="text-gray-500 font-normal text-lg">Wiki</span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {graphData?.nodes.length || 0} entities, {graphData?.edges.length || 0} relationships
          </span>
        </div>
      </div>

      {/* Chapter Slider (Spoiler Gate) */}
      <div className="mb-4 p-3 rounded-xl bg-white/[0.03] border border-white/5">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm">
            <Eye size={14} className="text-cyan-400" />
            <span className="text-gray-400 font-medium whitespace-nowrap">Show info up to Chapter:</span>
          </div>
          <input
            type="range"
            min={1}
            max={totalChapters}
            value={maxChapter}
            onChange={(e) => setMaxChapter(Number(e.target.value))}
            className="flex-1 accent-purple-500 h-2 cursor-pointer"
          />
          <span className="text-lg font-black text-purple-400 min-w-[2.5rem] text-center tabular-nums">
            {maxChapter}
          </span>
        </div>
      </div>

      {/* Main Content: Graph + Controls + Sidebar */}
      <div className="flex gap-4" style={{ height: isFullscreen ? "calc(100vh - 140px)" : "600px" }}>
        {/* Graph Area */}
        <div className="flex-1 relative rounded-2xl overflow-hidden border border-white/5 bg-[#0a0b0f]">
          {/* Graph Canvas */}
          {loading ? (
            <GraphPlaceholder />
          ) : graphData && graphData.nodes.length > 0 ? (
            <RelationshipGraph3D
              nodes={graphData.nodes}
              edges={graphData.edges}
              selectedNodeId={selectedNodeId}
              hoveredNodeId={hoveredNodeId}
              onSelectNode={(id) => {
                setSelectedNodeId(id);
                if (id) setSelectedEdge(null);
              }}
              onHoverNode={setHoveredNodeId}
              onSelectEdge={(edge) => {
                setSelectedEdge(edge);
                if (edge) setSelectedNodeId(null);
              }}
              visibleEntityTypes={visibleEntityTypes}
              visibleRelTypes={visibleRelTypes}
              searchQuery={searchQuery}
              resetCameraTrigger={resetCameraTrigger}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-center">
                <div className="text-4xl mb-3">{"(o_o)?"}</div>
                <p className="text-gray-500 mb-1">No entities discovered yet</p>
                <p className="text-xs text-gray-600">
                  Characters and entities are auto-detected when you translate chapters
                </p>
              </div>
            </div>
          )}

          {/* Floating Controls */}
          <div className="absolute top-3 right-3 flex flex-col gap-1.5">
            <button
              onClick={toggleFullscreen}
              className="p-2 rounded-lg bg-black/50 border border-white/10 text-gray-400 hover:text-white hover:bg-black/70 transition-all backdrop-blur-sm"
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button
              onClick={() => setResetCameraTrigger((v) => v + 1)}
              className="p-2 rounded-lg bg-black/50 border border-white/10 text-gray-400 hover:text-white hover:bg-black/70 transition-all backdrop-blur-sm"
              title="Reset Camera"
            >
              <RotateCcw size={16} />
            </button>
            <button
              onClick={() => setShowControls((v) => !v)}
              className="p-2 rounded-lg bg-black/50 border border-white/10 text-gray-400 hover:text-white hover:bg-black/70 transition-all backdrop-blur-sm"
              title="Toggle Filters"
            >
              {showControls ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {/* Search */}
          <div className="absolute top-3 left-3 w-64">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                placeholder="Search entities..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-black/50 backdrop-blur-sm border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Filter Controls (bottom-left overlay) */}
          {showControls && (
            <div className="absolute bottom-3 left-3 max-w-[280px] bg-black/60 backdrop-blur-sm rounded-xl border border-white/10 p-3 space-y-3">
              {/* Entity Type Filters */}
              <div>
                <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                  Entity Types
                </h4>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(ENTITY_TYPE_CONFIG).map(([type, config]) => {
                    if (!presentEntityTypes.has(type)) return null;
                    const active = visibleEntityTypes.has(type);
                    const Icon = config.icon;
                    return (
                      <button
                        key={type}
                        onClick={() => toggleEntityType(type)}
                        className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold border transition-all ${
                          active
                            ? "border-current opacity-100"
                            : "border-gray-700 text-gray-600 opacity-50"
                        }`}
                        style={active ? { color: config.color, borderColor: `${config.color}44`, background: `${config.color}15` } : {}}
                      >
                        <Icon size={10} />
                        {config.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Relationship Type Filters */}
              <div>
                <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                  Relationships
                </h4>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(RELATIONSHIP_TYPE_CONFIG).map(([type, config]) => {
                    if (!presentRelTypes.has(type)) return null;
                    const active = visibleRelTypes.has(type);
                    return (
                      <button
                        key={type}
                        onClick={() => toggleRelType(type)}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-semibold border transition-all ${
                          active
                            ? "border-current opacity-100"
                            : "border-gray-700 text-gray-600 opacity-50"
                        }`}
                        style={active ? { color: config.color, borderColor: `${config.color}44`, background: `${config.color}15` } : {}}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ background: active ? config.color : "#555" }}
                        />
                        {config.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Legend (bottom-right) */}
          <div className="absolute bottom-3 right-3 text-[10px] text-gray-600">
            Drag to rotate | Scroll to zoom | Click node for details
          </div>
        </div>

        {/* Sidebar */}
        {showSidebar && (
          <div
            className="w-80 flex-shrink-0 rounded-2xl border border-white/5 bg-[#12131a] p-4 animate-slide-up overflow-hidden"
            style={{ maxHeight: isFullscreen ? "calc(100vh - 140px)" : "600px" }}
          >
            {selectedNode && (
              <NodeDetailPanel
                node={selectedNode}
                edges={graphData?.edges || []}
                allNodes={graphData?.nodes || []}
                onClose={() => setSelectedNodeId(null)}
              />
            )}
            {selectedEdge && !selectedNode && (
              <EdgeDetailPanel
                edge={selectedEdge}
                allNodes={graphData?.nodes || []}
                onClose={() => setSelectedEdge(null)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
