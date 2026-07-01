import { useState, useId } from "react";
import JSZip from "jszip";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useSettings } from "@/hooks/useSettings";
import { searchSerpApiImages, SearchResult } from "@/lib/search";
import { cleanFilename } from "@/lib/download";
import { addDownloadHistoryEntry } from "@/hooks/useDownloadHistory";
import {
  Play,
  Download,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Loader2,
  Archive,
  Square,
  CheckSquare,
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
    .map((query, i) => ({ id: `q_${i}_${query.slice(0, 10)}`, query, count: 5 }));
}

function proxyDownloadUrl(originalUrl: string, filename: string): string {
  return `/api/proxy/download?url=${encodeURIComponent(originalUrl)}&filename=${encodeURIComponent(filename)}`;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function BatchPhotoSection() {
  const { settings } = useSettings();
  const uid = useId();

  // Input state
  const [rawText, setRawText] = useState("");
  const [queryLines, setQueryLines] = useState<QueryLine[]>([]);
  const [isParsed, setIsParsed] = useState(false);

  // Search results
  const [results, setResults] = useState<Record<string, QueryResult>>({});
  const [isSearching, setIsSearching] = useState(false);

  // Selection state: Set of result IDs
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isZipping, setIsZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState<{ done: number; total: number } | null>(null);

  // ── Parse step ─────────────────────────────────────────────────────────

  const handleParse = () => {
    const lines = parseTextarea(rawText);
    if (!lines.length) return;
    setQueryLines(lines);
    setIsParsed(true);
    setResults({});
    setSelected(new Set());
  };

  const updateCount = (id: string, count: number) => {
    setQueryLines((prev) =>
      prev.map((q) => (q.id === id ? { ...q, count: Math.max(1, Math.min(400, count)) } : q))
    );
  };

  // ── Search ─────────────────────────────────────────────────────────────

  const runSearch = async () => {
    if (!queryLines.length) return;
    setIsSearching(true);
    setSelected(new Set());

    // Initialize all as loading
    const init: Record<string, QueryResult> = {};
    for (const ql of queryLines) {
      init[ql.id] = { id: ql.id, query: ql.query, status: "loading", results: [] };
    }
    setResults(init);

    // Run all queries in parallel
    await Promise.allSettled(
      queryLines.map(async (ql) => {
        try {
          const items = await searchSerpApiImages(ql.query, ql.count);
          setResults((prev) => ({
            ...prev,
            [ql.id]: { ...prev[ql.id], status: "done", results: items },
          }));
        } catch (err: any) {
          setResults((prev) => ({
            ...prev,
            [ql.id]: {
              ...prev[ql.id],
              status: "error",
              error: err?.message || "Search failed",
            },
          }));
        }
      })
    );

    setIsSearching(false);
  };

  // ── Selection helpers ──────────────────────────────────────────────────

  const toggleItem = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllForQuery = (queryId: string) => {
    const qr = results[queryId];
    if (!qr) return;
    const ids = qr.results.map((r) => r.id);
    const allSelected = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        ids.forEach((id) => next.delete(id));
      } else {
        ids.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const selectAllGlobal = () => {
    const allIds = Object.values(results).flatMap((qr) => qr.results.map((r) => r.id));
    const allSelected = allIds.every((id) => selected.has(id));
    setSelected(allSelected ? new Set() : new Set(allIds));
  };

  const totalSelected = selected.size;
  const totalImages = Object.values(results).reduce((sum, qr) => sum + qr.results.length, 0);

  // ── ZIP download ───────────────────────────────────────────────────────

  /** Map Content-Type → file extension */
  function ctToExt(contentType: string): string {
    if (/webp/i.test(contentType)) return "webp";
    if (/png/i.test(contentType)) return "png";
    if (/gif/i.test(contentType)) return "gif";
    if (/svg/i.test(contentType)) return "svg";
    return "jpg"; // covers image/jpeg, image/jpg, fallback
  }

  const downloadSelected = async () => {
    if (selected.size === 0) return;
    setIsZipping(true);
    setZipProgress({ done: 0, total: selected.size });

    const zip = new JSZip();
    let done = 0;

    // Process block by block so numbering resets per query
    for (const qr of queryLines.map((ql) => results[ql.id]).filter(Boolean)) {
      const selectedInBlock = qr.results.filter((r) => selected.has(r.id));
      if (selectedInBlock.length === 0) continue;

      // Fetch in parallel but with pre-assigned sequential index (n)
      await Promise.allSettled(
        selectedInBlock.map(async (result, blockIdx) => {
          const n = blockIdx + 1; // per-block counter, resets to 1 for every query
          const tempUrl = proxyDownloadUrl(result.downloadUrl, `temp.jpg`);

          try {
            const upstream = await fetch(tempUrl);
            if (!upstream.ok) throw new Error(`HTTP ${upstream.status}`);

            // Get actual format from response Content-Type
            const ct = upstream.headers.get("content-type") || "image/jpeg";
            const ext = ctToExt(ct);
            const filename = `${qr.query} ${n}.${ext}`; // e.g. "Худи адидас 1.jpg"

            const blob = await upstream.blob();
            // JSZip handles UTF-8 filenames natively (sets the UTF-8 flag in ZIP)
            zip.file(filename, blob);
            addDownloadHistoryEntry({
              topic: qr.query,
              filename,
              source: result.source,
              url: result.downloadUrl,
              status: "success",
            });
          } catch (err: any) {
            // skip failed images silently — don't block the rest of the zip
            addDownloadHistoryEntry({
              topic: qr.query,
              filename: `${qr.query} ${n}.jpg`,
              source: result.source,
              url: result.downloadUrl,
              status: "error",
              error: err?.message || "Download failed",
            });
          } finally {
            done += 1;
            setZipProgress({ done, total: selected.size });
          }
        })
      );
    }

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `media-finder-batch-${Date.now()}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setIsZipping(false);
    setZipProgress(null);
  };

  // ── Render ─────────────────────────────────────────────────────────────

  const hasResults = Object.values(results).some((qr) => qr.results.length > 0);

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-300">
      <div>
        <h2 className="text-2xl font-bold mb-1">Batch Search</h2>
        <p className="text-muted-foreground text-sm">
          Paste queries (one per line), set image count per query, then search via Google Images.
        </p>
      </div>

      {/* Step 1 – textarea */}
      {!isParsed && (
        <Card className="p-6 border-[#2a2a2a] bg-[#141414] space-y-4">
          <label className="font-medium text-sm text-[#e85d04] block">
            Search queries — one per line
          </label>
          <Textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder={"Protocol Index hoodie\nNike Air Max 95 black\nAdidas Yeezy 700"}
            className="h-44 font-mono text-sm bg-[#1e1e1e] border-[#2a2a2a] resize-none"
          />
          <Button
            onClick={handleParse}
            disabled={!rawText.trim()}
            className="bg-[#e85d04] hover:bg-[#c84e03] text-white border-none"
          >
            Parse queries →
          </Button>
        </Card>
      )}

      {/* Step 2 – per-query count + run */}
      {isParsed && (
        <Card className="p-6 border-[#2a2a2a] bg-[#141414] space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-medium text-sm text-[#e85d04]">
              {queryLines.length} quer{queryLines.length === 1 ? "y" : "ies"} — set image count per query
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={() => { setIsParsed(false); setResults({}); setSelected(new Set()); }}
            >
              ← Edit queries
            </Button>
          </div>

          <div className="space-y-2">
            {queryLines.map((ql) => (
              <div key={ql.id} className="flex items-center gap-3 bg-[#1e1e1e] rounded-lg px-4 py-2.5">
                <span className="flex-1 text-sm font-mono truncate" title={ql.query}>
                  {ql.query}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <label className="text-xs text-muted-foreground whitespace-nowrap">Images:</label>
                  <Input
                    type="number"
                    min={1}
                    max={400}
                    value={ql.count}
                    onChange={(e) => updateCount(ql.id, parseInt(e.target.value) || 20)}
                    className="w-20 h-8 text-sm text-center bg-[#141414] border-[#2a2a2a]"
                  />
                </div>
              </div>
            ))}
          </div>

          <Button
            onClick={runSearch}
            disabled={isSearching || !settings.serpApiKeySet}
            className="w-full h-11 text-base font-bold bg-[#e85d04] hover:bg-[#c84e03] text-white border-none"
          >
            {isSearching ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Searching…</>
            ) : (
              <><Play className="w-4 h-4 mr-2" /> Search all queries</>
            )}
          </Button>

          {!settings.serpApiKeySet && (
            <p className="text-xs text-yellow-400 text-center">
              SerpApi key not set — add it in Settings to search Google Images
            </p>
          )}
        </Card>
      )}

      {/* Bulk action bar */}
      {hasResults && (
        <div className="sticky top-16 z-40 bg-[#0a0a0a]/95 backdrop-blur border border-[#2a2a2a] rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            className="border-[#2a2a2a] text-xs gap-1.5"
            onClick={selectAllGlobal}
          >
            {totalSelected === totalImages && totalImages > 0
              ? <><CheckSquare className="w-3.5 h-3.5" /> Deselect all</>
              : <><Square className="w-3.5 h-3.5" /> Select all ({totalImages})</>
            }
          </Button>

          {totalSelected > 0 && (
            <>
              <span className="text-sm text-muted-foreground">
                <span className="text-foreground font-bold">{totalSelected}</span> selected
              </span>
              <Button
                size="sm"
                className="ml-auto bg-[#e85d04] hover:bg-[#c84e03] text-white border-none gap-1.5"
                onClick={downloadSelected}
                disabled={isZipping}
              >
                {isZipping ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" />
                    {zipProgress ? `${zipProgress.done}/${zipProgress.total}` : "Preparing…"}</>
                ) : (
                  <><Archive className="w-3.5 h-3.5" /> Download selected ({totalSelected}) as ZIP</>
                )}
              </Button>
            </>
          )}
        </div>
      )}

      {/* Results per query */}
      {queryLines.map((ql) => {
        const qr = results[ql.id];
        if (!qr) return null;

        const ids = qr.results.map((r) => r.id);
        const allBlockSelected = ids.length > 0 && ids.every((id) => selected.has(id));
        const someBlockSelected = ids.some((id) => selected.has(id));

        return (
          <div key={ql.id} className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Block header */}
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
                  {qr.results.length} images
                </Badge>
              )}
              {ids.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto text-xs h-7 border border-[#2a2a2a] text-muted-foreground hover:text-foreground gap-1"
                  onClick={() => selectAllForQuery(ql.id)}
                >
                  {allBlockSelected
                    ? <><CheckSquare className="w-3 h-3" /> Deselect block</>
                    : <><Square className="w-3 h-3" /> Select block ({ids.length})</>
                  }
                </Button>
              )}
            </div>

            {qr.status === "loading" && (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="aspect-square rounded-lg bg-[#141414]" />
                ))}
              </div>
            )}

            {qr.status === "error" && (
              <div className="text-sm text-red-400 bg-red-950/30 border border-red-900/40 rounded-lg px-4 py-3">
                {qr.error}
              </div>
            )}

            {qr.status === "done" && qr.results.length === 0 && (
              <div className="text-sm text-muted-foreground bg-[#141414] border border-[#2a2a2a] rounded-lg px-4 py-3">
                No results — try a shorter or different query
              </div>
            )}

            {qr.results.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {qr.results.map((r) => {
                  const isChecked = selected.has(r.id);
                  const ext = r.downloadUrl.match(/\.(jpe?g|png|gif|webp|svg)/i)?.[1] || "jpg";
                  const filename = cleanFilename(`${qr.query}-${r.title}`, ext);
                  const proxyUrl = proxyDownloadUrl(r.downloadUrl, filename);

                  return (
                    <div
                      key={r.id}
                      className={`relative group rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${
                        isChecked
                          ? "border-[#e85d04] shadow-lg shadow-[#e85d04]/20"
                          : "border-transparent hover:border-[#2a2a2a]"
                      }`}
                      onClick={() => toggleItem(r.id)}
                    >
                      {/* Thumbnail */}
                      <div className="aspect-square bg-[#141414] overflow-hidden">
                        <img
                          src={r.thumbnailUrl}
                          alt={r.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src =
                              "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200' fill='%23222'%3E%3Crect width='200' height='200'/%3E%3Ctext x='50%25' y='50%25' fill='%23555' font-size='11' text-anchor='middle' dominant-baseline='middle'%3ENo Preview%3C/text%3E%3C/svg%3E";
                          }}
                        />
                      </div>

                      {/* Checkbox overlay */}
                      <div className={`absolute top-2 left-2 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                        isChecked
                          ? "bg-[#e85d04] border-[#e85d04]"
                          : "bg-black/60 border-white/40 group-hover:border-white/80"
                      }`}>
                        {isChecked && (
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12">
                            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>

                      {/* Dim overlay when checked */}
                      {isChecked && (
                        <div className="absolute inset-0 bg-[#e85d04]/10 pointer-events-none" />
                      )}

                      {/* Info overlay at bottom */}
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-2 translate-y-full group-hover:translate-y-0 transition-transform duration-200">
                        <p className="text-xs text-white truncate">{r.title}</p>
                        {r.metadata?.displayUrl && (
                          <p className="text-xs text-white/60 truncate">{r.metadata.displayUrl}</p>
                        )}
                        <div className="flex gap-1 mt-1.5">
                          <a
                            href={proxyUrl}
                            download={filename}
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-1 bg-[#e85d04] text-white text-xs px-2 py-0.5 rounded font-medium hover:bg-[#c84e03]"
                          >
                            <Download className="w-2.5 h-2.5" /> Save
                          </a>
                          <a
                            href={r.url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-1 bg-white/10 text-white text-xs px-2 py-0.5 rounded hover:bg-white/20"
                          >
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        </div>
                      </div>

                      {/* Dim for unselected when others are selected */}
                      {someBlockSelected && !isChecked && (
                        <div className="absolute inset-0 bg-black/30 pointer-events-none" />
                      )}
                    </div>
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
