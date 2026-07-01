import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useSettings } from "@/hooks/useSettings";
import {
  searchArchive,
  searchPexels,
  searchPixabay,
  searchWikimedia,
  searchSerpApiImages,
  SearchResult,
} from "@/lib/search";
import { downloadFile, downloadViaProxy, cleanFilename } from "@/lib/download";
import { addDownloadHistoryEntry } from "@/hooks/useDownloadHistory";
import {
  Search as SearchIcon,
  Play,
  Download,
  ExternalLink,
  Filter,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";

type SourceStatus = "idle" | "loading" | "done" | "error";
type SourceState = { status: SourceStatus; results: SearchResult[]; error?: string };

const SOURCES = ["Archive.org", "Pexels", "Pixabay", "Wikimedia", "SerpApi"] as const;
type SourceName = (typeof SOURCES)[number];

const SOURCE_LABELS: Record<SourceName, string> = {
  "Archive.org": "📼 ARCHIVE.ORG — Real Commercials & Reviews",
  Pexels: "🎬 PEXELS — Stock Footage & Photos",
  Pixabay: "🖼 PIXABAY — Stock Footage & Photos",
  Wikimedia: "📷 WIKIMEDIA — Press Photos & Documentation",
  SerpApi: "🔍 SERPAPI — Google Images",
};

const SOURCE_BADGE_CLASS: Record<SourceName, string> = {
  "Archive.org": "bg-purple-700 text-white",
  Pexels: "bg-green-700 text-white",
  Pixabay: "bg-blue-700 text-white",
  Wikimedia: "bg-slate-600 text-white",
  SerpApi: "bg-red-700 text-white",
};

const SOURCE_DOT: Record<SourceName, string> = {
  "Archive.org": "bg-purple-500",
  Pexels: "bg-green-500",
  Pixabay: "bg-blue-500",
  Wikimedia: "bg-slate-400",
  SerpApi: "bg-red-500",
};

function emptySourceState(): SourceState {
  return { status: "idle", results: [], error: undefined };
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(0)}MB`;
  return `${(bytes / 1024).toFixed(0)}KB`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function SearchTab() {
  const { settings } = useSettings();

  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [playing, setPlaying] = useState<string | null>(null);
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const singleControllersRef = useRef<Map<string, AbortController>>(new Map());

  useEffect(() => {
    return () => {
      singleControllersRef.current.forEach((c) => c.abort());
      singleControllersRef.current.clear();
    };
  }, []);

  const [sources, setSources] = useState<Record<SourceName, SourceState>>({
    "Archive.org": emptySourceState(),
    Pexels: emptySourceState(),
    Pixabay: emptySourceState(),
    Wikimedia: emptySourceState(),
    SerpApi: emptySourceState(),
  });

  const [hasSearched, setHasSearched] = useState(false);

  const setSourceState = useCallback(
    (name: SourceName, update: Partial<SourceState>) => {
      setSources((prev) => ({ ...prev, [name]: { ...prev[name], ...update } }));
    },
    []
  );

  const getTypeFilter = (): "all" | "video" | "photo" => {
    if (activeFilter === "video" || query.toLowerCase().trimEnd().endsWith(" video")) return "video";
    if (activeFilter === "photo" || query.toLowerCase().trimEnd().endsWith(" photo")) return "photo";
    return "all";
  };

  const runArchive = useCallback(async (q: string) => {
    setSourceState("Archive.org", { status: "loading", results: [], error: undefined });
    try {
      const results = await searchArchive(q, settings.resultsPerSource);
      setSourceState("Archive.org", { status: "done", results });
    } catch (err: any) {
      setSourceState("Archive.org", { status: "error", results: [], error: err?.message || "Request failed" });
    }
  }, [settings.resultsPerSource, setSourceState]);

  const runPexels = useCallback(async (q: string, typeFilter: "all" | "video" | "photo") => {
    if (!settings.pexelsKeySet) {
      setSourceState("Pexels", { status: "done", results: [] });
      return;
    }
    setSourceState("Pexels", { status: "loading", results: [], error: undefined });
    try {
      const results = await searchPexels(q, settings.resultsPerSource, typeFilter);
      setSourceState("Pexels", { status: "done", results });
    } catch (err: any) {
      setSourceState("Pexels", { status: "error", results: [], error: err?.message || "Request failed" });
    }
  }, [settings.pexelsKeySet, settings.resultsPerSource, setSourceState]);

  const runPixabay = useCallback(async (q: string, typeFilter: "all" | "video" | "photo") => {
    if (!settings.pixabayKeySet) {
      setSourceState("Pixabay", { status: "done", results: [] });
      return;
    }
    setSourceState("Pixabay", { status: "loading", results: [], error: undefined });
    try {
      const results = await searchPixabay(q, settings.resultsPerSource, typeFilter);
      setSourceState("Pixabay", { status: "done", results });
    } catch (err: any) {
      setSourceState("Pixabay", { status: "error", results: [], error: err?.message || "Request failed" });
    }
  }, [settings.pixabayKeySet, settings.resultsPerSource, setSourceState]);

  const runWikimedia = useCallback(async (q: string) => {
    setSourceState("Wikimedia", { status: "loading", results: [], error: undefined });
    try {
      const results = await searchWikimedia(q, settings.resultsPerSource);
      setSourceState("Wikimedia", { status: "done", results });
    } catch (err: any) {
      setSourceState("Wikimedia", { status: "error", results: [], error: err?.message || "Request failed" });
    }
  }, [settings.resultsPerSource, setSourceState]);

  const runSerpApi = useCallback(async (q: string) => {
    if (!settings.serpApiKeySet) {
      setSourceState("SerpApi", { status: "done", results: [] });
      return;
    }
    setSourceState("SerpApi", { status: "loading", results: [], error: undefined });
    try {
      const count = Math.max(10, settings.resultsPerSource * 4);
      const results = await searchSerpApiImages(q, count);
      setSourceState("SerpApi", { status: "done", results });
    } catch (err: any) {
      setSourceState("SerpApi", { status: "error", results: [], error: err?.message || "Request failed" });
    }
  }, [settings.serpApiKeySet, settings.resultsPerSource, setSourceState]);

  const performSearch = useCallback(async (overrideQuery?: string) => {
    const q = (overrideQuery ?? query).trim();
    if (!q) return;

    setPlaying(null);
    setHasSearched(true);

    const typeFilter = getTypeFilter();

    const promises: Promise<void>[] = [];

    if (typeFilter !== "photo") {
      promises.push(runArchive(q));
    } else {
      setSourceState("Archive.org", { status: "done", results: [] });
    }

    promises.push(runPexels(q, typeFilter));
    promises.push(runPixabay(q, typeFilter));

    if (typeFilter !== "video") {
      promises.push(runWikimedia(q));
      promises.push(runSerpApi(q));
    } else {
      setSourceState("Wikimedia", { status: "done", results: [] });
      setSourceState("SerpApi", { status: "done", results: [] });
    }

    await Promise.allSettled(promises);
  }, [query, runArchive, runPexels, runPixabay, runWikimedia, runSerpApi, setSourceState]);

  const retrySource = (name: SourceName) => {
    const q = query.trim();
    const typeFilter = getTypeFilter();
    if (name === "Archive.org") runArchive(q);
    else if (name === "Pexels") runPexels(q, typeFilter);
    else if (name === "Pixabay") runPixabay(q, typeFilter);
    else if (name === "Wikimedia") runWikimedia(q);
    else if (name === "SerpApi") runSerpApi(q);
  };

  const isAnyLoading = SOURCES.some((s) => sources[s].status === "loading");
  const totalResults = SOURCES.reduce((acc, s) => acc + sources[s].results.length, 0);
  const activeSourceCount = SOURCES.filter((s) => sources[s].results.length > 0).length;

  const renderStatusIcon = (status: SourceStatus, count: number) => {
    if (status === "loading") return <Loader2 className="w-4 h-4 animate-spin text-yellow-400" />;
    if (status === "error") return <XCircle className="w-4 h-4 text-red-400" />;
    if (status === "done" && count > 0) return <CheckCircle2 className="w-4 h-4 text-green-400" />;
    if (status === "done" && count === 0) return <XCircle className="w-4 h-4 text-muted-foreground" />;
    return null;
  };

  const renderCard = (r: SearchResult) => {
    const isArchive = r.source === "Archive.org";
    const sizeMB = r.metadata?.size ? formatBytes(r.metadata.size) : null;
    const isLarge = r.metadata?.largeFile;

    return (
      <Card
        key={r.id}
        className="overflow-hidden border border-[#2a2a2a] bg-[#141414] hover:bg-[#1e1e1e] transition-colors flex flex-col group animate-in fade-in duration-300"
      >
        <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
          {playing === r.id ? (
            <video src={r.downloadUrl} controls autoPlay className="w-full h-full object-contain" />
          ) : (
            <>
              <img
                src={r.thumbnailUrl}
                alt={r.title}
                className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='225' fill='%23222'%3E%3Crect width='400' height='225'/%3E%3Ctext x='50%25' y='50%25' fill='%23555' font-size='14' text-anchor='middle' dominant-baseline='middle'%3ENo Preview%3C/text%3E%3C/svg%3E";
                }}
              />
              <div className="absolute top-2 left-2 flex gap-1 flex-wrap">
                <Badge className={`text-xs font-bold border-none ${SOURCE_BADGE_CLASS[r.source]}`}>
                  {r.source}
                </Badge>
              </div>
              <div className="absolute top-2 right-2 flex gap-1 flex-wrap justify-end">
                <Badge variant="secondary" className="bg-black/80 text-white border-none font-mono text-xs">
                  {r.qualityBadge}
                </Badge>
                {isLarge && (
                  <Badge className="bg-yellow-600 text-black border-none text-xs font-bold">Large file</Badge>
                )}
              </div>
              {r.metadata?.duration != null && (
                <div className="absolute bottom-2 right-2 bg-black/80 backdrop-blur px-2 py-0.5 rounded text-xs font-mono text-white">
                  {formatDuration(r.metadata.duration)}
                </div>
              )}
              {r.type === "video" && r.downloadUrl && (
                <button
                  onClick={() => setPlaying(r.id)}
                  className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-colors"
                >
                  <div className="w-12 h-12 rounded-full bg-[#e85d04]/90 flex items-center justify-center text-white shadow-lg">
                    <Play className="w-6 h-6 ml-1" />
                  </div>
                </button>
              )}
            </>
          )}
        </div>

        <div className="p-4 flex flex-col flex-1 gap-3">
          <div>
            <h4 className="font-medium line-clamp-2 text-sm text-foreground/90 leading-snug" title={r.title}>
              {r.title}
            </h4>
            {isArchive && r.metadata?.year && (
              <p className="text-xl font-bold text-[#e85d04] mt-1">{r.metadata.year}</p>
            )}
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-xs text-muted-foreground">
              {r.metadata?.displayUrl ? (
                <span className="truncate">{r.metadata.displayUrl}</span>
              ) : r.metadata?.author ? (
                <span className="truncate">by {r.metadata.author}</span>
              ) : null}
              {sizeMB && <span className={isLarge ? "text-yellow-400 font-medium" : ""}>{sizeMB}</span>}
              {isArchive && r.metadata?.format && <span className="uppercase font-mono">.{r.metadata.format}</span>}
              {isArchive && r.metadata?.downloads != null && (
                <span>{Number(r.metadata.downloads).toLocaleString()} downloads</span>
              )}
              {r.metadata?.license && <span className="text-slate-400">{r.metadata.license}</span>}
            </div>
          </div>

          <div className="mt-auto flex flex-col gap-1.5">
            {r.type === "video" && r.downloadUrl && (
              <Button
                size="sm"
                variant="outline"
                className="w-full text-xs h-8 border-[#2a2a2a]"
                onClick={() => setPlaying(playing === r.id ? null : r.id)}
              >
                <Play className="w-3 h-3 mr-1.5" />
                {playing === r.id ? "Hide Preview" : "Preview"}
              </Button>
            )}
            {r.downloadUrl && (
              <Button
                size="sm"
                className="w-full font-medium bg-[#e85d04] hover:bg-[#c84e03] text-white border-none"
                disabled={downloadingIds.has(r.id)}
                onClick={async () => {
                  if (isArchive) {
                    window.open(r.url, "_blank");
                    addDownloadHistoryEntry({ topic: query || "Search", filename: r.title, source: r.source, url: r.downloadUrl, status: "success" });
                  } else if (r.source === "SerpApi") {
                    const fn = cleanFilename(r.title, "jpg");
                    const proxyUrl = `/api/proxy/download?url=${encodeURIComponent(r.downloadUrl)}&filename=${encodeURIComponent(fn)}`;
                    downloadFile(proxyUrl, fn);
                    addDownloadHistoryEntry({ topic: query || "Search", filename: fn, source: r.source, url: r.downloadUrl, status: "success" });
                  } else if (r.type === "video") {
                    singleControllersRef.current.get(r.id)?.abort();
                    const controller = new AbortController();
                    singleControllersRef.current.set(r.id, controller);
                    setDownloadingIds((prev) => new Set(prev).add(r.id));
                    const fn = cleanFilename(r.title, "mp4");
                    try {
                      await downloadViaProxy(r.downloadUrl, fn, controller.signal);
                      addDownloadHistoryEntry({ topic: query || "Search", filename: fn, source: r.source, url: r.downloadUrl, status: "success" });
                    } catch (err: any) {
                      if (err?.name !== "AbortError") {
                        console.error("[Video download] Failed:", err);
                        addDownloadHistoryEntry({
                          topic: query || "Search",
                          filename: fn,
                          source: r.source,
                          url: r.downloadUrl,
                          status: "error",
                          error: err?.message || "Download failed",
                        });
                      }
                    } finally {
                      singleControllersRef.current.delete(r.id);
                      setDownloadingIds((prev) => {
                        const next = new Set(prev);
                        next.delete(r.id);
                        return next;
                      });
                    }
                  } else {
                    const fn = cleanFilename(r.title, "jpg");
                    downloadFile(r.downloadUrl, fn);
                    addDownloadHistoryEntry({ topic: query || "Search", filename: fn, source: r.source, url: r.downloadUrl, status: "success" });
                  }
                }}
              >
                {downloadingIds.has(r.id) ? (
                  <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                ) : (
                  <Download className="w-3 h-3 mr-1.5" />
                )}
                {isArchive
                  ? "Download"
                  : r.type === "video"
                  ? downloadingIds.has(r.id) ? "Downloading…" : "Download 1080p"
                  : "Download Full Size"}
              </Button>
            )}
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
  };

  const missingPexels = !settings.pexelsKeySet;
  const missingPixabay = !settings.pixabayKeySet;
  const missingSerpApi = !settings.serpApiKeySet;

  return (
    <div className="space-y-4 animate-in fade-in duration-300">

      {/* Missing key banners */}
      {(missingPexels || missingPixabay || missingSerpApi) && (
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
          {missingSerpApi && (
            <div className="flex items-center gap-2 bg-yellow-950/40 border border-yellow-700/40 rounded-lg px-4 py-2.5 text-sm text-yellow-300">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                SerpApi key missing —{" "}
                <button className="underline font-medium hover:text-yellow-100" onClick={() => window.dispatchEvent(new CustomEvent("navigate-to-settings"))}>
                  add in Settings
                </button>{" "}
                for Google Images results (free: 100/mo, no card)
              </span>
            </div>
          )}
        </div>
      )}

      {/* Search bar + filters */}
      <div className="sticky top-16 z-40 bg-[#0a0a0a]/95 backdrop-blur py-4 -mx-4 px-4 border-b border-[#2a2a2a] space-y-3">
        <div className="flex gap-2 max-w-4xl mx-auto">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") performSearch(); }}
              placeholder="Search archival footage, commercials, stock media..."
              className="pl-10 h-12 bg-[#141414] border-[#2a2a2a] text-base"
            />
          </div>
          <Button
            onClick={() => performSearch()}
            className="h-12 px-8 text-base font-bold bg-[#e85d04] hover:bg-[#c84e03] text-white"
            disabled={isAnyLoading || !query.trim()}
          >
            {isAnyLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Search"}
          </Button>
        </div>

        <div className="flex gap-2 max-w-4xl mx-auto overflow-x-auto pb-1">
          <Filter className="w-4 h-4 text-muted-foreground mr-1 shrink-0 self-center" />
          {["all", "video", "photo"].map((f) => (
            <Button
              key={f}
              variant={activeFilter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveFilter(f)}
              className={`rounded-full shrink-0 ${
                activeFilter === f
                  ? "bg-[#e85d04] hover:bg-[#c84e03] border-none text-white"
                  : "border-[#2a2a2a] text-muted-foreground hover:text-foreground"
              }`}
            >
              {f === "all" ? "All" : f === "video" ? "Video only" : "Photo only"}
            </Button>
          ))}
        </div>
      </div>

      {/* Per-source status bar */}
      {hasSearched && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 py-2">
          {SOURCES.map((name) => {
            const s = sources[name];
            return (
              <div key={name} className="flex items-center gap-2 bg-[#141414] border border-[#2a2a2a] rounded-lg px-3 py-2 text-xs">
                <div className={`w-2 h-2 rounded-full shrink-0 ${SOURCE_DOT[name]}`} />
                <span className="font-medium text-foreground/80 truncate">{name}</span>
                {renderStatusIcon(s.status, s.results.length)}
                <span className="ml-auto text-muted-foreground shrink-0">
                  {s.status === "loading" ? "..." : s.status === "error" ? "Err" : `${s.results.length}`}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Total counter */}
      {hasSearched && !isAnyLoading && totalResults > 0 && (
        <p className="text-center text-sm font-medium text-muted-foreground">
          Found <span className="text-foreground font-bold">{totalResults}</span> results across{" "}
          <span className="text-foreground font-bold">{activeSourceCount}</span>{" "}
          {activeSourceCount === 1 ? "source" : "sources"}
        </p>
      )}

      {/* Results by source */}
      <div className="space-y-12">
        {SOURCES.map((name) => {
          const s = sources[name];
          if (!hasSearched) return null;

          const missingKey =
            (name === "Pexels" && missingPexels) ||
            (name === "Pixabay" && missingPixabay) ||
            (name === "SerpApi" && missingSerpApi);

          return (
            <div key={name} className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full shrink-0 ${SOURCE_DOT[name]}`} />
                <h3 className="text-lg font-bold tracking-tight text-foreground/90">{SOURCE_LABELS[name]}</h3>
                {s.status === "error" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-auto border-[#2a2a2a] text-xs h-7"
                    onClick={() => retrySource(name)}
                  >
                    <RotateCcw className="w-3 h-3 mr-1" /> Retry
                  </Button>
                )}
              </div>

              {s.status === "loading" && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-72 w-full bg-[#141414] rounded-xl" />)}
                </div>
              )}

              {s.status === "error" && (
                <div className="flex items-center gap-2 text-sm text-red-400 bg-red-950/30 border border-red-900/40 rounded-lg px-4 py-3">
                  <XCircle className="w-4 h-4 shrink-0" />
                  <span>{s.error || "Request failed"}</span>
                </div>
              )}

              {s.status === "done" && s.results.length === 0 && (
                <div className="text-sm text-muted-foreground bg-[#141414] border border-[#2a2a2a] rounded-lg px-4 py-3">
                  {missingKey
                    ? `${name} key not set — add it in Settings`
                    : name === "Archive.org"
                    ? 'No Archive.org results. Try shorter keywords — e.g. "Toyota Camry commercial"'
                    : "No results — try simpler keywords"}
                </div>
              )}

              {s.results.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {s.results.map(renderCard)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Empty initial state */}
      {!hasSearched && (
        <div className="flex flex-col items-center justify-center py-24 text-center gap-4 text-muted-foreground">
          <SearchIcon className="w-16 h-16 opacity-20" />
          <p className="text-lg font-medium">Search for car commercials, reviews, and press photos</p>
          <p className="text-sm max-w-sm">
            Searches Archive.org, Pexels, Pixabay, Wikimedia, and Google Images (via SerpApi) simultaneously.
            Add keys in{" "}
            <button
              className="text-[#e85d04] underline hover:text-[#e85d04]/80"
              onClick={() => window.dispatchEvent(new CustomEvent("navigate-to-settings"))}
            >
              Settings
            </button>.
          </p>
        </div>
      )}
    </div>
  );
}
