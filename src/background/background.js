importScripts('../shared/util.js', '../shared/engine.js', 'sheets.js');
const DEFAULTS = { clientId: '', spreadsheetId: '', sheetName: 'Applications',
  autoDetect: true, autoSave: true, alwaysConfirm: false, paused: false };
const TTL = 3 * 3600e3, U = JT.util, ses = chrome.storage.session, loc = chrome.storage.local;
const settings = async () => {
  const s = (await loc.get('settings')).settings || {};
  return { ...DEFAULTS, ...s };
};
const getCtx = async id => { const k = 'ctx:' + id, c = (await ses.get(k))[k]; if (c && Date.now() - c.updatedAt > TTL) { await ses.remove(k); return null; } return c || null; };
const setCtx = (id, c) => { c.updatedAt = Date.now(); return ses.set({ ['ctx:' + id]: c }); };
const get = async (k, d) => (await loc.get(k))[k] ?? d;

chrome.tabs.onRemoved.addListener(id => ses.remove('ctx:' + id));
// Preserve job context when an apply click opens the company site in a new tab.
chrome.tabs.onCreated.addListener(async t => {
  if (t.openerTabId == null) return;
  const c = await getCtx(t.openerTabId);
  if (c && c.applyStartedAt) await setCtx(t.id, JSON.parse(JSON.stringify(c)));
});
chrome.runtime.onInstalled.addListener(() => chrome.alarms.create('sync', { periodInMinutes: 1 }));
chrome.runtime.onStartup.addListener(() => chrome.alarms.create('sync', { periodInMinutes: 1 }));
chrome.alarms.onAlarm.addListener(a => a.name === 'sync' && processQueue(false));

async function badge() {
  const n = (await get('reviews', [])).length;
  chrome.action.setBadgeText({ text: n ? String(n) : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#b45309' });
}
async function logHistory(entry) { const h = await get('history', []); h.unshift({ ...entry, at: Date.now() }); await loc.set({ history: h.slice(0, 50) }); }
const notify = (title, message) => {
  try {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icon.png'),
      title,
      message
    }, () => {
      if (chrome.runtime.lastError) {}
    });
  } catch {}
};

async function enqueue(record) {
  const q = await get('queue', []);
  if (q.some(i => i.record.uniqueKey === record.uniqueKey)) return;
  q.push({ id: crypto.randomUUID(), record, attempts: 0, nextAt: 0 });
  await loc.set({ queue: q });
  processQueue(true);
}

let running = false;
async function processQueue(interactive) {
  if (running) return; running = true;
  try {
    const st = await settings(); let q = await get('queue', []);
    for (const it of q) {
      if (it.nextAt > Date.now() && !interactive) continue;
      if (it.blocked && !interactive) continue;
      try {
        const res = await JT.sheets.sync(it.record, st, interactive);
        it.done = true;
        await logHistory({ ok: true, result: res, company: it.record.company, title: it.record.title });
        if (res === 'saved') notify('Application saved', `${it.record.title} at ${it.record.company}`);
        try {
          let cached = (await loc.get('cachedApplications')).cachedApplications || [];
          if (!cached.some(c => c.uniqueKey === it.record.uniqueKey)) {
            cached.unshift({
              company: it.record.company,
              title: it.record.title,
              appliedDate: it.record.appliedDate,
              jobLink: it.record.jobLink,
              status: it.record.status || 'Applied',
              sourcePortal: it.record.sourcePortal || 'Direct',
              location: it.record.location || '',
              employmentType: it.record.employmentType || '',
              experience: it.record.experience || '',
              salary: it.record.salary || '',
              stage: it.record.stage || '',
              loggedAt: new Date().toISOString(),
              notes: it.record.notes || '',
              uniqueKey: it.record.uniqueKey
            });
            await loc.set({ cachedApplications: cached.slice(0, 500) });
          }
        } catch {}
      } catch (e) {
        it.attempts++; it.lastError = e.message;
        if (e.transient) { it.blocked = false; it.nextAt = Date.now() + Math.min(2 ** it.attempts * 30e3, 30 * 60e3); }
        else it.blocked = true; // needs user action (reconnect / fix sheet access); "Sync now" retries
        await logHistory({ ok: false, error: e.message, company: it.record.company, title: it.record.title });
      }
    }
    q = q.filter(i => !i.done);
    await loc.set({ queue: q });
  } finally { running = false; }
}

async function handleEvidence(m, tabId) {
  console.log('[JobTrack Background] Received evidence for tab:', tabId, m);
  const st = await settings(); if (!st.autoDetect || st.paused) return;
  const ctx = (await getCtx(tabId)) || {};
  const cur = { platformId: m.platformId, url: m.url, host: U.hostOf(m.url), job: m.job, signals: m.signals };
  const { score, reasons } = JT.engine.score(m.signals, ctx);
  let level = JT.engine.level(score);
  console.log(`[JobTrack Background] Score: ${score}, Level: ${level}, Reasons:`, reasons);
  if (level === 'low') {
    console.warn('[JobTrack Background] Dropping evidence: score too low');
    return;
  }
  const record = JT.engine.buildRecord(ctx, cur);
  const criticalIssues = record.issues.filter(i => i.includes('Employer not found') || i.includes('Job title not found'));
  if (level === 'high' && (criticalIssues.length || st.alwaysConfirm || !st.autoSave)) level = 'medium';
  console.log(`[JobTrack Background] Resulting Level: ${level}, Record:`, record);
  const seen = await get('seen', {});
  if (record.company && record.title && seen[record.uniqueKey] && Date.now() - seen[record.uniqueKey] < 24 * 3600e3) {
    console.log('[JobTrack Background] Already handled in past 24h:', record.uniqueKey);
    return;
  }
  if (record.company && record.title) {
    seen[record.uniqueKey] = Date.now();
    await loc.set({ seen });
  }
  if (level === 'high' || (level === 'medium' && st.autoSave && !st.alwaysConfirm && record.company)) {
    console.log('[JobTrack Background] Auto-saving record directly:', record);
    return enqueue(record);
  }
  const reviews = await get('reviews', []);
  reviews.push({ id: crypto.randomUUID(), record, score, reasons });
  await loc.set({ reviews }); await badge();
  notify('Did you submit this application?', `${record.title || 'Unknown role'} at ${record.company || 'unknown employer'} — open JobTrack AI to confirm.`);
}

async function handle(m, sender) {
  const id = sender.tab && sender.tab.id;
  switch (m.type) {
    case 'JOB_SEEN': {
      let c = await getCtx(id); const host = U.hostOf(m.url);
      const here = { platformId: m.platformId, url: m.url, host, job: m.job };
      if (!c || !c.applyStartedAt) c = { origin: here };
      else if (host !== c.origin.host) c.external = here;
      else if (m.job.title && !c.origin.job.title) c.origin = here;
      return setCtx(id, c);
    }
    case 'APPLY_START': {
      let c = await getCtx(id);
      if (!c) c = { origin: { platformId: m.platformId, url: m.url, host: U.hostOf(m.url), job: m.job } };
      c.applyStartedAt = Date.now();
      if (m.job && (m.job.company || m.job.title)) {
        if (!c.origin) c.origin = { platformId: m.platformId, url: m.url, host: U.hostOf(m.url), job: m.job };
        else {
          if (m.job.company) c.origin.job.company = m.job.company;
          if (m.job.title) c.origin.job.title = m.job.title;
        }
      }
      return setCtx(id, c);
    }
    case 'SUBMIT_CLICK': {
      let c = await getCtx(id);
      if (!c) c = { origin: { platformId: m.platformId, url: m.url, host: U.hostOf(m.url), job: m.job } };
      c.submitAt = Date.now();
      if (m.job && (m.job.company || m.job.title)) {
        c.submitJob = m.job;
        if (!c.origin) c.origin = { platformId: m.platformId, url: m.url, host: U.hostOf(m.url), job: m.job };
        else {
          if (m.job.company) c.origin.job.company = m.job.company;
          if (m.job.title) c.origin.job.title = m.job.title;
        }
      }
      return setCtx(id, c);
    }
    case 'SUBMISSION_EVIDENCE': return handleEvidence(m, id);
    case 'GET_STATE': {
      const { auth = {} } = await loc.get('auth');
      const isConnected = !!(auth.token && auth.exp > Date.now());
      return { isConnected, settings: await settings(), queue: await get('queue', []), reviews: await get('reviews', []), history: await get('history', []) };
    }
    case 'CONNECT': {
      try {
        await JT.sheets.token(true);
        const st = await settings();
        if (!st.spreadsheetId && !st.webhookUrl) {
          const newSheetId = await JT.sheets.createSpreadsheet(true);
          st.spreadsheetId = newSheetId;
          await loc.set({ settings: st });
        }
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }
    case 'TEST_SYNC': {
      try {
        const st = await settings();
        const testRecord = {
          company: 'JobTrack AI (Test)',
          title: 'Software Engineer',
          appliedDate: JT.util.todayISO(),
          jobLink: 'https://example.com/test-job',
          contact: 'recruiter@example.com',
          location: 'Remote',
          employmentType: 'Full-time',
          experience: 'Mid-Senior',
          salary: '$120,000',
          notes: 'Test entry to verify Google Sheet connection',
          uniqueKey: 'test|jobtrack|' + Date.now(),
          issues: []
        };
        const res = await JT.sheets.sync(testRecord, st, true);
        await logHistory({ ok: true, result: res, company: testRecord.company, title: testRecord.title });
        return { ok: true, result: res };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    }
    case 'SYNC_NOW': {
      const st = await settings();
      const sheetInfo = await JT.sheets.resolveSheetInfo(st.spreadsheetId, st.sheetName, true);
      await JT.sheets.ensureHeaders(st.spreadsheetId, sheetInfo, true);
      await processQueue(true);
      return { ok: true };
    }
    case 'MANUAL_LOG': {
      const date = JT.util.todayISO();
      const rec = m.record || {};
      const record = {
        company: rec.company || 'Unknown Employer',
        title: rec.title || 'Job Application',
        appliedDate: rec.appliedDate || date,
        jobLink: rec.jobLink || '',
        contact: rec.contact || '',
        location: rec.location || '',
        employmentType: rec.employmentType || '',
        experience: rec.experience || '',
        salary: rec.salary || '',
        notes: rec.notes || 'Manually logged via JobTrack AI popup',
        sourcePortal: 'manual',
        issues: [],
        uniqueKey: JT.util.uniqueKey(rec.company || 'Unknown', rec.title || 'Job', date)
      };
      await enqueue(record);
      return { ok: true };
    }
    case 'SAVE_SETTINGS': await loc.set({ settings: { ...(await settings()), ...m.settings } }); return { ok: true };
    case 'REVIEW': {
      const reviews = await get('reviews', []), r = reviews.find(x => x.id === m.id); if (!r) return { ok: false };
      await loc.set({ reviews: reviews.filter(x => x.id !== m.id) }); await badge();
      if (m.accept) { Object.assign(r.record, m.edits || {}); r.record.uniqueKey = U.uniqueKey(r.record.company, r.record.title, r.record.appliedDate); await enqueue(r.record); }
      return { ok: true };
    }
    case 'GET_APPLICATIONS': {
      const cached = (await loc.get('cachedApplications')).cachedApplications || [];
      const st = await settings();
      if (!st.spreadsheetId) {
        return { ok: true, source: 'cache', applications: cached, spreadsheetId: '' };
      }
      try {
        const sheetInfo = await JT.sheets.resolveSheetInfo(st.spreadsheetId, st.sheetName, false);
        const sheetName = sheetInfo.name;
        const base = `https://sheets.googleapis.com/v4/spreadsheets/${st.spreadsheetId}/values/`;
        const rng = encodeURIComponent(`${sheetName}!A2:N`);
        const data = await JT.sheets.api(`${base}${rng}?valueRenderOption=FORMULA`, {}, false);
        const rows = data.values || [];
        const extractUrl = val => {
          if (!val) return '';
          const match = String(val).match(/=HYPERLINK\("([^"]+)"/i);
          return match ? match[1] : (String(val).startsWith('http') ? String(val) : '');
        };
        const applications = rows.map((r, idx) => ({
          rowIndex: idx + 2,
          company: r[0] || '',
          title: r[1] || '',
          appliedDate: r[2] || '',
          jobLink: extractUrl(r[3]),
          status: r[4] || 'Applied',
          sourcePortal: r[5] || 'Direct',
          location: r[6] || '',
          employmentType: r[7] || '',
          experience: r[8] || '',
          salary: r[9] || '',
          stage: r[10] || '',
          loggedAt: r[11] || '',
          notes: r[12] || '',
          uniqueKey: r[13] || ''
        })).filter(a => a.company && a.company !== 'Company');

        await loc.set({ cachedApplications: applications });
        return { ok: true, source: 'sheets', spreadsheetId: st.spreadsheetId, applications };
      } catch (e) {
        return { ok: true, source: 'cache', applications: cached, spreadsheetId: st.spreadsheetId, error: e.message };
      }
    }
    case 'UPDATE_STATUS': {
      const { rowIndex, status, uniqueKey } = m;
      const st = await settings();
      let cached = (await loc.get('cachedApplications')).cachedApplications || [];
      cached = cached.map(c => {
        if ((rowIndex && c.rowIndex === rowIndex) || (uniqueKey && c.uniqueKey === uniqueKey)) {
          return { ...c, status };
        }
        return c;
      });
      await loc.set({ cachedApplications: cached });

      if (st.spreadsheetId && rowIndex) {
        try {
          const sheetInfo = await JT.sheets.resolveSheetInfo(st.spreadsheetId, st.sheetName, false);
          const sheetName = sheetInfo.name;
          const base = `https://sheets.googleapis.com/v4/spreadsheets/${st.spreadsheetId}/values/`;
          const rng = encodeURIComponent(`${sheetName}!E${rowIndex}`);
          await JT.sheets.api(`${base}${rng}?valueInputOption=USER_ENTERED`, {
            method: 'PUT',
            body: JSON.stringify({ range: `${sheetName}!E${rowIndex}`, values: [[status]] })
          }, false);
          return { ok: true };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      }
      return { ok: true };
    }
  }
}
chrome.runtime.onMessage.addListener((m, s, reply) => { handle(m, s).then(r => reply(r), e => reply({ ok: false, error: e.message })); return true; });
