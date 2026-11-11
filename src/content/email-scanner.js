// JobTrack AI - Real-time Webmail Scanner (Gmail & Outlook)
// Detects Rejection, Interview Calls, Assessments, and Offers right inside webmail.
(() => {
  const isGmail = location.hostname.includes('mail.google.com');
  const isOutlook = location.hostname.includes('outlook.');
  if (!isGmail && !isOutlook) return;

  const isAlive = () => { try { return !!chrome.runtime?.id; } catch { return false; } };
  const handledThreads = new Set();
  let cachedApps = [];
  let isScanning = false;

  // Refresh cached applications list from background
  async function loadKnownCompanies() {
    if (!isAlive()) return [];
    try {
      const res = await chrome.runtime.sendMessage({ type: 'GET_APPLICATIONS' });
      if (res && res.applications) {
        cachedApps = res.applications;
        return cachedApps.map(a => a.company).filter(Boolean);
      }
    } catch {}
    return cachedApps.map(a => a.company).filter(Boolean);
  }

  function extractEmailDetails() {
    let subject = '', senderName = '', senderEmail = '', bodyText = '';

    if (isGmail) {
      // Gmail Selectors
      const subEl = document.querySelector('h2.hP, [data-thread-perm-id] h2, .ha h2');
      if (subEl) subject = (subEl.textContent || '').trim();

      const senderEl = document.querySelector('span.gD, [email]');
      if (senderEl) {
        senderEmail = senderEl.getAttribute('email') || '';
        senderName = (senderEl.textContent || senderEl.getAttribute('name') || '').trim();
      }

      const bodyEls = document.querySelectorAll('.a3s.aiL, .ii.gt, [role="listitem"] .a3s');
      if (bodyEls.length) {
        const lastBody = bodyEls[bodyEls.length - 1];
        bodyText = (lastBody.innerText || '').slice(0, 3000);
      }
    } else if (isOutlook) {
      // Outlook Selectors
      const subEl = document.querySelector('[role="heading"][aria-level="2"], [data-app-section="ConversationHeader"] [role="heading"], .allowTextSelection');
      if (subEl) subject = (subEl.textContent || '').trim();

      const senderEl = document.querySelector('[data-testid="SenderPersona"], span[title*="@"], [aria-label*="From:"]');
      if (senderEl) {
        senderName = (senderEl.textContent || '').trim();
        const mMail = (senderEl.getAttribute('title') || '').match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
        if (mMail) senderEmail = mMail[1];
      }

      const bodyEl = document.querySelector('[aria-label="Message body"], .ReadingPane, [role="document"]');
      if (bodyEl) bodyText = (bodyEl.innerText || '').slice(0, 3000);
    }

    return { subject, senderName, senderEmail, bodyText };
  }

  function injectWidget(match, company, uniqueThreadKey) {
    if (document.getElementById('jobtrack-email-pill')) return;

    const pill = document.createElement('div');
    pill.id = 'jobtrack-email-pill';
    pill.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 9999999;
      background: #0F172A;
      color: #F8FAFC;
      border: 1px solid #3B82F6;
      border-radius: 12px;
      padding: 16px 20px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.6), 0 8px 10px -6px rgba(0, 0, 0, 0.6);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      max-width: 360px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      animation: jobtrack-slide-in 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    pill.innerHTML = `
      <style>
        @keyframes jobtrack-slide-in {
          from { transform: translateY(100px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .jt-pill-btn {
          background: #2563EB;
          color: #FFFFFF;
          border: none;
          padding: 8px 14px;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
          font-size: 12px;
          transition: background 0.15s;
        }
        .jt-pill-btn:hover { background: #1D4ED8; }
        .jt-pill-dismiss {
          background: transparent;
          color: #94A3B8;
          border: 1px solid #334155;
          padding: 8px 12px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 12px;
        }
        .jt-pill-dismiss:hover { color: #FFF; border-color: #64748B; }
      </style>
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
        <div style="display:flex;align-items:center;gap:8px;font-weight:600;color:#60A5FA;font-size:14px;">
          <span>${match.icon}</span>
          <span>JobTrack AI: ${match.label}</span>
        </div>
        <button id="jtCloseBtn" style="background:transparent;border:none;color:#94A3B8;cursor:pointer;font-size:16px;line-height:1;">✕</button>
      </div>
      <div style="line-height:1.5;color:#CBD5E1;">
        Detected update for <strong>${company}</strong>.<br>
        Update status in your Google Sheet to <span style="display:inline-block;padding:2px 8px;border-radius:4px;background:#1E293B;color:#F59E0B;font-weight:600;font-size:11px;">${match.status}</span>?
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <button id="jtUpdateBtn" class="jt-pill-btn">✓ Update Google Sheet</button>
        <button id="jtDismissBtn" class="jt-pill-dismiss">Dismiss</button>
      </div>
    `;

    document.body.appendChild(pill);

    const close = () => {
      pill.style.opacity = '0';
      pill.style.transform = 'translateY(20px)';
      pill.style.transition = 'all 0.2s';
      setTimeout(() => pill.remove(), 200);
    };

    pill.querySelector('#jtCloseBtn').onclick = close;
    pill.querySelector('#jtDismissBtn').onclick = close;

    pill.querySelector('#jtUpdateBtn').onclick = async () => {
      const btn = pill.querySelector('#jtUpdateBtn');
      btn.textContent = 'Updating…';
      btn.disabled = true;

      try {
        const today = new Date().toISOString().slice(0, 10);
        const res = await chrome.runtime.sendMessage({
          type: 'UPDATE_STATUS_FROM_EMAIL',
          company,
          status: match.status,
          stage: match.stage || match.status,
          notes: `${match.label} email detected on ${today}`
        });

        if (res && res.ok) {
          pill.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;color:#10B981;font-weight:600;font-size:13px;">
              <span>✓</span>
              <span>Google Sheet Updated: ${company} → ${match.status}</span>
            </div>
          `;
          setTimeout(close, 2500);
        } else {
          btn.textContent = 'Saved Locally';
          setTimeout(close, 2000);
        }
      } catch (err) {
        btn.textContent = 'Saved Locally';
        setTimeout(close, 2000);
      }
    };
  }

  async function scanWebmail() {
    if (isScanning || !isAlive()) return;
    isScanning = true;

    try {
      const details = extractEmailDetails();
      if (!details.subject || (!details.bodyText && !details.senderName)) return;

      const threadKey = details.subject + '|' + details.senderEmail;
      if (handledThreads.has(threadKey)) return;

      const known = await loadKnownCompanies();
      const match = JT.engine.classifyEmail(details.subject, details.bodyText, details.senderName);
      if (!match) return;

      const company = JT.engine.extractCompanyFromEmail(details.senderName, details.senderEmail, details.subject, known);
      if (!company) return;

      handledThreads.add(threadKey);
      console.log('[JobTrack AI Webmail] Detected recruiter update:', match.label, 'for company:', company);
      injectWidget(match, company, threadKey);
    } finally {
      isScanning = false;
    }
  }

  // Scan on DOM changes with debounce
  let scanTimer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scanWebmail, 1200);
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(scanWebmail, 2000);
})();
