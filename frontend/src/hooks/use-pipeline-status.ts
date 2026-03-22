"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { PipelineProgress } from "@/lib/types";

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";

export function usePipelineStatus(chapterId: string | null) {
  const [status, setStatus] = useState<PipelineProgress | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    if (!chapterId) return;

    const ws = new WebSocket(`${WS_BASE}/ws/pipeline/${chapterId}`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onmessage = (event) => {
      try {
        const data: PipelineProgress = JSON.parse(event.data);
        setStatus(data);
      } catch {
        // ignore malformed messages
      }
    };
    ws.onclose = () => {
      setConnected(false);
      // Reconnect after 2 seconds if not completed/failed
      if (status?.stage !== "completed" && status?.stage !== "failed") {
        setTimeout(connect, 2000);
      }
    };
    ws.onerror = () => ws.close();
  }, [chapterId]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);

  return { status, connected };
}
