(function initAuthoritativePreviewState(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BeamerForgeAuthoritativePreviewState = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function authoritativePreviewStateFactory() {
  "use strict";

  const SOURCES = ["manual", "ai", "selected"];
  const CACHE_KEY_RE = /^[a-f0-9]{64}-[A-Za-z0-9._-]+$/;

  function sourcesForRoute(route) {
    if (route === "manual-review") return ["manual"];
    if (route === "ai-compare") return ["manual", "ai"];
    if (route === "final-review") return ["selected"];
    return [];
  }

  function trustedPdfUrl(value, locationLike) {
    if (!value || !locationLike?.href || !locationLike?.origin) return null;
    try {
      const url = new URL(value, locationLike.href);
      const match = url.pathname.match(/^\/api\/preview\/([^/]+)\/main\.pdf$/);
      if (url.origin !== locationLike.origin || !match || url.search || url.hash || !CACHE_KEY_RE.test(match[1])) return null;
      return url.href;
    } catch {
      return null;
    }
  }

  function displayPdfUrl(record, locationLike) {
    const trusted = trustedPdfUrl(record?.pdfUrl, locationLike);
    if (!trusted) return null;
    const url = new URL(trusted);
    url.searchParams.set("refresh", String(record.revision || 0));
    return url.href;
  }

  function blankRecord() {
    return { status: "idle", desiredKey: null, requestKey: null, route: null, themeHash: null, pdfUrl: null, stale: false, revision: 0, sequence: 0 };
  }

  function createAuthoritativePreviewState(options) {
    const sendRequest = options.request;
    const onChange = options.onChange || (() => {});
    const records = Object.fromEntries(SOURCES.map((source) => [source, blankRecord()]));

    function notify(source) { onChange(source, records[source]); }

    async function request(source, context = {}) {
      const record = records[source];
      if (!record) return null;
      const route = context.route || record.route;
      const themeHash = context.themeHash || record.themeHash;
      if (!route || !themeHash) return null;
      const key = `${route}:${source}:${themeHash}`;
      const force = context.force === true;
      const automatic = context.automatic === true;
      record.route = route;
      record.themeHash = themeHash;
      record.desiredKey = key;
      if (record.requestKey === key && (automatic || (!force && ["pending", "ready"].includes(record.status)))) return null;
      const previousPdfUrl = record.pdfUrl;
      const sequence = ++record.sequence;
      record.requestKey = key;
      record.status = "pending";
      record.message = null;
      record.excerpt = null;
      notify(source);
      try {
        const result = await sendRequest(source, force);
        if (record.sequence !== sequence || record.desiredKey !== key || record.requestKey !== key) return null;
        record.status = result?.status || "failed";
        record.cached = result?.cached === true;
        record.cacheKey = result?.cacheKey || null;
        record.compilerKind = result?.compilerKind || null;
        record.completedAt = result?.completedAt || null;
        record.sourceVersion = result?.sourceVersion || source;
        record.message = result?.message || null;
        record.excerpt = result?.excerpt || null;
        const nextPdf = result?.pdfUrl || result?.stalePdfUrl || previousPdfUrl;
        record.pdfUrl = nextPdf || null;
        record.stale = record.status !== "ready" && Boolean(record.pdfUrl);
        record.revision++;
        notify(source);
        return record;
      } catch (error) {
        if (record.sequence !== sequence || record.desiredKey !== key || record.requestKey !== key) return null;
        record.status = "failed";
        record.message = "Authoritative preview request failed.";
        record.excerpt = null;
        record.pdfUrl = previousPdfUrl;
        record.stale = Boolean(previousPdfUrl);
        notify(source);
        return record;
      }
    }

    function sync(route, hashes = {}) {
      const active = new Set(sourcesForRoute(route));
      for (const source of SOURCES) {
        const record = records[source];
        if (!active.has(source)) {
          if (record.desiredKey !== null) { record.desiredKey = null; record.sequence++; }
          continue;
        }
        const themeHash = hashes[source];
        if (!themeHash) {
          if (record.desiredKey !== null) {
            record.desiredKey = null;
            record.sequence++;
            record.status = "idle";
            record.stale = Boolean(record.pdfUrl);
            notify(source);
          }
          continue;
        }
        const key = `${route}:${source}:${themeHash}`;
        if (record.desiredKey !== key) {
          record.desiredKey = key;
          record.route = route;
          record.themeHash = themeHash;
        }
        void request(source, { route, themeHash, force: false, automatic: true });
      }
    }

    return {
      records, sync, request,
      retry(source) { return request(source, { force: false }); },
      refresh(source) { return request(source, { force: true }); }
    };
  }

  return { createAuthoritativePreviewState, sourcesForRoute, trustedPdfUrl, displayPdfUrl };
});
