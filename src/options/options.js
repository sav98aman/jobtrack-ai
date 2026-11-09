const ids = ['clientId', 'spreadsheetId', 'sheetName', 'webhookUrl'], flags = ['autoDetect', 'autoSave', 'alwaysConfirm'];
const redirectUriEl = document.getElementById('redirectUri');
if (redirectUriEl && chrome.identity && chrome.identity.getRedirectURL) {
  redirectUriEl.value = chrome.identity.getRedirectURL();
}
chrome.runtime.sendMessage({ type: 'GET_STATE' }, s => {
  ids.forEach(i => document.getElementById(i).value = s.settings[i] ?? '');
  if (!document.getElementById('clientId').value || document.getElementById('clientId').value.includes('YOUR_OLD_CLIENT_ID')) {
    document.getElementById('clientId').value = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
  }
  flags.forEach(i => document.getElementById(i).checked = !!s.settings[i]);
});
document.getElementById('save').onclick = () => {
  const st = {};
  ids.forEach(i => {
    let val = document.getElementById(i).value.trim();
    if (i === 'clientId' && val && !val.includes('.apps.googleusercontent.com') && /^\d+-[a-zA-Z0-9_-]+$/.test(val)) {
      val += '.apps.googleusercontent.com';
      document.getElementById('clientId').value = val;
    }
    st[i] = val;
  });
  flags.forEach(i => st[i] = document.getElementById(i).checked);
  chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings: st }, () => document.getElementById('ok').textContent = 'Saved');
};
