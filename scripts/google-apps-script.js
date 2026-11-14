/**
 * JobTrack AI - Google Apps Script Backend (100% Free, Zero Google Cloud Setup)
 *
 * HOW TO UPDATE ON GOOGLE APPS SCRIPT:
 * 1. Open your Google Sheet ("Job Application Tracker")
 * 2. Click "Extensions" -> "Apps Script"
 * 3. Select all code in Code.gs (Cmd+A), delete, and paste this entire file.
 * 4. Click Save (Cmd+S or floppy disk icon).
 * 5. Click "Deploy" (top right) -> "Manage deployments"
 * 6. Click the pencil icon (✏️ Edit) next to your active Web App deployment.
 * 7. Under "Version", change from the old version number to "New version".
 * 8. Click "Deploy".
 * 
 * Done! Your Web App will immediately support:
 * - Loading all rows (35+ applications) into HTML Dashboard
 * - Two-way live status updates (updating status in HTML updates Column E in Google Sheet)
 * - Automatic job tracking from LinkedIn, Hirist, Naukri, etc.
 */

function findApplicationsSheet(ss) {
  if (!ss) return null;
  let sheet = ss.getSheetByName('Applications');
  if (sheet) return sheet;
  const allSheets = ss.getSheets();
  for (let i = 0; i < allSheets.length; i++) {
    const name = allSheets[i].getName().trim().toLowerCase();
    if (name === 'applications' || name.indexOf('app') === 0) {
      return allSheets[i];
    }
  }
  return allSheets[0] || null;
}

function readApplicationsFromSheet(sheet) {
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];

  const data = sheet.getRange(2, 1, lastRow - 1, 14).getValues();
  const formulas = sheet.getRange(2, 4, lastRow - 1, 1).getFormulas();
  let richTexts = null;
  try {
    richTexts = sheet.getRange(2, 4, lastRow - 1, 1).getRichTextValues();
  } catch (e) {}

  const extractUrl = function(val, idx) {
    if (formulas && formulas[idx] && formulas[idx][0]) {
      const m = String(formulas[idx][0]).match(/=HYPERLINK\("([^"]+)"/i);
      if (m) return m[1];
    }
    if (richTexts && richTexts[idx] && richTexts[idx][0]) {
      const u = richTexts[idx][0].getLinkUrl();
      if (u) return u;
    }
    const str = String(val || '').trim();
    if (str.startsWith('http')) return str;
    const m2 = str.match(/=HYPERLINK\("([^"]+)"/i);
    return m2 ? m2[1] : '';
  };

  const apps = [];
  const seenMap = {};
  for (let idx = 0; idx < data.length; idx++) {
    const r = data[idx];
    const company = String(r[0] || '').trim();
    if (!company || company.toLowerCase() === 'company') continue;

    let appliedStr = '';
    if (r[2] instanceof Date) {
      appliedStr = Utilities.formatDate(r[2], Session.getScriptTimeZone() || 'GMT', 'yyyy-MM-dd');
    } else {
      appliedStr = String(r[2] || '').trim();
    }

    const jobUrl = extractUrl(r[3], idx);
    let portal = String(r[5] || '').trim();
    if (!portal || portal.toLowerCase() === 'direct') {
      const lowerUrl = jobUrl.toLowerCase();
      if (lowerUrl.indexOf('linkedin.com') !== -1) portal = 'LinkedIn';
      else if (lowerUrl.indexOf('hirist.com') !== -1 || lowerUrl.indexOf('iimjobs.com') !== -1) portal = 'Hirist';
      else if (lowerUrl.indexOf('naukri.com') !== -1) portal = 'Naukri';
      else if (lowerUrl.indexOf('indeed.com') !== -1) portal = 'Indeed';
      else if (!portal) portal = 'Direct';
    }

    const norm = function(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
    const normCo = norm(company);
    const normTi = norm(r[1]);
    const isWebmailAccidental = jobUrl.toLowerCase().includes('mail.google.com') || portal.toLowerCase().includes('mail.google.com');

    // Filter out accidental duplicate webmail rows if the company is already present
    const dedupKey = normCo + '|' + normTi;
    if (isWebmailAccidental && seenMap[normCo]) {
      continue; // Skip accidental duplicate from Gmail
    }
    seenMap[normCo] = true;
    if (normTi) seenMap[dedupKey] = true;

    apps.push({
      rowIndex: idx + 2,
      company: company,
      title: String(r[1] || '').trim() || 'Job Application',
      appliedDate: appliedStr,
      jobLink: jobUrl,
      status: String(r[4] || 'Applied').trim(),
      sourcePortal: portal,
      location: String(r[6] || '').trim(),
      employmentType: String(r[7] || '').trim(),
      experience: String(r[8] || '').trim(),
      salary: String(r[9] || '').trim(),
      stage: String(r[10] || '').trim(),
      loggedAt: String(r[11] || '').trim(),
      notes: String(r[12] || '').trim(),
      uniqueKey: String(r[13] || '').trim()
    });
  }
  return apps;
}

function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    const data = JSON.parse(raw);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = findApplicationsSheet(ss);

    // Initialize Applications sheet if missing
    if (!sheet) {
      sheet = ss.insertSheet('Applications');
      const headers = [
        'Company', 'Job Title', 'Date Applied', 'Job Link', 'Status',
        'Source Portal', 'Location', 'Employment Type', 'Experience',
        'Salary', 'Stage', 'Logged At', 'Notes', 'Unique Key'
      ];
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length)
        .setBackground('#1E293B')
        .setFontColor('#FFFFFF')
        .setFontWeight('bold');
      sheet.setFrozenRows(1);
    }

    // 1. Fetch Applications Action (HTML Dashboard Load)
    if (data.action === 'getApplications') {
      const apps = readApplicationsFromSheet(sheet);
      return ContentService.createTextOutput(JSON.stringify({ ok: true, total: apps.length, applications: apps }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 2. Update Status Action (from HTML Dashboard Dropdown)
    if (data.action === 'updateStatus') {
      const lastRow = sheet.getLastRow();
      let targetRow = data.rowIndex ? Number(data.rowIndex) : null;

      if (lastRow > 1) {
        // Priority 1: Match by uniqueKey in Column 14
        if (data.uniqueKey) {
          const keys = sheet.getRange(2, 14, lastRow - 1, 1).getValues();
          for (let i = 0; i < keys.length; i++) {
            if (String(keys[i][0]).trim() === String(data.uniqueKey).trim()) {
              targetRow = i + 2;
              break;
            }
          }
        }

        // Priority 2: Verify targetRow against company name if provided
        if (targetRow && targetRow >= 2 && targetRow <= lastRow) {
          if (data.company) {
            const currentCo = String(sheet.getRange(targetRow, 1).getValue()).trim().toLowerCase();
            const searchCo = String(data.company).trim().toLowerCase();
            if (currentCo !== searchCo) {
              // Row index might have shifted; search by company name
              const companies = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
              for (let i = 0; i < companies.length; i++) {
                if (String(companies[i][0]).trim().toLowerCase() === searchCo) {
                  targetRow = i + 2;
                  break;
                }
              }
            }
          }
        } else if (data.company) {
          // Priority 3: Search by company name
          const searchCo = String(data.company).trim().toLowerCase();
          const companies = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
          for (let i = 0; i < companies.length; i++) {
            if (String(companies[i][0]).trim().toLowerCase() === searchCo) {
              targetRow = i + 2;
              break;
            }
          }
        }

        if (targetRow && targetRow >= 2 && targetRow <= lastRow) {
          if (data.status) {
            sheet.getRange(targetRow, 5).setValue(data.status); // Column E: Status
          }
          if (data.stage !== undefined) {
            sheet.getRange(targetRow, 11).setValue(data.stage); // Column K: Stage
          }
          if (data.notes !== undefined) {
            sheet.getRange(targetRow, 13).setValue(data.notes); // Column M: Notes
          }

          return ContentService.createTextOutput(JSON.stringify({
            ok: true,
            status: 'updated',
            rowIndex: targetRow,
            newStatus: data.status
          })).setMimeType(ContentService.MimeType.JSON);
        }
      }

      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'Row not found in sheet' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 3. Append Application Action (Auto-tracking from job boards)
    if (data.action === 'append' && data.values && data.values.length > 0) {
      const row = data.values[0];
      const newCompany = String(row[0] || '').trim();
      const newTitle = String(row[1] || '').trim();
      const jobLink = String(row[3] || '').trim().toLowerCase();
      const portal = String(row[5] || '').trim().toLowerCase();
      const notes = String(row[12] || '').trim().toLowerCase();
      const uniqueKey = String(row[13] || '').trim();

      // STRICT GUARD: Webmail (Gmail, Outlook) is NEVER an application source!
      // This prevents confirmation emails from being logged as duplicate applications.
      if (jobLink.includes('mail.google.com') || jobLink.includes('outlook.') ||
          portal.includes('gmail') || portal.includes('mail.google.com') ||
          notes.includes('site: mail.google.com')) {
        return ContentService.createTextOutput(JSON.stringify({ status: 'ignored', reason: 'Webmail is not a job portal' }))
          .setMimeType(ContentService.MimeType.JSON);
      }

      // Robust Deduplication check
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        const norm = function(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
        const normCo = norm(newCompany);
        const normTi = norm(newTitle);
        const sheetData = sheet.getRange(2, 1, lastRow - 1, 14).getValues();

        for (let i = 0; i < sheetData.length; i++) {
          const exKey = String(sheetData[i][13] || '').trim();
          const exCo = norm(sheetData[i][0]);
          const exTi = norm(sheetData[i][1]);

          // Match by Unique Key (col 14)
          if (uniqueKey && exKey === uniqueKey) {
            return ContentService.createTextOutput(JSON.stringify({ status: 'duplicate', rowIndex: i + 2 }))
              .setMimeType(ContentService.MimeType.JSON);
          }
          // Match by Company + Job Title (prevent duplicate rows for same job)
          if (normCo && normTi && exCo === normCo && exTi === normTi) {
            return ContentService.createTextOutput(JSON.stringify({ status: 'duplicate', rowIndex: i + 2 }))
              .setMimeType(ContentService.MimeType.JSON);
          }
        }
      }

      sheet.appendRow(row);
      return ContentService.createTextOutput(JSON.stringify({ status: 'saved', rowIndex: sheet.getLastRow() }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 4. Scan Gmail for Recruiter Updates Action (Interview, Assessment, Rejection, Offer)
    if (data.action === 'scanGmail') {
      const scanRes = scanGmailForUpdates(sheet);
      return ContentService.createTextOutput(JSON.stringify(scanRes))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: 'ignored' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function scanGmailForUpdates(sheet) {
  if (!sheet) return { ok: false, updated: 0, matches: [] };
  const apps = readApplicationsFromSheet(sheet);
  if (!apps.length) return { ok: true, updated: 0, matches: [] };

  const companyMap = {};
  for (let i = 0; i < apps.length; i++) {
    const co = apps[i].company.trim().toLowerCase();
    if (co && co !== 'confidential') {
      companyMap[co] = apps[i];
    }
  }

  // Search Gmail for recruitment keywords within past 14 days
  const query = 'newer_than:14d (interview OR assessment OR "not moving forward" OR hackerrank OR codesignal OR "offer of employment" OR "status of your application" OR "regret to inform")';
  let threads = [];
  try {
    threads = GmailApp.search(query, 0, 30);
  } catch (e) {
    return { ok: false, error: 'Gmail permission or search error: ' + e.toString(), updated: 0, matches: [] };
  }

  const results = [];
  const patterns = {
    offer: /offer\s+of\s+employment|pleased\s+to\s+offer|congratulations\s+on\s+your\s+offer|offer\s+letter/i,
    interview: /invitation\s+to\s+interview|schedule\s+(an?\s+interview|a\s+call|a\s+phone\s+screen)|invite\s+you\s+for\s+an?\s+interview|technical\s+interview|calendly\.com/i,
    assessment: /online\s+assessment|coding\s+(test|challenge)|hackerrank|codesignal|codility|take-home|technical\s+assessment/i,
    rejection: /unfortunately|not\s+moving\s+forward|decided\s+to\s+pursue\s+other|regret\s+to\s+inform|not\s+selected/i
  };

  for (let t = 0; t < threads.length; t++) {
    const msgs = threads[t].getMessages();
    if (!msgs.length) continue;
    const lastMsg = msgs[msgs.length - 1];
    const subject = lastMsg.getSubject() || '';
    const body = (lastMsg.getPlainBody() || '').slice(0, 2500);
    const sender = lastMsg.getFrom() || '';
    const combined = (subject + ' ' + body + ' ' + sender).toLowerCase();

    // Match against applied companies
    let matchedApp = null;
    for (const co in companyMap) {
      if (combined.indexOf(co) !== -1) {
        matchedApp = companyMap[co];
        break;
      }
    }
    if (!matchedApp) continue;

    let newStatus = '';
    let stageName = '';
    if (patterns.offer.test(combined)) { newStatus = 'Offer'; stageName = 'Offer'; }
    else if (patterns.interview.test(combined)) { newStatus = 'Interviewing'; stageName = 'Interview'; }
    else if (patterns.assessment.test(combined)) { newStatus = 'Screening'; stageName = 'Assessment'; }
    else if (patterns.rejection.test(combined)) { newStatus = 'Rejected'; stageName = 'Rejected'; }

    if (newStatus && newStatus !== matchedApp.status) {
      sheet.getRange(matchedApp.rowIndex, 5).setValue(newStatus);
      if (stageName) sheet.getRange(matchedApp.rowIndex, 11).setValue(stageName);
      const note = 'Auto-updated from Gmail on ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'GMT', 'yyyy-MM-dd');
      sheet.getRange(matchedApp.rowIndex, 13).setValue(note);
      results.push({ company: matchedApp.company, oldStatus: matchedApp.status, newStatus: newStatus });
      matchedApp.status = newStatus;
    }
  }

  return { ok: true, updated: results.length, matches: results };
}

function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = findApplicationsSheet(ss);
    const apps = readApplicationsFromSheet(sheet);
    return ContentService.createTextOutput(JSON.stringify({ ok: true, total: apps.length, applications: apps }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString(), applications: [] }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
