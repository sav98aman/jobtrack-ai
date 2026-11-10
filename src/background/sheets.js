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
  async createSpreadsheet(interactive = true) {
    const payload = {
      properties: { title: 'JobTrack AI - Job Application Tracker' },
      sheets: [
        { properties: { title: 'Applications', gridProperties: { frozenRowCount: 1 } } },
        { properties: { title: 'Dashboard' } }
      ]
    };
    const res = await this.api('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      body: JSON.stringify(payload)
    }, interactive);
    const newId = res.spreadsheetId;
    if (!newId) throw new SheetsError('Failed to create new spreadsheet in Google Drive', false);
    
    // Auto-initialize both tabs immediately
    const sheetInfo = { name: 'Applications', id: (res.sheets && res.sheets[0] && res.sheets[0].properties && res.sheets[0].properties.sheetId) || 0 };
    await this.ensureHeaders(newId, sheetInfo, interactive);
    return newId;
  },
  HEADERS: ['Company', 'Job Title', 'Date Applied', 'Job Link', 'Status', 'Source Portal', 'Location', 'Employment Type', 'Experience', 'Salary', 'Stage', 'Logged At', 'Notes', 'Unique Key'],
  inferSourcePortal(url) {
    if (!url) return 'Company Career Site';
    const u = String(url).toLowerCase();
    if (u.includes('linkedin')) return 'LinkedIn';
    if (u.includes('hirist')) return 'Hirist';
    if (u.includes('iimjobs')) return 'IIMJobs';
    if (u.includes('naukri')) return 'Naukri';
    if (u.includes('indeed')) return 'Indeed';
    if (u.includes('instahyre')) return 'Instahyre';
    if (u.includes('foundit')) return 'Foundit (Monster)';
    if (u.includes('smartrecruiters')) return 'SmartRecruiters';
    if (u.includes('greenhouse')) return 'Greenhouse';
    if (u.includes('lever')) return 'Lever';
    if (u.includes('workday')) return 'Workday';
    if (u.includes('ashby')) return 'Ashby';
    try {
      const raw = url.replace(/^[=HYPERLINK\("]*/i, '').split('"')[0];
      const h = new URL(raw).hostname.replace(/^www\./, '');
      return `Career Site (${h})`;
    } catch {
      return 'Company Career Site';
    }
  },
  async resolveSheetInfo(spreadsheetId, preferredName, interactive) {
    try {
      const meta = await this.api(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`, {}, interactive);
      const sheets = meta.sheets || [];
      if (!sheets.length) return { name: preferredName || 'Applications', id: 0 };
      const match = sheets.find(s => s.properties && s.properties.title && s.properties.title.toLowerCase() === (preferredName || 'applications').toLowerCase());
      const selected = match || sheets[0];
      return { name: selected.properties.title, id: selected.properties.sheetId || 0 };
    } catch {
      return { name: preferredName || 'Applications', id: 0 };
    }
  },
  async resolveSheetName(spreadsheetId, preferredName, interactive) {
    const info = await this.resolveSheetInfo(spreadsheetId, preferredName, interactive);
    return info.name;
  },
  async applyFormatting(spreadsheetId, sheetId, interactive) {
    try {
      const widths = [180, 240, 115, 125, 135, 150, 160, 125, 100, 110, 140, 150, 220, 80];
      const colRequests = widths.map((w, idx) => ({
        updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: idx, endIndex: idx + 1 },
          properties: { pixelSize: w },
          fields: 'pixelSize'
        }
      }));

      const statusValues = ['Applied', 'Screening / HR', 'Interviewing', 'Assessment', 'Offer', 'Rejected', 'Withdrawn'];
      const dataValidationReq = {
        setDataValidation: {
          range: { sheetId, startRowIndex: 1, startColumnIndex: 4, endColumnIndex: 5 },
          rule: {
            condition: {
              type: 'ONE_OF_LIST',
              values: statusValues.map(v => ({ userEnteredValue: v }))
            },
            showCustomUi: true,
            strict: false
          }
        }
      };

      const condRules = [
        { val: 'Applied', bg: { red: 0.88, green: 0.95, blue: 1 }, fg: { red: 0.01, green: 0.41, blue: 0.63 } },
        { val: 'Interviewing', bg: { red: 1, green: 0.95, blue: 0.78 }, fg: { red: 0.71, green: 0.33, blue: 0.04 } },
        { val: 'Offer', bg: { red: 0.86, green: 0.99, blue: 0.91 }, fg: { red: 0.08, green: 0.50, blue: 0.24 } },
        { val: 'Rejected', bg: { red: 1, green: 0.89, blue: 0.89 }, fg: { red: 0.73, green: 0.11, blue: 0.11 } }
      ].map(c => ({
        addConditionalFormatRule: {
          rule: {
            ranges: [{ sheetId, startRowIndex: 1, startColumnIndex: 4, endColumnIndex: 5 }],
            booleanRule: {
              condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: c.val }] },
              format: { backgroundColor: c.bg, textFormat: { bold: true, foregroundColor: c.fg } }
            }
          },
          index: 0
        }
      }));

      const requests = [
        // 1. Freeze Header Row (Row 1)
        {
          updateSheetProperties: {
            properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
            fields: 'gridProperties.frozenRowCount'
          }
        },
        // 2. Format Header Row (Dark Slate #1E293B, White Bold text, 10pt)
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 14 },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.118, green: 0.161, blue: 0.231 },
                textFormat: { bold: true, fontSize: 10, foregroundColor: { red: 1, green: 1, blue: 1 } },
                verticalAlignment: 'MIDDLE',
                horizontalAlignment: 'LEFT'
              }
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment,horizontalAlignment)'
          }
        },
        // 3. Header Row Height (38px)
        {
          updateDimensionProperties: {
            range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 },
            properties: { pixelSize: 38 },
            fields: 'pixelSize'
          }
        },
        // 4. Center-align Headers for Date, Link, Status, Source Portal
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 2, endColumnIndex: 6 },
            cell: { userEnteredFormat: { horizontalAlignment: 'CENTER' } },
            fields: 'userEnteredFormat.horizontalAlignment'
          }
        },
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 7, endColumnIndex: 10 },
            cell: { userEnteredFormat: { horizontalAlignment: 'CENTER' } },
            fields: 'userEnteredFormat.horizontalAlignment'
          }
        },
        // 5. Data rows alignment: Center align Date (col 2), Link (col 3), Status (col 4), Portal (col 5)
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 1, startColumnIndex: 2, endColumnIndex: 6 },
            cell: { userEnteredFormat: { horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' } },
            fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)'
          }
        },
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 1, startColumnIndex: 7, endColumnIndex: 10 },
            cell: { userEnteredFormat: { horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' } },
            fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)'
          }
        },
        // 6. Professional Column Widths
        ...colRequests,
        // 7. Status Dropdown (Data Validation)
        dataValidationReq,
        // 8. Status Conditional Highlighting
        ...condRules
      ];

      await this.api(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
        { method: 'POST', body: JSON.stringify({ requests }) }, interactive).catch(() => {});

      // Alternating row colors (Zebra Striping)
      try {
        await this.api(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
          method: 'POST',
          body: JSON.stringify({
            requests: [{
              addBanding: {
                bandedRange: {
                  range: { sheetId, startRowIndex: 0, startColumnIndex: 0, endColumnIndex: 14 },
                  rowProperties: {
                    headerColor: { red: 0.118, green: 0.161, blue: 0.231 },
                    firstBandColor: { red: 1, green: 1, blue: 1 },
                    secondBandColor: { red: 0.973, green: 0.980, blue: 0.988 }
                  }
                }
              }
            }]
          })
        }, interactive).catch(() => {});
      } catch {}
    } catch (err) {
      console.warn('[JobTrack Sheets] applyFormatting issue:', err.message);
    }
  },
  async ensureHeaders(spreadsheetId, sheetName, interactive) {
    try {
      const sheetInfo = typeof sheetName === 'object' && sheetName.name ? sheetName : await this.resolveSheetInfo(spreadsheetId, sheetName, interactive);
      const targetName = sheetInfo.name;
      const base = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/`;
      const allData = await this.api(`${base}${encodeURIComponent(targetName + '!A1:N')}`, {}, interactive);
      let rows = (allData.values || []).filter(r => r && r.length);
      
      // Automatically remove any fake rows logged from logins or navbar badges (e.g., "Welcome, Aman Kumar", "0 notifications", "(1 notification)")
      let cleaned = rows.filter((r, idx) => {
        if (idx === 0 && r[0] === 'Company') return true;
        const title = r[1] || '';
        return !/^(welcome|hello|sign in|login|[\(\[]?\d+\s*notifications?[\)\]]?|notifications?)/i.test(title.trim());
      }).map((r, idx) => {
        if (idx === 0) return this.HEADERS;
        // Upgrade existing raw URLs to neat clickable hyperlinks
        if (r[3] && /^https?:\/\//i.test(r[3])) {
          r[3] = `=HYPERLINK("${r[3].replace(/"/g, '""')}", "View Job ↗")`;
        }
        // Auto-fill Source Portal for existing rows
        if (!r[5] || r[5] === 'Contact' || r[5].includes('@')) {
          r[5] = this.inferSourcePortal(r[3]);
        }
        return r;
      });

      if (!cleaned.length) {
        await this.api(`${base}${encodeURIComponent(targetName + '!A1:N1')}?valueInputOption=USER_ENTERED`,
          { method: 'PUT', body: JSON.stringify({ values: [this.HEADERS] }) }, interactive);
      } else {
        if (cleaned[0][0] !== 'Company') {
          cleaned.unshift(this.HEADERS);
        }

        if (cleaned.length !== rows.length || (rows[0] && cleaned[0][0] !== rows[0][0])) {
          await this.api(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(targetName + '!A1:N')}:clear`, { method: 'POST' }, interactive).catch(() => {});
          await this.api(`${base}${encodeURIComponent(targetName + '!A1:N')}?valueInputOption=USER_ENTERED`,
            { method: 'PUT', body: JSON.stringify({ values: cleaned }) }, interactive);
        }
      }

      // Apply executive-grade styling, freeze row 1, custom column widths, and dropdown chips
      await this.applyFormatting(spreadsheetId, sheetInfo.id, interactive);
      // Auto-configure the consolidated Dashboard tab
      await this.setupDashboardTab(spreadsheetId, targetName, interactive);
    } catch (err) {
      console.warn('[JobTrack Sheets] ensureHeaders issue:', err.message);
    }
  },
  async setupDashboardTab(spreadsheetId, appsTabName, interactive) {
    try {
      const meta = await this.api(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`, {}, interactive);
      const sheets = meta.sheets || [];
      let dashSheet = sheets.find(s => s.properties && s.properties.title && s.properties.title.toLowerCase() === 'dashboard');
      let dashSheetId = dashSheet && dashSheet.properties.sheetId;

      if (!dashSheet) {
        const addRes = await this.api(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
          method: 'POST',
          body: JSON.stringify({ requests: [{ addSheet: { properties: { title: 'Dashboard' } } }] })
        }, interactive).catch(() => null);
        dashSheetId = addRes && addRes.replies && addRes.replies[0] && addRes.replies[0].addSheet && addRes.replies[0].addSheet.properties.sheetId;
      }

      if (dashSheetId == null) return;

      const apps = appsTabName || 'Applications';
      const dashboardRows = [
        ['Job Search Analytics & Consolidated Dashboard', '', '', ''],
        ['', '', '', ''],
        ['KPI Metric', 'Count', '% of Total', 'Benchmark / Notes'],
        ['Total Applications', `=COUNTA('${apps}'!A2:A)`, '100%', 'All portals combined'],
        ['Applications Logged Today', `=COUNTIF('${apps}'!C2:C, TODAY())`, '=IF(B4>0, B5/B4, 0)', 'Daily activity tracker'],
        ['Call-back & Response Rate', `=COUNTIF('${apps}'!E2:E, "*Interview*") + COUNTIF('${apps}'!E2:E, "*Screening*") + COUNTIF('${apps}'!E2:E, "*Call*")`, '=IF(B4>0, B6/B4, 0)', 'Recruiter response rate'],
        ['', '', '', ''],
        ['Pipeline Stage', 'Applications Count', '% of Total Pipeline', 'Action Status'],
        ['Under Review (Applied)', `=COUNTIF('${apps}'!E2:E, "Applied")`, '=IF($B$4>0, B9/$B$4, 0)', 'Awaiting first response'],
        ['Screenings & Recruiter Calls', `=COUNTIF('${apps}'!E2:E, "*Screening*") + COUNTIF('${apps}'!E2:E, "*Call*")`, '=IF($B$4>0, B10/$B$4, 0)', 'Initial calls'],
        ['Technical & Final Interviews', `=COUNTIF('${apps}'!E2:E, "*Interview*")`, '=IF($B$4>0, B11/$B$4, 0)', 'Active interviewing'],
        ['Assessments & Tests', `=COUNTIF('${apps}'!E2:E, "*Assessment*")`, '=IF($B$4>0, B12/$B$4, 0)', 'Coding / take-home tests'],
        ['Job Offers Received 🎉', `=COUNTIF('${apps}'!E2:E, "Offer*")`, '=IF($B$4>0, B13/$B$4, 0)', 'Decision stage'],
        ['Rejected / Archived', `=COUNTIF('${apps}'!E2:E, "Rejected*")`, '=IF($B$4>0, B14/$B$4, 0)', 'Closed'],
        ['', '', '', ''],
        ['Portal / Source', 'Applications Count', '% of Total', 'Source Type'],
        ['LinkedIn', `=COUNTIF('${apps}'!D2:D, "*linkedin*")`, '=IF($B$4>0, B17/$B$4, 0)', 'LinkedIn Easy Apply & Jobs'],
        ['Hirist / IIMJobs', `=COUNTIF('${apps}'!D2:D, "*hirist*") + COUNTIF('${apps}'!D2:D, "*iimjobs*")`, '=IF($B$4>0, B18/$B$4, 0)', 'Hirist tech jobs'],
        ['Naukri', `=COUNTIF('${apps}'!D2:D, "*naukri*")`, '=IF($B$4>0, B19/$B$4, 0)', 'Naukri portal'],
        ['Direct Company Sites / Other', '=$B$4 - B17 - B18 - B19', '=IF($B$4>0, B20/$B$4, 0)', 'Direct Career Sites (ATS)']
      ];

      const base = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/`;
      await this.api(`${base}${encodeURIComponent('Dashboard!A1:D20')}?valueInputOption=USER_ENTERED`,
        { method: 'PUT', body: JSON.stringify({ values: dashboardRows }) }, interactive).catch(() => {});

      const dashReqs = [
        { updateDimensionProperties: { range: { sheetId: dashSheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 260 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId: dashSheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 130 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId: dashSheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 }, properties: { pixelSize: 130 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId: dashSheetId, dimension: 'COLUMNS', startIndex: 3, endIndex: 4 }, properties: { pixelSize: 220 }, fields: 'pixelSize' } },
        {
          repeatCell: {
            range: { sheetId: dashSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 4 },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.118, green: 0.161, blue: 0.231 },
                textFormat: { bold: true, fontSize: 12, foregroundColor: { red: 1, green: 1, blue: 1 } },
                verticalAlignment: 'MIDDLE'
              }
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment)'
          }
        },
        {
          repeatCell: {
            range: { sheetId: dashSheetId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: 4 },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.20, green: 0.27, blue: 0.38 },
                textFormat: { bold: true, fontSize: 10, foregroundColor: { red: 1, green: 1, blue: 1 } },
                verticalAlignment: 'MIDDLE'
              }
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment)'
          }
        },
        {
          repeatCell: {
            range: { sheetId: dashSheetId, startRowIndex: 7, endRowIndex: 8, startColumnIndex: 0, endColumnIndex: 4 },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.20, green: 0.27, blue: 0.38 },
                textFormat: { bold: true, fontSize: 10, foregroundColor: { red: 1, green: 1, blue: 1 } },
                verticalAlignment: 'MIDDLE'
              }
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment)'
          }
        },
        {
          repeatCell: {
            range: { sheetId: dashSheetId, startRowIndex: 15, endRowIndex: 16, startColumnIndex: 0, endColumnIndex: 4 },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.20, green: 0.27, blue: 0.38 },
                textFormat: { bold: true, fontSize: 10, foregroundColor: { red: 1, green: 1, blue: 1 } },
                verticalAlignment: 'MIDDLE'
              }
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment)'
          }
        },
        {
          repeatCell: {
            range: { sheetId: dashSheetId, startRowIndex: 3, endRowIndex: 20, startColumnIndex: 1, endColumnIndex: 3 },
            cell: { userEnteredFormat: { horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' } },
            fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)'
          }
        },
        {
          repeatCell: {
            range: { sheetId: dashSheetId, startRowIndex: 3, endRowIndex: 20, startColumnIndex: 2, endColumnIndex: 3 },
            cell: { userEnteredFormat: { numberFormat: { type: 'PERCENT', pattern: '0.0%' } } },
            fields: 'userEnteredFormat.numberFormat'
          }
        }
      ];

      await this.api(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
        { method: 'POST', body: JSON.stringify({ requests: dashReqs }) }, interactive).catch(() => {});
    } catch (err) {
      console.warn('[JobTrack Sheets] setupDashboardTab issue:', err.message);
    }
  },
  toRow(rec) {
    const c = JT.util.safeCell;
    const linkFormula = rec.jobLink && /^https?:\/\//i.test(rec.jobLink)
      ? `=HYPERLINK("${rec.jobLink.replace(/"/g, '""')}", "View Job ↗")`
      : c(rec.jobLink);
    return [
      c(rec.company),
      c(rec.title),
      rec.appliedDate,
      linkFormula,
      'Applied',
      c(rec.sourcePortal || this.inferSourcePortal(rec.jobLink)),
      c(rec.location),
      c(rec.employmentType),
      c(rec.experience),
      c(rec.salary),
      '',
      new Date().toISOString().replace('T', ' ').slice(0, 19),
      c(rec.notes),
      rec.uniqueKey
    ];
  },
  async sync(rec, st, interactive = false) {
    if (st.webhookUrl) {
      if (st.webhookUrl.includes('docs.google.com/spreadsheets')) {
        const m = st.webhookUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
        if (m) st.spreadsheetId = m[1];
        st.webhookUrl = '';
      } else {
        const resp = await fetch(st.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action: 'append', sheetName: st.sheetName || 'Applications', values: [this.toRow(rec)], record: rec })
        });
        if (!resp.ok) {
          const body = (await resp.text().catch(() => '')).slice(0, 100);
          throw new SheetsError(`Webhook error ${resp.status}${body ? ': ' + body : ''}`, false);
        }
        const res = await resp.json().catch(() => ({}));
        if (res.status === 'duplicate') return 'duplicate';
        return 'saved';
      }
    }
    const sheetInfo = await this.resolveSheetInfo(st.spreadsheetId, st.sheetName, interactive);
    const sheetName = sheetInfo.name;
    await this.ensureHeaders(st.spreadsheetId, sheetInfo, interactive);

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
