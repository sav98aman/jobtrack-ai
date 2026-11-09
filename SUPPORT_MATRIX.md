# Portal support matrix (PRD §15)
Nothing is "Fully Supported" until it passes every quality gate with recorded test evidence.

| Platform | Status | Notes |
|---|---|---|
| LinkedIn, Naukri, Indeed, Instahyre, Foundit, iimjobs, Hirist | Website Detected | Selectors are untested best guesses |
| Workday, Greenhouse, Lever, Ashby, SmartRecruiters | Website Detected | Employer from URL slug is flagged for user review |
| Direct company sites (generic adapter) | Not Tested | Fallback only: JSON-LD + confirmation text; ask-to-confirm unless strong evidence |

Per-portal test evidence (employer, title, submission, duplicate, Sheets result, limitations, date) goes in `test-reports/<portal>.md`.
