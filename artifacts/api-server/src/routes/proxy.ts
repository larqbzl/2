import { Router, type IRouter } from "express";
import path from "path";
import fs from "fs";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ── Key storage ────────────────────────────────────────────────────────────
const workspaceRoot = process.cwd().endsWith(path.join("artifacts", "api-server"))
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();

const dataDir = path.resolve(workspaceRoot, "artifacts/api-server/data");
const keysFile = path.resolve(dataDir, "api-keys.json");

type KeyStore = {
  pexelsKey?: string;
  pixabayKey?: string;
  serpApiKey?: string;
  // Google Custom Search — kept inactive as reserve
  googleApiKey?: string;
  googleCx?: string;
};

function loadKeys(): KeyStore {
  try {
    if (fs.existsSync(keysFile)) {
      return JSON.parse(fs.readFileSync(keysFile, "utf8"));
    }
  } catch (err) {
    logger.warn({ err }, "Failed to read api-keys.json, using env fallback");
  }
  return {
    pexelsKey: process.env["PEXELS_KEY"] ?? "",
    pixabayKey: process.env["PIXABAY_KEY"] ?? "",
    serpApiKey: process.env["SERPAPI_KEY"] ?? "",
  };
}

function saveKeys(store: KeyStore): void {
  try {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(keysFile, JSON.stringify(store, null, 2));
  } catch (err) {
    logger.error({ err }, "Failed to write api-keys.json");
  }
}

/**
 * Safe fetch wrapper — reads the response as text first, then tries JSON.
 * Prevents crashes when upstream returns plain-text errors.
 */
async function safeFetch(
  url: string,
  options?: RequestInit
): Promise<{ ok: boolean; status: number; data: any }> {
  const res = await fetch(url, options);
  const text = await res.text();
  logger.debug({ status: res.status, url, body: text.slice(0, 200) }, "upstream response");

  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: text.trim() };
  }

  return { ok: res.ok, status: res.status, data };
}

// ── GET /keys ──────────────────────────────────────────────────────────────
router.get("/keys", async (_req, res): Promise<void> => {
  const store = loadKeys();
  res.json({
    pexelsSet: Boolean(store.pexelsKey),
    pixabaySet: Boolean(store.pixabayKey),
    serpApiSet: Boolean(store.serpApiKey),
  });
});

// ── POST /keys ─────────────────────────────────────────────────────────────
router.post("/keys", async (req, res): Promise<void> => {
  const { pexelsKey, pixabayKey, serpApiKey } = req.body as {
    pexelsKey?: string;
    pixabayKey?: string;
    serpApiKey?: string;
  };

  const current = loadKeys();

  if (typeof pexelsKey === "string" && pexelsKey.trim()) current.pexelsKey = pexelsKey.trim();
  if (typeof pixabayKey === "string" && pixabayKey.trim()) current.pixabayKey = pixabayKey.trim();
  if (typeof serpApiKey === "string" && serpApiKey.trim()) current.serpApiKey = serpApiKey.trim();

  saveKeys(current);
  req.log.info("API keys updated");

  res.json({
    pexelsSet: Boolean(current.pexelsKey),
    pixabaySet: Boolean(current.pixabayKey),
    serpApiSet: Boolean(current.serpApiKey),
  });
});

// ── DELETE /keys ───────────────────────────────────────────────────────────
router.delete("/keys", async (req, res): Promise<void> => {
  const { which } = req.query as { which?: string };
  const current = loadKeys();

  if (which === "pexels") current.pexelsKey = "";
  if (which === "pixabay") current.pixabayKey = "";
  if (which === "serpapi") current.serpApiKey = "";

  saveKeys(current);
  res.json({
    pexelsSet: Boolean(current.pexelsKey),
    pixabaySet: Boolean(current.pixabayKey),
    serpApiSet: Boolean(current.serpApiKey),
  });
});

// ── GET /proxy/pexels ──────────────────────────────────────────────────────
router.get("/proxy/pexels", async (req, res): Promise<void> => {
  const store = loadKeys();
  const apiKey = store.pexelsKey;

  if (!apiKey) {
    res.status(400).json({ error: "Pexels API key not configured. Add it in Settings." });
    return;
  }

  const { q = "", type = "videos", per_page = "15", min_width, min_height } =
    req.query as Record<string, string>;

  let upstream: string;
  if (type === "photos") {
    const params = new URLSearchParams({ query: q, per_page });
    upstream = `https://api.pexels.com/v1/search?${params}`;
  } else {
    const params = new URLSearchParams({ query: q, per_page });
    if (min_width) params.set("min_width", min_width);
    if (min_height) params.set("min_height", min_height);
    upstream = `https://api.pexels.com/videos/search?${params}`;
  }

  req.log.info({ type, q }, "Proxying Pexels request");

  const { ok, status, data } = await safeFetch(upstream, { headers: { Authorization: apiKey } });

  if (!ok) {
    req.log.warn({ status }, "Pexels upstream error");
    res.status(status).json(data);
    return;
  }

  res.json(data);
});

// ── GET /proxy/pixabay ─────────────────────────────────────────────────────
router.get("/proxy/pixabay", async (req, res): Promise<void> => {
  const store = loadKeys();
  const apiKey = store.pixabayKey;

  if (!apiKey) {
    res.status(400).json({ error: "Pixabay API key not configured. Add it in Settings." });
    return;
  }

  const { q = "", type = "videos", per_page = "15", min_width } =
    req.query as Record<string, string>;

  let upstream: string;
  if (type === "photos") {
    const params = new URLSearchParams({ key: apiKey, q, per_page });
    if (min_width) params.set("min_width", min_width);
    upstream = `https://pixabay.com/api/?${params}`;
  } else {
    const params = new URLSearchParams({ key: apiKey, q, per_page });
    if (min_width) params.set("min_width", min_width);
    upstream = `https://pixabay.com/api/videos/?${params}`;
  }

  req.log.info({ type, q }, "Proxying Pixabay request");

  const { ok, status, data } = await safeFetch(upstream, {
    headers: {
      Referer: "https://pixabay.com/",
      "User-Agent": "Mozilla/5.0 (compatible; MediaFinderProxy/1.0)",
    },
  });

  if (!ok || data?.error) {
    req.log.warn({ status, error: data?.error }, "Pixabay upstream error");
    res.status(ok ? 200 : status).json({ error: data?.error || "Pixabay request failed", hits: [] });
    return;
  }

  res.json(data);
});

// ── GET /proxy/serpapi-images ──────────────────────────────────────────────
// SerpApi Google Images search. One page = ~100 results (ijn=0,1,2…)
router.get("/proxy/serpapi-images", async (req, res): Promise<void> => {
  const store = loadKeys();
  const apiKey = store.serpApiKey;

  if (!apiKey) {
    res.status(400).json({ error: "SerpApi key not configured. Add it in Settings." });
    return;
  }

  const { query = "", count = "20" } = req.query as Record<string, string>;
  const numResults = Math.max(1, Math.min(400, parseInt(count, 10) || 20));

  // SerpApi returns ~100 images per page (ijn parameter). Fetch multiple pages if needed.
  const pagesNeeded = Math.ceil(numResults / 100);

  req.log.info({ query, numResults, pagesNeeded }, "Proxying SerpApi images request");

  const pagePromises = Array.from({ length: pagesNeeded }, (_, i) => {
    const params = new URLSearchParams({
      engine: "google_images",
      q: query,
      api_key: apiKey,
      ijn: String(i),
      gl: "us",
      hl: "en",
      safe: "off",
    });
    return safeFetch(`https://serpapi.com/search.json?${params}`);
  });

  const pageResults = await Promise.allSettled(pagePromises);

  const allImages: any[] = [];
  let firstError: string | null = null;

  for (const result of pageResults) {
    if (result.status === "rejected") {
      firstError = firstError ?? String(result.reason);
      continue;
    }
    const { ok, status, data } = result.value;
    if (!ok || data?.error) {
      firstError = firstError ?? (data?.error || `HTTP ${status}`);
      req.log.warn({ status, error: data?.error }, "SerpApi upstream error");
      continue;
    }
    if (Array.isArray(data?.images_results)) {
      allImages.push(...data.images_results);
    }
  }

  if (allImages.length === 0 && firstError) {
    res.status(502).json({ error: firstError, images_results: [] });
    return;
  }

  res.json({ images_results: allImages.slice(0, numResults) });
});

// ── GET /proxy/download ───────────────────────────────────────────────────
// Server-side image proxy: fetches the remote URL and streams it back to the
// browser with Content-Disposition: attachment so the browser saves the file
// instead of navigating to it.  Required for cross-origin SerpApi images.
router.get("/proxy/download", async (req, res): Promise<void> => {
  const { url, filename = "image.jpg" } = req.query as { url?: string; filename?: string };

  if (!url) {
    res.status(400).json({ error: "url parameter required" });
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("invalid protocol");
  } catch {
    res.status(400).json({ error: "Invalid URL" });
    return;
  }

  const safeFilename = (filename as string).replace(/[^a-z0-9._\-()[\] ]/gi, "_").slice(0, 200);

  req.log.info({ url, safeFilename }, "Proxy download request");

  // Hard timeout on the upstream fetch — without this, a CDN that never
  // responds (or stalls mid-stream) hangs this request forever, which in
  // turn blocks the client's sequential download queue (looked like
  // "0/68 forever" with no way to recover except reloading the page).
  const UPSTREAM_TIMEOUT_MS = 25_000;
  const upstreamController = new AbortController();
  const timeoutTimer = setTimeout(() => upstreamController.abort(), UPSTREAM_TIMEOUT_MS);
  req.on("close", () => upstreamController.abort());

  try {
    const upstream = await fetch(parsed.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "image/*,*/*;q=0.8",
        Referer: parsed.origin + "/",
      },
      redirect: "follow",
      signal: upstreamController.signal,
    });

    if (!upstream.ok) {
      res.status(upstream.status).json({ error: `Upstream returned ${upstream.status}` });
      return;
    }

    const ct = upstream.headers.get("content-type") || "application/octet-stream";
    const cl = upstream.headers.get("content-length");

    res.setHeader("Content-Type", ct);
    res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}"`);
    res.setHeader("Cache-Control", "no-store");
    if (cl) res.setHeader("Content-Length", cl);

    if (upstream.body) {
      const reader = upstream.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
      res.end();
    } else {
      const buf = await upstream.arrayBuffer();
      res.end(Buffer.from(buf));
    }
  } catch (err: any) {
    req.log.error({ err, url }, "Download proxy error");
    if (!res.headersSent) res.status(502).json({ error: "Failed to fetch image" });
  }
});

// ── GET /proxy/pexels/test ─────────────────────────────────────────────────
router.get("/proxy/pexels/test", async (req, res): Promise<void> => {
  const store = loadKeys();
  const apiKey = store.pexelsKey;

  if (!apiKey) {
    res.json({ valid: false, reason: "No key configured" });
    return;
  }

  const upstreamRes = await fetch(
    "https://api.pexels.com/v1/search?query=car&per_page=1",
    { headers: { Authorization: apiKey } }
  );

  res.json({ valid: upstreamRes.ok, status: upstreamRes.status });
});

// ── GET /proxy/pixabay/test ────────────────────────────────────────────────
router.get("/proxy/pixabay/test", async (req, res): Promise<void> => {
  const store = loadKeys();
  const apiKey = store.pixabayKey;

  if (!apiKey) {
    res.json({ valid: false, reason: "No key configured" });
    return;
  }

  req.log.info("Testing Pixabay key");

  const { ok, status, data } = await safeFetch(
    `https://pixabay.com/api/?key=${encodeURIComponent(apiKey)}&q=car&per_page=3`,
    {
      headers: {
        Referer: "https://pixabay.com/",
        "User-Agent": "Mozilla/5.0 (compatible; MediaFinderProxy/1.0)",
      },
    }
  );

  if (!ok || data?.error) {
    res.json({ valid: false, status, reason: data?.error || `HTTP ${status}` });
    return;
  }

  res.json({ valid: true, status, hits: data?.totalHits });
});

// ── GET /proxy/serpapi-images/test ────────────────────────────────────────
router.get("/proxy/serpapi-images/test", async (req, res): Promise<void> => {
  const store = loadKeys();
  const apiKey = store.serpApiKey;

  if (!apiKey) {
    res.json({ valid: false, reason: "SerpApi key not configured" });
    return;
  }

  req.log.info("Testing SerpApi key");

  const params = new URLSearchParams({
    engine: "google_images",
    q: "car",
    api_key: apiKey,
    ijn: "0",
    gl: "us",
    hl: "en",
    safe: "off",
    num: "3",
  });

  const { ok, status, data } = await safeFetch(
    `https://serpapi.com/search.json?${params}`
  );

  if (!ok || data?.error) {
    res.json({ valid: false, status, reason: data?.error || `HTTP ${status}` });
    return;
  }

  const count = Array.isArray(data?.images_results) ? data.images_results.length : 0;
  res.json({ valid: true, status: 200, images: count });
});

export default router;
