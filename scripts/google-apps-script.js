/**
 * JobTrack AI - Google Apps Script Backend (100% Free, Zero Google Cloud Setup)
 *
 * HOW TO USE / UPDATE:
 * 1. Open your Google Sheet
 * 2. Click "Extensions" -> "Apps Script"
 * 3. Delete any code in the editor and paste this entire file.
 * 4. Click "Deploy" -> "Manage deployments" -> Click Edit (pencil icon) -> Version: "New version" -> Click "Deploy"
 * 5. Web App URL is ready! Both saving and loading applications work automatically with 0 permissions errors.
 */

function readApplicationsFromSheet(sheet) {
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  const data = sheet.getRange(2, 1, lastRow - 1, 14).getValues();
  const extractUrl = function(val) {
    if (!val) return '';
    const m = String(val).match(/=HYPERLINK\("([^"]+)"/i);
    return m ? m[1] : (String(val).startsWith('http') ? String(val) : '');
  };
  return data.map(function(r, idx) {
    var appliedStr = '';
    if (r[2] instanceof Date) {
      appliedStr = Utilities.formatDate(r[2], Session.getScriptTimeZone() || 'GMT', 'yyyy-MM-dd');
    } else {
      appliedStr = String(r[2] || '');
    }
    return {
      rowIndex: idx + 2,
      company: r[0] || '',
      title: r[1] || '',
      appliedDate: appliedStr,
      jobLink: extractUrl(r[3]),
      status: r[4] || 'Applied',
      sourcePortal: r[5] || 'Direct',
      location: r[6] || '',
      employmentType: r[7] || '',
      experience: r[8] || '',
      salary: r[9] || '',
      stage: r[10] || '',
      loggedAt: r[11] || '',
      notes: r[12] || '',
      uniqueKey: r[13] || ''
    };
  }).filter(function(a) { return a.company && a.company !== 'Company'; });
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetName = data.sheetName || 'Applications';
    let sheet = ss.getSheetByName(sheetName);

    // Initialize Applications sheet if missing
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
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

    // 1. Fetch Applications Action
    if (data.action === 'getApplications') {
      const apps = readApplicationsFromSheet(sheet);
      return ContentService.createTextOutput(JSON.stringify({ ok: true, applications: apps }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 2. Update Status Action (from HTML Dashboard)
    if (data.action === 'updateStatus') {
      const lastRow = sheet.getLastRow();
      let targetRow = data.rowIndex;

      if (lastRow > 1) {
        if (data.uniqueKey) {
          const keys = sheet.getRange(2, 14, lastRow - 1, 1).getValues();
          for (let i = 0; i < keys.length; i++) {
            if (keys[i][0] === data.uniqueKey) {
              targetRow = i + 2;
              break;
            }
          }
        }
        if (targetRow && targetRow >= 2 && targetRow <= lastRow) {
          if (data.status) sheet.getRange(targetRow, 5).setValue(data.status); // Column E: Status
          if (data.stage !== undefined) sheet.getRange(targetRow, 11).setValue(data.stage); // Column K: Stage
          if (data.notes !== undefined) sheet.getRange(targetRow, 13).setValue(data.notes); // Column M: Notes

          return ContentService.createTextOutput(JSON.stringify({ ok: true, status: 'updated', rowIndex: targetRow }))
            .setMimeType(ContentService.MimeType.JSON);
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'Row not found' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 3. Append Application Action
    if (data.action === 'append' && data.values && data.values.length > 0) {
      const row = data.values[0];
      const uniqueKey = row[13];

      // Deduplication check
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        const keys = sheet.getRange(2, 14, lastRow - 1, 1).getValues();
        for (let i = 0; i < keys.length; i++) {
          if (keys[i][0] === uniqueKey) {
            return ContentService.createTextOutput(JSON.stringify({ status: 'duplicate' }))
              .setMimeType(ContentService.MimeType.JSON);
          }
        }
      }

      sheet.appendRow(row);
      return ContentService.createTextOutput(JSON.stringify({ status: 'saved' }))
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
    const sheet = ss.getSheetByName('Applications');
    const apps = readApplicationsFromSheet(sheet);
    return ContentService.createTextOutput(JSON.stringify({ ok: true, applications: apps }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString(), applications: [] }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
