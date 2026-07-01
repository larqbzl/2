import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useDownloadHistory, updateDownloadHistoryEntry } from "@/hooks/useDownloadHistory";
import { downloadViaProxy } from "@/lib/download";
import {
  CheckCircle2,
  XCircle,
  Trash2,
  RotateCcw,
  Loader2,
  History as HistoryIcon,
} from "lucide-react";

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function HistoryTab() {
  const { entries, clear } = useDownloadHistory();
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryProgress, setRetryProgress] = useState<{ done: number; total: number } | null>(null);

  const failed = entries.filter((e) => e.status === "error");
  const succeeded = entries.filter((e) => e.status === "success");

  const retryFailed = async () => {
    // Snapshot the currently-failed entries so retrying doesn't chase newly
    // added failures created mid-retry.
    const toRetry = entries.filter((e) => e.status === "error");
    if (toRetry.length === 0) return;

    setIsRetrying(true);
    setRetryProgress({ done: 0, total: toRetry.length });

    let done = 0;
    for (const entry of toRetry) {
      try {
        await downloadViaProxy(entry.url, entry.filename);
        updateDownloadHistoryEntry(entry.id, { status: "success", error: undefined, timestamp: Date.now() });
      } catch (err: any) {
        updateDownloadHistoryEntry(entry.id, {
          status: "error",
          error: err?.message || "Download failed",
          timestamp: Date.now(),
        });
      }
      done += 1;
      setRetryProgress({ done, total: toRetry.length });
    }

    setIsRetrying(false);
    setRetryProgress(null);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold mb-1 flex items-center gap-2">
            <HistoryIcon className="w-5 h-5 text-[#e85d04]" /> Download History
          </h2>
          <p className="text-muted-foreground text-sm">
            Every file downloaded from Search and Batch, with topic, status and time.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {failed.length > 0 && (
            <Button
              size="sm"
              className="bg-[#e85d04] hover:bg-[#c84e03] text-white border-none gap-1.5"
              onClick={retryFailed}
              disabled={isRetrying}
            >
              {isRetrying ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {retryProgress ? `${retryProgress.done}/${retryProgress.total}` : "Preparing…"}</>
              ) : (
                <><RotateCcw className="w-3.5 h-3.5" /> Retry failed ({failed.length})</>
              )}
            </Button>
          )}
          {entries.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="border-[#2a2a2a] text-muted-foreground hover:text-foreground gap-1.5"
              onClick={clear}
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear
            </Button>
          )}
        </div>
      </div>

      {entries.length > 0 && (
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>
            <span className="text-foreground font-bold">{entries.length}</span> total
          </span>
          <span className="flex items-center gap-1 text-green-400">
            <CheckCircle2 className="w-3.5 h-3.5" /> {succeeded.length} success
          </span>
          <span className="flex items-center gap-1 text-red-400">
            <XCircle className="w-3.5 h-3.5" /> {failed.length} failed
          </span>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground border-2 border-dashed border-[#2a2a2a] rounded-lg">
          No downloads yet — files you download from Search or Batch will show up here.
        </div>
      ) : (
        <Card className="border-[#2a2a2a] bg-[#141414] overflow-hidden">
          <div className="divide-y divide-[#2a2a2a]">
            {entries.map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-3 flex-wrap">
                <div className="shrink-0">
                  {e.status === "success" ? (
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground/90 truncate" title={e.filename}>
                    {e.filename}
                  </p>
                  <p className="text-xs text-muted-foreground truncate" title={e.topic}>
                    {e.topic}
                    {e.error ? ` — ${e.error}` : ""}
                  </p>
                </div>
                <Badge variant="secondary" className="bg-[#2a2a2a] text-muted-foreground text-xs border-none shrink-0">
                  {e.source}
                </Badge>
                <span className="text-xs text-muted-foreground shrink-0 font-mono">{formatTime(e.timestamp)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
