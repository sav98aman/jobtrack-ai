// Portal adapters + job extraction. Selectors are best-effort starting points:
// every platform stays "Not Tested" until it passes the quality gate (see SUPPORT_MATRIX.md).
self.JT = self.JT || {};
if (!JT.engine) {
  JT.engine = {
    isValidJobTitle: t => !!(t && typeof t === 'string' && t.trim().length >= 2),
    normalizeRecord: (c, t, l) => ({ company: c, title: t, location: l }),
    parseTitleFromUrl: () => ''
  };
}

JT.adapters = (() => {
  const PLATFORM_NAME_RE = /^(linkedin|naukri|indeed|workday|myworkdayjobs|greenhouse|lever|ashby|ashbyhq|smartrecruiters|instahyre|foundit|monster|iimjobs|hirist)\b/i;
  const slugName = s => decodeURIComponent(s || '').replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();
  const firstPath = () => location.pathname.split('/').filter(Boolean)[0];

  const PLATFORMS = [
    { id: 'linkedin', host: /(^|\.)linkedin\.com$/, jobUrl: /\/jobs\/(view|collections|search)|currentJobId=/,
      employer: [
        '.job-details-jobs-unified-top-card__company-name a', '.job-details-jobs-unified-top-card__company-name',
        '.jobs-unified-top-card__company-name a', '.jobs-unified-top-card__company-name',
        '.artdeco-entity-lockup__subtitle a', '.artdeco-entity-lockup__subtitle',
        '[class*="company-name"] a', '[class*="company-name"]',
        '.topcard__org-name-link'
      ],
      title: [
        '.job-details-jobs-unified-top-card__job-title h1', '.job-details-jobs-unified-top-card__job-title',
        '.jobs-unified-top-card__job-title h1', '.jobs-unified-top-card__job-title h2', '.jobs-unified-top-card__job-title',
        '[class*="job-title"] h1', '[class*="job-title"] h2', '[class*="job-title"]',
        '.top-card-layout__title', 'h1'
      ],
      confirmSel: ['[data-test-modal-id="post-apply-modal"]', '[class*="post-apply"]'],
      confirmText: /(application (was |has been )?(sent|submitted)|your application was sent to|application submitted)/i },
    { id: 'naukri', host: /(^|\.)naukri\.com$/, jobUrl: /job-listings|saveapply|myapply/i,
      employer: ['.jd-header-comp-name a', '[class*="comp-name"]', '.subTitle a', '[class*="company-name"]'],
      title: ['.jd-header-title', 'h1'],
      confirmSel: ['[class*="apply-message"]', '[class*="success-msg"]', '[class*="applied"]', '[class*="saveApply"]'],
      confirmUrl: /saveapply|myapply|confirmation|applied/i,
      confirmText: /(applied to ["'].+?["']|applied to |interview preparation for|application (submitted|sent))/i },
    { id: 'indeed', host: /(^|\.)indeed\.com$/, jobUrl: /viewjob|[?&]vjk=/,
      employer: ['[data-testid="inlineHeader-companyName"]', '[data-company-name]'], title: ['.jobsearch-JobInfoHeader-title', 'h1'],
      confirmUrl: /post-apply|applied|confirmation/i },
    { id: 'instahyre', host: /(^|\.)instahyre\.com$/, jobUrl: /job-/, employer: [], title: ['h1'] },
    { id: 'foundit', host: /(^|\.)foundit\.in$/, jobUrl: /job\//, employer: [], title: ['h1'] },
    { id: 'iimjobs', host: /(^|\.)iimjobs\.com$/, jobUrl: /\/j\//, employer: [], title: ['h1'] },
    { id: 'hirist', host: /(^|\.)hirist\.(tech|com)$/, jobUrl: /\/j\//, employer: [], title: ['h1'] },
    { id: 'greenhouse', host: /(^|\.)greenhouse\.io$/, jobUrl: /\/jobs\/\d+/, urlEmployer: () => slugName(firstPath()),
      employer: ['.company-name'], title: ['h1.app-title', 'h1'], confirmUrl: /confirmation/i, confirmSel: ['#application_confirmation, .application--submitted'] },
    { id: 'lever', host: /(^|\.)lever\.co$/, jobUrl: /\/[0-9a-f-]{36}/, urlEmployer: () => slugName(firstPath()),
      employer: [], title: ['.posting-headline h2', 'h1'], confirmUrl: /\/thanks/i },
    { id: 'ashby', host: /(^|\.)ashbyhq\.com$/, jobUrl: /\/[0-9a-f-]{36}/, urlEmployer: () => slugName(firstPath()),
      employer: [], title: ['h1'] },
    { id: 'smartrecruiters', host: /(^|\.)smartrecruiters\.com$/, jobUrl: /\/[^/]+\/\d+/, urlEmployer: () => slugName(firstPath()),
      employer: ['[itemprop="hiringOrganization"] [itemprop="name"]'], title: ['h1'] },
    { id: 'workday', host: /(^|\.)myworkdayjobs\.com$/, jobUrl: /\/job\//,
      urlEmployer: () => slugName(location.hostname.split('.')[0]), employer: [], title: ['[data-automation-id="jobPostingHeader"]', 'h1'] }
  ];
  const GENERIC = { id: 'generic', employer: [], title: ['h1'] };
  const WEBMAIL = { id: 'webmail_ignore', employer: [], title: [] };
  const isWebmail = h => /(^|\.)(mail\.google\.com|inbox\.google\.com|outlook\.(live|office|office365)\.com|mail\.yahoo\.com|mail\.proton\.(me|com)|mail\.zoho\.(com|in)|mail\.icloud\.com)$/i.test(h);

  const detectPlatform = () => {
    if (isWebmail(location.hostname)) return WEBMAIL;
    return PLATFORMS.find(p => p.host.test(location.hostname)) || GENERIC;
  };
  const txt = (sels) => {
    for (const s of sels || []) { const el = document.querySelector(s); const t = el && el.textContent.trim(); if (t) return t.replace(/\s+/g, ' '); }
    return '';
  };
  const isPlatformName = n => PLATFORM_NAME_RE.test(String(n || '').trim());

  function jsonLdJob() {
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      let data; try { data = JSON.parse(s.textContent); } catch { continue; }
      const stack = Array.isArray(data) ? [...data] : [data];
      while (stack.length) {
        const n = stack.pop(); if (!n || typeof n !== 'object') continue;
        if (n['@graph']) stack.push(...[].concat(n['@graph']));
        if ([].concat(n['@type']).includes('JobPosting')) return n;
      }
    }
    return null;
  }

  function extractLinkedInJob(clickedEl) {
    let company = '', title = '', locationStr = '', canonical = '';
    const ROLE_RE = /\b(engineer|developer|architect|specialist|consultant|manager|lead|tester|qa|sdet|fullstack|backend|frontend|devops|data scientist|analyst|intern|trainee|administrator|programmer|expert|coder)\b/i;

    // 0. If clicked element or button is provided (e.g. from Easy Apply click), inspect its context
    if (clickedEl) {
      const aria = clickedEl.getAttribute('aria-label') || '';
      if (aria) {
        const mAt = aria.match(/(?:easy\s+)?apply\s+to\s+(.+?)\s+at\s+(.+)$/i);
        if (mAt) {
          if (!title && JT.engine.isValidJobTitle(mAt[1])) title = mAt[1].trim();
          if (!company && !isPlatformName(mAt[2])) company = mAt[2].trim();
        } else {
          const mTo = aria.match(/(?:easy\s+)?apply\s+to\s+(.+)$/i);
          if (mTo) {
            const val = mTo[1].trim();
            if (ROLE_RE.test(val) && JT.engine.isValidJobTitle(val)) {
              if (!title) title = val;
            } else if (!isPlatformName(val)) {
              if (!company) company = val;
            }
          }
        }
      }
      const card = clickedEl.closest('[data-job-id], [data-occludable-job-id], [data-view-name="job-card"], .job-card-container, [class*="job-card"], li');
      if (card) {
        if (!title) {
          const tEl = card.querySelector('a.job-card-list__title, [class*="job-title"], strong, a[href*="/jobs/view/"]');
          if (tEl) {
            const t = tEl.textContent.trim().replace(/\s+/g, ' ');
            if (JT.engine.isValidJobTitle(t)) title = t;
          }
        }
        if (!company) {
          const cEl = card.querySelector('.job-card-container__primary-description, [class*="company-name"], a[href*="/company/"]');
          if (cEl) {
            let c = cEl.textContent.trim().replace(/\s+/g, ' ').split('·')[0].split('•')[0].trim();
            if (c && !isPlatformName(c)) company = c;
          }
        }
        if (!locationStr) {
          const lEl = card.querySelector('.job-card-container__metadata-item, [class*="metadata"]');
          if (lEl) locationStr = lEl.textContent.trim().replace(/\s+/g, ' ').split('·')[0].trim();
        }
      }
    }

    // 1. If an Easy Apply modal or confirmation modal is open, inspect modal text for company ONLY
    const modal = document.querySelector('.artdeco-modal, [role=dialog]');
    if (modal) {
      const modalText = (modal.innerText || '').trim();
      const mSent = modalText.match(/Your application was sent to\s+([A-Za-z0-9&.,\- ]+?)!/i);
      if (mSent && mSent[1] && !isPlatformName(mSent[1])) company = mSent[1].trim();
      if (!company) {
        const mApply = modalText.match(/Apply to\s+([A-Za-z0-9&.,\- ]+?)(?:\n|\?|$)/i);
        if (mApply && mApply[1] && !isPlatformName(mApply[1])) company = mApply[1].trim();
      }
      // ONLY check modal for title if there is a specific job-title element (NEVER header h2 which is "Apply to [Company]")
      if (!title) {
        const mTitleEl = modal.querySelector('.jobs-unified-top-card__job-title, [class*="top-card"] [class*="job-title"]');
        if (mTitleEl) {
          const mt = mTitleEl.textContent.trim().replace(/\s+/g, ' ');
          if (mt && JT.engine.isValidJobTitle(mt)) title = mt;
        }
      }
    }

    // 2. Company from active job detail pane or active item in search list
    if (!company) {
      const compEl = document.querySelector(
        '.job-details-jobs-unified-top-card__company-name a, .job-details-jobs-unified-top-card__company-name, ' +
        '.jobs-unified-top-card__company-name a, .jobs-unified-top-card__company-name, ' +
        '.artdeco-entity-lockup__subtitle a, .artdeco-entity-lockup__subtitle, ' +
        'li[class*="list-item--active"] [class*="primary-description"], ' +
        'li[class*="list-item--active"] a[href*="/company/"], ' +
        '[class*="job-card-container--selected"] [class*="primary-description"], ' +
        '[class*="job-card-container--selected"] a[href*="/company/"], ' +
        '.jobs-search__job-details a[href*="/company/"], .jobs-details a[href*="/company/"], ' +
        'a[data-tracking-control-name*="company"], a[href*="/company/"]'
      );
      if (compEl) {
        let t = compEl.textContent.trim().replace(/\s+/g, ' ');
        t = t.split('·')[0].split('•')[0].trim();
        if (t && !isPlatformName(t)) company = t;
      }
    }

    // 3. Job title from active job details pane
    if (!title) {
      const titleEl = document.querySelector(
        '.job-details-jobs-unified-top-card__job-title h1, .job-details-jobs-unified-top-card__job-title h2, .job-details-jobs-unified-top-card__job-title, ' +
        '.jobs-unified-top-card__job-title h1, .jobs-unified-top-card__job-title h2, .jobs-unified-top-card__job-title, ' +
        '.job-details-jobs-unified-top-card h1, .job-details-jobs-unified-top-card h2, ' +
        '.jobs-search__job-details h1, .jobs-search__job-details h2, .jobs-details__main-content h1, main h1'
      );
      if (titleEl) {
        let t = titleEl.textContent.trim().replace(/\s+/g, ' ');
        if (t && JT.engine.isValidJobTitle(t)) {
          title = t;
        }
      }
    }

    // 3b. Job title from currentJobId active card in search list
    if (!title) {
      const mJobId = location.href.match(/[?&]currentJobId=(\d+)/) || location.pathname.match(/\/jobs\/view\/(\d+)/);
      if (mJobId && mJobId[1]) {
        const activeCard = document.querySelector(`[data-job-id="${mJobId[1]}"] a.job-card-list__title, [data-occludable-job-id="${mJobId[1]}"] a.job-card-list__title, [data-job-id="${mJobId[1]}"] strong, a[href*="/jobs/view/${mJobId[1]}"] strong, a[href*="/jobs/view/${mJobId[1]}"]`);
        if (activeCard) {
          const t = activeCard.textContent.trim().replace(/\s+/g, ' ');
          if (t && JT.engine.isValidJobTitle(t)) title = t;
        }
        if (!company) {
          const cCard = document.querySelector(`[data-job-id="${mJobId[1]}"] [class*="primary-description"], [data-occludable-job-id="${mJobId[1]}"] [class*="primary-description"], [data-job-id="${mJobId[1]}"] [class*="company-name"]`);
          if (cCard) {
            const c = cCard.textContent.trim().replace(/\s+/g, ' ').split('·')[0].split('•')[0].trim();
            if (c && !isPlatformName(c)) company = c;
          }
        }
      }
    }

    // 3c. Fallback to active list item title in search list
    if (!title) {
      const anyActive = document.querySelector(
        'li[class*="list-item--active"] a.job-card-list__title, li[class*="list-item--active"] [class*="job-title"], ' +
        '[class*="job-card-container--selected"] a.job-card-list__title, [class*="job-card-container--selected"] strong, ' +
        'div[data-view-name="job-card"][aria-current="true"] a, li.active a.job-card-list__title'
      );
      if (anyActive) {
        const t = anyActive.textContent.trim().replace(/\s+/g, ' ');
        if (t && JT.engine.isValidJobTitle(t)) title = t;
      }
    }

    // 4. Fallback to document.title
    if (!company || !title) {
      let dt = (document.title || '').replace(/^\(\d+\+?\)\s*/, '').replace(/\s*\|\s*LinkedIn.*$/i, '').trim();
      let tm = dt.match(/^(.+?)\s+hiring\s+(.+?)(?:\s+in\s+.*)?$/i);
      if (tm) {
        if (!company) company = tm[1].trim();
        if (!title && JT.engine.isValidJobTitle(tm[2])) title = tm[2].trim();
      } else {
        tm = dt.match(/^(.+?)\s+(?:at|[-–—])\s+(.+?)$/i);
        if (tm) {
          const left = tm[1].trim(), right = tm[2].trim();
          if (ROLE_RE.test(left)) {
            if (!title && JT.engine.isValidJobTitle(left)) title = left;
            if (!company && !isPlatformName(right)) company = right;
          } else {
            if (!company && !isPlatformName(left)) company = left;
            if (!title && JT.engine.isValidJobTitle(right)) title = right;
          }
        }
      }
    }

    // 4b. Recover title from search query keywords if still missing
    if (!title) {
      const fromUrl = JT.engine.parseTitleFromUrl(location.href);
      if (fromUrl && JT.engine.isValidJobTitle(fromUrl)) title = fromUrl;
    }

    // 5. Location
    const locEl = document.querySelector(
      '.job-details-jobs-unified-top-card__primary-description-container, .artdeco-entity-lockup__caption, ' +
      'li[class*="list-item--active"] .job-card-container__metadata-item, [class*="job-card-container--selected"] .job-card-container__metadata-item'
    );
    if (locEl) {
      locationStr = locEl.textContent.trim().replace(/\s+/g, ' ').split('·')[0].trim();
    }

    // 6. Clean canonical URL
    const mUrl = location.href.match(/[?&]currentJobId=(\d+)/) || location.pathname.match(/\/jobs\/view\/(\d+)/);
    if (mUrl && mUrl[1]) {
      canonical = 'https://www.linkedin.com/jobs/view/' + mUrl[1] + '/';
    }

    const norm = JT.engine.normalizeRecord(company, title, locationStr, canonical || location.href);

    return {
      company: norm.company,
      title: norm.title,
      location: norm.location || locationStr,
      canonical: canonical || location.href,
      employerSource: norm.company ? 'page' : ''
    };
  }

  function extractHiristJob(clickedEl) {
    let company = '', title = '', locationStr = '', canonical = '';
    const ROLE_RE = /\b(engineer|developer|architect|specialist|consultant|manager|lead|tester|qa|sdet|fullstack|backend|frontend|devops|data scientist|analyst|intern|trainee|administrator|programmer|expert|coder)\b/i;
    const ROLE_TITLE_RE = /^(senior|lead|principal|staff|junior|associate|fullstack|full-stack|backend|frontend|java|python|cloud|data|qa|devops|coding|polarion)?\s*.*?\b(engineer|developer|architect|specialist|consultant|manager|lead|tester|qa|sdet|analyst|intern|trainee|administrator|programmer|expert|coder)$/i;

    // 0. Check JSON-LD
    const ld = jsonLdJob();
    if (ld) {
      if (ld.hiringOrganization) {
        const orgName = ld.hiringOrganization.name || (typeof ld.hiringOrganization === 'string' && ld.hiringOrganization);
        if (orgName && !isPlatformName(orgName) && !ROLE_TITLE_RE.test(orgName)) {
          company = orgName.trim();
        }
      }
      if (ld.title && JT.engine.isValidJobTitle(ld.title)) {
        title = ld.title.trim();
      }
    }

    // 1. Direct company element on Hirist (e.g. a[href*="/c/"], .recruiter-company)
    if (!company) {
      const compEl = document.querySelector('a[href*="/c/"], .recruiter-company, [class*="recruiter-company"], [class*="company-name"] a, [class*="company-name"], [class*="comp-name"], .recruiter-name');
      if (compEl) {
        let t = compEl.textContent.trim().replace(/\s+/g, ' ');
        if (t && !isPlatformName(t) && !ROLE_TITLE_RE.test(t)) {
          company = t;
        }
      }
    }

    // 2. Breadcrumb check
    // e.g. "Home > Backend Development > True Balance - Java Backend Engineer" OR "Home > Category > Polarion Developer - Java & Plugin Development"
    const breadcrumbEl = document.querySelector('nav[aria-label="breadcrumb"], .breadcrumb, [class*="breadcrumb"], .bread-crumb, ol[class*="breadcrumb"]');
    if (breadcrumbEl) {
      const parts = (breadcrumbEl.innerText || '').split('>').map(s => s.trim()).filter(Boolean);
      if (parts.length) {
        const last = parts[parts.length - 1];
        const m = last.match(/^([A-Za-z0-9&.,' /()-]+?)\s+-\s+(.+)$/);
        if (m) {
          if (!ROLE_TITLE_RE.test(m[1]) && !isPlatformName(m[1])) {
            if (!company) company = m[1].trim();
            if (!title) title = m[2].trim();
          } else {
            // First part was a job role, not a company! Entire string is the job title
            if (!title) title = last.trim();
          }
        } else {
          if (!title) title = last.trim();
        }
      }
    }

    // 3. Fallback to page title selector
    if (!title) {
      const titleEl = document.querySelector('[class*="job-title"] h1, [class*="job-title"], h1');
      if (titleEl) {
        let t = titleEl.textContent.trim().replace(/\s+/g, ' ');
        if (t && JT.engine.isValidJobTitle(t)) title = t;
      }
    }

    // 4. Document title fallback
    if (!company || !title) {
      const dt = (document.title || '').replace(/\s*\|\s*(Hirist|iimjobs).*$/i, '').trim();
      const m = dt.match(/^([A-Za-z0-9&.,' /()-]+?)\s+-\s+(.+)$/);
      if (m) {
        if (!ROLE_TITLE_RE.test(m[1]) && !isPlatformName(m[1])) {
          if (!company) company = m[1].trim();
          if (!title && JT.engine.isValidJobTitle(m[2])) title = m[2].trim();
        } else {
          if (!title && JT.engine.isValidJobTitle(dt)) title = dt;
        }
      } else {
        if (!title && JT.engine.isValidJobTitle(dt)) title = dt;
      }
    }

    // 4b. Recover title from URL slug fallback
    if (!title) {
      const fromUrl = JT.engine.parseTitleFromUrl(location.href);
      if (fromUrl && JT.engine.isValidJobTitle(fromUrl)) title = fromUrl;
    }

    // 5. Job link
    const mJobId = location.search.match(/[?&]jobId=(\d+)/) || location.pathname.match(/\/j\/.*?(\d+)\.html/);
    if (mJobId && mJobId[1]) {
      canonical = location.origin + '/j/' + mJobId[1] + '.html';
    }

    const norm = JT.engine.normalizeRecord(company, title, locationStr, canonical || location.href);

    return {
      company: norm.company,
      title: norm.title,
      location: norm.location || locationStr,
      canonical: canonical || location.href,
      employerSource: norm.company ? 'page' : ''
    };
  }

  function extractNaukriJob() {
    let company = '', title = '', locationStr = '', canonical = '';

    // 1. Check for Naukri post-apply confirmation page (e.g. /myapply/saveApply or similar)
    const pageText = (document.body ? document.body.innerText : '') || '';

    // Match: Applied to "Java Developer"
    const mApplied = pageText.match(/Applied to\s+["']([^"'\n\r]+)["']/i) || pageText.match(/Applied to\s+([^\n\r]+)/i);
    if (mApplied && mApplied[1]) {
      const candidateTitle = mApplied[1].trim();
      if (candidateTitle.length < 80 && !candidateTitle.includes('\n')) {
        title = candidateTitle;
      }
    }

    // Match: Start your interview preparation for Rimpac
    const mPrep = pageText.match(/(?:interview preparation for|preparation for|questions for)\s+([A-Za-z0-9&.,' /()-]+?)(?:\s+(?:Start|View|Attempted|by)|\n|\r|$)/i);
    if (mPrep && mPrep[1]) {
      const candidateCompany = mPrep[1].trim();
      if (candidateCompany.length < 80 && !isPlatformName(candidateCompany)) {
        company = candidateCompany;
      }
    }

    // 2. Selectors on Naukri job view / listing page
    if (!company) {
      const compEl = document.querySelector('.jd-header-comp-name a, [class*="comp-name"] a, [class*="comp-name"], .subTitle a, a[title*="Careers at"], [class*="company-name"]');
      if (compEl) {
        let t = compEl.textContent.trim().replace(/\s+/g, ' ');
        if (t && !isPlatformName(t)) company = t;
      }
    }

    if (!title) {
      const titleEl = document.querySelector('.jd-header-title, [class*="jd-header-title"], h1');
      if (titleEl) {
        let t = titleEl.textContent.trim().replace(/\s+/g, ' ');
        const mSub = t.match(/Applied to\s+["']?([^"']+)["']?/i);
        if (mSub) t = mSub[1].trim();
        if (t && JT.engine.isValidJobTitle(t)) title = t;
      }
    }

    // 3. Location, Experience, Salary
    const locEl = document.querySelector('.location span, .loc span, [class*="location"]');
    if (locEl) locationStr = locEl.textContent.trim().replace(/\s+/g, ' ');

    // 4. Document title fallback
    if (!company || !title) {
      const dt = (document.title || '').replace(/\s*[-|]\s*Naukri\.com.*$/i, '').trim();
      const mAt = dt.match(/^(.+?)\s+(?:Job\s+(?:in\s+.*?at|at)|at|[-–—])\s+(.+?)$/i);
      if (mAt) {
        if (!title && JT.engine.isValidJobTitle(mAt[1])) title = mAt[1].trim();
        if (!company && !isPlatformName(mAt[2])) company = mAt[2].trim();
      }
    }

    // 5. Job link
    const mJobId = location.search.match(/strJobsarr=\[(\d+)\]/) || location.search.match(/id=(\d+)/) || location.pathname.match(/-(\d+)$/);
    if (mJobId && mJobId[1]) {
      canonical = location.origin + '/job-listings-' + mJobId[1];
    }

    if (title && /^(application (sent|submitted)|jobs|search|naukri|apply|apply to .*|[\(\[]?\d+\s*notifications?[\)\]]?|notifications?)$/i.test(title)) title = '';
    if (company && isPlatformName(company)) company = '';

    return {
      company: company.trim(),
      title: title.trim(),
      location: locationStr,
      canonical: canonical || location.href,
      employerSource: company ? 'page' : ''
    };
  }

  function extractJob(clickedEl) {
    const p = detectPlatform(), ld = jsonLdJob(), job = { employerSource: '' };
    let company = '', title = '', locationStr = '', canonical = '';

    if (p.id === 'linkedin') {
      const li = extractLinkedInJob(clickedEl);
      if (li.company) { company = li.company; job.employerSource = li.employerSource || 'page'; }
      if (li.title) { title = li.title; }
      if (li.location) locationStr = li.location;
      if (li.canonical) canonical = li.canonical;
    } else if (p.id === 'hirist' || p.id === 'iimjobs') {
      const hj = extractHiristJob(clickedEl);
      if (hj.company) { company = hj.company; job.employerSource = hj.employerSource || 'page'; }
      if (hj.title) { title = hj.title; }
      if (hj.location) locationStr = hj.location;
      if (hj.canonical) canonical = hj.canonical;
    } else if (p.id === 'naukri') {
      const nj = extractNaukriJob();
      if (nj.company) { company = nj.company; job.employerSource = nj.employerSource || 'page'; }
      if (nj.title) { title = nj.title; }
      if (nj.location) locationStr = nj.location;
      if (nj.canonical) canonical = nj.canonical;
    }

    if (!company) {
      const org = ld && ld.hiringOrganization;
      company = org && (org.name || (typeof org === 'string' && org));
      if (company && !isPlatformName(company)) job.employerSource = 'jsonld'; else company = '';
    }
    if (!company) { company = txt(p.employer); if (company && !isPlatformName(company)) job.employerSource = 'page'; else company = ''; }
    if (!company && p.id === 'generic') {
      const og = document.querySelector('meta[property="og:site_name"]');
      company = og && og.content; if (company) job.employerSource = 'meta';
    }
    if (!company && p.urlEmployer) { company = p.urlEmployer(); if (company) job.employerSource = 'url'; }
    if (!company) {
      const pageText = document.body ? document.body.innerText : '';
      const m = pageText.match(/(?:application (?:was |has been )?sent to|thank you for applying to|thanks for applying to|apply to)\s+([A-Za-z0-9&.,\- ]{2,50}?)(?:!|\.|\n|\?|$)/i);
      if (m && m[1] && !isPlatformName(m[1])) {
        company = m[1].trim();
        job.employerSource = 'confirmation-text';
      }
    }

    if (!title) {
      title = (ld && ld.title) || txt(p.title) || txt(['.jobs-unified-top-card__job-title', '[class*="job-title"]', 'h1', 'h2']) || '';
    }
    if (title && !JT.engine.isValidJobTitle(title)) {
      title = '';
    }
    if (!company || !title) {
      let dt = (document.title || '').replace(/^\(\d+\+?\)\s*/, '').replace(/\s*\|\s*(LinkedIn|Naukri|Hirist|Indeed).*$/i, '').trim();
      let tm = dt.match(/^(.+?)\s+hiring\s+(.+?)(?:\s+in\s+.*)?$/i);
      if (tm) {
        if (!company) company = tm[1].trim();
        if (!title && JT.engine.isValidJobTitle(tm[2])) title = tm[2].trim();
      } else {
        tm = dt.match(/^(.+?)\s+(?:at|[-–—])\s+(.+?)$/i);
        if (tm) {
          if (!title && JT.engine.isValidJobTitle(tm[1])) title = tm[1].trim();
          if (!company && !isPlatformName(tm[2])) company = tm[2].trim();
        }
      }
    }

    const canon = document.querySelector('link[rel="canonical"]');
    const finalCanonical = canonical || (canon && canon.href) || location.href;

    const norm = JT.engine.normalizeRecord(company, title, locationStr, finalCanonical);
    company = norm.company;
    title = norm.title;
    if (norm.location) locationStr = norm.location;

    job.company = company && !isPlatformName(company) ? company.trim() : '';
    job.title = title.trim();

    const loc = ld && ld.jobLocation && [].concat(ld.jobLocation)[0];
    const addr = loc && loc.address;
    job.location = locationStr || (addr ? [addr.addressLocality, addr.addressRegion, addr.addressCountry && (addr.addressCountry.name || addr.addressCountry)].filter(Boolean).join(', ') : '');
    job.employmentType = ld ? [].concat(ld.employmentType || []).join(', ') : '';
    job.experience = ld && ld.experienceRequirements ? (ld.experienceRequirements.monthsOfExperience ? ld.experienceRequirements.monthsOfExperience / 12 + ' yrs' : String(ld.experienceRequirements)) : '';
    const sal = ld && ld.baseSalary && ld.baseSalary.value;
    job.salary = sal ? [sal.minValue, sal.maxValue].filter(Boolean).join('-') + (ld.baseSalary.currency ? ' ' + ld.baseSalary.currency : '') : '';
    job.canonical = finalCanonical;
    job.hasJsonLd = !!ld;
    return job;
  }

  return { PLATFORMS, detectPlatform, extractJob, isPlatformName };
})();
