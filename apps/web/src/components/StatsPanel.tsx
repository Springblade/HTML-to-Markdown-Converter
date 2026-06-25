'use client';

import { useEffect, useState } from 'react';
import { ServerStats } from '@/lib/types';

interface StatsPanelProps {
  isCrawling: boolean;
}

interface PythonStatsResponse {
  running: number;
  max_concurrency: number;
  memory_rss_mb: number;
  system_memory_percent: number;
  memory_threshold_percent: number;
  memory_timeout: number;
  v8_max_old_space_size: number;
  queue_timeout: number;
  memory_vms_mb: number;
  child_memory_mb: number;
  child_count: number;
  total_memory_mb: number;
  system_memory_total_gb: number;
  system_memory_used_gb: number;
}

const MEMORY_COLORS = {
  high: 'bg-red-500',
  medium: 'bg-amber-500',
  low: 'bg-emerald-500',
} as const;

export function StatsPanel({ isCrawling }: StatsPanelProps) {
  const [stats, setStats] = useState<ServerStats | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/stats');
        if (res.ok) {
          const pythonStats: PythonStatsResponse = await res.json();
          const serverStats: ServerStats = {
            memory: {
              rss_mb: pythonStats.memory_rss_mb,
              child_mb: pythonStats.child_memory_mb,
              total_mb: pythonStats.total_memory_mb,
              percent: pythonStats.system_memory_percent,
              threshold_percent: pythonStats.memory_threshold_percent,
              system_total_gb: pythonStats.system_memory_total_gb,
              system_used_gb: pythonStats.system_memory_used_gb,
            },
            crawler: {
              running: pythonStats.running,
              max_concurrent: pythonStats.max_concurrency,
              child_count: pythonStats.child_count,
            },
          };
          setStats(serverStats);
        }
      } catch {
        // Silently fail - stats are not critical
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  if (!stats?.memory) {
    return (
      <div className="flex items-center justify-center py-2 text-sm text-zinc-400">
        Loading stats...
      </div>
    );
  }

  const { memory, crawler } = stats;
  const memoryMB = Math.round(memory.total_mb);
  const colorKey = memory.percent >= 90 ? 'high' : memory.percent >= 60 ? 'medium' : 'low';
  const thresholdColor = MEMORY_COLORS[colorKey];

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm">
      {/* Memory (server + browsers) */}
      <div className="flex items-center gap-2">
        <span className="text-zinc-500">Memory:</span>
        <span className="font-medium text-zinc-700">{memoryMB} MB</span>
        <span className="text-xs text-zinc-400">(server: {Math.round(memory.rss_mb)} + browsers: {Math.round(memory.child_mb)})</span>
        <div className="h-2 w-20 overflow-hidden rounded-full bg-zinc-200">
          <div
            className={`h-full ${thresholdColor} transition-all`}
            style={{ width: `${Math.min(memory.percent, 100)}%` }}
          />
        </div>
        <span className="text-zinc-400">{Math.round(memory.percent)}% ({memory.system_used_gb} / {memory.system_total_gb} GB)</span>
      </div>

      {/* Separator */}
      <div className="h-4 w-px bg-zinc-200" />

      {/* Running tasks */}
      <div className="flex items-center gap-2">
        <span className="text-zinc-500">Running:</span>
        <span className="font-medium text-zinc-700">
          {crawler.running} / {crawler.max_concurrent}
        </span>
      </div>

      {/* Separator */}
      <div className="h-4 w-px bg-zinc-200" />

      {/* Threshold */}
      <div className="flex items-center gap-2">
        <span className="text-zinc-500">Threshold:</span>
        <span className="font-medium text-zinc-700">{memory.threshold_percent}%</span>
      </div>
    </div>
  );
}
