import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useSettings } from "@/hooks/useSettings";
import { searchPexels, searchPixabay, SearchResult } from "@/lib/search";
import { downloadViaProxy } from "@/lib/download";
import { addDownloadHistoryEntry } from "@/hooks/useDownloadHistory";
import {
  Download,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  Film,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

type QueryLine = {
  id: string;
  query: string;
  count: number;
};

type QueryResult = {
  id: string;
  query: string;
  status: "idle" | "loading" | "done" | "error";
  results: SearchResult[];
  error?: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────

function parseTextarea(raw: string): QueryLine[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((query, i) => ({ id: `qv_${i}_${query.slice(0, 10)}`, query, count: 4 }));
}

function safeSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/(^_|_$)/g, "") || "video";
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function BatchVideoSection() {
  const { settings } = useSettings();

  // Input state
  const [rawText, setRawText] = useState("");
  const [queryLines, setQueryLines] = useState<QueryLine[]>([]);
  const [isParsed, setIsParsed] = useState(false);

  // Search results
  const [results, setResults] = useState<Record<string, QueryResult>>({});
  const [isSearching, setIsSearching] = useState(false);

  // Per-item download state
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [downloadAllProgress, setDownloadAllProgress] = useState<{ done: number; total: number } | null>(null);

  // Track in-flight downloads so they can be cancelled — both when the user
  // hits "Отмена" and automatically on unmount. Without this, leaving the tab
  // mid-download leaves the fetch loop running in the background; it keeps
  // occupying the browser's small per-origin connection pool and starves any
  // new download queue started after remounting (looks like an infinite hang).
  const downloadAllControllerRef = useRef<AbortController | null>(null);
  const singleControllersRef = useRef<Map<string, AbortController>>(new Map());

  useEffect(() => {
    return () => {
      downloadAllControllerRef.current?.abort();
      singleControllersRef.current.forEach((c) => c.abort());
      singleControllersRef.current.clear();
    };
  }, []);

  // ── Parse step ─────────────────────────────────────────────────────────

  const handleParse = () => {
    const lines = parseTextarea(rawText);
    if (!lines.length) return;
    setQueryLines(lines);
    setIsParsed(true);
    setResults({});
  };

  const updateCount = (id: string, count: number) => {
    setQueryLines((prev) =>
      prev.map((q) => (q.id === id ? { ...q, count: Math.max(1, Math.min(50, count)) } : q))
    );
  };

  // ── Search ─────────────────────────────────────────────────────────────

  const runSearch = async () => {
    if (!queryLines.length) return;
    setIsSearching(true);

    const init: Record<string, QueryResult> = {};
    for (const ql of queryLines) {
      init[ql.id] = { id: ql.id, query: ql.query, status: "loading", results: [] };
    }
    setResults(init);

    await Promise.allSettled(
      queryLines.map(async (ql) => {
        try {
          const [pexelsRes, pixabayRes] = await Promise.allSettled([
            settings.pexelsKeySet ? searchPexels(ql.query, ql.count, "video") : Promise.resolve([]),
            settings.pixabayKeySet ? searchPixabay(ql.query, ql.count, "video") : Promise.resolve([]),
          ]);

          const items: SearchResult[] = [];
          if (pexelsRes.status === "fulfilled") items.push(...pexelsRes.value);
          if (pixabayRes.status === "fulfilled") items.push(...pixabayRes.value);

          const firstError =
            pexelsRes.status === "rejected"
              ? pexelsRes.reason?.message
              : pixabayRes.status === "rejected"
              ? pixabayRes.reason?.message
              : undefined;

          setResults((prev) => ({
            ...prev,
            [ql.id]: {
              ...prev[ql.id],
              status: items.length > 0 || !firstError ? "done" : "error",
              results: items,
              error: items.length === 0 ? firstError : undefined,
            },
          }));
        } catch (err: any) {
          setResults((prev) => ({
            ...prev,
            [ql.id]: { ...prev[ql.id], status: "error", error: err?.message || "Search failed" },
          }));
        }
      })
    );

    setIsSearching(false);
  };

  const totalVideos = Object.values(results).reduce((sum, qr) => sum + qr.results.length, 0);
  const hasResults = totalVideos > 0;

  // ── Downloads ──────────────────────────────────────────────────────────

  const downloadOne = async (query: string, item: SearchResult, n: number) => {
    // If a previous controller for this same card is somehow still open
    // (e.g. a stray click), abort it before starting a fresh one.
    singleControllersRef.current.get(item.id)?.abort();
    const controller = new AbortController();
    singleControllersRef.current.set(item.id, controller);

    const filename = `${safeSlug(query)}_${item.source.toLowerCase()}_${n}.mp4`;
    setDownloadingIds((prev) => new Set(prev).add(item.id));
    try {
      await downloadViaProxy(item.downloadUrl, filename, controller.signal);
      addDownloadHistoryEntry({ topic: query, filename, source: item.source, url: item.downloadUrl, status: "success" });
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        console.error("[Batch video download] Failed:", err);
        addDownloadHistoryEntry({
          topic: query,
          filename,
          source: item.source,
          url: item.downloadUrl,
          status: "error",
          error: err?.message || "Download failed",
        });
      }
    } finally {
      singleControllersRef.current.delete(item.id);
      setDownloadingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  const downloadAll = async () => {
    const all: { query: string; item: SearchResult }[] = [];
    for (const ql of queryLines) {
      const qr = results[ql.id];
      if (!qr) continue;
      for (const item of qr.results) all.push({ query: ql.query, item });
    }
    if (all.length === 0) return;

    // Cancel any previous (possibly stuck) run before starting a new one —
    // this is what prevents the "0/68 forever" bug: without this, the old
    // loop's fetches kept competing for the browser's connection pool.
    downloadAllControllerRef.current?.abort();
    const controller = new AbortController();
    downloadAllControllerRef.current = controller;

    setIsDownloadingAll(true);
    setDownloadAllProgress({ done: 0, total: all.length });

    const counters: Record<string, number> = {};
    let done = 0;

    for (const { query, item } of all) {
      if (controller.signal.aborted) break;

      const key = `${query}__${item.source}`;
      counters[key] = (counters[key] || 0) + 1;
      const n = counters[key];
      const filename = `${safeSlug(query)}_${item.source.toLowerCase()}_${n}.mp4`;

      try {
        await downloadViaProxy(item.downloadUrl, filename, controller.signal);
        addDownloadHistoryEntry({ topic: query, filename, source: item.source, url: item.downloadUrl, status: "success" });
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          console.error("[Batch video download-all] Failed for", item.id, err);
          addDownloadHistoryEntry({
            topic: query,
            filename,
            source: item.source,
            url: item.downloadUrl,
            status: "error",
            error: err?.message || "Download failed",
          });
        } else {
          break;
        }
      }

      done += 1;
      setDownloadAllProgress({ done, total: all.length });
      if (controller.signal.aborted) break;
      // small gap between downloads so the browser doesn't treat it as a download flood
      await new Promise((r) => setTimeout(r, 250));
    }

    if (downloadAllControllerRef.current === controller) {
      downloadAllControllerRef.current = null;
    }
    setIsDownloadingAll(false);
    setDownloadAllProgress(null);
  };

  const cancelDownloadAll = () => {
    downloadAllControllerRef.current?.abort();
    downloadAllControllerRef.current = null;
    setIsDownloadingAll(false);
    setDownloadAllProgress(null);
  };

  const missingPexels = !settings.pexelsKeySet;
  const missingPixabay = !settings.pixabayKeySet;

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-300">
      <div>
        <h2 className="text-2xl font-bold mb-1">Batch Video Search</h2>
        <p className="text-muted-foreground text-sm">
          Paste topics (one per line), set video count per topic, then search Pexels + Pixabay simultaneously. All downloads are capped at 1080p.
        </p>
      </div>

      {(missingPexels || missingPixabay) && (
        <div className="space-y-2">
          {missingPexels && (
            <div className="flex items-center gap-2 bg-yellow-950/40 border border-yellow-700/40 rounded-lg px-4 py-2.5 text-sm text-yellow-300">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                Pexels key missing —{" "}
                <button className="underline font-medium hover:text-yellow-100" onClick={() => window.dispatchEvent(new CustomEvent("navigate-to-settings"))}>
                  add in Settings
                </button>
              </span>
            </div>
          )}
          {missingPixabay && (
            <div className="flex items-center gap-2 bg-yellow-950/40 border border-yellow-700/40 rounded-lg px-4 py-2.5 text-sm text-yellow-300">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                Pixabay key missing —{" "}
                <button className="underline font-medium hover:text-yellow-100" onClick={() => window.dispatchEvent(new CustomEvent("navigate-to-settings"))}>
                  add in Settings
                </button>
              </span>
            </div>
          )}
        </div>
      )}

      {/* Step 1 – textarea */}
      {!isParsed && (
        <Card className="p-6 border-[#2a2a2a] bg-[#141414] space-y-4">
          <label className="font-medium text-sm text-[#e85d04] block">
            Video topics — one per line
          </label>
          <Textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder={"Sunset drone footage\nCity traffic timelapse\nOcean waves"}
            className="h-44 font-mono text-sm bg-[#1e1e1e] border-[#2a2a2a] resize-none"
          />
          <Button
            onClick={handleParse}
            disabled={!rawText.trim()}
            className="bg-[#e85d04] hover:bg-[#c84e03] text-white border-none"
          >
            Parse topics →
          </Button>
        </Card>
      )}

      {/* Step 2 – per-query count + run */}
      {isParsed && (
        <Card className="p-6 border-[#2a2a2a] bg-[#141414] space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-medium text-sm text-[#e85d04]">
              {queryLines.length} topic{queryLines.length === 1 ? "" : "s"} — set video count per topic (per source)
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={() => { setIsParsed(false); setResults({}); }}
            >
              ← Edit topics
            </Button>
          </div>

          <div className="space-y-2">
            {queryLines.map((ql) => (
              <div key={ql.id} className="flex items-center gap-3 bg-[#1e1e1e] rounded-lg px-4 py-2.5">
                <span className="flex-1 text-sm font-mono truncate" title={ql.query}>
                  {ql.query}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <label className="text-xs text-muted-foreground whitespace-nowrap">Videos:</label>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={ql.count}
                    onChange={(e) => updateCount(ql.id, parseInt(e.target.value) || 4)}
                    className="w-20 h-8 text-sm text-center bg-[#141414] border-[#2a2a2a]"
                  />
                </div>
              </div>
            ))}
          </div>

          <Button
            onClick={runSearch}
            disabled={isSearching || (!settings.pexelsKeySet && !settings.pixabayKeySet)}
            className="w-full h-11 text-base font-bold bg-[#e85d04] hover:bg-[#c84e03] text-white border-none"
          >
            {isSearching ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Searching…</>
            ) : (
              <><Film className="w-4 h-4 mr-2" /> Search all topics</>
            )}
          </Button>

          {!settings.pexelsKeySet && !settings.pixabayKeySet && (
            <p className="text-xs text-yellow-400 text-center">
              Add a Pexels or Pixabay key in Settings to search for videos
            </p>
          )}
        </Card>
      )}

      {/* Bulk action bar */}
      {hasResults && (
        <div className="sticky top-16 z-40 bg-[#0a0a0a]/95 backdrop-blur border border-[#2a2a2a] rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
          <span className="text-sm text-muted-foreground">
            <span className="text-foreground font-bold">{totalVideos}</span> videos found
          </span>
          <Button
            size="sm"
            className="ml-auto bg-[#e85d04] hover:bg-[#c84e03] text-white border-none gap-1.5"
            onClick={downloadAll}
            disabled={isDownloadingAll}
          >
            {isDownloadingAll ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" />
                {downloadAllProgress ? `${downloadAllProgress.done}/${downloadAllProgress.total}` : "Preparing…"}</>
            ) : (
              <><Download className="w-3.5 h-3.5" /> Скачать всё ({totalVideos})</>
            )}
          </Button>
          {isDownloadingAll && (
            <Button
              size="sm"
              variant="outline"
              className="border-red-800 text-red-400 hover:bg-red-950/40 hover:text-red-300 gap-1.5"
              onClick={cancelDownloadAll}
            >
              <XCircle className="w-3.5 h-3.5" /> Отмена
            </Button>
          )}
        </div>
      )}

      {/* Results per query */}
      {queryLines.map((ql) => {
        const qr = results[ql.id];
        if (!qr) return null;

        return (
          <div key={ql.id} className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                {qr.status === "loading" && <Loader2 className="w-4 h-4 animate-spin text-yellow-400" />}
                {qr.status === "done" && qr.results.length > 0 && <CheckCircle2 className="w-4 h-4 text-green-400" />}
                {qr.status === "done" && qr.results.length === 0 && <XCircle className="w-4 h-4 text-muted-foreground" />}
                {qr.status === "error" && <XCircle className="w-4 h-4 text-red-400" />}
              </div>
              <h3 className="text-base font-bold text-foreground/90 font-mono">{qr.query}</h3>
              {qr.status === "done" && (
                <Badge variant="secondary" className="bg-[#2a2a2a] text-muted-foreground text-xs border-none">
                  {qr.results.length} videos
                </Badge>
              )}
            </div>

            {qr.status === "loading" && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="aspect-video rounded-lg bg-[#141414]" />
                ))}
              </div>
            )}

            {qr.status === "error" && qr.results.length === 0 && (
              <div className="text-sm text-red-400 bg-red-950/30 border border-red-900/40 rounded-lg px-4 py-3">
                {qr.error || "Search failed"}
              </div>
            )}

            {qr.status === "done" && qr.results.length === 0 && (
              <div className="text-sm text-muted-foreground bg-[#141414] border border-[#2a2a2a] rounded-lg px-4 py-3">
                No videos found — try a shorter or different topic
              </div>
            )}

            {qr.results.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {qr.results.map((r, idx) => {
                  const sourceClass =
                    r.source === "Pexels" ? "bg-green-700 text-white" : "bg-blue-700 text-white";
                  const isDownloading = downloadingIds.has(r.id);

                  return (
                    <Card
                      key={r.id}
                      className="overflow-hidden border border-[#2a2a2a] bg-[#141414] hover:bg-[#1e1e1e] transition-colors flex flex-col group"
                    >
                      <div className="relative aspect-video bg-black overflow-hidden">
                        <img
                          src={r.thumbnailUrl}
                          alt={r.title}
                          className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src =
                              "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='225' fill='%23222'%3E%3Crect width='400' height='225'/%3E%3Ctext x='50%25' y='50%25' fill='%23555' font-size='14' text-anchor='middle' dominant-baseline='middle'%3ENo Preview%3C/text%3E%3C/svg%3E";
                          }}
                        />
                        <div className="absolute top-2 left-2">
                          <Badge className={`text-xs font-bold border-none ${sourceClass}`}>{r.source}</Badge>
                        </div>
                        <div className="absolute top-2 right-2">
                          <Badge variant="secondary" className="bg-black/80 text-white border-none font-mono text-xs">
                            {r.qualityBadge}
                          </Badge>
                        </div>
                        {r.metadata?.duration != null && (
                          <div className="absolute bottom-2 right-2 bg-black/80 backdrop-blur px-2 py-0.5 rounded text-xs font-mono text-white">
                            {formatDuration(r.metadata.duration)}
                          </div>
                        )}
                      </div>

                      <div className="p-3 flex flex-col flex-1 gap-2">
                        <h4 className="font-medium line-clamp-2 text-sm text-foreground/90 leading-snug" title={r.title}>
                          {r.title}
                        </h4>

                        <div className="mt-auto flex flex-col gap-1.5">
                          <Button
                            size="sm"
                            className="w-full font-medium bg-[#e85d04] hover:bg-[#c84e03] text-white border-none text-xs h-8"
                            disabled={isDownloading}
                            onClick={() => downloadOne(ql.query, r, idx + 1)}
                          >
                            {isDownloading ? (
                              <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                            ) : (
                              <Download className="w-3 h-3 mr-1.5" />
                            )}
                            {isDownloading ? "Downloading…" : "Скачать"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="w-full text-xs h-7 text-muted-foreground hover:text-foreground"
                            asChild
                          >
                            <a href={r.url} target="_blank" rel="noreferrer">
                              <ExternalLink className="w-3 h-3 mr-1.5" />
                              Open Page
                            </a>
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
