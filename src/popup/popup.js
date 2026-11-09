const $ = id => document.getElementById(id), msg = m => chrome.runtime.sendMessage(m);
const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
async function render() {
  const s = await msg({ type: 'GET_STATE' });
  $('connect').textContent = s.isConnected ? 'Google connected ✓' : 'Connect Google';
  $('pause').textContent = s.settings.paused ? 'Resume detection' : 'Pause detection';
  $('reviews').innerHTML = s.reviews.length ? s.reviews.map(r => `<div class="card"><b>Did you submit this application?</b>
    <label>Company<input data-f="company" data-id="${r.id}" value="${esc(r.record.company)}"></label>
    <label>Job title<input data-f="title" data-id="${r.id}" value="${esc(r.record.title)}"></label>
    <p class="muted">${esc(r.reasons.join(', '))} · confidence ${r.score}${r.record.issues.length ? '<br>' + esc(r.record.issues.join('; ')) : ''}</p>
    <div class="row"><button data-yes="${r.id}">Yes, save application</button><button data-no="${r.id}">No, discard</button></div></div>`).join('') : '';
  const last = s.history[0];
  $('status').textContent = `${s.queue.length} pending` + (last ? ` · last: ${last.ok ? last.result : 'failed — ' + last.error}` : '')
    + (s.queue.find(i => i.lastError) ? ` · ${s.queue.find(i => i.lastError).lastError}` : '');
  const hist = s.history || [];
  const histEl = $('history');
  if (histEl) {
    histEl.innerHTML = hist.length
      ? '<b>Recent Activity:</b><br>' + hist.slice(0, 4).map(h =>
          `${h.ok ? '✓' : '✗'} <b>${esc(h.company || 'Job')}</b> (${esc(h.title || '')}) — <span class="${h.ok ? '' : 'muted'}">${esc(h.ok ? h.result : h.error)}</span>`
        ).join('<br>')
      : '<span class="muted">No activity logged yet</span>';
  }
}
$('reviews').onclick = async e => {
  const yes = e.target.dataset.yes, no = e.target.dataset.no, id = yes || no; if (!id) return;
  const edits = {}; document.querySelectorAll(`input[data-id="${id}"]`).forEach(i => edits[i.dataset.f] = i.value.trim());
  await msg({ type: 'REVIEW', id, accept: !!yes, edits }); render();
};
$('connect').onclick = async () => {
  const r = await msg({ type: 'CONNECT' });
  $('status').textContent = r.ok ? 'Google connected' : r.error;
  if (r.ok) render();
};
$('sync').onclick = async () => { await msg({ type: 'SYNC_NOW' }); render(); };
$('testRow').onclick = async () => {
  $('status').textContent = 'Writing test row to Google Sheet…';
  const r = await msg({ type: 'TEST_SYNC' });
  if (r.ok) {
    $('status').textContent = 'Success! Test row added to your Google Sheet.';
    render();
  } else {
    $('status').textContent = 'Failed: ' + r.error;
  }
};
$('pause').onclick = async () => { const s = await msg({ type: 'GET_STATE' }); await msg({ type: 'SAVE_SETTINGS', settings: { paused: !s.settings.paused } }); render(); };
let currentTabUrl = '', detectedInfo = null;
$('opts').onclick = e => { e.preventDefault(); chrome.runtime.openOptionsPage(); };
$('addManual').onclick = () => {
  $('manualBox').style.display = $('manualBox').style.display === 'none' ? 'block' : 'none';
  if ($('manualBox').style.display === 'block') {
    if (detectedInfo) {
      if (detectedInfo.company && !$('manCo').value) $('manCo').value = detectedInfo.company;
      if (detectedInfo.title && !$('manTitle').value) $('manTitle').value = detectedInfo.title;
    }
    $('manCo').focus();
  }
};
$('cancelManual').onclick = () => { $('manualBox').style.display = 'none'; };
$('saveManual').onclick = async () => {
  const company = $('manCo').value.trim();
  const title = $('manTitle').value.trim();
  if (!company) { $('status').textContent = 'Please enter a company name.'; return; }
  $('status').textContent = 'Saving application…';
  const r = await msg({
    type: 'MANUAL_LOG',
    record: { company, title: title || 'Job Application', jobLink: currentTabUrl }
  });
  if (r.ok) {
    $('status').textContent = `Saved: ${title || 'Job'} at ${company}`;
    $('manCo').value = '';
    $('manTitle').value = '';
    $('manualBox').style.display = 'none';
    render();
  } else {
    $('status').textContent = 'Save failed: ' + (r.error || 'Unknown error');
  }
};
$('openSheet').onclick = async e => {
  e.preventDefault();
  const s = await msg({ type: 'GET_STATE' });
  const sheetId = s.settings.spreadsheetId;
  if (sheetId) chrome.tabs.create({ url: `https://docs.google.com/spreadsheets/d/${sheetId}/edit` });
};
chrome.tabs.query({ active: true, currentWindow: true }, ([t]) => {
  if (t) currentTabUrl = t.url || '';
  chrome.tabs.sendMessage(t.id, { type: 'GET_PAGE_INFO' }, i => {
    detectedInfo = i;
    $('page').textContent = chrome.runtime.lastError || !i ? 'No job detected on this page.'
      : `${i.company || 'Employer unknown'} — ${i.title || 'title unknown'} (${i.platform})`;
  });
});
render();
