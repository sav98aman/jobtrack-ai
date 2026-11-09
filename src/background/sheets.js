// Google Sheets v4 sync. Re-reads the sheet before every append, so retrying after a timeout cannot create a second row.
class SheetsError extends Error { constructor(m, transient, auth) { super(m); this.transient = transient; this.auth = !!auth; } }
JT.sheets = {
  async token(interactive) {
    const { auth = {}, settings = {} } = await chrome.storage.local.get(['auth', 'settings']);
    if (settings.webhookUrl) return 'webhook';
    if (auth.token && auth.exp > Date.now() + 60000) return auth.token;

    // 1. Try native Chrome Extension OAuth (works directly with "Chrome extension" OAuth client type)
    if (chrome.identity && chrome.identity.getAuthToken) {
      try {
        const token = await new Promise((resolve, reject) => {
          chrome.identity.getAuthToken({ interactive: !!interactive }, tok => {
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else resolve(tok);
          });
        });
        if (token) {
          await chrome.storage.local.set({ auth: { token, exp: Date.now() + 3600 * 1000 } });
          return token;
        }
      } catch (err) {
        if (!settings.clientId) throw new SheetsError(`Google login failed: ${err.message}`, false, true);
      }
    }

    // 2. Fallback to launchWebAuthFlow (for "Web application" OAuth client type)
    if (!settings.clientId) throw new SheetsError('Add your Google Client ID or Apps Script URL in Settings first', false, true);
    const q = { client_id: settings.clientId, response_type: 'token', redirect_uri: chrome.identity.getRedirectURL(),
      scope: 'https://www.googleapis.com/auth/spreadsheets' };
    if (!interactive) q.prompt = 'none';
    let resp;
    try { resp = await chrome.identity.launchWebAuthFlow({ url: 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams(q), interactive }); }
    catch (e) { throw new SheetsError(e && e.message ? `Google login failed: ${e.message}` : 'Google account not connected', false, true); }
    const u = new URL(resp);
    const searchP = u.searchParams;
    const hashP = new URLSearchParams(u.hash.slice(1));
    const err = searchP.get('error') || hashP.get('error');
    if (err) {
      const desc = searchP.get('error_description') || hashP.get('error_description') || err;
      throw new SheetsError(`Google authorization error: ${desc}`, false, true);
    }
    const token = hashP.get('access_token') || searchP.get('access_token');
    if (!token) throw new SheetsError('Google did not return an access token', false, true);
    await chrome.storage.local.set({ auth: { token, exp: Date.now() + Number(hashP.get('expires_in') || 3600) * 1000 } });
    return token;
  },
  async api(url, opts = {}, interactive = false, retry = true) {
    const tok = await this.token(interactive);
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 20000);
    let r;
    try { r = await fetch(url, { ...opts, signal: ctl.signal, headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' } }); }
    catch { throw new SheetsError('Network error or timeout', true); }
    finally { clearTimeout(to); }
    if (r.status === 401 && retry) {
      if (chrome.identity && chrome.identity.removeCachedAuthToken && tok) {
        chrome.identity.removeCachedAuthToken({ token: tok }, () => {});
      }
      await chrome.storage.local.remove('auth');
      return this.api(url, opts, interactive, false);
    }
    if (r.status === 401 || r.status === 403) throw new SheetsError(`Permission problem (${r.status}) — reconnect Google or check sheet access`, false, true);
    if (r.status === 429 || r.status >= 500) throw new SheetsError(`Sheets temporarily unavailable (${r.status})`, true);
    if (!r.ok) throw new SheetsError(`Sheets API error ${r.status}: ${(await r.text()).slice(0, 160)}`, false);
    return r.json();
  },
  HEADERS: ['Company', 'Job Title', 'Date Applied', 'Job Link', 'Status', 'Contact', 'Location', 'Employment Type', 'Experience', 'Salary', 'Stage', 'Logged At', 'Notes', 'Unique Key'],
  async resolveSheetName(spreadsheetId, preferredName, interactive) {
    try {
      const meta = await this.api(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`, {}, interactive);
      const titles = (meta.sheets || []).map(s => s.properties && s.properties.title).filter(Boolean);
      if (!titles.length) return preferredName || 'Applications';
      const match = titles.find(t => t.toLowerCase() === (preferredName || 'applications').toLowerCase());
      return match || titles[0];
    } catch {
      return preferredName || 'Applications';
    }
  },
  async ensureHeaders(spreadsheetId, sheetName, interactive) {
    try {
      const base = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/`;
      const allData = await this.api(`${base}${encodeURIComponent(sheetName + '!A1:N')}`, {}, interactive);
      let rows = (allData.values || []).filter(r => r && r.length);
      
      // Automatically remove any fake rows logged from logins or navbar badges (e.g., "Welcome, Aman Kumar", "0 notifications")
      let cleaned = rows.filter((r, idx) => {
        if (idx === 0 && r[0] === 'Company') return true;
        const title = r[1] || '';
        return !/^(welcome|hello|sign in|login|\d+\s*notifications?|notifications?)/i.test(title.trim());
      });

      if (!cleaned.length) {
        await this.api(`${base}${encodeURIComponent(sheetName + '!A1:N1')}?valueInputOption=USER_ENTERED`,
          { method: 'PUT', body: JSON.stringify({ values: [this.HEADERS] }) }, interactive);
        return;
      }

      if (cleaned[0][0] !== 'Company') {
        cleaned.unshift(this.HEADERS);
      }

      if (cleaned.length !== rows.length || (rows[0] && cleaned[0][0] !== rows[0][0])) {
        await this.api(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName + '!A1:N')}:clear`, { method: 'POST' }, interactive).catch(() => {});
        await this.api(`${base}${encodeURIComponent(sheetName + '!A1:N')}?valueInputOption=USER_ENTERED`,
          { method: 'PUT', body: JSON.stringify({ values: cleaned }) }, interactive);
      }
    } catch (err) {
      console.warn('[JobTrack Sheets] ensureHeaders issue:', err.message);
    }
  },
  toRow(rec) {
    const c = JT.util.safeCell;
    return [c(rec.company), c(rec.title), rec.appliedDate, rec.jobLink, 'Applied', c(rec.contact), c(rec.location),
      c(rec.employmentType), c(rec.experience), c(rec.salary), '', new Date().toISOString(), c(rec.notes), rec.uniqueKey];
  },
  async sync(rec, st, interactive = false) {
    if (st.webhookUrl) {
      const resp = await fetch(st.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'append', sheetName: st.sheetName || 'Applications', values: [this.toRow(rec)], record: rec })
      });
      if (!resp.ok) throw new SheetsError(`Webhook error ${resp.status}`, false);
      const res = await resp.json().catch(() => ({}));
      if (res.status === 'duplicate') return 'duplicate';
      return 'saved';
    }
    const sheetName = await this.resolveSheetName(st.spreadsheetId, st.sheetName, interactive);
    await this.ensureHeaders(st.spreadsheetId, sheetName, interactive);

    const U = JT.util, base = `https://sheets.googleapis.com/v4/spreadsheets/${st.spreadsheetId}/values/`;
    const rng = encodeURIComponent(`${sheetName}!A2:N`);
    const data = await this.api(`${base}${rng}?valueRenderOption=FORMATTED_VALUE`, {}, interactive);
    const iso = v => { const t = Date.parse(v); if (isNaN(t)) return ''; const d = new Date(t), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
    const dup = (data.values || []).some(r => r[13] === rec.uniqueKey ||
      (U.norm(r[0]) === U.norm(rec.company) && U.norm(r[1]) === U.norm(rec.title) && iso(r[2]) === rec.appliedDate));
    if (dup) return 'duplicate';
    const app = encodeURIComponent(`${sheetName}!A:N`);
    await this.api(`${base}${app}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      { method: 'POST', body: JSON.stringify({ values: [this.toRow(rec)] }) }, interactive);
    return 'saved';
  }
};
