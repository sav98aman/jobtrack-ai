# JobTrack AI 🚀

> **Automated Job Application Tracker for Google Chrome & Google Sheets**  
> Never lose track of where, when, and what role you applied for. Zero-touch, 100% private.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-brightgreen.svg)](manifest.json)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Open Source Love](https://badges.frapsoft.com/os/v1/open-source.svg?v=103)](https://github.com/ellerbrock/open-source-badges/)
[![Platform](https://img.shields.io/badge/Portals-LinkedIn%20%7C%20Hirist%20%7C%20Naukri%20%7C%20IIMJobs%20%7C%20Foundit%20%7C%20Career%20Sites-orange.svg)](SUPPORT_MATRIX.md)

---

## ✨ Features

- **⚡ Zero-Touch Auto-Logging**: Automatically detects confirmed job applications across major portals and records them immediately.
- **🌐 Supported Job Portals**:
  - **LinkedIn** (Easy Apply modals, search job cards, direct postings)
  - **Hirist.tech & IIMJobs** (Recruiter postings, confidential roles, breadcrumb & slug extraction)
  - **Naukri.com** (Single-apply `/myapply/saveApply`, standard job listings)
  - **Indeed**, **Instahyre**, **Foundit**
  - **Direct Company Career Sites** (Workday, Greenhouse, Lever, SmartRecruiters, Ashby)
- **✉️ Recruiter Email Intelligence (Gmail & Outlook)**:
  - Automatically identifies follow-up emails from recruiters and hiring teams:
    - 📅 **Interview Calls / Invitations** $\rightarrow$ Prompts to update status to `Interviewing`
    - 💻 **Online Coding Assessments** (HackerRank, CodeSignal, Codility, Take-home) $\rightarrow$ Updates status to `Screening (Assessment)`
    - ❌ **Application Rejections** $\rightarrow$ Updates status to `Rejected`
    - 🎉 **Job Offers** $\rightarrow$ Updates status to `Offer`
  - In-browser real-time action widget directly inside Gmail and Outlook.
  - On-demand **"✉️ Scan Emails"** button in Dashboard powered by Google Apps Script.
- **📊 Executive Built-in Web Dashboard & Google Sheets**:
  - Live KPIs: Total Applications, Today's Submissions, Active Pipeline, and Response Rate.
  - Interactive status dropdowns (`Applied`, `Screening`, `Interviewing`, `Offer`, `Rejected`, `No Response`) that sync live to Google Sheets.
  - One-click links straight back to the original job posting.
  - Automatic historical deduplication (never duplicate entries in the same 24 hours).
- **🔒 100% Private & Open Source**:
  - **Zero intermediate servers**: Data flows directly from your browser to **your own personal Google Sheet**.
  - Never reads passwords, form inputs, or resumes.
  - Open source under the [MIT License](LICENSE). Contributions welcome!

---

## ⚡ Easy 3-Step Setup Guide

### Step 1: Install Extension in Chrome

1. Clone or download this repository:
   ```bash
   git clone https://github.com/sav98aman/jobtrack-ai.git
   ```
2. Open Google Chrome and navigate to:
   ```text
   chrome://extensions/
   ```
3. Toggle on **Developer mode** in the top-right corner.
4. Click **Load unpacked** (top-left) and select the `jobtrack-ai` project folder.
5. Pin **JobTrack AI** to your Chrome toolbar.

---

### Step 2: Connect Your Google Sheet (Free Apps Script Webhook — Recommended)

No Google Cloud setup or API keys required! This takes under 60 seconds:

1. **Create a Sheet**: Open a new Google Sheet at [sheets.new](https://sheets.new).
2. **Open Apps Script**: In the top menu, go to **Extensions** → **Apps Script**.
3. **Paste Script**:
   - Delete any default code in the editor (`function myFunction() {}`).
   - Copy and paste the entire script code below into the editor (or copy from [`scripts/google-apps-script.js`](scripts/google-apps-script.js)):

   <details open>
   <summary><b>📋 Click to view / copy the full Google Apps Script code (<code>Code.gs</code>)</b></summary>

   ```javascript
   /**
    * JobTrack AI - Google Apps Script Backend (100% Free, Zero Google Cloud Setup)
    *
    * Paste this entire code into your Google Sheet's Apps Script editor (Code.gs).
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
   ```
   </details>

   - Click the **💾 Save** icon (or `Ctrl+S` / `Cmd+S`).
4. **Deploy as Web App**:
   - Click the blue **Deploy** button (top-right) → **New deployment**.
   - Click the gear icon ⚙️ next to *Select type* and choose **Web app**.
   - Configure settings:
     - **Description**: `JobTrack AI Webhook`
     - **Execute as**: `Me (your-email@gmail.com)`
     - **Who has access**: `Anyone` *(Crucial so the extension can send data to your sheet)*
   - Click **Deploy**.
   - Click **Authorize access**, choose your Google account, click *Advanced* → *Go to job-tracker (unsafe)*, and click **Allow**.
5. **Copy the Web App URL**:
   - Copy the URL ending in `/exec` (looks like `https://script.google.com/macros/s/.../exec`).
6. **Connect the Extension**:
   - Open the **JobTrack AI Dashboard** by clicking the extension icon → **Dashboard** (or right-click extension icon → Options).
   - In the connection banner, paste your Web App URL and click **Connect & Sync**.
   - You will see: `Synced with Google Sheets ● Connected`.

---

### Step 3: Start Applying!

1. Browse jobs on **LinkedIn**, **Hirist**, or **Naukri**.
2. Apply to any job:
   - On **LinkedIn**: Click *Easy Apply* and submit.
   - On **Hirist**: Click *Apply*.
   - On **Naukri**: Click *Apply* / submit on *Save Apply*.
3. JobTrack AI instantly detects your submission and automatically logs:
   - **Company Name** (cleaned of recruiter pipes and locations)
   - **Job Title** (with skills and specializations intact)
   - **Date Applied** (ISO format)
   - **Job Posting URL**
   - **Initial Status**: `Applied`
   - **Source Portal & Location**
4. Check your Google Sheet or open the JobTrack AI Dashboard to view your live tracker!

---

## ✉️ Email Intelligence: Automatic Status Tracking from Gmail & Outlook

JobTrack AI doesn't stop after you apply. It automatically tracks recruiter communications in **Gmail** and **Outlook**:

### 1. Real-Time In-Browser Detection
When you open an email in **Gmail** (`mail.google.com`) or **Outlook** (`outlook.live.com` / `outlook.office.com`), JobTrack AI scans the sender, subject, and snippet:

| Email Category | Detected Phrases | Resulting Sheet Status |
| :--- | :--- | :--- |
| 📅 **Interview Invitation** | "invitation to interview", "schedule a phone screen", "technical interview", Calendly link | `Interviewing` |
| 💻 **Coding / Assessment** | "online assessment", "HackerRank test link", "CodeSignal", "take-home assignment" | `Screening` (Assessment) |
| ❌ **Application Rejection** | "unfortunately, we will not be moving forward", "after careful consideration", "decided to pursue other candidates" | `Rejected` |
| 🎉 **Job Offer** | "offer of employment", "pleased to offer you", "formal offer letter" | `Offer` |

A discreet floating card appears at the bottom-right of your inbox with a one-click **"✓ Update Google Sheet"** button to immediately sync Column E in your tracker!

### 2. On-Demand Inbox Scanning
Prefer to scan your inbox in bulk?
1. Open the JobTrack AI Dashboard (`dashboard.html`).
2. Click the **✉️ Scan Emails** button in the header.
3. The Web App backend searches your Gmail for the last 14 days of recruiter emails matching your applied companies, updates their statuses, and reloads your dashboard automatically!

---

## 🖥️ Alternative Connection Method: Native Google Cloud OAuth

If your organization requires Google Cloud OAuth:
1. Go to the [Google Cloud Console](https://console.cloud.google.com/) and enable the **Google Sheets API**.
2. Under **Credentials**, create an **OAuth 2.0 Client ID** with Application Type: `Web application`.
3. Set Authorized Redirect URI to `https://<EXTENSION_ID>.chromiumapp.org/` (found in JobTrack AI extension options).
4. Add your email under **Test Users** on the OAuth consent screen.
5. In JobTrack AI options, enter your Client ID and click **Sign In with Google**.

---

## 🛠️ Updating & Reloading the Extension

When code updates are pulled:
1. Run `git pull origin master` in your local directory.
2. Go to `chrome://extensions/`.
3. Find **JobTrack AI** and click the **🔄 Reload** button.
4. Refresh any open job portal tabs.

---

## ❓ Frequently Asked Questions & Troubleshooting

<details>
<summary><b>1. "Script function not found: doGet" error</b></summary>

- This happens if you deploy the script without selecting **New deployment**.
- In Google Apps Script, click **Deploy** → **New deployment**, set *Execute as* to **Me** and *Who has access* to **Anyone**, and copy the new deployment URL.
</details>

<details>
<summary><b>2. "Sheets API error 400: Unable to open the file at present"</b></summary>

- This occurs when a Web App URL (`.../exec`) is accidentally pasted into the Spreadsheet ID input box.
- The latest version automatically sanitizes this and connects directly via the Webhook handler.
</details>

<details>
<summary><b>3. How do I change an application's status?</b></summary>

- Open the built-in Dashboard (`dashboard.html`).
- Click the Status dropdown next to any job (e.g., change `Applied` to `Interviewing` or `Offer`).
- JobTrack AI updates Column E in your Google Sheet immediately in real-time.
</details>

<details>
<summary><b>4. Does JobTrack AI record duplicate applications?</b></summary>

- No. JobTrack AI generates a unique hash (`company|title|date`) and deduplicates submissions within a 24-hour window.
</details>

---

## 📁 Repository Structure

```text
jobtrack-ai/
├── manifest.json              # Extension Manifest V3 configuration
├── icons/                     # Extension icons (16px, 48px, 128px)
├── src/
│   ├── background/
│   │   ├── background.js      # Service worker, queue orchestrator & webhook router
│   │   └── sheets.js          # Google Sheets v4 API client & row formatters
│   ├── content/
│   │   ├── content.js         # Submission observer & click listeners
│   │   ├── adapters.js        # Portal-specific job metadata extractors (LinkedIn, Hirist, Naukri)
│   │   └── email-scanner.js   # Real-time Gmail & Outlook recruiter email classifier
│   ├── dashboard/             # Executive analytics & live status dashboard
│   │   ├── dashboard.html
│   │   ├── dashboard.css
│   │   └── dashboard.js
│   ├── popup/                 # Quick status popup & manual job logger
│   ├── options/               # Extension configuration & connection settings
│   └── shared/                # Normalization engine & helper utilities
│       ├── engine.js          # Role disambiguation, email patterns & URL title recovery
│       └── util.js
├── scripts/
│   └── google-apps-script.js  # Free standalone Apps Script webhook backend & Gmail scanner
├── CONTRIBUTING.md            # Open source contribution guide
├── CODE_OF_CONDUCT.md         # Contributor Covenant Code of Conduct
├── SECURITY.md                # Responsible disclosure & privacy policy
├── PRIVACY_POLICY.md          # Chrome Web Store compliant privacy policy
└── LICENSE                    # MIT License
```

---

## 🛡️ Security & Privacy

- All credentials (OAuth tokens, Webhook URLs) stay strictly inside your local browser instance (`chrome.storage.local`).
- No analytics, third-party trackers, or external servers are involved.
- Read our full [Privacy Policy](PRIVACY_POLICY.md) and [Security Policy](SECURITY.md).

---

## 🤝 Contributing & Community

JobTrack AI is proudly **100% open-source**. Contributions from the community are warmly welcome!

- **New Portals**: Want to add support for a regional job board (Dice, Glassdoor, Wellfound)?
- **Email Intelligence**: Want to add more email patterns or recruiter signatures?
- **Dashboard UI**: Have ideas for new charts, pipeline views, or filters?

Please read our [Contributing Guidelines](CONTRIBUTING.md) and [Code of Conduct](CODE_OF_CONDUCT.md) before opening a pull request.

---

## 📄 License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.
