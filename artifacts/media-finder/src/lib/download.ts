export function downloadFile(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * Directly downloads a (possibly cross-origin) file to the user's computer,
 * without opening any browser tab or third-party page.
 * Routes through the server-side /api/proxy/download endpoint (avoids CORS),
 * fetches the bytes as a Blob, then triggers a save via an artificial <a> click.
 *
 * Accepts an optional AbortSignal so callers can cancel an in-flight download —
 * this matters because browsers cap the number of concurrent connections per
 * origin (~6 for HTTP/1.1). A queue of downloads that isn't cancelled when the
 * caller no longer needs it (e.g. component unmounted, or a new run started)
 * will keep occupying those connection slots and starve any later downloads,
 * making them appear to "hang" for minutes.
 */
const DOWNLOAD_TIMEOUT_MS = 30_000;

/**
 * Combines a caller-provided AbortSignal (user cancel) with an internal
 * timeout, so a single upstream request that never responds can't hang the
 * whole queue forever. Without this, one stuck video/image blocks every
 * download after it indefinitely — this is what caused "0/68 for minutes".
 */
function withTimeout(signal: AbortSignal | undefined, timeoutMs: number): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  signal?.addEventListener("abort", onExternalAbort);
  if (signal?.aborted) controller.abort();

  const timer = setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onExternalAbort);
    },
  };
}

export async function downloadViaProxy(
  url: string,
  filename: string,
  signal?: AbortSignal
): Promise<void> {
  const proxyUrl = `/api/proxy/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;
  const { signal: combinedSignal, cleanup } = withTimeout(signal, DOWNLOAD_TIMEOUT_MS);
  try {
    const res = await fetch(proxyUrl, { signal: combinedSignal });
    if (!res.ok) {
      throw new Error(`Download failed (HTTP ${res.status})`);
    }
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch (err: any) {
    if (err?.name === "AbortError" && !signal?.aborted) {
      // Timed out internally (not a user cancel) — surface as a real failure.
      throw new Error("Download timed out");
    }
    throw err;
  } finally {
    cleanup();
  }
}

/**
 * Fetches a URL through the download proxy as a Blob, bounded by the same
 * timeout/cancel semantics as downloadViaProxy. Used by batch photo ZIP
 * downloads so a single stuck image can't stall the whole batch.
 */
export async function fetchViaProxyAsBlob(
  url: string,
  filename: string,
  signal?: AbortSignal
): Promise<{ blob: Blob; contentType: string }> {
  const proxyUrl = `/api/proxy/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;
  const { signal: combinedSignal, cleanup } = withTimeout(signal, DOWNLOAD_TIMEOUT_MS);
  try {
    const res = await fetch(proxyUrl, { signal: combinedSignal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const contentType = res.headers.get("content-type") || "image/jpeg";
    const blob = await res.blob();
    return { blob, contentType };
  } catch (err: any) {
    if (err?.name === "AbortError" && !signal?.aborted) {
      throw new Error("Download timed out");
    }
    throw err;
  } finally {
    cleanup();
  }
}

export function cleanFilename(name: string, ext: string) {
  const clean = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return `${clean}.${ext}`;
}
