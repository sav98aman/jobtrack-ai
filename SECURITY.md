# Security Policy

## Supported Versions

JobTrack AI actively maintains security updates on the latest stable branch:

| Version | Supported          |
| ------- | ------------------ |
| 1.5.x   | :white_check_mark: |
| < 1.5   | :x:                |

---

## 🔒 Privacy & Architecture Principles

JobTrack AI is designed with strict **privacy-by-default** principles:

1. **Zero External Servers**: JobTrack AI does not maintain or connect to any centralized servers, tracking services, or cloud analytics.
2. **Direct-to-User Storage**: All job application data flows directly from your browser to your personal Google Drive (via Google Sheets API or Google Apps Script).
3. **Restricted Content Access**: The extension inspects job submission confirmations and recruitment email headers/snippets. It **never** reads, intercepts, or transmits sensitive form fields (e.g., passwords, credit cards, resumes, or private messages).
4. **Local Execution**: OAuth credentials and webhook URLs are stored strictly in Chrome's encrypted `chrome.storage.local`.

---

## 🛡️ Reporting a Vulnerability

If you discover a security vulnerability or sensitive data leak in JobTrack AI, please **do not open a public GitHub issue**.

Instead, please report it privately:
1. Contact the maintainers via GitHub Security Advisories: [Report a Vulnerability](https://github.com/sav98aman/jobtrack-ai/security/advisories/new)
2. Or reach out to the project maintainers directly.

### What to Include in Your Report
- A clear description of the vulnerability.
- Steps to reproduce or a Proof of Concept (PoC).
- Potential impact of the issue.
- Any suggestions for mitigation.

We will acknowledge receipt within 48 hours and work with you to remediate and publish a patch promptly.
