// Detection engine: confidence scoring + employer-safe record building. Runs in the service worker.
JT.engine = {
  score(s, ctx) {
    let sc = 0; const r = [];
    if (s.phrase) { sc += 60; r.push('confirmation message on page'); }
    if (s.platformSpecific) { sc += 25; r.push('portal-specific confirmation element'); }
    if (s.urlConfirm) { sc += 20; r.push('confirmation-style URL'); }
    if (ctx.submitAt && Date.now() - ctx.submitAt < 10 * 60e3) { sc += 25; r.push('submit click observed'); }
    if (ctx.applyStartedAt) { sc += 10; r.push('apply journey tracked'); }
    if (s.formGone) { sc += 15; r.push('application form disappeared'); }
    if (s.negative) { sc -= 60; r.push('error / already-applied text present'); }
    return { score: Math.max(0, Math.min(100, sc)), reasons: r };
  },
  // Thresholds:
  // high (>= 60): Auto-saves directly to your Google Sheet! (Clear confirmation on page)
  // medium (35 - 59): Asks in popup to confirm when there is doubt or weak signals
  // low (< 35): Discarded (not enough evidence)
  level: sc => (sc >= 60 ? 'high' : sc >= 35 ? 'medium' : 'low'),

  isValidJobTitle(title) {
    if (!title || typeof title !== 'string') return false;
    const t = title.trim();
    if (t.length < 2 || t.length > 100) return false;
    if (/^(welcome|hello|hi|good (morning|afternoon|evening)|sign\s*in|log\s*in|sign\s*up|logout|my\s*(profile|account|applications|dashboard)|dashboard|account|settings|overview|search|careers|jobs|home|application\s*(sent|submitted|received)|thank\s*you|\d+\s*notifications?|notifications?)/i.test(t)) {
      return false;
    }
    return true;
  },

  buildRecord(ctx, cur) {
    const U = JT.util, issues = [];
    const sources = [
      ctx.submitJob ? { job: ctx.submitJob } : null,
      ctx.external,
      cur,
      ctx.origin
    ].filter(Boolean);
    const pick = f => { for (const s of sources) { const v = s.job && s.job[f]; if (v) return { v, src: s }; } return { v: '', src: null }; };
    let co = pick('company'), ti = pick('title');
    let title = ti.v;
    if (!JT.engine.isValidJobTitle(title)) {
      title = (ctx.submitJob && JT.engine.isValidJobTitle(ctx.submitJob.title) && ctx.submitJob.title) ||
              (ctx.origin && ctx.origin.job && JT.engine.isValidJobTitle(ctx.origin.job.title) && ctx.origin.job.title) || '';
    }
    let company = co.v;
    if (!company && cur.signals && cur.signals.phraseText) {
      const m = cur.signals.phraseText.match(/(?:sent to|apply to)\s+([A-Za-z0-9&.,\- ]{2,50}?)(?:!|\.|\n|$)/i);
      if (m && m[1]) company = m[1].trim();
    }
    if (!company && ctx.submitJob && ctx.submitJob.company) {
      company = ctx.submitJob.company;
    }
    if (!company) issues.push('Employer not found');
    if (!title) issues.push('Job title not found');
    let link = '';
    const jobPage = s => s && s.job && s.job.title && (s.job.canonical || s.url);
    if (jobPage(ctx.submitJob ? { job: ctx.submitJob, url: cur.url } : null)) link = ctx.submitJob.canonical || cur.url;
    else if (jobPage(ctx.origin)) link = ctx.origin.job.canonical || ctx.origin.url;
    else if (jobPage(ctx.external)) link = ctx.external.job.canonical || ctx.external.url;
    else if (cur.job && cur.job.canonical) link = cur.job.canonical;
    else { link = cur.url; issues.push('Job link is the confirmation page'); }
    const portal = ctx.origin && ctx.origin.platformId !== 'generic' ? ctx.origin.platformId
      : cur.platformId !== 'generic' ? cur.platformId : 'direct';
    const date = U.todayISO();
    return {
      company, title, appliedDate: date, jobLink: link,
      contact: '', location: pick('location').v, employmentType: pick('employmentType').v,
      experience: pick('experience').v, salary: pick('salary').v,
      notes: `Auto-tracked by JobTrack AI (source: ${portal}; site: ${U.hostOf(cur.url)})`,
      sourcePortal: portal, issues, uniqueKey: U.uniqueKey(company, title, date)
    };
  }
};
