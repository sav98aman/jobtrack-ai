// Portal adapters + job extraction. Selectors are best-effort starting points:
// every platform stays "Not Tested" until it passes the quality gate (see SUPPORT_MATRIX.md).
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
    { id: 'naukri', host: /(^|\.)naukri\.com$/, jobUrl: /job-listings/,
      employer: ['.jd-header-comp-name a', '[class*="comp-name"]'], title: ['.jd-header-title', 'h1'],
      confirmSel: ['[class*="apply-message"]'], confirmUrl: /apply\/confirmation|applied/i },
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

  const detectPlatform = () => PLATFORMS.find(p => p.host.test(location.hostname)) || GENERIC;
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

  function extractLinkedInJob() {
    let company = '', title = '', locationStr = '', canonical = '';

    // 1. If an Easy Apply modal or confirmation modal is open, inspect modal text first
    const modal = document.querySelector('.artdeco-modal, [role=dialog]');
    if (modal) {
      const modalText = (modal.innerText || '').trim();
      const mSent = modalText.match(/Your application was sent to\s+([A-Za-z0-9&.,\- ]+?)!/i);
      if (mSent && mSent[1] && !isPlatformName(mSent[1])) company = mSent[1].trim();
      if (!company) {
        const mApply = modalText.match(/Apply to\s+([A-Za-z0-9&.,\- ]+?)(?:\n|\?|$)/i);
        if (mApply && mApply[1] && !isPlatformName(mApply[1])) company = mApply[1].trim();
      }
    }

    // 2. Company from active job detail pane or active item in search list
    if (!company) {
      const compEl = document.querySelector(
        '.job-details-jobs-unified-top-card__company-name a, .job-details-jobs-unified-top-card__company-name, ' +
        '.jobs-unified-top-card__company-name a, .jobs-unified-top-card__company-name, ' +
        '.artdeco-entity-lockup__subtitle a, .artdeco-entity-lockup__subtitle, ' +
        '.jobs-search-results-list__list-item--active .job-card-container__primary-description, ' +
        '.jobs-search-results-list__list-item--active a[href*="/company/"], ' +
        '.jobs-search__job-details a[href*="/company/"], .jobs-details a[href*="/company/"], ' +
        'a[data-tracking-control-name*="company"], a[href*="/company/"]'
      );
      if (compEl) {
        let t = compEl.textContent.trim().replace(/\s+/g, ' ');
        // Strip trailing metadata like "· Hyderabad" or "• 10,001+ employees"
        t = t.split('·')[0].split('•')[0].trim();
        if (t && !isPlatformName(t)) company = t;
      }
    }

    // 3. Job title from active job details or active search list item
    const titleEl = document.querySelector(
      '.job-details-jobs-unified-top-card__job-title h1, .job-details-jobs-unified-top-card__job-title, ' +
      '.jobs-unified-top-card__job-title h1, .jobs-unified-top-card__job-title h2, .jobs-unified-top-card__job-title, ' +
      '.job-details-jobs-unified-top-card h1, .job-details-jobs-unified-top-card h2, ' +
      '.jobs-search__job-details h1, .jobs-search__job-details h2, ' +
      '.jobs-search-results-list__list-item--active .job-card-list__title, ' +
      '.jobs-search-results-list__list-item--active [class*="job-title"], ' +
      'h1.t-24, h2.t-24'
    );
    if (titleEl) {
      let t = titleEl.textContent.trim().replace(/\s+/g, ' ');
      if (t && !/^(application (sent|submitted)|jobs|search|linkedin|apply|apply to .*|\d+\s*notifications?|notifications?)$/i.test(t)) {
        title = t;
      }
    }

    // 4. Fallback to document.title
    if (!company || !title) {
      const dt = (document.title || '').replace(/\s*\|\s*LinkedIn.*$/i, '').trim();
      let tm = dt.match(/^(.+?)\s+hiring\s+(.+?)(?:\s+in\s+.*)?$/i);
      if (tm) {
        if (!company) company = tm[1].trim();
        if (!title) title = tm[2].trim();
      } else {
        tm = dt.match(/^(.+?)\s+(?:at|[-–—])\s+(.+?)$/i);
        if (tm) {
          if (!title) title = tm[1].trim();
          if (!company) company = tm[2].trim();
        }
      }
    }

    // 5. Location
    const locEl = document.querySelector(
      '.job-details-jobs-unified-top-card__primary-description-container, .artdeco-entity-lockup__caption, ' +
      '.jobs-search-results-list__list-item--active .job-card-container__metadata-item'
    );
    if (locEl) {
      locationStr = locEl.textContent.trim().replace(/\s+/g, ' ').split('·')[0].trim();
    }

    // 6. Clean canonical URL
    const mUrl = location.href.match(/[?&]currentJobId=(\d+)/) || location.pathname.match(/\/jobs\/view\/(\d+)/);
    if (mUrl && mUrl[1]) {
      canonical = 'https://www.linkedin.com/jobs/view/' + mUrl[1] + '/';
    }

    if (title && /^(application (sent|submitted)|jobs|search|linkedin|apply|apply to .*|\d+\s*notifications?|notifications?)$/i.test(title)) title = '';
    if (company && isPlatformName(company)) company = '';

    return {
      company: company.trim(),
      title: title.trim(),
      location: locationStr,
      canonical: canonical || location.href,
      employerSource: company ? 'page' : ''
    };
  }

  function extractHiristJob() {
    let company = '', title = '', locationStr = '', canonical = '';

    // 1. Breadcrumb check (works on both job details page and the /job/applied confirmation page!)
    // e.g. "Home > Backend Development > True Balance - Java Backend Engineer - Spring Frameworks"
    const breadcrumbEl = document.querySelector('nav[aria-label="breadcrumb"], .breadcrumb, [class*="breadcrumb"], .bread-crumb, ol[class*="breadcrumb"]');
    if (breadcrumbEl) {
      const parts = (breadcrumbEl.innerText || '').split('>').map(s => s.trim()).filter(Boolean);
      if (parts.length) {
        const last = parts[parts.length - 1];
        const m = last.match(/^([A-Za-z0-9&.,' /()-]+?)\s+-\s+(.+)$/);
        if (m && !isPlatformName(m[1])) {
          company = m[1].trim();
          title = m[2].trim();
        }
      }
    }

    // 2. Page selectors if breadcrumb didn't have both
    if (!company) {
      const compEl = document.querySelector('[class*="company-name"] a, [class*="company-name"], [class*="recruiter-name"], [class*="comp-name"], a[href*="/c/"], .recruiter-company');
      if (compEl) {
        let t = compEl.textContent.trim().replace(/\s+/g, ' ');
        if (t && !isPlatformName(t)) company = t;
      }
    }

    if (!title) {
      const titleEl = document.querySelector('[class*="job-title"] h1, [class*="job-title"], h1');
      if (titleEl) {
        let t = titleEl.textContent.trim().replace(/\s+/g, ' ');
        if (t && JT.engine.isValidJobTitle(t)) title = t;
      }
    }

    // 3. Document title fallback
    if (!company || !title) {
      const dt = (document.title || '').replace(/\s*\|\s*(Hirist|iimjobs).*$/i, '').trim();
      const m = dt.match(/^([A-Za-z0-9&.,' /()-]+?)\s+-\s+(.+)$/);
      if (m && !isPlatformName(m[1])) {
        if (!company) company = m[1].trim();
        if (!title && JT.engine.isValidJobTitle(m[2])) title = m[2].trim();
      }
    }

    // 4. Job link
    const mJobId = location.search.match(/[?&]jobId=(\d+)/) || location.pathname.match(/\/j\/.*?(\d+)\.html/);
    if (mJobId && mJobId[1]) {
      canonical = location.origin + '/j/' + mJobId[1] + '.html';
    }

    if (title && /^(application (sent|submitted)|jobs|search|hirist|iimjobs|apply|apply to .*|\d+\s*notifications?|notifications?)$/i.test(title)) title = '';
    if (company && isPlatformName(company)) company = '';

    return {
      company: company.trim(),
      title: title.trim(),
      location: locationStr,
      canonical: canonical || location.href,
      employerSource: company ? 'page' : ''
    };
  }

  function extractJob() {
    const p = detectPlatform(), ld = jsonLdJob(), job = { employerSource: '' };
    let company = '', title = '', locationStr = '', canonical = '';

    if (p.id === 'linkedin') {
      const li = extractLinkedInJob();
      if (li.company) { company = li.company; job.employerSource = li.employerSource || 'page'; }
      if (li.title) { title = li.title; }
      if (li.location) locationStr = li.location;
      if (li.canonical) canonical = li.canonical;
    } else if (p.id === 'hirist' || p.id === 'iimjobs') {
      const hj = extractHiristJob();
      if (hj.company) { company = hj.company; job.employerSource = hj.employerSource || 'page'; }
      if (hj.title) { title = hj.title; }
      if (hj.location) locationStr = hj.location;
      if (hj.canonical) canonical = hj.canonical;
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
    if (title && /^(application (sent|submitted)|jobs|search|linkedin|apply|apply to .*)$/i.test(title.trim())) {
      title = '';
    }
    if (!company || !title) {
      const dt = (document.title || '').replace(/\s*\|\s*LinkedIn.*$/i, '').trim();
      let tm = dt.match(/^(.+?)\s+hiring\s+(.+?)(?:\s+in\s+.*)?$/i);
      if (tm) {
        if (!company) company = tm[1].trim();
        if (!title) title = tm[2].trim();
      } else {
        tm = dt.match(/^(.+?)\s+(?:at|[-–—])\s+(.+?)$/i);
        if (tm) {
          if (!title) title = tm[1].trim();
          if (!company) company = tm[2].trim();
        }
      }
    }

    job.company = company && !isPlatformName(company) ? company.trim() : '';
    job.title = title.trim();

    const loc = ld && ld.jobLocation && [].concat(ld.jobLocation)[0];
    const addr = loc && loc.address;
    job.location = locationStr || (addr ? [addr.addressLocality, addr.addressRegion, addr.addressCountry && (addr.addressCountry.name || addr.addressCountry)].filter(Boolean).join(', ') : '');
    job.employmentType = ld ? [].concat(ld.employmentType || []).join(', ') : '';
    job.experience = ld && ld.experienceRequirements ? (ld.experienceRequirements.monthsOfExperience ? ld.experienceRequirements.monthsOfExperience / 12 + ' yrs' : String(ld.experienceRequirements)) : '';
    const sal = ld && ld.baseSalary && ld.baseSalary.value;
    job.salary = sal ? [sal.minValue, sal.maxValue].filter(Boolean).join('-') + (ld.baseSalary.currency ? ' ' + ld.baseSalary.currency : '') : '';
    const canon = document.querySelector('link[rel="canonical"]');
    job.canonical = canonical || (canon && canon.href) || location.href;
    job.hasJsonLd = !!ld;
    return job;
  }

  return { PLATFORMS, detectPlatform, extractJob, isPlatformName };
})();
