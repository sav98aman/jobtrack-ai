// Content script: reads the page, reports events. Never writes to Sheets, never reads form values.
(() => {
  if (window.__jobtrack) return; window.__jobtrack = true;

  // Webmail clients (Gmail, Outlook, Yahoo Mail, etc.) are NOT job application portals.
  // Form/application submission tracking MUST NOT run on webmail, as reading application confirmation
  // emails or recruiter letters would trigger duplicate job application entries.
  // Webmail is handled exclusively by email-scanner.js for recruiter status updates.
  const isWebmail = h => /(^|\.)(mail\.google\.com|inbox\.google\.com|outlook\.(live|office|office365)\.com|mail\.yahoo\.com|mail\.proton\.(me|com)|mail\.zoho\.(com|in)|mail\.icloud\.com)$/i.test(h);
  if (isWebmail(location.hostname)) return;

  const A = JT.adapters;
  const CONFIRM_RE = /(application (has been |was |is )?(submitted|received|sent|complete|delivered)|(thank you|thanks) for (applying|your application|submitting|your interest)|successfully applied|you('ve| have) (successfully )?applied|application (submitted )?successfully|we('ve| have) received your application|application complete|your application has been sent|applied to ["'].+?["']|applied to [A-Za-z0-9]|interview preparation for)/i;
  const NEG_RE = /(failed|error|unable|try again|something went wrong|invalid|already applied|not submitted)/i;
  let sawForm = false, jobSent = '', lastJobSentTitle = '', timer = null, lastHref = location.href;
  let lastActiveJob = null;
  const sent = new Set();

  const isAlive = () => { try { return !!chrome.runtime?.id; } catch { return false; } };
  const send = (type, payload = {}) => {
    if (!isAlive()) return;
    try {
      const p = chrome.runtime.sendMessage({ type, url: location.href, platformId: A.detectPlatform().id, ...payload });
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {}
  };
  // After the extension is reloaded, old page scripts lose their connection: treat that as "disabled" instead of throwing.
  const enabled = async () => {
    if (!isAlive()) return false;
    try {
      const { settings = {} } = await chrome.storage.local.get('settings');
      return settings.autoDetect !== false && !settings.paused;
    } catch {
      return false;
    }
  };
  const isVisible = el => {
    if (!el) return false;
    if (el.offsetParent !== null) return true;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const formVisible = () => [...document.querySelectorAll('form, [role=dialog]')].some(f =>
    f.querySelectorAll('input:not([type=hidden]),textarea,select').length >= 2 && isVisible(f)
  );

  function looksLikeJobPage(job) {
    const p = A.detectPlatform();
    return !!(job.company || job.title || job.hasJsonLd || (p.jobUrl && p.jobUrl.test(location.href)));
  }

  function collectSignals() {
    const p = A.detectPlatform(); let phrase = '', negative = false;
    
    // 1. Direct modal inspection (for LinkedIn "Application sent", "Your application was sent to ...")
    const modal = document.querySelector('.artdeco-modal, [role=dialog], .modal, .popup');
    if (modal && isVisible(modal)) {
      const modalText = (modal.innerText || '').trim();
      if (CONFIRM_RE.test(modalText) || /application (was |has been )?sent|your application was sent to/i.test(modalText)) {
        phrase = modalText.split('\n')[0].slice(0, 100);
      }
    }

    // 2. Specific page status text (e.g., LinkedIn "Application status • Application submitted now")
    if (!phrase) {
      const statusEls = document.querySelectorAll('[class*="status"], [class*="feedback"], [class*="state"], [class*="message"], [class*="applied"]');
      for (const el of statusEls) {
        if (!isVisible(el)) continue;
        const t = (el.innerText || '').trim();
        if (t && /application (has been |was |is )?(submitted|sent)|application submitted now/i.test(t)) {
          phrase = t.split('\n')[0].slice(0, 80);
          break;
        }
      }
    }

    // 3. Scan candidates across the page
    if (!phrase) {
      const candidates = document.querySelectorAll(
        'h1,h2,h3,h4,p,span,li,div,[role=alert],[role=status],[class*=status i],[class*=success i],[class*=confirm i],[class*=thank i],[class*=applied i],[class*=submitted i]'
      );
      for (const el of candidates) {
        if (!isVisible(el)) continue;
        const t = (el.innerText || '').trim();
        if (!t || t.length > 180 || (t.includes('\n') && t.length > 80)) continue;
        if (CONFIRM_RE.test(t) || (p.confirmText && p.confirmText.test(t))) {
          phrase = t.slice(0, 80);
          if (NEG_RE.test(t)) negative = true;
          break;
        }
      }
    }

    const platformSpecific = !!(p.confirmSel || []).some(s => document.querySelector(s));
    const urlConfirm = !!(
      (p.confirmUrl && p.confirmUrl.test(location.href)) ||
      /(?:\/|^)(?:job|career|apply|application|myapply)[^/]*(?:confirm|thank|submitted|success|applied|saveapply)/i.test(location.pathname) ||
      /(?:thank-you-for-applying|application-submitted|post-apply|apply\/confirmation|saveapply|myapply)/i.test(location.pathname)
    );
    const result = { phrase: !!phrase, phraseText: phrase, platformSpecific, urlConfirm, formGone: sawForm && !formVisible(), negative };
    if (result.phrase || result.platformSpecific || result.urlConfirm) {
      console.log('[JobTrack AI] Evidence found:', result);
    }
    return result;
  }

  async function scan() {
    if (!(await enabled())) return;
    if (formVisible()) sawForm = true;
    const job = A.extractJob();
    if (lastActiveJob && Date.now() - lastActiveJob.timestamp < 30 * 60e3) {
      if (!job.title && lastActiveJob.title) job.title = lastActiveJob.title;
      if (!job.company && lastActiveJob.company) job.company = lastActiveJob.company;
      if (!job.location && lastActiveJob.location) job.location = lastActiveJob.location;
    }
    if (looksLikeJobPage(job) && (jobSent !== location.href || (job.title && !lastJobSentTitle))) {
      jobSent = location.href;
      lastJobSentTitle = job.title || '';
      console.log('[JobTrack AI] Job page detected:', job.company, '—', job.title);
      send('JOB_SEEN', { job });
    }
    const s = collectSignals();
    if (s.phrase || s.platformSpecific || s.urlConfirm) {
      const coKey = (job.company || '').trim().toLowerCase();
      const tiKey = (job.title || '').trim().toLowerCase();
      if (!coKey) return; // Wait until company is identified
      const key = coKey + '|' + tiKey;
      if (sent.has(key)) return;
      sent.add(key);
      console.log('[JobTrack AI] Sending SUBMISSION_EVIDENCE for:', job.company, job.title, s);
      send('SUBMISSION_EVIDENCE', { job, signals: s });
    }
  }
  const schedule = () => {
    if (!isAlive()) return;
    clearTimeout(timer);
    timer = setTimeout(scan, 800);
  };

  function checkPostSubmit(submittedJob) {
    let attempts = 0;
    const checkInterval = setInterval(() => {
      attempts++;
      if (!isAlive() || attempts > 5) { clearInterval(checkInterval); return; }
      
      const currentJob = A.extractJob();
      const job = {
        company: currentJob.company || submittedJob.company || (lastActiveJob && lastActiveJob.company) || '',
        title: currentJob.title || submittedJob.title || (lastActiveJob && lastActiveJob.title) || '',
        location: currentJob.location || submittedJob.location || (lastActiveJob && lastActiveJob.location) || '',
        canonical: currentJob.canonical || submittedJob.canonical || (lastActiveJob && lastActiveJob.canonical) || location.href
      };

      const s = collectSignals();
      if (s.phrase || s.platformSpecific || s.urlConfirm) {
        clearInterval(checkInterval);
        const coKey = (job.company || '').trim().toLowerCase();
        const tiKey = (job.title || '').trim().toLowerCase();
        if (coKey) {
          const key = coKey + '|' + tiKey;
          if (sent.has(key)) return;
          sent.add(key);
          console.log('[JobTrack AI] Post-submit evidence confirmed:', job.company, job.title, s);
          send('SUBMISSION_EVIDENCE', { job, signals: s });
        }
      }
    }, 800);
  }

  document.addEventListener('click', async e => {
    if (!(await enabled())) return;
    const el = e.target.closest && e.target.closest('button,a,input[type=submit],[role=button]');
    if (!el) return;
    const label = (el.innerText || el.value || el.getAttribute('aria-label') || '').trim();
    if (/^(easy apply|apply( now| for this job| to this job| on company (site|website))?)$/i.test(label) || /^(easy\s+)?apply\s+to/i.test(label)) {
      console.log('[JobTrack AI] Apply button clicked:', label);
      const applyJob = A.extractJob(el);
      if (applyJob.company || applyJob.title) {
        lastActiveJob = { ...applyJob, timestamp: Date.now() };
      }
      send('APPLY_START', { job: applyJob });
    } else if (/(submit( application)?|send application|apply now|finish|complete)/i.test(label)) {
      console.log('[JobTrack AI] Submit button clicked:', label);
      let submitJob = A.extractJob(el);
      if (lastActiveJob && Date.now() - lastActiveJob.timestamp < 30 * 60e3) {
        if (!submitJob.title && lastActiveJob.title) submitJob.title = lastActiveJob.title;
        if (!submitJob.company && lastActiveJob.company) submitJob.company = lastActiveJob.company;
      }
      send('SUBMIT_CLICK', { job: submitJob });
      checkPostSubmit(submitJob);
    }
  }, true);

  chrome.runtime.onMessage.addListener((m, _s, reply) => {
    if (m.type === 'GET_PAGE_INFO') { const j = A.extractJob(); reply({ platform: A.detectPlatform().id, company: j.company, title: j.title, employerSource: j.employerSource }); }
  });

  const observer = new MutationObserver(() => {
    if (!isAlive()) { observer.disconnect(); return; }
    schedule();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  const intervalId = setInterval(() => {
    if (!isAlive()) { clearInterval(intervalId); return; }
    if (location.href !== lastHref) { lastHref = location.href; schedule(); }
  }, 1000);
  scan();
})();
