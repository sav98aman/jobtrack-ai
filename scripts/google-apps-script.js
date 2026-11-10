/**
 * JobTrack AI - Google Apps Script Backend (100% Free, Zero Google Cloud Setup)
 *
 * HOW TO USE:
 * 1. Open Google Sheets (https://sheets.new)
 * 2. Click "Extensions" -> "Apps Script"
 * 3. Delete any code in the editor and paste this entire file.
 * 4. Click "Deploy" -> "New deployment"
 * 5. Select type: "Web app"
 * 6. Set Description: "JobTrack AI Webhook"
 * 7. Set Execute as: "Me"
 * 8. Set Who has access: "Anyone" (allows your extension to send data to your sheet)
 * 9. Click "Deploy", authorize permissions, and copy the Web App URL (ends with /exec)
 * 10. Open JobTrack AI extension -> Settings -> Paste URL under "Method B: Google Apps Script Web App".
 */

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
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({ applications: [] }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      return ContentService.createTextOutput(JSON.stringify({ applications: [] }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    const data = sheet.getRange(2, 1, lastRow - 1, 14).getValues();
    const extractUrl = val => {
      if (!val) return '';
      const m = String(val).match(/=HYPERLINK\("([^"]+)"/i);
      return m ? m[1] : (String(val).startsWith('http') ? String(val) : '');
    };
    const applications = data.map((r, idx) => ({
      rowIndex: idx + 2,
      company: r[0] || '',
      title: r[1] || '',
      appliedDate: r[2] instanceof Date ? Utilities.formatDate(r[2], Session.getScriptTimeZone(), 'yyyy-MM-dd') : (r[2] || ''),
      jobLink: extractUrl(r[3]),
      status: r[4] || 'Applied',
      sourcePortal: r[5] || 'Direct',
      location: r[6] || '',
      notes: r[12] || '',
      uniqueKey: r[13] || ''
    })).filter(a => a.company && a.company !== 'Company');

    return ContentService.createTextOutput(JSON.stringify({ applications: applications }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString(), applications: [] }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

