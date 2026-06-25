'use client';

import { useEffect, useState } from 'react';

export interface ServerStats {
  memory: {
    rss_mb: number;
    child_mb: number;
    total_mb: number;
    percent: number;
    threshold_percent: number;
    system_total_gb: number;
    system_used_gb: number;
  };
  crawler: {
    running: number;
    max_concurrent: number;
    child_count: number;
  };
  last_crawl?: {
    memory_before_mb: number;
    memory_after_mb: number;
  };
}

interface StatsPanelProps {
  isCrawling: boolean;
  onCrawlStart?: () => void;
  onCrawlEnd?: () => void;
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

export function StatsPanel({ isCrawling }: StatsPanelProps) {
  const [stats, setStats] = useState<ServerStats | null>(null);
  const [memoryBefore, setMemoryBefore] = useState<number | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/stats');
        if (res.ok) {
          const data: PythonStatsResponse = await res.json();
          const transformed: ServerStats = {
            memory: {
              rss_mb: data.memory_rss_mb,
              child_mb: data.child_memory_mb,
              total_mb: data.total_memory_mb,
              percent: data.system_memory_percent,
              threshold_percent: data.memory_threshold_percent,
              system_total_gb: data.system_memory_total_gb,
              system_used_gb: data.system_memory_used_gb,
            },
            crawler: {
              running: data.running,
              max_concurrent: data.max_concurrency,
              child_count: data.child_count,
            },
          };
          setStats(transformed);
        }
      } catch {
        // Silently fail - stats are not critical
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (isCrawling && stats?.memory?.rss_mb) {
      setMemoryBefore(stats.memory.rss_mb);
    }
  }, [isCrawling, stats?.memory?.rss_mb]);

  if (!stats?.memory) {
    return (
      <div className="flex items-center justify-center py-2 text-sm text-zinc-400">
        Loading stats...
      </div>
    );
  }

  const { memory, crawler } = stats;
  const memoryMB = Math.round(memory.total_mb);
  const thresholdColor = memory.percent >= 80
    ? 'bg-red-500'
    : memory.percent >= 60
      ? 'bg-amber-500'
      : 'bg-emerald-500';

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

      {/* Last crawl delta */}
      {memoryBefore && stats.last_crawl && (
        <>
          <div className="h-4 w-px bg-zinc-200" />
          <div className="flex items-center gap-2">
            <span className="text-zinc-500">Last crawl:</span>
            <span className="font-medium text-emerald-600">
              +{Math.round(stats.last_crawl.memory_after_mb - stats.last_crawl.memory_before_mb)} MB
            </span>
          </div>
        </>
      )}
    </div>
  );
}
