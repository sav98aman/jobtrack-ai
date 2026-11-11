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
  },

  classifyEmail(subject, body, sender) {
    const text = `${subject || ''} ${body || ''} ${sender || ''}`.toLowerCase();

    // 1. Offer check
    const offerRegexes = [
      /offer\s+of\s+employment/i,
      /pleased\s+to\s+offer\s+you/i,
      /congratulations\s+on\s+your\s+offer/i,
      /formal\s+(job\s+)?offer/i,
      /offer\s+letter/i,
      /compensation\s+package/i
    ];
    for (const re of offerRegexes) {
      if (re.test(text)) {
        return { status: 'Offer', stage: 'Offer', label: 'Job Offer', icon: '🎉' };
      }
    }

    // 2. Interview check
    const interviewRegexes = [
      /(invitation|invite)\s+to\s+(interview|an\s+interview)/i,
      /schedule\s+(an?\s+interview|a\s+call|a\s+phone\s+screen|a\s+time\s+to\s+speak)/i,
      /like\s+to\s+invite\s+you\s+for\s+(an?\s+interview|a\s+discussion)/i,
      /next\s+(round|steps?)\s+(in\s+the\s+interview|of\s+interviews?|with)/i,
      /technical\s+interview|hiring\s+manager\s+(round|interview|screen|chat)/i,
      /availability\s+for\s+a\s+(quick\s+call|chat|phone\s+screen|video\s+call)/i,
      /calendly\.com\/[a-z0-9_-]+/i,
      /interview\s+schedule|zoom\s+link\s+for\s+interview|google\s+meet\s+link\s+for\s+interview/i,
      /\b(round\s*1|round\s*2|round\s*3|final\s*round)\b/i
    ];
    for (const re of interviewRegexes) {
      if (re.test(text)) {
        return { status: 'Interviewing', stage: 'Interview', label: 'Interview Invitation', icon: '📅' };
      }
    }

    // 3. Assessment / Coding test check
    const assessmentRegexes = [
      /(online|coding|technical)\s+(assessment|test|challenge|screening)/i,
      /hackerrank\.com\/|codesignal\.com\/|codility\.com\/|testgorilla\.com\/|hirevue\.com\/|karat\.com\//i,
      /complete\s+(your|the)\s+(assessment|coding\s+challenge|test)/i,
      /take-home\s+(assignment|project|test|challenge)/i,
      /link\s+to\s+(the|your)\s+(test|assessment)/i,
      /test\s+duration\s*:\s*\d+/i
    ];
    for (const re of assessmentRegexes) {
      if (re.test(text)) {
        return { status: 'Screening', stage: 'Assessment', label: 'Coding / Assessment Call', icon: '💻' };
      }
    }

    // 4. Rejection check
    const rejectionRegexes = [
      /unfortunately,?\s+(we\s+)?(will\s+not|are\s+unable|cannot|have\s+decided\s+not)\s+to\s+(move|proceed|advance)/i,
      /after\s+careful\s+consideration/i,
      /decided\s+to\s+(pursue|move\s+forward\s+with)\s+other\s+candidates/i,
      /regret\s+to\s+inform\s+you/i,
      /not\s+selected\s+for\s+(an?\s+interview|this\s+position|the\s+role)/i,
      /wish\s+you\s+(the\s+best|every\s+success)\s+in\s+your\s+(job\s+search|career)/i,
      /position\s+has\s+been\s+filled/i,
      /decided\s+not\s+to\s+move\s+forward/i,
      /not\s+moving\s+forward\s+with\s+your\s+application/i
    ];
    for (const re of rejectionRegexes) {
      if (re.test(text)) {
        return { status: 'Rejected', stage: 'Rejected', label: 'Application Rejection', icon: '❌' };
      }
    }

    return null;
  },

  extractCompanyFromEmail(senderName, senderEmail, subject, knownList = []) {
    const combined = `${senderName || ''} ${subject || ''}`.trim();

    // 1. Check known applied companies first
    for (const co of knownList) {
      if (!co || co.length < 2) continue;
      const re = new RegExp('\\b' + co.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
      if (re.test(combined)) {
        return co;
      }
    }

    // 2. Check subject patterns (e.g. "Interview with Acme Corp", "Update from Globex")
    const mAt = (subject || '').match(/(?:at|with|from)\s+([A-Za-z0-9&.,\- ]+?)(?:\s*[-–—:]|\s+for|\s+regarding|\s+team|\s+interview|\s+application|$)/i);
    if (mAt && mAt[1] && mAt[1].trim().length > 2 && mAt[1].trim().length < 40) {
      const candidate = mAt[1].trim();
      if (!/^(the|your|our|us|me|an?)\b/i.test(candidate)) return candidate;
    }

    // 3. Sender name (e.g. "Wise Recruiting" -> "Wise", "Haptik Careers" -> "Haptik")
    if (senderName) {
      let s = senderName.replace(/<.*?>/, '').trim();
      s = s.replace(/\s+(recruiting|careers|talent|hiring|team|jobs|hr)\b.*/i, '').trim();
      if (s.length > 2 && s.length < 40 && !/^(google|linkedin|microsoft|outlook|noreply|no-reply)$/i.test(s)) {
        return s;
      }
    }

    // 4. Sender domain (e.g. "careers@greyorange.com" -> "GreyOrange")
    if (senderEmail && senderEmail.includes('@')) {
      const domain = senderEmail.split('@')[1].split('.')[0];
      if (domain && !['gmail', 'outlook', 'yahoo', 'greenhouse', 'lever', 'smartrecruiters', 'workday', 'ashbyhq'].includes(domain.toLowerCase())) {
        return domain.charAt(0).toUpperCase() + domain.slice(1);
      }
    }

    return '';
  }
};
