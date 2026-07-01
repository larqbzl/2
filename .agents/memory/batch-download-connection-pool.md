---
name: Browser connection-pool starvation on batch downloads
description: Why a sequential download-all loop can appear to "hang forever" after leaving/returning to a page, and how to fix it with AbortController.
---

Sequential `fetch`-based download loops (e.g. a "download all" button that awaits one file at a time) must be cancellable via `AbortController`, aborted on component unmount, and aborted before starting a new run.

**Why:** If a component unmounts mid-loop (user navigates away), the `for` loop is a plain async function — it keeps running detached from the component. Its `fetch` calls keep occupying the browser's per-origin connection pool (~6 concurrent connections for HTTP/1.1). When the user returns and starts a new download run, the new fetches queue up behind the orphaned ones, making the new run appear to hang indefinitely (progress stuck at "0/N"). Individual single-item downloads on the same origin are also starved by the same leaked connections.

**How to apply:** Any download/upload loop that runs multiple sequential network requests tied to a component's lifecycle needs: (1) an `AbortController` ref for the batch run, aborted in a `useEffect` cleanup on unmount; (2) abort the previous controller before starting a new run; (3) pass the `signal` into every `fetch`; (4) treat `AbortError` as a graceful stop, not a failure; (5) expose a visible "Cancel" button that aborts the controller so users can unstick a hung queue themselves. Apply the same signal-passing to any single-item download reusing the same underlying fetch helper, since it shares the same connection pool.
