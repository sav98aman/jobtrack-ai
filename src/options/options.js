const ids = ['clientId', 'spreadsheetId', 'sheetName', 'webhookUrl'], flags = ['autoDetect', 'autoSave', 'alwaysConfirm'];
const redirectUriEl = document.getElementById('redirectUri');
const webhookWarnEl = document.getElementById('webhookWarn');

function validateWebhook(val) {
  if (!webhookWarnEl) return;
  if (val && val.includes('/home/projects/')) {
    webhookWarnEl.style.display = 'block';
    webhookWarnEl.innerHTML = '⚠️ <b>That is the project editor link, not the deployed Web App URL!</b><br>In Google Apps Script, click <b>Deploy</b> → <b>New deployment</b> → select <b>Web app</b> (Who has access: <i>Anyone</i>) → click <b>Deploy</b> and copy the URL ending in <code>/exec</code>.';
  } else if (val && val.includes('docs.google.com/spreadsheets')) {
    webhookWarnEl.style.display = 'block';
    webhookWarnEl.innerHTML = '⚠️ That is a Google Sheet URL. Paste it in <b>Spreadsheet ID</b> above instead, or leave this field empty.';
  } else {
    webhookWarnEl.style.display = 'none';
  }
}

if (redirectUriEl && chrome.identity && chrome.identity.getRedirectURL) {
  redirectUriEl.value = chrome.identity.getRedirectURL();
}
chrome.runtime.sendMessage({ type: 'GET_STATE' }, s => {
  ids.forEach(i => document.getElementById(i).value = (s && s.settings && s.settings[i]) ?? '');
  flags.forEach(i => document.getElementById(i).checked = !!(s && s.settings && s.settings[i]));
  validateWebhook(document.getElementById('webhookUrl').value.trim());
});

document.getElementById('webhookUrl').addEventListener('input', e => validateWebhook(e.target.value.trim()));
document.getElementById('save').onclick = () => {
  const st = {};
  ids.forEach(i => {
    let val = document.getElementById(i).value.trim();
    if (i === 'clientId' && val && !val.includes('.apps.googleusercontent.com') && /^\d+-[a-zA-Z0-9_-]+$/.test(val)) {
      val += '.apps.googleusercontent.com';
      document.getElementById('clientId').value = val;
    }
    // Auto-detect: if a Google Sheet URL was pasted into spreadsheetId or webhookUrl
    if ((i === 'spreadsheetId' || i === 'webhookUrl') && val && val.includes('docs.google.com/spreadsheets')) {
      const match = val.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
      if (match) {
        if (i === 'webhookUrl') {
          st.spreadsheetId = match[1];
          document.getElementById('spreadsheetId').value = match[1];
          val = '';
          document.getElementById('webhookUrl').value = '';
        } else {
          val = match[1];
          document.getElementById('spreadsheetId').value = val;
        }
      }
    }
    // Auto-detect: if a Web App URL was pasted into spreadsheetId
    if (i === 'spreadsheetId' && val && val.includes('script.google.com/macros/s/')) {
      st.webhookUrl = val;
      document.getElementById('webhookUrl').value = val;
      val = '';
      document.getElementById('spreadsheetId').value = '';
    }
    // Sanitize spreadsheetId
    if (i === 'spreadsheetId' && val && (val === 'exec' || val.length < 15)) {
      val = '';
      document.getElementById('spreadsheetId').value = '';
    }
    st[i] = val;
  });
  flags.forEach(i => st[i] = document.getElementById(i).checked);
  chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings: st }, () => document.getElementById('ok').textContent = 'Saved');
};
