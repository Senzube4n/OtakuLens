"use client";

import { useRef, useState, useEffect, useMemo } from "react";
import { Canvas, useFrame, useThree, ThreeEvent } from "@react-three/fiber";
import { Html, OrbitControls, Line } from "@react-three/drei";
import * as THREE from "three";
import type { RelationshipMapNode, RelationshipMapEdge } from "@/lib/types";

// ─── Constants ───────────────────────────────────────────────────────────────

const ENTITY_COLORS: Record<string, string> = {
  character: "#a855f7",
  item: "#eab308",
  location: "#14b8a6",
  faction: "#f97316",
  concept: "#ec4899",
  power_system: "#6366f1",
  skill: "#06b6d4",
};

const RELATIONSHIP_COLORS: Record<string, string> = {
  ally: "#22c55e",
  enemy: "#ef4444",
  romantic: "#ec4899",
  family: "#3b82f6",
  mentor: "#a855f7",
  rival: "#f97316",
  member_of: "#14b8a6",
};

const SPRING_LENGTH = 4;
const SPRING_STRENGTH = 0.01;
const REPULSION = 8;
const DAMPING = 0.92;
const CENTER_GRAVITY = 0.002;

// ─── Types ───────────────────────────────────────────────────────────────────

interface SimNode {
  id: string;
  data: RelationshipMapNode;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
}

interface GraphProps {
  nodes: RelationshipMapNode[];
  edges: RelationshipMapEdge[];
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  onHoverNode: (id: string | null) => void;
  onSelectEdge: (edge: RelationshipMapEdge | null) => void;
  visibleEntityTypes: Set<string>;
  visibleRelTypes: Set<string>;
  searchQuery: string;
}

// ─── Node Mesh ───────────────────────────────────────────────────────────────

function NodeMesh({
  simNode,
  isSelected,
  isHovered,
  isConnected,
  isDimmed,
  onSelect,
  onHover,
  onUnhover,
}: {
  simNode: SimNode;
  isSelected: boolean;
  isHovered: boolean;
  isConnected: boolean;
  isDimmed: boolean;
  onSelect: () => void;
  onHover: () => void;
  onUnhover: () => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const { data } = simNode;
  const color = ENTITY_COLORS[data.entity_type] || "#888888";

  useFrame(() => {
    if (meshRef.current) {
      meshRef.current.position.copy(simNode.position);
      // Gentle bobbing animation
      meshRef.current.position.y += Math.sin(Date.now() * 0.001 + simNode.position.x) * 0.05;
      // Slow rotation
      meshRef.current.rotation.y += 0.005;
      meshRef.current.rotation.x += 0.002;
    }
  });

  const scale = isSelected ? 1.4 : isHovered ? 1.25 : isConnected ? 1.1 : 1;
  const opacity = isDimmed ? 0.15 : 1;

  const geometry = useMemo(() => {
    switch (data.entity_type) {
      case "item":
        return <octahedronGeometry args={[0.4, 0]} />;
      case "location":
        return <boxGeometry args={[0.55, 0.55, 0.55]} />;
      case "faction":
        return <dodecahedronGeometry args={[0.4, 0]} />;
      default:
        return <sphereGeometry args={[0.35, 32, 32]} />;
    }
  }, [data.entity_type]);

  return (
    <group>
      <mesh
        ref={meshRef}
        onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelect(); }}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); onHover(); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { onUnhover(); document.body.style.cursor = "default"; }}
        scale={scale}
      >
        {geometry}
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isSelected ? 0.8 : isHovered ? 0.6 : 0.3}
          transparent
          opacity={opacity}
          roughness={0.3}
          metalness={0.6}
        />
      </mesh>
      {/* Glow ring for selected */}
      {isSelected && (
        <mesh position={simNode.position} scale={1.8}>
          <ringGeometry args={[0.3, 0.38, 32]} />
          <meshBasicMaterial color={color} transparent opacity={0.4} side={THREE.DoubleSide} />
        </mesh>
      )}
      {/* Label */}
      <Html
        position={simNode.position}
        center
        distanceFactor={12}
        style={{
          pointerEvents: "none",
          transform: "translateY(-28px)",
          opacity: isDimmed ? 0.15 : 1,
          transition: "opacity 0.3s",
        }}
      >
        <div className="text-[11px] font-bold text-white px-2 py-0.5 rounded-full whitespace-nowrap select-none"
          style={{
            background: `linear-gradient(135deg, ${color}cc, ${color}88)`,
            textShadow: "0 1px 3px rgba(0,0,0,0.5)",
            boxShadow: `0 2px 8px ${color}44`,
          }}>
          {data.name}
        </div>
      </Html>
    </group>
  );
}

// ─── Edge Lines ──────────────────────────────────────────────────────────────

function EdgeLine({
  edge,
  sourcePos,
  targetPos,
  isHighlighted,
  isDimmed,
  onClick,
}: {
  edge: RelationshipMapEdge;
  sourcePos: THREE.Vector3;
  targetPos: THREE.Vector3;
  isHighlighted: boolean;
  isDimmed: boolean;
  onClick: () => void;
}) {
  const color = RELATIONSHIP_COLORS[edge.relationship_type] || "#666666";
  const points = useMemo(() => {
    const mid = new THREE.Vector3().addVectors(sourcePos, targetPos).multiplyScalar(0.5);
    mid.y += 0.3;
    const curve = new THREE.QuadraticBezierCurve3(sourcePos.clone(), mid, targetPos.clone());
    return curve.getPoints(20);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourcePos.x, sourcePos.y, sourcePos.z, targetPos.x, targetPos.y, targetPos.z]);

  return (
    <group>
      <Line
        points={points}
        color={color}
        lineWidth={isHighlighted ? 3 : 1.5}
        transparent
        opacity={isDimmed ? 0.05 : isHighlighted ? 0.9 : 0.4}
      />
      {/* Clickable invisible wider line for interaction */}
      <Line
        points={points}
        color={color}
        lineWidth={8}
        transparent
        opacity={0}
        onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onClick(); }}
        onPointerOver={() => { document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { document.body.style.cursor = "default"; }}
      />
    </group>
  );
}

// ─── Force Simulation ────────────────────────────────────────────────────────

function ForceGraph({
  nodes,
  edges,
  selectedNodeId,
  hoveredNodeId,
  onSelectNode,
  onHoverNode,
  onSelectEdge,
  visibleEntityTypes,
  visibleRelTypes,
  searchQuery,
}: GraphProps) {
  const simNodesRef = useRef<SimNode[]>([]);
  const [, forceUpdate] = useState(0);

  // Build adjacency for highlighting connected nodes
  const adjacency = useMemo(() => {
    const adj = new Map<string, Set<string>>();
    edges.forEach((e) => {
      if (!adj.has(e.source)) adj.set(e.source, new Set());
      if (!adj.has(e.target)) adj.set(e.target, new Set());
      adj.get(e.source)!.add(e.target);
      adj.get(e.target)!.add(e.source);
    });
    return adj;
  }, [edges]);

  // Filter nodes and edges
  const filteredNodes = useMemo(
    () => nodes.filter((n) => visibleEntityTypes.has(n.entity_type)),
    [nodes, visibleEntityTypes]
  );

  const filteredNodeIds = useMemo(
    () => new Set(filteredNodes.map((n) => n.id)),
    [filteredNodes]
  );

  const filteredEdges = useMemo(
    () =>
      edges.filter(
        (e) =>
          visibleRelTypes.has(e.relationship_type) &&
          filteredNodeIds.has(e.source) &&
          filteredNodeIds.has(e.target)
      ),
    [edges, visibleRelTypes, filteredNodeIds]
  );

  // Search match
  const searchMatchIds = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase();
    return new Set(
      filteredNodes
        .filter(
          (n) =>
            n.name.toLowerCase().includes(q) ||
            (n.aliases && n.aliases.toLowerCase().includes(q)) ||
            (n.name_original && n.name_original.toLowerCase().includes(q))
        )
        .map((n) => n.id)
    );
  }, [filteredNodes, searchQuery]);

  // Initialize / update sim nodes
  useEffect(() => {
    const existing = new Map(simNodesRef.current.map((s) => [s.id, s]));
    simNodesRef.current = filteredNodes.map((n, i) => {
      if (existing.has(n.id)) {
        const e = existing.get(n.id)!;
        e.data = n;
        return e;
      }
      // Distribute in a sphere
      const phi = Math.acos(-1 + (2 * i) / Math.max(filteredNodes.length, 1));
      const theta = Math.sqrt(filteredNodes.length * Math.PI) * phi;
      const r = 3 + Math.random() * 2;
      return {
        id: n.id,
        data: n,
        position: new THREE.Vector3(
          r * Math.cos(theta) * Math.sin(phi),
          r * Math.sin(theta) * Math.sin(phi),
          r * Math.cos(phi)
        ),
        velocity: new THREE.Vector3(),
      };
    });
  }, [filteredNodes]);

  // Physics step
  useFrame(() => {
    const simNodes = simNodesRef.current;
    if (simNodes.length === 0) return;

    // Repulsion between all pairs
    for (let i = 0; i < simNodes.length; i++) {
      for (let j = i + 1; j < simNodes.length; j++) {
        const a = simNodes[i];
        const b = simNodes[j];
        const diff = new THREE.Vector3().subVectors(a.position, b.position);
        const dist = Math.max(diff.length(), 0.1);
        const force = REPULSION / (dist * dist);
        diff.normalize().multiplyScalar(force);
        a.velocity.add(diff);
        b.velocity.sub(diff);
      }
    }

    // Spring forces along edges
    const nodeMap = new Map(simNodes.map((n) => [n.id, n]));
    filteredEdges.forEach((e) => {
      const a = nodeMap.get(e.source);
      const b = nodeMap.get(e.target);
      if (!a || !b) return;
      const diff = new THREE.Vector3().subVectors(b.position, a.position);
      const dist = diff.length();
      const force = (dist - SPRING_LENGTH) * SPRING_STRENGTH;
      diff.normalize().multiplyScalar(force);
      a.velocity.add(diff);
      b.velocity.sub(diff);
    });

    // Center gravity
    simNodes.forEach((n) => {
      n.velocity.add(n.position.clone().negate().multiplyScalar(CENTER_GRAVITY));
    });

    // Integrate
    simNodes.forEach((n) => {
      n.velocity.multiplyScalar(DAMPING);
      n.position.add(n.velocity);
    });

    forceUpdate((v) => v + 1);
  });

  const hoveredOrSelected = hoveredNodeId || selectedNodeId;
  const connectedToFocus = hoveredOrSelected
    ? adjacency.get(hoveredOrSelected) || new Set()
    : new Set<string>();

  const nodeMap = new Map(simNodesRef.current.map((n) => [n.id, n]));

  return (
    <>
      {/* Ambient + Directional lights */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 10, 5]} intensity={0.8} />
      <pointLight position={[-10, -10, -10]} intensity={0.3} color="#ec4899" />
      <pointLight position={[10, -5, 10]} intensity={0.3} color="#a855f7" />

      {/* Edges */}
      {filteredEdges.map((edge) => {
        const src = nodeMap.get(edge.source);
        const tgt = nodeMap.get(edge.target);
        if (!src || !tgt) return null;
        const isHighlighted =
          hoveredOrSelected === edge.source || hoveredOrSelected === edge.target;
        const isDimmed = hoveredOrSelected != null && !isHighlighted;
        return (
          <EdgeLine
            key={edge.id}
            edge={edge}
            sourcePos={src.position}
            targetPos={tgt.position}
            isHighlighted={isHighlighted}
            isDimmed={isDimmed}
            onClick={() => onSelectEdge(edge)}
          />
        );
      })}

      {/* Nodes */}
      {simNodesRef.current.map((simNode) => {
        const isSelected = selectedNodeId === simNode.id;
        const isHovered = hoveredNodeId === simNode.id;
        const isConnected = connectedToFocus.has(simNode.id);
        const isDimmedByFocus =
          hoveredOrSelected != null &&
          !isSelected &&
          !isHovered &&
          !isConnected &&
          hoveredOrSelected !== simNode.id;
        const isDimmedBySearch =
          searchMatchIds != null && !searchMatchIds.has(simNode.id);
        return (
          <NodeMesh
            key={simNode.id}
            simNode={simNode}
            isSelected={isSelected}
            isHovered={isHovered}
            isConnected={isConnected}
            isDimmed={isDimmedByFocus || isDimmedBySearch}
            onSelect={() => onSelectNode(isSelected ? null : simNode.id)}
            onHover={() => onHoverNode(simNode.id)}
            onUnhover={() => onHoverNode(null)}
          />
        );
      })}
    </>
  );
}

// ─── Camera Reset Helper ─────────────────────────────────────────────────────

function CameraController({ resetTrigger }: { resetTrigger: number }) {
  const { camera } = useThree();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controlsRef = useRef<any>(null);

  useEffect(() => {
    if (resetTrigger > 0) {
      camera.position.set(0, 0, 12);
      camera.lookAt(0, 0, 0);
      if (controlsRef.current) {
        controlsRef.current.target.set(0, 0, 0);
        controlsRef.current.update();
      }
    }
  }, [resetTrigger, camera]);

  return <OrbitControls ref={controlsRef} enableDamping dampingFactor={0.1} rotateSpeed={0.5} zoomSpeed={0.8} />;
}

// ─── Main Export ─────────────────────────────────────────────────────────────

export interface RelationshipGraph3DProps {
  nodes: RelationshipMapNode[];
  edges: RelationshipMapEdge[];
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  onHoverNode: (id: string | null) => void;
  onSelectEdge: (edge: RelationshipMapEdge | null) => void;
  visibleEntityTypes: Set<string>;
  visibleRelTypes: Set<string>;
  searchQuery: string;
  resetCameraTrigger: number;
}

export default function RelationshipGraph3D({
  nodes,
  edges,
  selectedNodeId,
  hoveredNodeId,
  onSelectNode,
  onHoverNode,
  onSelectEdge,
  visibleEntityTypes,
  visibleRelTypes,
  searchQuery,
  resetCameraTrigger,
}: RelationshipGraph3DProps) {
  return (
    <Canvas
      camera={{ position: [0, 0, 12], fov: 60, near: 0.1, far: 100 }}
      style={{ background: "transparent" }}
      gl={{ alpha: true, antialias: true }}
      onPointerMissed={() => {
        onSelectNode(null);
        onSelectEdge(null);
      }}
    >
      <fog attach="fog" args={["#0a0b0f", 15, 40]} />
      <CameraController resetTrigger={resetCameraTrigger} />
      <ForceGraph
        nodes={nodes}
        edges={edges}
        selectedNodeId={selectedNodeId}
        hoveredNodeId={hoveredNodeId}
        onSelectNode={onSelectNode}
        onHoverNode={onHoverNode}
        onSelectEdge={onSelectEdge}
        visibleEntityTypes={visibleEntityTypes}
        visibleRelTypes={visibleRelTypes}
        searchQuery={searchQuery}
      />
    </Canvas>
  );
}

export { ENTITY_COLORS, RELATIONSHIP_COLORS };
