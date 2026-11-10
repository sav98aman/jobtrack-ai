# JobTrack AI 🚀

> **Automated Job Application Tracker for Google Chrome & Google Sheets**  
> Never lose track of where, when, and what role you applied for. Zero-touch, 100% private.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Chrome%20Extension-Manifest%20V3-brightgreen.svg)](manifest.json)
[![Platform](https://img.shields.io/badge/Portals-LinkedIn%20%7C%20Hirist%20%7C%20Naukri%20%7C%20IIMJobs%20%7C%20Foundit%20%7C%20Career%20Sites-orange.svg)](SUPPORT_MATRIX.md)

---

## ✨ Features

- **⚡ Zero-Touch Auto-Logging**: Automatically detects confirmed job application submissions across major portals and records them immediately.
- **🌐 Supported Job Portals**:
  - **LinkedIn** (Easy Apply modals, in-page confirmation cards)
  - **Hirist.tech** & **IIMJobs** (Breadcrumb extraction, post-submit tracking)
  - **Naukri.com**
  - **Instahyre** & **Foundit**
  - **Direct Company Career Sites** (Workday, Greenhouse, Lever, Ashby, BambooHR)
- **📊 Executive Google Sheets Dashboard**:
  - Live KPIs: Total Applications, Today's Submissions, Recruiter Response Rate %, and Pipeline Stages.
  - Color-coded status chips: `Applied`, `Screening`, `Interviewing`, `Offer`, `Rejected`.
  - Clean `=HYPERLINK` buttons pointing straight back to the job posting.
  - Automatic historical deduplication.
- **🔒 100% Private & Open Source**:
  - **No middleman servers**: All data is saved directly to **your personal Google Sheets** in your own Google Drive.
  - Never reads passwords, emails, form inputs, or resumes.
- **🖱️ One-Click Manual Log**:
  - For unlisted or boutique portals, open the extension popup and click `+ Log Job` with pre-filled page data.

---

## 🚀 Quick Start (2-Minute Setup)

### Step 1: Install Extension in Chrome
1. Clone or download this repository:
   ```bash
   git clone https://github.com/your-username/jobtrack-ai.git
   ```
2. Open Google Chrome and go to `chrome://extensions/`.
3. Toggle on **Developer mode** in the top right corner.
4. Click **Load unpacked** and select the `jobtrack-ai` folder.

---

### Step 2: Choose Your Connection Method

You can connect to Google Sheets using either of the two methods below:

#### Method A: Google Apps Script Web App (Easiest — 100% Free, Zero Google Cloud Setup)
1. Open a new Google Sheet at [sheets.new](https://sheets.new).
2. In the menu, go to **Extensions** → **Apps Script**.
3. Copy the code from [`scripts/google-apps-script.js`](scripts/google-apps-script.js) and paste it into the script editor.
4. Click **Deploy** → **New deployment**:
   - **Select type**: `Web app`
   - **Execute as**: `Me`
   - **Who has access**: `Anyone`
5. Click **Deploy**, authorize permissions, and copy the **Web app URL** (`https://script.google.com/macros/s/.../exec`).
6. Open the JobTrack AI extension → Click **Settings** (or right-click extension icon → Options).
7. Paste your Web app URL under **Method B: Google Apps Script Web App** and click **Save settings**.
8. Done! All applied jobs will now instantly log to your sheet.

---

#### Method B: Native Google Cloud OAuth
If you want automatic sheet creation and live dashboard generation via Google Cloud APIs:
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project and enable the **Google Sheets API**.
3. Under **APIs & Services** → **Credentials**, create an **OAuth 2.0 Client ID**:
   - **Application type**: `Web application`
   - **Authorized redirect URIs**: Copy the Redirect URI shown in the JobTrack AI extension Settings page (`https://<EXTENSION_ID>.chromiumapp.org/`).
4. In OAuth Consent Screen, add your email under **Test users** (if in Testing mode).
5. Paste your `Client ID` into JobTrack AI Settings (or copy `src/config.example.js` to `src/config.local.js`).
6. Click **Google connected** in the extension popup. A private spreadsheet with an executive dashboard is automatically created in your Google Drive!

---

## 📁 Repository Structure

```text
jobtrack-ai/
├── manifest.json              # Extension Manifest V3
├── icons/                     # Extension icons (16px, 48px, 128px)
├── src/
│   ├── background/
│   │   ├── background.js      # Service worker & queue orchestrator
│   │   └── sheets.js          # Google Sheets v4 API client & dashboard formatter
│   ├── content/
│   │   ├── content.js         # Submission observer & click listeners
│   │   └── adapters.js        # Portal-specific job metadata extractors
│   ├── popup/                 # Extension popup UI & manual job logger
│   ├── options/               # Extension configuration & connection settings
│   └── shared/                # Common normalization and regex engine
├── scripts/
│   └── google-apps-script.js  # Free standalone Apps Script webhook backend
├── PRIVACY_POLICY.md          # Chrome Web Store compliant privacy policy
└── LICENSE                    # MIT License
```

---

## 🛡️ Security & Privacy

- All credentials (OAuth tokens, API keys) stay inside your local browser instance.
- No analytics, tracking beacons, or third-party telemetries are bundled.
- Read our full [Privacy Policy](PRIVACY_POLICY.md).

---

## 🤝 Contributing

Pull requests are welcome! If you'd like to add support for a new job portal or enhance existing adapters:
1. Fork the Project.
2. Create your Feature Branch (`git checkout -b feature/NewPortalAdapter`).
3. Commit your Changes (`git commit -m 'feat: added Glassdoor adapter'`).
4. Push to the Branch (`git push origin feature/NewPortalAdapter`).
5. Open a Pull Request.

---

## 📄 License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.
