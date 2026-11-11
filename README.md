# JobTrack AI 🚀

> **Automated Job Application Tracker for Google Chrome & Google Sheets**  
> Never lose track of where, when, and what role you applied for. Zero-touch, 100% private.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-brightgreen.svg)](manifest.json)
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
- **📊 Executive Built-in Web Dashboard & Google Sheets**:
  - Live KPIs: Total Applications, Today's Submissions, Active Pipeline, and Response Rate.
  - Interactive status dropdowns (`Applied`, `Screening`, `Interviewing`, `Offer`, `Rejected`, `No Response`) that sync live to Google Sheets.
  - One-click links straight back to the original job posting.
  - Automatic historical deduplication (never duplicate entries in the same 24 hours).
- **🔒 100% Private & Open Source**:
  - **Zero intermediate servers**: Data flows directly from your browser to **your own personal Google Sheet**.
  - Never reads passwords, emails, form inputs, or resumes.

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
   - Copy the entire code from [`scripts/google-apps-script.js`](scripts/google-apps-script.js) and paste it into the editor.
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
│   │   └── adapters.js        # Portal-specific job metadata extractors (LinkedIn, Hirist, Naukri)
│   ├── dashboard/             # Executive analytics & live status dashboard
│   │   ├── dashboard.html
│   │   ├── dashboard.css
│   │   └── dashboard.js
│   ├── popup/                 # Quick status popup & manual job logger
│   ├── options/               # Extension configuration & connection settings
│   └── shared/                # Normalization engine & helper utilities
│       ├── engine.js          # Role disambiguation, URL title recovery & scoring
│       └── util.js
├── scripts/
│   └── google-apps-script.js  # Free standalone Apps Script webhook backend
├── PRIVACY_POLICY.md          # Chrome Web Store compliant privacy policy
└── LICENSE                    # MIT License
```

---

## 🛡️ Security & Privacy

- All credentials (OAuth tokens, Webhook URLs) stay strictly inside your local browser instance (`chrome.storage.local`).
- No analytics, third-party trackers, or external servers are involved.
- Read our full [Privacy Policy](PRIVACY_POLICY.md).

---

## 🤝 Contributing

Contributions are welcome! To add support for new job portals or improve existing adapters:
1. Fork the Project.
2. Create your Feature Branch (`git checkout -b feature/NewPortalAdapter`).
3. Commit your Changes (`git commit -m 'feat: added Glassdoor adapter'`).
4. Push to the Branch (`git push origin feature/NewPortalAdapter`).
5. Open a Pull Request.

---

## 📄 License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.
