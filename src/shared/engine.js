// Detection engine: confidence scoring + employer-safe record building. Runs in service worker and content scripts.
self.JT = self.JT || {};
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
    if (/^(apply(\s+to\s+.*)?|your\s+application|application\s*(sent|submitted|received|status|complete)|welcome|hello|hi|good (morning|afternoon|evening)|sign\s*in|log\s*in|sign\s*up|logout|my\s*(profile|account|applications|dashboard)|dashboard|account|settings|overview|search(\s+results)?|careers|jobs(\s+in\s+.*)?|home|thank\s*you|[\(\[]?\d+\s*notifications?[\)\]]?|notifications?)$/i.test(t)) {
      return false;
    }
    return true;
  },

  parseTitleFromUrl(url) {
    if (!url) return '';
    try {
      const u = new URL(url);
      if (u.hostname.includes('hirist') || u.hostname.includes('iimjobs')) {
        const m = u.pathname.match(/\/j\/([a-z0-9-]+?)(?:-\d+)?(?:\.html)?$/i);
        if (m && m[1]) {
          let slug = m[1].replace(/-\d+$/, '');
          const words = slug.split('-').map(w => {
            const lw = w.toLowerCase();
            if (lw === 'and') return '&';
            if (lw === 'c') return 'C++';
            if (lw === 'sdet' || lw === 'qa' || lw === 'ui' || lw === 'ux' || lw === 'api' || lw === 'ai' || lw === 'ml') return lw.toUpperCase();
            return w.charAt(0).toUpperCase() + w.slice(1);
          });
          return words.join(' ');
        }
      }
      if (u.hostname.includes('linkedin')) {
        const kw = u.searchParams.get('keywords');
        if (kw) {
          return kw.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        }
      }
      if (u.hostname.includes('naukri')) {
        const m = u.pathname.match(/\/(?:job-listings-)?([a-z0-9-]+?)(?:-\d+)?$/i);
        if (m && m[1]) {
          const words = m[1].replace(/-\d+$/, '').split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1));
          return words.join(' ');
        }
      }
    } catch {}
    return '';
  },

  normalizeRecord(company, title, locationStr, url) {
    let co = String(company || '').trim();
    let ti = String(title || '').trim();
    let loc = String(locationStr || '').trim();

    const ROLE_RE = /\b(engineer|developer|architect|specialist|consultant|manager|lead|tester|qa|sdet|fullstack|backend|frontend|devops|data scientist|scientist|analyst|intern|trainee|administrator|programmer|technician|expert|coder|master|officer|associate|director|vp|head)\b/i;
    const ROLE_TITLE_RE = /^(senior|lead|principal|staff|junior|associate|fullstack|full-stack|backend|frontend|java|python|cloud|data|qa|devops|coding|polarion)?\s*.*?\b(engineer|developer|architect|specialist|consultant|manager|lead|tester|qa|sdet|analyst|intern|trainee|administrator|programmer|expert|coder)$/i;
    const DOMAIN_RE = /\b(fintech|domain|architecture|development|plugin|microservices|java|python|c\+\+|node|ai|testing|cloud|aws|azure|gcp|security|infrastructure)\b/i;
    const LOC_RE = /\b(india|usa|us|uk|jordan|canada|germany|singapore|uae|australia|ireland|netherlands|hyderabad|bangalore|bengaluru|pune|mumbai|delhi|noida|gurgaon|gurugram|chennai|telangana|karnataka|maharashtra|london|dubai|amman|remote|hybrid|onsite)\b/i;
    const LEGAL_RE = /\b(inc|llc|ltd|pvt|corp|corporation|co|llp|gmbh|sa|plc)\b/i;

    // 1. Clean Pipe in Company (e.g. "CRM & Notification Platform | noon", "Fullstack Developer | Talentgigs", "Bangalore ... | Golden Opportunities")
    if (co.includes('|')) {
      const parts = co.split('|').map(s => s.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const lastPart = parts[parts.length - 1];
        const firstPart = parts[0];

        if (ROLE_RE.test(firstPart) && !ROLE_RE.test(lastPart)) {
          if (!ti || ti.length < 5 || ti.toLowerCase() === 'java' || ti === 'Job Application') {
            ti = firstPart;
          }
          co = lastPart;
        } else if (!ROLE_RE.test(lastPart)) {
          co = lastPart;
        } else if (!ROLE_RE.test(firstPart)) {
          co = firstPart;
        }
      }
    }

    // 2. Swapped Role & Domain (e.g. on Hirist: company = "Senior Software Development Engineer", title = "Test - Fintech Domain")
    if (ROLE_TITLE_RE.test(co) && !/\b(technologies|solutions|services|consulting|systems|inc|llc|ltd|pvt|corp|corporation|group|agency|recruitment|staffing|partners|enterprises)\b/i.test(co)) {
      if (ti && DOMAIN_RE.test(ti)) {
        ti = `${co} - ${ti}`;
        co = 'Confidential';
      } else if (!ti || ti === 'Job Application') {
        ti = co;
        co = 'Confidential';
      } else {
        ti = `${co} - ${ti}`;
        co = 'Confidential';
      }
    }

    // 3. Trailing Location in Company (e.g. "Aspire, Jordan" -> company: "Aspire", location: "Jordan")
    const mLoc = co.match(/^(.+?),\s*([A-Za-z\s]+)$/);
    if (mLoc) {
      const mainComp = mLoc[1].trim();
      const trailLoc = mLoc[2].trim();
      if (!LEGAL_RE.test(trailLoc) && LOC_RE.test(trailLoc)) {
        co = mainComp;
        if (!loc) loc = trailLoc;
      }
    }

    // 4. Recover title from URL if missing or invalid
    if (!ti || !JT.engine.isValidJobTitle(ti)) {
      const fromUrl = JT.engine.parseTitleFromUrl(url);
      if (fromUrl && JT.engine.isValidJobTitle(fromUrl)) {
        ti = fromUrl;
      }
    }

    // 5. Strip junk prefixes
    co = co.replace(/^(hiring for|careers at|jobs at|welcome to)\s+/i, '').trim();

    return { company: co, title: ti, location: loc };
  },

  buildRecord(ctx, cur) {
    const U = JT.util, issues = [];
    const sources = [
      ctx.submitJob ? { job: ctx.submitJob } : null,
      ctx.applyJob ? { job: ctx.applyJob } : null,
      ctx.external,
      cur,
      ctx.origin
    ].filter(Boolean);
    const pick = f => { for (const s of sources) { const v = s.job && s.job[f]; if (v) return { v, src: s }; } return { v: '', src: null }; };
    let co = pick('company'), ti = pick('title');
    let rawTitle = ti.v;
    if (!JT.engine.isValidJobTitle(rawTitle)) {
      rawTitle = (ctx.submitJob && JT.engine.isValidJobTitle(ctx.submitJob.title) && ctx.submitJob.title) ||
                 (ctx.applyJob && JT.engine.isValidJobTitle(ctx.applyJob.title) && ctx.applyJob.title) ||
                 (ctx.origin && ctx.origin.job && JT.engine.isValidJobTitle(ctx.origin.job.title) && ctx.origin.job.title) ||
                 (ctx.external && ctx.external.job && JT.engine.isValidJobTitle(ctx.external.job.title) && ctx.external.job.title) || '';
    }
    let rawCompany = co.v;
    if (!rawCompany && cur.signals && cur.signals.phraseText) {
      const m = cur.signals.phraseText.match(/(?:sent to|apply to)\s+([A-Za-z0-9&.,\- ]{2,50}?)(?:!|\.|\n|$)/i);
      if (m && m[1]) rawCompany = m[1].trim();
    }
    if (!rawCompany && ctx.submitJob && ctx.submitJob.company) {
      rawCompany = ctx.submitJob.company;
    }
    if (!rawCompany && ctx.applyJob && ctx.applyJob.company) {
      rawCompany = ctx.applyJob.company;
    }
    if (!rawCompany && ctx.origin && ctx.origin.job && ctx.origin.job.company) {
      rawCompany = ctx.origin.job.company;
    }

    let link = '';
    const jobPage = s => s && s.job && s.job.title && (s.job.canonical || s.url);
    if (jobPage(ctx.submitJob ? { job: ctx.submitJob, url: cur.url } : null)) link = ctx.submitJob.canonical || cur.url;
    else if (jobPage(ctx.applyJob ? { job: ctx.applyJob, url: cur.url } : null)) link = ctx.applyJob.canonical || cur.url;
    else if (jobPage(ctx.origin)) link = ctx.origin.job.canonical || ctx.origin.url;
    else if (jobPage(ctx.external)) link = ctx.external.job.canonical || ctx.external.url;
    else if (cur.job && cur.job.canonical) link = cur.job.canonical;
    else { link = cur.url; issues.push('Job link is the confirmation page'); }

    let rawLoc = pick('location').v;
    const norm = JT.engine.normalizeRecord(rawCompany, rawTitle, rawLoc, link || cur.url);
    let company = norm.company;
    let title = norm.title;
    if (norm.location) rawLoc = norm.location;

    if (!company) issues.push('Employer not found');
    if (!title) issues.push('Job title not found');
    const rawPortal = ctx.origin && ctx.origin.platformId !== 'generic' ? ctx.origin.platformId
      : cur.platformId !== 'generic' ? cur.platformId : 'direct';
    const formatPortal = (pId, u) => {
      const p = String(pId || '').toLowerCase();
      if (p === 'linkedin') return 'LinkedIn';
      if (p === 'hirist') return 'Hirist';
      if (p === 'iimjobs') return 'IIMJobs';
      if (p === 'naukri') return 'Naukri';
      if (p === 'indeed') return 'Indeed';
      if (p === 'instahyre') return 'Instahyre';
      if (p === 'foundit') return 'Foundit (Monster)';
      if (p === 'greenhouse') return 'Greenhouse';
      if (p === 'lever') return 'Lever';
      if (p === 'workday') return 'Workday';
      if (p === 'smartrecruiters') return 'SmartRecruiters';
      if (p === 'ashby') return 'Ashby';
      if (u) {
        try {
          const h = new URL(u).hostname.replace(/^www\./, '');
          if (h.includes('linkedin')) return 'LinkedIn';
          if (h.includes('hirist')) return 'Hirist';
          if (h.includes('iimjobs')) return 'IIMJobs';
          if (h.includes('naukri')) return 'Naukri';
          if (h.includes('indeed')) return 'Indeed';
          return `Career Site (${h})`;
        } catch {}
      }
      return 'Company Career Site';
    };
    const portal = formatPortal(rawPortal, link || cur.url);
    const date = U.todayISO();
    return {
      company, title, appliedDate: date, jobLink: link,
      contact: '', location: pick('location').v, employmentType: pick('employmentType').v,
      experience: pick('experience').v, salary: pick('salary').v,
      notes: `Auto-tracked by JobTrack AI (source: ${rawPortal}; site: ${U.hostOf(cur.url)})`,
      sourcePortal: portal, issues, uniqueKey: U.uniqueKey(company, title, date)
    };
  }
};
