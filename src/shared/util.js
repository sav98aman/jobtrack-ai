// Shared helpers (loaded in content scripts and the service worker).
self.JT = self.JT || {};
JT.util = {
  norm(s) {
    return String(s || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  },
  normUrl(u) {
    try {
      const x = new URL(u);
      ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','gh_src','trk','refId','trackingId','src','source']
        .forEach(p => x.searchParams.delete(p));
      x.hash = '';
      return (x.origin + x.pathname.replace(/\/+$/, '') + x.search).toLowerCase();
    } catch { return String(u || '').toLowerCase(); }
  },
  hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } },
  todayISO() {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  },
  uniqueKey(company, title, date, appId) {
    const base = [JT.util.norm(company), JT.util.norm(title), date].join('|');
    return appId ? base + '|' + String(appId).toLowerCase() : base;
  },
  // Prevent spreadsheet formula injection from scraped text.
  safeCell(s) { s = String(s == null ? '' : s); return /^[=+\-@]/.test(s) ? "'" + s : s; }
};
