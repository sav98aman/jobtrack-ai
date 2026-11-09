# JobTrack AI — v0.1 (Phases 1–3 foundation)
## Setup
1. Google Cloud Console: 
   - Create an OAuth 2.0 Client ID of type **Web application** (in Credentials).
   - Under **Authorized redirect URIs**, add `https://<YOUR_EXTENSION_ID>.chromiumapp.org/` (found in the extension Settings page).
   - Enable the **Google Sheets API** in APIs & Services.
   - If the OAuth consent screen is in "Testing" mode, add your Google account email to **Test users**.
2. Put the full Client ID (ending in `.apps.googleusercontent.com`) into JobTrack AI Settings (options page).
3. `chrome://extensions` → Developer mode → Load unpacked → this folder.
4. Popup → **Connect Google**. Spreadsheet ID is pre-filled in Settings.
## Not built yet
React dashboard/analytics/follow-ups, iframe support, sync-history UI, Vitest/Playwright suites, portal test reports.
## Notes
- Uses the `spreadsheets` scope (required to open an existing sheet) and all-site content scripts (required for direct career pages).
- Appends all columns A–N; check that none of those columns hold ARRAYFORMULAs you need to keep.
