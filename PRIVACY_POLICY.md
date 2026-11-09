# Privacy Policy for JobTrack AI

**Effective Date:** November 9, 2026  
**Last Updated:** November 9, 2026

JobTrack AI ("we", "our", or "the extension") is committed to protecting your privacy. This Privacy Policy explains how our Chrome extension collects, uses, and safeguards your information.

---

### 1. What Information We Collect

JobTrack AI operates locally in your browser. When you visit job application portals (such as LinkedIn, Hirist, Naukri, or company career sites), the extension extracts only:
* **Job Title** (e.g. "Software Engineer")
* **Employer / Company Name** (e.g. "Google", "Deloitte")
* **Application Date**
* **Job URL** (the link to the job posting you applied for)
* **Application Status** (e.g. "Applied")
* **Location & Work Type** (if publicly listed on the job posting)

### 2. What We NEVER Collect or Store

* We **never** read, collect, or store your passwords, login credentials, or personal form inputs.
* We **never** read your resume, CV, cover letter, or answers to private application questions.
* We do **not** run any remote analytics, tracking pixels, or third-party advertising scripts.
* We do **not** operate a private database or backend server storing your data.

### 3. How Your Information Is Used

All extracted job details are transmitted **exclusively to your own Google Sheet** via the official Google Sheets API v4 using your authenticated Google account, or via your private Google Apps Script Web App URL. 

Your data belongs entirely to you and remains within your personal Google account.

### 4. Permissions Used

* `storage`: Used solely to store your extension preferences (e.g., your selected Google Sheet ID, auto-save settings, and recent application history locally on your computer).
* `identity`: Used to securely authenticate with Google OAuth 2.0 to access your personal Google Sheets without exposing passwords.
* `alarms`: Used to periodically flush any offline or queued applications to your sheet when an internet connection is restored.
* `notifications`: Used to alert you when an application is saved or when your confirmation is needed.
* `host_permissions` (`sheets.googleapis.com`): Required to append rows and format your Google Sheet.

### 5. Third-Party Sharing

We do not sell, rent, trade, or share your data with any third parties. Data is transferred solely between your local browser and Google Cloud APIs.

### 6. Contact Us

If you have any questions about this Privacy Policy, please contact the developer via the GitHub repository or support channels.
