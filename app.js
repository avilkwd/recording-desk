'use strict';

// Recording Desk: entirely client-side; browser localStorage is the data store.
const STORAGE_KEY = 'recording-desk-v1';
const VERSION = 1;
const TEMPLATES = Object.freeze({
  purchase: ['DEED', 'MORTGAGE'],
  refinance: ['MORTGAGE']
});
const CHECKLIST = Object.freeze([
  { key: 'documentDate', label: 'Document date' },
  { key: 'reviewRecordableDocs', label: 'Review recordable docs' },
  { key: 'addressCert', label: 'Address cert' },
  { key: 'exhibitA', label: 'Exhibit A' },
  { key: 'sentForRecording', label: 'Sent for recording' }
]);
const qs = selector => document.querySelector(selector);
const uid = () => (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
  ? crypto.randomUUID()
  : `rd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const escapeHtml = text => String(text).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));
const blankChecks = () => Object.fromEntries(CHECKLIST.map(check => [check.key, false]));
const makeDocument = (name, checks = {}) => ({
  id: uid(), name, notes: '', checks: { ...blankChecks(), ...checks }
});
const makeFile = (number, type) => ({
  id: uid(), number, type, createdAt: new Date().toISOString(),
  documents: TEMPLATES[type].map(name => makeDocument(name))
});
// Some checklist columns do not apply to every document type.
// Whole-word matching also recognizes names such as 'Warranty Deed' or 'Mortgage Rider'.
const isApplicable = (doc, key) => {
  const name = doc.name.trim().toUpperCase();
  if (key === 'documentDate') return /\bDEED\b/.test(name);
  if (key === 'addressCert') return /\b(DEED|MORTGAGE)\b/.test(name);
  return true;
};
const applicableChecks = doc => CHECKLIST.filter(check => isApplicable(doc, check.key));
const resolved = status => status === true || status === 'na';
// One click completes, two clicks selects N/A, three clicks clears.
const nextStatus = status => status === true ? 'na' : status === 'na' ? false : true;
const statusName = status => status === true ? 'Checked' : status === 'na' ? 'N/A' : 'Not checked';
const statusClass = status => status === true ? 'checked' : status === 'na' ? 'na' : 'empty';
const docComplete = doc => applicableChecks(doc).every(check => resolved(doc.checks[check.key]));
const docReady = doc => applicableChecks(doc).filter(check => check.key !== 'sentForRecording')
  .every(check => resolved(doc.checks[check.key])) && doc.checks.sentForRecording === false;
const fileComplete = file => file.documents.length > 0 && file.documents.every(docComplete);
const fileCheckCounts = file => ({
  checked: file.documents.reduce((total, doc) => total + applicableChecks(doc)
    .filter(check => resolved(doc.checks[check.key])).length, 0),
  available: file.documents.reduce((total, doc) => total + applicableChecks(doc).length, 0)
});

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: VERSION, files: [] };
    return validateBackup(JSON.parse(raw));
  } catch (error) {
    console.error('Could not load saved data:', error);
    setTimeout(() => toast('Could not load saved data. The existing backup has not been overwritten.'), 0);
    return { version: VERSION, files: [], loadError: true };
  }
}

// Validate imported data and avoid injecting untrusted file content into the UI.
function validateBackup(value) {
  if (!value || typeof value !== 'object' || value.version !== VERSION || !Array.isArray(value.files)
    || value.files.length > 2000) throw new Error('Not a valid Recording Desk v1 backup.');
  const seen = new Set();
  const files = value.files.map(file => {
    if (!file || !['purchase', 'refinance'].includes(file.type)
      || typeof file.number !== 'string' || !file.number.trim() || file.number.length > 60
      || !Array.isArray(file.documents) || file.documents.length > 300)
      throw new Error('A file in the backup has invalid data.');
    const number = file.number.trim();
    if (seen.has(number.toLowerCase())) throw new Error(`Duplicate file number: ${number}`);
    seen.add(number.toLowerCase());
    return {
      id: uid(), number, type: file.type,
      createdAt: typeof file.createdAt === 'string' ? file.createdAt.slice(0, 40) : new Date().toISOString(),
      documents: file.documents.map(doc => {
        if (!doc || typeof doc.name !== 'string' || !doc.name.trim() || doc.name.length > 100
          || !doc.checks || typeof doc.checks !== 'object') throw new Error('Invalid document in backup.');
        return { ...makeDocument(doc.name.trim(), Object.fromEntries(CHECKLIST.map(check => [
          check.key, doc.checks[check.key] === true ? true : doc.checks[check.key] === 'na' ? 'na' : false
        ]))), notes: typeof doc.notes === 'string' ? doc.notes.slice(0, 5000) : '' };
      })
    };
  });
  return { version: VERSION, files };
}

let state = loadData();
let activeFileId = null;
let searchTerm = '';
let selectedFilter = 'all';
let notesTarget = null;
let toastTimer;

function persist() {
  if (state.loadError) return false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, files: state.files }));
    const indicator = qs('.save-indicator');
    indicator.dataset.error = 'false';
    qs('#save-status').textContent = 'Saved in this browser';
    return true;
  } catch (error) {
    console.error('Save error:', error);
    qs('.save-indicator').dataset.error = 'true';
    qs('#save-status').textContent = 'Could not save';
    toast('Could not save in this browser. Export your data to avoid losing changes.');
    return false;
  }
}
function toast(message) {
  const element = qs('#toast');
  if (!element) return;
  clearTimeout(toastTimer);
  element.textContent = message;
  element.classList.add('show');
  toastTimer = setTimeout(() => element.classList.remove('show'), 3200);
}

function renderMetrics() {
  const documents = state.files.flatMap(file => file.documents);
  qs('#files-count').textContent = String(state.files.filter(file => !fileComplete(file)).length);
  qs('#documents-count').textContent = String(documents.length);
  qs('#complete-count').textContent = String(documents.filter(docComplete).length);
  qs('#ready-count').textContent = String(documents.filter(docReady).length);
}
function matchesFilter(file) {
  if (selectedFilter === 'purchase' || selectedFilter === 'refinance') {
    if (file.type !== selectedFilter) return false;
  } else if (selectedFilter === 'needs-attention' && fileComplete(file)) return false;
  else if (selectedFilter === 'complete' && !fileComplete(file)) return false;
  if (searchTerm) {
    const needle = searchTerm.toLowerCase();
    return file.number.toLowerCase().includes(needle)
      || file.documents.some(doc => doc.name.toLowerCase().includes(needle));
  }
  return true;
}
function fileMarkup(file) {
  const { checked, available } = fileCheckCounts(file);
  const completeDocs = file.documents.filter(docComplete).length;
  const percent = available ? Math.round(checked / available * 100) : 0;
  const rows = file.documents.map(doc => `
    <tr data-doc-id="${escapeHtml(doc.id)}" class="${docComplete(doc) ? 'document-complete' : ''}">
      <td><span class="document-label">${escapeHtml(doc.name)}</span></td>
      ${CHECKLIST.map(check => {
        if (!isApplicable(doc, check.key)) return `<td class="check-cell not-required"><span aria-label="Not required" title="Not required for this document">—</span></td>`;
        const status = doc.checks[check.key];
        return `<td class="check-cell"><button class="document-check status-${statusClass(status)}" type="button"
          data-checkbox="${check.key}" data-file-id="${escapeHtml(file.id)}" data-doc-id="${escapeHtml(doc.id)}"
          data-check-label="${escapeHtml(check.label)}" data-document-name="${escapeHtml(doc.name)}"
          aria-pressed="${status === true ? 'true' : status === 'na' ? 'mixed' : 'false'}"
          aria-label="File ${escapeHtml(file.number)} — ${escapeHtml(doc.name)} — ${escapeHtml(check.label)}: ${statusName(status)}"
          title="Click to cycle: checked → N/A → clear">${status === true ? '✓' : status === 'na' ? 'N/A' : ''}</button></td>`;
      }).join('')}
      <td><div class="doc-actions"><button type="button" class="text-action notes-action" data-action="edit-notes" data-file-id="${escapeHtml(file.id)}" data-doc-id="${escapeHtml(doc.id)}">${doc.notes ? "Notes ●" : "+ Notes"}</button><button type="button" class="text-action remove-document" data-action="remove-document"
        data-file-id="${escapeHtml(file.id)}" data-doc-id="${escapeHtml(doc.id)}"
        aria-label="Remove ${escapeHtml(doc.name)} from file ${escapeHtml(file.number)}">Remove</button></div></td>
    </tr>`).join('');
  return `<article class="file-card" data-file-card="${escapeHtml(file.id)}">
    <div class="file-heading"><div class="file-main">
      <div class="file-title-line"><span class="file-number">#${escapeHtml(file.number)}</span>
        <span class="type-tag">${file.type === 'purchase' ? 'PURCHASE' : 'REFINANCE'}</span></div>
      <div class="progress-summary" data-file-summary="${escapeHtml(file.id)}">${completeDocs} of ${file.documents.length} documents complete · ${checked}/${available} resolved</div>
    </div><div class="file-actions">
      <button type="button" class="button button-outline add-doc-button" data-action="add-document" data-file-id="${escapeHtml(file.id)}">＋ Add document</button>
      <button type="button" class="text-action" data-action="remove-file" data-file-id="${escapeHtml(file.id)}">Delete file</button>
    </div></div>
    <div class="file-progress-track" role="progressbar" aria-label="File ${escapeHtml(file.number)} completion" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}">
      <div class="file-progress-fill" style="width:${percent}%"></div></div>
    <div class="table-scroll"><table class="documents-table"><thead><tr>
      <th scope="col">Document type</th>
      ${CHECKLIST.map(check => `<th scope="col">${escapeHtml(check.label)}</th>`).join('')}
      <th scope="col"><span class="sr-only">Document actions</span></th>
    </tr></thead><tbody>${rows || '<tr><td colspan="7" style="text-align:left;padding:20px 24px;color:#777">No documents yet. Select Add document to begin.</td></tr>'}</tbody></table></div>
  </article>`;
}
function render() {
  renderMetrics();
  const matching = state.files.filter(matchesFilter);
  const incomplete = matching.filter(file => !fileComplete(file));
  const complete = matching.filter(fileComplete);
  qs('#visible-count').textContent = '(' + incomplete.length + ')';
  qs('#completed-count').textContent = '(' + complete.length + ')';
  qs('#incomplete-section').hidden = selectedFilter === 'complete';
  qs('#completed-section').hidden = selectedFilter === 'needs-attention';
  qs('#file-list').innerHTML = incomplete.length ? incomplete.map(fileMarkup).join('') :
    state.files.length ? '<div class="empty-state"><h3>No incomplete files</h3><p>Completed files appear in the section below.</p></div>' :
    '<div class="empty-state"><h3>Start with your first file</h3><p>Add a file number and transaction type.</p><button type="button" class="button button-primary" data-action="new-file">＋ New file</button><button type="button" class="button button-outline" data-action="load-examples">View spreadsheet examples</button></div>';
  qs('#completed-file-list').innerHTML = complete.length ? complete.map(fileMarkup).join('') :
    '<div class="completed-empty">Completed files will appear here automatically.</div>';
}

function updateFileProgress(file) {
  const card = [...document.querySelectorAll('[data-file-card]')].find(el => el.dataset.fileCard === file.id);
  if (!card) return;
  const { checked, available } = fileCheckCounts(file);
  const completeDocs = file.documents.filter(docComplete).length;
  const summary = card.querySelector('[data-file-summary]');
  summary.textContent = `${completeDocs} of ${file.documents.length} documents complete · ${checked}/${available} resolved`;
  const percent = available ? Math.round(checked / available * 100) : 0;
  card.querySelector('.file-progress-fill').style.width = `${percent}%`;
  card.querySelector('[role="progressbar"]').setAttribute('aria-valuenow', String(percent));
}

function openDialog(dialog) { dialog.showModal(); }
function closeDialog(button) { button.closest('dialog')?.close(); }
function showNewFile() {
  qs('#new-file-form').reset();
  qs('#new-file-error').hidden = true;
  updateTemplatePreview();
  openDialog(qs('#new-file-dialog'));
  qs('#new-file-number').focus();
}
function updateTemplatePreview() {
  const selected = qs('#transaction-type').value;
  qs('#template-documents').innerHTML = TEMPLATES[selected]
    .map(name => `<span class="document-tag">${escapeHtml(name)}</span>`).join('');
}
function showDocumentNotes(fileId, docId) {
  const file = state.files.find(item => item.id === fileId);
  const doc = file?.documents.find(item => item.id === docId);
  if (!doc) return;
  notesTarget = { fileId, docId };
  qs('#notes-context').textContent = 'File #' + file.number + ' · ' + doc.name;
  qs('#document-notes').value = doc.notes || '';
  openDialog(qs('#notes-dialog'));
  qs('#document-notes').focus();
}
qs('#notes-form').addEventListener('submit', event => {
  event.preventDefault();
  const doc = state.files.find(file => file.id === notesTarget?.fileId)?.documents.find(item => item.id === notesTarget.docId);
  if (!doc) return;
  doc.notes = qs('#document-notes').value.slice(0, 5000);
  persist();
  qs('#notes-dialog').close();
  render();
  toast('Notes saved.');
});
function showAddDocument(fileId) {
  const file = state.files.find(item => item.id === fileId);
  if (!file) return;
  activeFileId = file.id;
  qs('#add-document-form').reset();
  qs('#add-document-context').textContent = `Adding a custom document to file #${file.number}. Checklist items will appear where they apply.`;
  openDialog(qs('#add-document-dialog'));
  qs('#new-document-name').focus();
}

qs('#new-file-button').addEventListener('click', showNewFile);
qs('#transaction-type').addEventListener('change', updateTemplatePreview);
qs('#data-button').addEventListener('click', () => openDialog(qs('#data-dialog')));
document.querySelectorAll('[data-close-dialog]').forEach(btn => {
  btn.addEventListener('click', () => closeDialog(btn));
});
document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => {
  if (event.target === dialog) dialog.close();
}));

qs('#new-file-form').addEventListener('submit', event => {
  event.preventDefault();
  const number = qs('#new-file-number').value.trim();
  const type = qs('#transaction-type').value;
  const error = qs('#new-file-error');
  if (!number || number.length > 60 || !(type in TEMPLATES)) return;
  if (state.files.some(file => file.number.toLowerCase() === number.toLowerCase())) {
    error.textContent = `File #${number} already exists.`;
    error.hidden = false;
    return;
  }
  state.files.unshift(makeFile(number, type));
  qs('#new-file-dialog').close();
  persist();
  searchTerm = '';
  selectedFilter = 'all';
  qs('#file-search').value = '';
  qs('#file-filter').value = 'all';
  render();
  toast(`File #${number} created with ${TEMPLATES[type].length} documents.`);
});
qs('#add-document-form').addEventListener('submit', event => {
  event.preventDefault();
  const file = state.files.find(item => item.id === activeFileId);
  const name = qs('#new-document-name').value.trim();
  if (!file || !name || name.length > 100) return;
  file.documents.push(makeDocument(name));
  qs('#add-document-dialog').close();
  persist();
  render();
  toast(`${name} added to file #${file.number}.`);
});
qs('#file-search').addEventListener('input', event => { searchTerm = event.target.value.trim(); render(); });
qs('#file-filter').addEventListener('change', event => { selectedFilter = event.target.value; render(); });
let filterRenderTimer;
document.querySelectorAll('#file-list, #completed-file-list').forEach(container => container.addEventListener('click', event => {
  const button = event.target.closest('button[data-checkbox]');
  if (!button) return;
  const file = state.files.find(item => item.id === button.dataset.fileId);
  const doc = file?.documents.find(item => item.id === button.dataset.docId);
  const key = button.dataset.checkbox;
  if (!file || !doc || !CHECKLIST.some(check => check.key === key) || !isApplicable(doc, key)) return;
  const status = nextStatus(doc.checks[key]);
  doc.checks[key] = status;
  button.className = `document-check status-${statusClass(status)}`;
  button.textContent = status === true ? '✓' : status === 'na' ? 'N/A' : '';
  button.setAttribute('aria-pressed', status === true ? 'true' : status === 'na' ? 'mixed' : 'false');
  button.setAttribute('aria-label', `File ${file.number} — ${doc.name} — ${button.dataset.checkLabel}: ${statusName(status)}`);
  persist();
  button.closest('tr').classList.toggle('document-complete', docComplete(doc));
  updateFileProgress(file);
  renderMetrics();
  // Defer rerender to allow cycling through N/A before a completed file moves.
  clearTimeout(filterRenderTimer);
  filterRenderTimer = setTimeout(render, 800);
}));
document.querySelectorAll('#file-list, #completed-file-list').forEach(container => container.addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  if (action === 'new-file') return showNewFile();
  if (action === 'load-examples') return loadExamples();
  if (action === 'add-document') return showAddDocument(button.dataset.fileId);
  if (action === 'edit-notes') return showDocumentNotes(button.dataset.fileId, button.dataset.docId);
  if (action === 'clear-filters') {
    searchTerm = '';
    selectedFilter = 'all';
    qs('#file-search').value = '';
    qs('#file-filter').value = 'all';
    return render();
  }
  const file = state.files.find(item => item.id === button.dataset.fileId);
  if (!file) return;
  if (action === 'remove-file') {
    if (!window.confirm(`Permanently delete file #${file.number} and all its documents?`)) return;
    state.files = state.files.filter(item => item.id !== file.id);
    persist(); render(); toast(`File #${file.number} deleted.`);
  }
  if (action === 'remove-document') {
    const doc = file.documents.find(item => item.id === button.dataset.docId);
    if (!doc || !window.confirm(`Remove ${doc.name} from file #${file.number}?`)) return;
    file.documents = file.documents.filter(item => item.id !== doc.id);
    persist(); render(); toast(`${doc.name} removed.`);
  }
}));

function loadExamples() {
  if (state.files.length) return;
  const purchase1139 = makeFile('1139', 'purchase');
  const completedReview = { reviewRecordableDocs: true, addressCert: true, exhibitA: true };
  purchase1139.documents[0].checks = { ...blankChecks(), ...completedReview, documentDate: true };
  purchase1139.documents[1].checks = { ...blankChecks(), reviewRecordableDocs: true, exhibitA: true };
  state.files = [purchase1139, makeFile('1146', 'refinance'), makeFile('1140', 'purchase')];
  persist(); render(); toast('Loaded three sample files from the spreadsheet.');
}
function download(filename, mime, text) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
function dayStamp() { return new Date().toISOString().slice(0, 10); }
qs('#download-json').addEventListener('click', () => {
  download(`recording-desk-backup-${dayStamp()}.json`, 'application/json;charset=utf-8',
    JSON.stringify({ version: VERSION, files: state.files, exportedAt: new Date().toISOString() }, null, 2));
  toast('Backup downloaded.');
});
function csvCell(value) {
  let text = String(value);
  // Prevent spreadsheet applications from evaluating user-entered names as formulas.
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
qs('#download-csv').addEventListener('click', () => {
  const columns = ['File number', 'Transaction type', 'Document type', ...CHECKLIST.map(check => check.label), 'Notes'];
  const rows = [columns];
  state.files.forEach(file => file.documents.forEach(doc => {
    rows.push([file.number, file.type.toUpperCase(), doc.name,
      ...CHECKLIST.map(check => !isApplicable(doc, check.key) ? ''
        : doc.checks[check.key] === true ? 'Yes' : doc.checks[check.key] === 'na' ? 'N/A' : 'No'), doc.notes || '']);
  }));
  download(`recording-desk-${dayStamp()}.csv`, 'text/csv;charset=utf-8',
    '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n'));
  toast('Spreadsheet exported.');
});
qs('#import-json').addEventListener('change', async event => {
  const input = event.target;
  const file = input.files?.[0];
  if (!file) return;
  try {
    if (file.size > 5_000_000) throw new Error('Backup is too large (5 MB limit).');
    const incoming = validateBackup(JSON.parse(await file.text()));
    if (!window.confirm(`Replace the current ${state.files.length} files with ${incoming.files.length} files from this backup? This cannot be undone.`)) return;
    const previous = state;
    state = incoming;
    if (!persist()) { state = previous; throw new Error('Import could not be saved. Check browser storage permissions.'); }
    searchTerm = ''; selectedFilter = 'all';
    qs('#file-search').value = ''; qs('#file-filter').value = 'all';
    qs('#data-dialog').close(); render(); toast(`${state.files.length} files imported successfully.`);
  } catch (error) { window.alert(`Import failed: ${error.message}`); }
  finally { input.value = ''; }
});

render();