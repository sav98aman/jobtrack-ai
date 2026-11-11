// JobTrack AI - Vanilla JS Applications Dashboard
(function () {
  'use strict';

  let rawApplications = [];
  let currentStatus = 'All';
  let currentPortal = 'All';
  let currentSort = 'newest';
  let searchQuery = '';
  let spreadsheetId = '';

  const $ = id => document.getElementById(id);
  const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function showToast(msg, icon = '✓') {
    const toast = $('toast');
    $('toastIcon').textContent = icon;
    $('toastMsg').textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 3000);
  }

  function getAvatarColor(str) {
    const colors = ['#2563EB', '#7C3AED', '#059669', '#D97706', '#DC2626', '#0284C7', '#4F46E5'];
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  }

  function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }

  function getPortalClass(portal) {
    const p = String(portal || '').toLowerCase();
    if (p.includes('linkedin')) return 'portal-linkedin';
    if (p.includes('hirist') || p.includes('iimjobs')) return 'portal-hirist';
    if (p.includes('naukri')) return 'portal-naukri';
    if (p.includes('career') || p.includes('workday') || p.includes('greenhouse') || p.includes('lever')) return 'portal-career';
    return 'portal-default';
  }

  function getTodayISO() {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function parseSheetId(input) {
    if (!input) return '';
    const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (match) return match[1];
    return input.trim();
  }

  async function loadData(interactive = false) {
    $('connStatus').textContent = 'Fetching applications…';
    try {
      const res = await chrome.runtime.sendMessage({ type: 'GET_APPLICATIONS', interactive: !!interactive });
      if (res && res.applications && res.applications.length > 0) {
        rawApplications = res.applications;
        spreadsheetId = res.spreadsheetId || '';

        $('connectBanner').style.display = 'none';
        $('connStatus').innerHTML = `Synced with Google Sheets (${rawApplications.length} total) <span style="color:#10B981">● Connected</span>`;
        if (spreadsheetId) {
          $('openSheetLink').href = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
          $('openSheetLink').style.display = 'inline-flex';
        }
      } else if (res && res.ok) {
        rawApplications = res.applications || [];
        spreadsheetId = res.spreadsheetId || '';

        if (spreadsheetId) {
          $('connectBanner').style.display = 'none';
          $('connStatus').innerHTML = `Synced with Google Sheets (${rawApplications.length} total) <span style="color:#10B981">● Connected</span>`;
          $('openSheetLink').href = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
          $('openSheetLink').style.display = 'inline-flex';
        } else {
          $('connectBanner').style.display = 'flex';
          $('connStatus').innerHTML = `Local Mode (${rawApplications.length} saved) · Connect Google Sheet to sync live`;
          $('openSheetLink').style.display = 'none';
        }
      } else {
        if (rawApplications.length === 0) {
          $('connectBanner').style.display = 'flex';
        }
        $('connStatus').textContent = res && res.error ? `Sync notice: ${res.error}` : 'Offline (Showing cached applications)';
      }
    } catch (e) {
      $('connStatus').textContent = 'Unable to reach extension background worker.';
    }
    render();
  }

  function updateKPIs() {
    const total = rawApplications.length;
    const today = getTodayISO();
    const appliedToday = rawApplications.filter(a => String(a.appliedDate).startsWith(today)).length;
    const inPipeline = rawApplications.filter(a => ['Screening', 'Interviewing', 'Offer'].includes(a.status)).length;
    const responded = rawApplications.filter(a => a.status && a.status !== 'Applied').length;
    const rate = total > 0 ? Math.round((responded / total) * 100) : 0;

    $('kpiTotal').textContent = total;
    $('kpiToday').textContent = appliedToday;
    $('kpiPipeline').textContent = inPipeline;
    $('kpiResponseRate').textContent = `${rate}%`;

    // Tab Counts
    $('cntAll').textContent = `(${total})`;
    $('cntApplied').textContent = `(${rawApplications.filter(a => (a.status || 'Applied') === 'Applied').length})`;
    $('cntScreening').textContent = `(${rawApplications.filter(a => a.status === 'Screening').length})`;
    $('cntInterviewing').textContent = `(${rawApplications.filter(a => a.status === 'Interviewing').length})`;
    $('cntOffer').textContent = `(${rawApplications.filter(a => a.status === 'Offer').length})`;
    $('cntRejected').textContent = `(${rawApplications.filter(a => a.status === 'Rejected').length})`;
    if ($('cntNoResponse')) $('cntNoResponse').textContent = `(${rawApplications.filter(a => a.status === 'No Response').length})`;
  }

  function render() {
    updateKPIs();

    // Filtering
    let list = rawApplications.filter(app => {
      // Status Tab filter
      if (currentStatus !== 'All' && (app.status || 'Applied') !== currentStatus) return false;

      // Portal filter
      if (currentPortal !== 'All') {
        const p = String(app.sourcePortal || '').toLowerCase();
        if (currentPortal === 'LinkedIn' && !p.includes('linkedin')) return false;
        if (currentPortal === 'Hirist' && !p.includes('hirist') && !p.includes('iimjobs')) return false;
        if (currentPortal === 'Naukri' && !p.includes('naukri')) return false;
        if (currentPortal === 'Career Site' && !p.includes('career') && !p.includes('workday') && !p.includes('greenhouse')) return false;
        if (currentPortal === 'Direct' && (p.includes('linkedin') || p.includes('hirist') || p.includes('naukri'))) return false;
      }

      // Search Query filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const co = String(app.company || '').toLowerCase();
        const ti = String(app.title || '').toLowerCase();
        const loc = String(app.location || '').toLowerCase();
        const notes = String(app.notes || '').toLowerCase();
        if (!co.includes(q) && !ti.includes(q) && !loc.includes(q) && !notes.includes(q)) return false;
      }

      return true;
    });

    // Sorting
    list.sort((a, b) => {
      if (currentSort === 'newest') return (b.rowIndex || 0) - (a.rowIndex || 0) || String(b.appliedDate).localeCompare(String(a.appliedDate));
      if (currentSort === 'oldest') return (a.rowIndex || 0) - (b.rowIndex || 0) || String(a.appliedDate).localeCompare(String(b.appliedDate));
      if (currentSort === 'company') return String(a.company).localeCompare(String(b.company));
      return 0;
    });

    const tbody = $('appTableBody');
    const empty = $('emptyState');

    if (list.length === 0) {
      tbody.innerHTML = '';
      empty.style.display = 'block';
      return;
    }

    empty.style.display = 'none';

    tbody.innerHTML = list.map(app => {
      const co = esc(app.company || 'Unknown');
      const ti = esc(app.title || 'Job Application');
      const portal = esc(app.sourcePortal || 'Direct');
      const pClass = getPortalClass(portal);
      const date = esc(app.appliedDate || '');
      const loc = esc(app.location || '');
      const status = app.status || 'Applied';
      const color = getAvatarColor(app.company || 'U');
      const initials = getInitials(app.company || 'U');
      const link = app.jobLink ? `<a href="${esc(app.jobLink)}" target="_blank" class="btn btn-sm" title="View Job Details">View ↗</a>` : '<span class="text-muted" style="font-size:12px;">—</span>';

      return `
        <tr>
          <td>
            <div class="company-cell">
              <div class="company-avatar" style="background:${color}">${initials}</div>
              <div>
                <div class="company-name">${co}</div>
                ${loc ? `<div style="font-size:11px;color:var(--text-muted);">${loc}</div>` : ''}
              </div>
            </div>
          </td>
          <td>
            <div style="font-weight:500;color:#F1F5F9;">${ti}</div>
            ${app.notes ? `<div style="font-size:11px;color:var(--text-muted);">${esc(app.notes)}</div>` : ''}
          </td>
          <td>
            <span class="portal-chip ${pClass}">${portal}</span>
          </td>
          <td style="color:var(--text-secondary);font-size:12px;font-variant-numeric:tabular-nums;">
            ${date}
          </td>
          <td>
            <select class="status-select status-${status}" data-row="${app.rowIndex || ''}" data-key="${esc(app.uniqueKey || '')}">
              <option value="Applied" ${status === 'Applied' ? 'selected' : ''}>Applied</option>
              <option value="Screening" ${status === 'Screening' ? 'selected' : ''}>Screening</option>
              <option value="Interviewing" ${status === 'Interviewing' ? 'selected' : ''}>Interviewing</option>
              <option value="Offer" ${status === 'Offer' ? 'selected' : ''}>Offer</option>
              <option value="Rejected" ${status === 'Rejected' ? 'selected' : ''}>Rejected</option>
              <option value="No Response" ${status === 'No Response' ? 'selected' : ''}>No Response</option>
            </select>
          </td>
          <td style="text-align:right;">
            ${link}
          </td>
        </tr>
      `;
    }).join('');
  }

  // Handle Status Change
  $('appTableBody').addEventListener('change', async e => {
    if (e.target.classList.contains('status-select')) {
      const select = e.target;
      const newStatus = select.value;
      const rowIndex = Number(select.dataset.row) || null;
      const uniqueKey = select.dataset.key;

      // Update local item
      const item = rawApplications.find(a => (rowIndex && a.rowIndex === rowIndex) || (uniqueKey && a.uniqueKey === uniqueKey));
      if (item) item.status = newStatus;

      // Update select styling
      select.className = `status-select status-${newStatus.replace(/\s+/g, '-')}`;
      updateKPIs();
      showToast(`Updating status in Google Sheet…`, '⏳');

      try {
        const res = await chrome.runtime.sendMessage({
          type: 'UPDATE_STATUS',
          rowIndex,
          uniqueKey,
          company: item ? item.company : '',
          status: newStatus
        });
        if (res && res.ok) {
          showToast(`✓ Google Sheet updated: ${item ? item.company : 'Job'} → ${newStatus}`);
        } else {
          showToast(`Saved locally (${res && res.error ? res.error : 'Sync pending'})`, 'ℹ');
        }
      } catch (err) {
        showToast(`Saved locally`, 'ℹ');
      }
    }
  });

  // Export CSV
  function exportCSV() {
    if (rawApplications.length === 0) {
      showToast('No applications to export', '⚠️');
      return;
    }
    const headers = ['Company', 'Job Title', 'Date Applied', 'Job Link', 'Status', 'Source Portal', 'Location', 'Notes'];
    const rows = rawApplications.map(a => [
      `"${String(a.company || '').replace(/"/g, '""')}"`,
      `"${String(a.title || '').replace(/"/g, '""')}"`,
      `"${String(a.appliedDate || '').replace(/"/g, '""')}"`,
      `"${String(a.jobLink || '').replace(/"/g, '""')}"`,
      `"${String(a.status || 'Applied').replace(/"/g, '""')}"`,
      `"${String(a.sourcePortal || '').replace(/"/g, '""')}"`,
      `"${String(a.location || '').replace(/"/g, '""')}"`,
      `"${String(a.notes || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `jobtrack_applications_${getTodayISO()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Exported applications to CSV!');
  }

  // Event Listeners
  $('statusTabs').addEventListener('click', e => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentStatus = btn.dataset.status;
    render();
  });

  $('searchInput').addEventListener('input', e => {
    searchQuery = e.target.value.trim();
    render();
  });

  $('portalFilter').addEventListener('change', e => {
    currentPortal = e.target.value;
    render();
  });

  $('sortFilter').addEventListener('change', e => {
    currentSort = e.target.value;
    render();
  });

  $('refreshBtn').addEventListener('click', () => {
    loadData(true);
    showToast('Refreshed application list');
  });

  $('saveSheetBtn').addEventListener('click', async () => {
    const raw = $('sheetInput').value.trim();
    const id = parseSheetId(raw);
    if (!id) {
      showToast('Please enter a valid Google Sheet URL or ID', '⚠️');
      return;
    }
    showToast('Connecting spreadsheet…');
    await chrome.runtime.sendMessage({ type: 'SAVE_SHEET_ID', spreadsheetId: id });
    loadData(true);
  });

  $('authBtn').addEventListener('click', async () => {
    showToast('Signing in with Google…');
    const r = await chrome.runtime.sendMessage({ type: 'CONNECT' });
    if (r && r.ok) {
      showToast('Connected to Google!', '✓');
      loadData(true);
    } else {
      showToast(`Login failed: ${r ? r.error : 'Unknown'}`, '✗');
    }
  });

  $('exportCsvBtn').addEventListener('click', exportCSV);

  // Modal actions
  const modal = $('addModal');
  const openModal = () => { modal.classList.add('open'); $('modalCompany').focus(); };
  const closeModal = () => { modal.classList.remove('open'); $('addAppForm').reset(); };

  $('openAddModalBtn').addEventListener('click', openModal);
  $('emptyAddBtn').addEventListener('click', openModal);
  $('closeModalBtn').addEventListener('click', closeModal);
  $('cancelModalBtn').addEventListener('click', closeModal);

  $('addAppForm').addEventListener('submit', async e => {
    e.preventDefault();
    const company = $('modalCompany').value.trim();
    const title = $('modalTitle').value.trim();
    const sourcePortal = $('modalPortal').value;
    const location = $('modalLocation').value.trim();
    const jobLink = $('modalLink').value.trim();
    const notes = $('modalNotes').value.trim();

    if (!company || !title) return;

    try {
      await chrome.runtime.sendMessage({
        type: 'MANUAL_LOG',
        record: {
          company,
          title,
          sourcePortal,
          location,
          jobLink,
          notes,
          appliedDate: getTodayISO()
        }
      });
      closeModal();
      showToast(`Added ${title} at ${company}!`);
      setTimeout(loadData, 500);
    } catch (err) {
      showToast('Failed to add application', '✗');
    }
  });

  // Initial load
  loadData();
})();

