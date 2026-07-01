export type SearchResult = {
  id: string;
  source: "Archive.org" | "Pexels" | "Pixabay" | "Wikimedia" | "SerpApi";
  type: "video" | "photo";
  title: string;
  thumbnailUrl: string;
  url: string;
  downloadUrl: string;
  qualityBadge: string;
  metadata?: {
    year?: string | number;
    downloads?: number;
    size?: number;
    format?: string;
    duration?: number;
    author?: string;
    license?: string;
    largeFile?: boolean;
    displayUrl?: string;
  };
};

const MAX_FILE_SIZE = 800 * 1024 * 1024;
const LARGE_FILE_THRESHOLD = 200 * 1024 * 1024;

export function cleanQueryForStockSites(query: string): string {
  const stopWords = /\b(photo|video|footage|real|original|USA|TV|commercial|advertisement|ad)\b/gi;
  return query.replace(stopWords, "").replace(/\s{2,}/g, " ").trim();
}

export function stripMediaTypeWord(query: string): string {
  return query.replace(/\s+(video|photo)\s*$/i, "").trim();
}

/**
 * Picks the best Pexels video_files entry, strictly capped at 1080p (width 1920).
 * Never returns a 4K/2K file. Prefers an exact 1920-wide file; falls back to the
 * next-best quality below 1080p (e.g. 720p) only if a true 1080p file is absent.
 */
function pickPexelsVideoFile(files: any[]): any | null {
  if (!Array.isArray(files) || files.length === 0) return null;
  const withWidth = files.filter((f) => typeof f.width === "number" && f.width > 0);
  if (withWidth.length === 0) return files[0] ?? null;

  const exact1080 = withWidth.filter((f) => f.width === 1920);
  if (exact1080.length > 0) {
    return exact1080.sort((a, b) => (b.height || 0) - (a.height || 0))[0];
  }

  const below1080 = withWidth.filter((f) => f.width < 1920).sort((a, b) => b.width - a.width);
  if (below1080.length > 0) return below1080[0];

  // Last resort: everything available is above 1080p — pick the smallest of those.
  return withWidth.sort((a, b) => a.width - b.width)[0];
}

/**
 * Picks the best Pixabay video quality, strictly capped at 1080p.
 * Pixabay's "large" tier is documented as the 1080p rendition, so it is always
 * preferred. Falls back to "medium" then "small" — 720p only as a last resort.
 */
function pickPixabayVideoFile(videos: any): any | null {
  if (!videos) return null;
  return videos.large || videos.medium || videos.small || null;
}

function videoQualityBadge(width: number | undefined): string {
  if (!width) return "SD";
  if (width >= 1920) return "1080p";
  if (width >= 1280) return "720p";
  return `${width}p`;
}

// ─── Archive.org ───────────────────────────────────────────────────────────

async function fetchArchiveSearch(url: string): Promise<any[]> {
  const res = await fetch(url);
  const data = await res.json();
  return data?.response?.docs ?? [];
}

async function fetchArchiveMetadata(identifier: string): Promise<any> {
  const res = await fetch(`https://archive.org/metadata/${identifier}`);
  return res.json();
}

export async function searchArchive(query: string, limit: number = 3): Promise<SearchResult[]> {
  const commercialQ = encodeURIComponent(
    query + " AND mediatype:movies AND subject:(commercial OR advertisement OR ad)"
  );
  const reviewQ = encodeURIComponent(
    query + " AND mediatype:movies AND subject:(review OR test+drive OR automotive)"
  );
  const baseQ = encodeURIComponent(query + " AND mediatype:movies");

  const urlA = `https://archive.org/advancedsearch.php?q=${commercialQ}&fl[]=identifier,title,description,year,subject,downloads,avg_rating&sort[]=downloads+desc&rows=10&output=json`;
  const urlB = `https://archive.org/advancedsearch.php?q=${reviewQ}&fl[]=identifier,title,description,year,subject,downloads&sort[]=downloads+desc&rows=10&output=json`;
  const urlBase = `https://archive.org/advancedsearch.php?q=${baseQ}&fl[]=identifier,title,description,year,subject,downloads&sort[]=downloads+desc&rows=10&output=json`;

  let allDocs: any[] = [];
  try {
    const [docsA, docsB, docsBase] = await Promise.all([
      fetchArchiveSearch(urlA).catch(() => []),
      fetchArchiveSearch(urlB).catch(() => []),
      fetchArchiveSearch(urlBase).catch(() => []),
    ]);
    const seen = new Set<string>();
    for (const doc of [...docsA, ...docsB, ...docsBase]) {
      if (!seen.has(doc.identifier)) {
        seen.add(doc.identifier);
        allDocs.push(doc);
      }
    }
  } catch (err) {
    console.error("[Archive.org] Search error:", err);
    return [];
  }

  if (allDocs.length === 0) return [];
  allDocs.sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
  const candidates = allDocs.slice(0, 8);
  const results: SearchResult[] = [];

  for (const doc of candidates) {
    if (results.length >= limit) break;
    try {
      const meta = await fetchArchiveMetadata(doc.identifier);
      if (!meta?.files) continue;

      const videoFiles = meta.files.filter((f: any) => {
        const name: string = f.name || "";
        return name.endsWith(".mp4") || name.endsWith(".avi") || name.endsWith(".mov") || name.endsWith(".mpg") || name.endsWith(".mpeg");
      });

      const underLimit = videoFiles.filter((f: any) => parseInt(f.size || "0") < MAX_FILE_SIZE);
      if (underLimit.length === 0 && videoFiles.length === 0) continue;

      const pool = underLimit.length > 0 ? underLimit : videoFiles;
      pool.sort((a: any, b: any) => {
        const aIsMp4 = a.name?.endsWith(".mp4") ? 1 : 0;
        const bIsMp4 = b.name?.endsWith(".mp4") ? 1 : 0;
        if (aIsMp4 !== bIsMp4) return bIsMp4 - aIsMp4;
        return parseInt(b.size || "0") - parseInt(a.size || "0");
      });

      const bestFile = pool[0];
      const fileSize = parseInt(bestFile.size || "0");
      const ext = bestFile.name.split(".").pop()?.toUpperCase() || "MP4";

      let duration: number | undefined;
      const lenStr = meta.metadata?.length || meta.metadata?.runtime;
      if (lenStr) {
        const parsed = parseFloat(lenStr);
        if (!isNaN(parsed)) duration = Math.round(parsed);
      }

      results.push({
        id: doc.identifier,
        source: "Archive.org",
        type: "video",
        title: doc.title || doc.identifier,
        thumbnailUrl: `https://archive.org/services/img/${doc.identifier}`,
        url: `https://archive.org/details/${doc.identifier}`,
        downloadUrl: `https://archive.org/download/${doc.identifier}/${bestFile.name}`,
        qualityBadge: ext,
        metadata: {
          year: doc.year,
          downloads: doc.downloads,
          size: fileSize,
          format: ext,
          duration,
          largeFile: fileSize > LARGE_FILE_THRESHOLD,
        },
      });
    } catch (err) {
      console.error("[Archive.org] Metadata error for", doc.identifier, err);
    }
  }

  return results;
}

// ─── Pexels (via server proxy) ─────────────────────────────────────────────

export async function searchPexels(
  query: string,
  limit: number = 3,
  type: "all" | "video" | "photo" = "all"
): Promise<SearchResult[]> {
  const cleaned = stripMediaTypeWord(cleanQueryForStockSites(query));
  const results: SearchResult[] = [];

  if (type === "all" || type === "video") {
    const urlWith = `/api/proxy/pexels?q=${encodeURIComponent(cleaned)}&type=videos&per_page=15&min_width=1920&min_height=1080`;
    const urlWithout = `/api/proxy/pexels?q=${encodeURIComponent(cleaned)}&type=videos&per_page=15`;
    try {
      let vData: any = null;
      const r1 = await fetch(urlWith);
      if (r1.status === 400) {
        const err = await r1.json();
        throw new Error(err.error || "Pexels key not configured");
      }
      vData = await r1.json();
      if (!vData?.videos?.length) {
        const r2 = await fetch(urlWithout);
        vData = await r2.json();
      }
      if (vData?.videos) {
        for (const v of vData.videos) {
          if (results.filter((r) => r.type === "video").length >= limit) break;
          const best = pickPexelsVideoFile(v.video_files);
          if (!best) continue;
          results.push({
            id: `pex_v_${v.id}`,
            source: "Pexels",
            type: "video",
            title: `Video by ${v.user.name}`,
            thumbnailUrl: v.image,
            url: v.url,
            downloadUrl: best.link,
            qualityBadge: videoQualityBadge(best.width),
            metadata: { duration: v.duration, author: v.user.name },
          });
        }
      }
    } catch (err) {
      console.error("[Pexels Video] Error:", err);
      throw err;
    }
  }

  if (type === "all" || type === "photo") {
    const urlP = `/api/proxy/pexels?q=${encodeURIComponent(cleaned)}&type=photos&per_page=15`;
    try {
      const pRes = await fetch(urlP);
      if (pRes.status === 400) {
        const err = await pRes.json();
        throw new Error(err.error || "Pexels key not configured");
      }
      const pData = await pRes.json();
      if (pData?.photos) {
        for (const p of pData.photos) {
          if (results.filter((r) => r.type === "photo").length >= limit) break;
          if (Math.max(p.width, p.height) < 2000) continue;
          results.push({
            id: `pex_p_${p.id}`,
            source: "Pexels",
            type: "photo",
            title: `Photo by ${p.photographer}`,
            thumbnailUrl: p.src.medium,
            url: p.url,
            downloadUrl: p.src.original,
            qualityBadge: `${p.width}×${p.height}`,
            metadata: { author: p.photographer },
          });
        }
      }
    } catch (err) {
      console.error("[Pexels Photo] Error:", err);
      if (type === "photo") throw err;
    }
  }

  return results.slice(0, limit * 2);
}

// ─── Pixabay (via server proxy) ────────────────────────────────────────────

export async function searchPixabay(
  query: string,
  limit: number = 3,
  type: "all" | "video" | "photo" = "all"
): Promise<SearchResult[]> {
  const cleaned = stripMediaTypeWord(cleanQueryForStockSites(query));
  const results: SearchResult[] = [];

  if (type === "all" || type === "video") {
    const urlWith = `/api/proxy/pixabay?q=${encodeURIComponent(cleaned)}&type=videos&per_page=15&min_width=1920`;
    const urlWithout = `/api/proxy/pixabay?q=${encodeURIComponent(cleaned)}&type=videos&per_page=15`;
    try {
      let vData: any = null;
      const r1 = await fetch(urlWith);
      if (r1.status === 400) {
        const err = await r1.json();
        throw new Error(err.error || "Pixabay key not configured");
      }
      vData = await r1.json();
      if (!vData?.hits?.length) {
        const r2 = await fetch(urlWithout);
        vData = await r2.json();
      }
      if (vData?.hits) {
        for (const v of vData.hits) {
          if (results.filter((r) => r.type === "video").length >= limit) break;
          const best = pickPixabayVideoFile(v.videos);
          if (!best) continue;
          const thumbnailUrl =
            best.thumbnail ||
            v.videos?.large?.thumbnail ||
            v.videos?.medium?.thumbnail ||
            v.videos?.small?.thumbnail ||
            v.userImageURL ||
            `https://i.vimeocdn.com/video/${v.picture_id}_640x360.jpg`;
          results.push({
            id: `pix_v_${v.id}`,
            source: "Pixabay",
            type: "video",
            title: `Video by ${v.user}`,
            thumbnailUrl,
            url: v.pageURL,
            downloadUrl: best.url,
            qualityBadge: videoQualityBadge(best.width),
            metadata: { duration: v.duration, author: v.user },
          });
        }
      }
    } catch (err) {
      console.error("[Pixabay Video] Error:", err);
      throw err;
    }
  }

  if (type === "all" || type === "photo") {
    const urlWith = `/api/proxy/pixabay?q=${encodeURIComponent(cleaned)}&type=photos&per_page=15&min_width=2000`;
    const urlWithout = `/api/proxy/pixabay?q=${encodeURIComponent(cleaned)}&type=photos&per_page=15`;
    try {
      let pData: any = null;
      const r1 = await fetch(urlWith);
      if (r1.status === 400) {
        const err = await r1.json();
        if (type === "photo") throw new Error(err.error || "Pixabay key not configured");
      } else {
        pData = await r1.json();
        if (!pData?.hits?.length) {
          const r2 = await fetch(urlWithout);
          pData = await r2.json();
        }
        if (pData?.hits) {
          for (const p of pData.hits) {
            if (results.filter((r) => r.type === "photo").length >= limit) break;
            if (Math.max(p.imageWidth, p.imageHeight) < 2000) continue;
            results.push({
              id: `pix_p_${p.id}`,
              source: "Pixabay",
              type: "photo",
              title: `Photo by ${p.user}`,
              thumbnailUrl: p.webformatURL,
              url: p.pageURL,
              downloadUrl: p.largeImageURL,
              qualityBadge: `${p.imageWidth}×${p.imageHeight}`,
              metadata: { author: p.user },
            });
          }
        }
      }
    } catch (err) {
      console.error("[Pixabay Photo] Error:", err);
      if (type === "photo") throw err;
    }
  }

  return results.slice(0, limit * 2);
}

// ─── Wikimedia ─────────────────────────────────────────────────────────────

export async function searchWikimedia(query: string, limit: number = 3): Promise<SearchResult[]> {
  const cleaned = stripMediaTypeWord(cleanQueryForStockSites(query));
  const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleaned)}&srnamespace=6&srlimit=15&format=json&origin=*`;

  try {
    const res = await fetch(searchUrl);
    const data = await res.json();
    if (!data?.query?.search?.length) return [];

    const results: SearchResult[] = [];

    for (const item of data.query.search) {
      if (results.length >= limit) break;
      const infoUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(item.title)}&prop=imageinfo&iiprop=url|size|mime|extmetadata&format=json&origin=*`;
      try {
        const infoRes = await fetch(infoUrl);
        const infoData = await infoRes.json();
        const pages = infoData?.query?.pages;
        if (!pages) continue;
        const pageId = Object.keys(pages)[0];
        const info = pages[pageId]?.imageinfo?.[0];
        if (!info) continue;
        if (!(info.width >= 1920 || info.size >= 1_500_000)) continue;

        const license = info.extmetadata?.LicenseShortName?.value || info.extmetadata?.License?.value || "Unknown license";
        const authorRaw = info.extmetadata?.Artist?.value || info.extmetadata?.Credit?.value || "Unknown";
        const author = authorRaw.replace(/<[^>]*>?/gm, "").trim();

        results.push({
          id: `wiki_${pageId}`,
          source: "Wikimedia",
          type: info.mime?.startsWith("video") ? "video" : "photo",
          title: item.title.replace("File:", ""),
          thumbnailUrl: info.url + "?width=400",
          url: `https://commons.wikimedia.org/wiki/${encodeURIComponent(item.title)}`,
          downloadUrl: info.url,
          qualityBadge: info.width && info.height ? `${info.width}×${info.height}` : "HiRes",
          metadata: { license, author },
        });
      } catch (err) {
        console.error("[Wikimedia] Info error for", item.title, err);
      }
    }

    return results;
  } catch (err) {
    console.error("[Wikimedia] Search failed:", err);
    return [];
  }
}

// ─── SerpApi Google Images (via server proxy) ──────────────────────────────

export async function searchSerpApiImages(
  query: string,
  count: number = 20
): Promise<SearchResult[]> {
  const res = await fetch(
    `/api/proxy/serpapi-images?query=${encodeURIComponent(query)}&count=${count}`
  );

  if (res.status === 400) {
    const err = await res.json();
    throw new Error(err.error || "SerpApi key not configured");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `SerpApi error ${res.status}`);
  }

  const data = await res.json();
  const items: any[] = data?.images_results ?? [];

  const results: SearchResult[] = [];

  for (const item of items) {
    const downloadUrl = item.original || item.thumbnail || "";
    const thumbnailUrl = item.thumbnail || item.original || "";
    if (!downloadUrl) continue;

    const width: number = item.original_width || 0;
    const height: number = item.original_height || 0;

    // Extract readable domain from source URL
    let displayUrl = "";
    try {
      displayUrl = new URL(item.link || item.original || "").hostname.replace("www.", "");
    } catch {}

    results.push({
      id: `serp_${results.length}_${encodeURIComponent(downloadUrl).slice(0, 20)}`,
      source: "SerpApi",
      type: "photo",
      title: item.title || "Google Image",
      thumbnailUrl,
      url: item.link || downloadUrl,
      downloadUrl,
      qualityBadge: width && height ? `${width}×${height}` : "Web",
      metadata: { displayUrl },
    });
  }

  return results;
}
