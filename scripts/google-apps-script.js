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
      const uniqueKey = row[13];

      // Deduplication check
      const lastRow = sheet.getLastRow();
      if (lastRow > 1 && uniqueKey) {
        const keys = sheet.getRange(2, 14, lastRow - 1, 1).getValues();
        for (let i = 0; i < keys.length; i++) {
          if (String(keys[i][0]).trim() === String(uniqueKey).trim()) {
            return ContentService.createTextOutput(JSON.stringify({ status: 'duplicate' }))
              .setMimeType(ContentService.MimeType.JSON);
          }
        }
      }

      sheet.appendRow(row);
      return ContentService.createTextOutput(JSON.stringify({ status: 'saved', rowIndex: sheet.getLastRow() }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: 'ignored' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
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
