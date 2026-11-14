# Contributing to JobTrack AI 🚀

Thank you for your interest in contributing to **JobTrack AI**! We welcome contributions from developers, designers, and job seekers worldwide.

Whether you're fixing a bug, adding an adapter for a regional job board, improving email classification patterns, or polishing the dashboard UI, your help makes JobTrack AI better for everyone.

---

## 🧭 Code of Conduct

Please read and adhere to our [Code of Conduct](CODE_OF_CONDUCT.md). We expect all contributors and maintainers to foster a welcoming, respectful, and harassment-free community.

---

## 🛠️ Getting Started with Local Development

### Prerequisites
- Google Chrome (or Chromium-based browsers: Brave, Edge, Arc, Opera)
- Node.js (v18+ recommended for syntax validation)
- Git

### 1. Fork & Clone the Repository
```bash
# Clone your fork
git clone https://github.com/<your-username>/jobtrack-ai.git
cd jobtrack-ai

# Add upstream remote
git remote add upstream https://github.com/sav98aman/jobtrack-ai.git
```

### 2. Load the Extension in Chrome
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked** and select your local `jobtrack-ai` directory.
4. Pin the JobTrack AI icon to your toolbar.

### 3. Verify Code Changes Locally
JobTrack AI uses zero external dependencies or bundling tools (100% vanilla JavaScript, HTML, and CSS).
To verify JavaScript syntax:
```bash
node -c src/shared/engine.js src/content/adapters.js src/content/email-scanner.js src/background/background.js src/dashboard/dashboard.js
```

---

## 🧩 Architectural Overview

JobTrack AI follows a modular, Manifest V3 compliant architecture:

```text
jobtrack-ai/
├── manifest.json              # Extension permissions, host rules, and content script registration
├── src/
│   ├── background/
│   │   ├── background.js      # Service worker: queues, storage, webhook & OAuth sync
│   │   └── sheets.js          # Google Sheets v4 API client & row formatters
│   ├── content/
│   │   ├── adapters.js        # Portal extractors (LinkedIn, Hirist, Naukri, Indeed, etc.)
│   │   ├── email-scanner.js   # Real-time Gmail & Outlook classifier and floating UI
│   │   └── content.js         # Submission observer, DOM listeners & apply journey tracker
│   ├── dashboard/             # Executive analytics & live status dashboard
│   │   ├── dashboard.html
│   │   ├── dashboard.css
│   │   └── dashboard.js
│   ├── popup/                 # Quick status popup & manual job logger
│   ├── options/               # Extension configuration & connection settings
│   └── shared/
│       ├── engine.js          # Normalization, email regex patterns, role disambiguation
│       └── util.js            # Key hashing, URL canonicalization, and date formatting
└── scripts/
    └── google-apps-script.js  # Free standalone Apps Script webhook & Gmail scanner backend
```

---

## 💡 How to Add a New Job Portal Adapter

We actively encourage adding adapters for new job platforms! To add support for a new portal:

1. Open [`src/content/adapters.js`](src/content/adapters.js).
2. Add an entry to the `PLATFORMS` array:
   ```javascript
   {
     id: 'portalname',
     host: /(^|\.)portalname\.com$/,
     jobUrl: /\/jobs\/view\/|job-listings/,
     employer: ['.company-name a', '[class*="company"]'],
     title: ['h1.job-title', '[class*="title"]'],
     confirmSel: ['.application-success', '[class*="success-message"]'],
     confirmUrl: /apply\/confirmation|thank-you/i
   }
   ```
3. If the portal requires custom DOM extraction logic (like multi-frame modals or breadcrumbs), implement a helper function:
   ```javascript
   function extractPortalNameJob() {
     // ... custom DOM lookups ...
     return { company, title, location, canonical };
   }
   ```
4. Verify by navigating to a job page on the portal and running `node -c src/content/adapters.js`.
5. Update [`SUPPORT_MATRIX.md`](SUPPORT_MATRIX.md).

---

## ✉️ Enhancing Email Intelligence

JobTrack AI detects:
- **Rejections**: "unfortunately, we will not be moving forward..."
- **Interviews**: "invitation to interview", "schedule a phone screen..."
- **Assessments**: "online coding challenge", "HackerRank test link..."
- **Offers**: "offer of employment", "pleased to offer..."

To add new patterns or recruiter signatures:
1. Open [`src/shared/engine.js`](src/shared/engine.js).
2. Update `classifyEmail()` with new regex patterns.
3. Test your patterns:
   ```bash
   node -e 'const JT = {}; require("./src/shared/engine.js"); console.log(JT.engine.classifyEmail("Your subject", "Your body"));'
   ```

---

## 📋 Pull Request Guidelines

1. **Keep PRs Focused**: One feature or bug fix per pull request.
2. **No External Libraries**: Do not introduce npm packages, bundlers (Webpack, Vite), or frontend frameworks. We intentionally maintain 100% vanilla JavaScript.
3. **Never Commit Secrets**: Ensure zero API keys, personal OAuth tokens, or private Web App URLs are committed.
4. **Follow Semantic Commits**:
   - `feat: add Dice.com job portal adapter`
   - `fix: resolve company parsing for Outlook emails`
   - `docs: update setup instructions in README`
   - `style: refine dashboard dark mode contrast`

---

## 💬 Community & Support

- **Bug Reports**: Open an issue using the [Bug Report Template](.github/ISSUE_TEMPLATE/bug_report.md).
- **Feature Requests**: Open an issue using the [Feature Request Template](.github/ISSUE_TEMPLATE/feature_request.md).
- **Discussions**: Start a conversation on GitHub Discussions.

Thank you for contributing to an open, privacy-first job tracking tool! 🌟

