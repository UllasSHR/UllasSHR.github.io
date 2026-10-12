import { calculateRisk, recordEvent, makeDemoState, acknowledgeAlert } from './model.js';
const $ = selector => document.querySelector(selector);
const key = 'honeyguard-demo-v1';
let state = makeDemoState();
try {
  const saved = JSON.parse(localStorage.getItem(key));
  if (saved?.version === 1 && Array.isArray(saved.documents) && saved.documents.length && saved.documents.every(d => typeof d.id === 'string' && typeof d.name === 'string' && ['Low','Medium','High'].includes(d.sensitivity)) && Array.isArray(saved.events) && saved.events.every(e => typeof e.id === 'string' && typeof e.documentName === 'string' && typeof e.timestamp === 'number' && ['LOW','MEDIUM','HIGH'].includes(e.severity) && Number.isFinite(e.score) && e.score >= 0 && e.score <= 100) && Array.isArray(saved.alerts) && saved.alerts.every(a => typeof a.id === 'string' && saved.events.some(e => e.id === a.eventId) && ['Open','Acknowledged'].includes(a.status))) state = saved;
} catch { /* A fresh demo works even when browser storage is unavailable. */ }
const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
const badge = severity => `<span class="badge ${severity.toLowerCase()}">${escape(severity)}</span>`;
const time = timestamp => new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const fullTime = timestamp => new Date(timestamp).toLocaleString();
let toastTimer;
function toast(message) { clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').hidden = false; toastTimer = setTimeout(() => $('#toast').hidden = true, 4200); }
function save() { try { localStorage.setItem(key, JSON.stringify(state)); } catch { toast('Your demo works for this visit. Browser storage is unavailable.'); } }
function docRow(doc, inventory = false) {
  const count = state.events.filter(e => e.documentId === doc.id).length;
  return `<tr><td><span class="document-name"><span class="file-icon">${escape(doc.type)}</span>${escape(doc.name)}</span></td>${inventory ? `<td class="ip">${escape(doc.type)}</td>` : ''}<td>${badge(doc.sensitivity.toUpperCase())}</td><td class="${inventory ? '' : 'hide-small'}">${count}</td><td><button class="table-action" data-simulate="${escape(doc.id)}" aria-label="Simulate activity on ${escape(doc.name)}">Simulate <span aria-hidden="true">↗</span></button></td></tr>`;
}
function renderActivity() {
  const query = $('#activity-search').value.toLowerCase().trim();
  const severity = $('#severity-filter').value;
  const filtered = state.events.filter(e => (severity === 'all' || e.severity === severity) && `${e.documentName} ${e.activity} ${e.ip} ${e.severity}`.toLowerCase().includes(query));
  $('#activity-table').innerHTML = filtered.slice(0,20).map(e => `<tr><td class="document-name">${escape(e.documentName)}</td><td>${escape(e.activity)}</td><td class="ip">${escape(e.ip)}${e.unknownIp ? ' *' : ''}</td><td><div class="score-cell"><b>${e.score}</b><span class="mini-track" aria-hidden="true"><span style="width:${e.score}%"></span></span></div></td><td>${badge(e.severity)}</td><td class="time" title="${escape(fullTime(e.timestamp))}">${escape(time(e.timestamp))}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">No events match your filters.</td></tr>';
  $('#event-count').textContent = `Showing ${Math.min(20,filtered.length)} of ${filtered.length} matching events`;
}
function renderAlerts() {
  const status = $('#alert-filter').value;
  const alerts = state.alerts.filter(a => status === 'all' || a.status === status);
  $('#alert-summary').textContent = `${state.alerts.filter(a => a.status === 'Open').length} open · ${state.alerts.filter(a => a.status === 'Acknowledged').length} acknowledged`;
  $('[data-action="ack-all"]').disabled = !state.alerts.some(a => a.status === 'Open');
  $('#alerts-list').innerHTML = alerts.map(a => {
    const e = state.events.find(e => e.id === a.eventId);
    return `<article class="alert-card ${e.severity.toLowerCase()} ${a.status === 'Acknowledged' ? 'acknowledged' : ''}"><div class="alert-score">${e.score}<small>RISK / 100</small></div><div class="alert-body"><h3>${escape(e.activity)} on ${escape(e.documentName)}</h3><div class="alert-meta">${badge(e.severity)}<span>${escape(fullTime(e.timestamp))}</span><span class="ip">${escape(e.ip)}</span><span>${escape(e.device)}</span></div></div>${a.status === 'Open' ? `<button class="button secondary small" data-ack="${escape(a.id)}">Acknowledge</button>` : '<span class="mini-label">ACKNOWLEDGED ✓</span>'}</article>`;
  }).join('') || '<div class="panel empty">No alerts in this view. Medium and high risk events appear here.</div>';
}
function render() {
  const open = state.alerts.filter(a => a.status === 'Open').length;
  $('#metric-docs').textContent = state.documents.length;
  $('#nav-docs').textContent = state.documents.length;
  $('#nav-alerts').textContent = open;
  $('#metric-events').textContent = state.events.length;
  $('#metric-alerts').textContent = open;
  const highOpen = state.alerts.filter(a => a.status === 'Open' && state.events.find(e => e.id === a.eventId)?.severity === 'HIGH').length;
  $('#metric-alert-sub').textContent = highOpen ? `${highOpen} high severity · awaiting review` : open ? 'Awaiting review' : 'All alerts reviewed';
  $('#metric-risk').textContent = state.events.length ? Math.round(state.events.reduce((sum,e) => sum + e.score,0) / state.events.length) : 0;
  $('#overview-documents').innerHTML = state.documents.slice(0,5).map(d => docRow(d)).join('');
  $('#all-documents').innerHTML = state.documents.map(d => docRow(d,true)).join('');
  $('#inventory-count').textContent = `${state.documents.length} ASSETS`;
  $('#distribution').innerHTML = [['HIGH','70–100'],['MEDIUM','40–69'],['LOW','0–39']].map(([level,range]) => {
    const count = state.events.filter(e => e.severity === level).length;
    const proportion = state.events.length ? count / state.events.length * 100 : 0;
    return `<div class="distribution-row"><div class="distribution-label"><span>${level[0]+level.slice(1).toLowerCase()} <small>(${range})</small></span><strong>${count} ${count === 1 ? 'event' : 'events'}</strong></div><div class="track" role="img" aria-label="${level}: ${count} events, ${Math.round(proportion)} percent"><div class="fill ${level.toLowerCase()}" style="width:${proportion}%"></div></div></div>`;
  }).join('');
  renderActivity(); renderAlerts();
}
function navigate() {
  const views = ['overview','documents','alerts','project'];
  const view = views.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'overview';
  document.querySelectorAll('.view').forEach(s => s.hidden = s.id !== view);
  document.querySelectorAll('[data-view]').forEach(a => { const active = a.dataset.view === view; a.classList.toggle('active',active); active ? a.setAttribute('aria-current','page') : a.removeAttribute('aria-current'); });
  $('#breadcrumb').textContent = ({overview:'Overview',documents:'Honey documents',alerts:'Alert center',project:'About the project'})[view];
  document.title = `${$('#breadcrumb').textContent} | HoneyGuard`;
}
function updatePreview() {
  const doc = state.documents.find(d => d.id === $('#sim-document').value);
  if (!doc) return;
  const data = new FormData($('#simulate-form'));
  const {score,severity} = calculateRisk(doc.sensitivity,data.get('activity'),$('#unknown-ip').checked,$('#unknown-device').checked);
  $('#preview-score').textContent = score;
  $('#preview-severity').textContent = severity;
  $('#preview-severity').className = `badge ${severity.toLowerCase()}`;
  $('#preview-explanation').textContent = severity === 'LOW' ? 'Event logged. No alert at this score.' : `${severity === 'HIGH' ? 'High' : 'Medium'} severity alert will be generated.`;
}
function openSimulation(id) {
  $('#simulate-form').reset();
  $('#sim-document').innerHTML = state.documents.map(d => `<option value="${escape(d.id)}">${escape(d.name)} · ${escape(d.sensitivity)}</option>`).join('');
  if (id) $('#sim-document').value = id;
  updatePreview(); $('#simulate-dialog').showModal();
}
document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.hasAttribute('data-close')) { button.closest('dialog').close(); return; }
  if (button.dataset.simulate) { openSimulation(button.dataset.simulate); return; }
  if (button.dataset.ack) { acknowledgeAlert(state,button.dataset.ack); save(); render(); toast('Alert acknowledged. The event remains in the activity log.'); return; }
  const action = button.dataset.action;
  if (action === 'simulate') openSimulation();
  if (action === 'add') { $('#add-form').reset(); $('#add-dialog').showModal(); }
  if (action === 'ack-all') { state.alerts.forEach(a => a.status = 'Acknowledged'); save(); render(); toast('All alerts acknowledged.'); }
  if (action === 'reset' && confirm('Reset this browser demo? Your added documents and simulated events will be replaced with the original sample data.')) { state = makeDemoState(); save(); render(); toast('Demo reset to the original sample data.'); }
  if (action === 'export') {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), environment: 'simulated-browser-demo', ...state },null,2)], {type:'application/json'});
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download='HoneyGuard-Demo-Log.json'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url),1000); toast('Demo log exported.');
  }
});
$('#simulate-form').addEventListener('change',updatePreview);
$('#simulate-form').addEventListener('submit', event => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const e = recordEvent(state,data.get('document'),data.get('activity'),$('#unknown-ip').checked,$('#unknown-device').checked);
  save(); render(); $('#simulate-dialog').close();
  toast(`${e.activity} recorded · risk ${e.score}/100 · ${e.severity}${e.severity !== 'LOW' ? ' alert generated' : ' severity'}`);
});
$('#add-form').addEventListener('submit',event => {
  event.preventDefault(); const data = new FormData(event.currentTarget); const name = String(data.get('name')).trim();
  if (!name) return;
  if (state.documents.some(d => d.name.toLowerCase() === name.toLowerCase())) { toast('A document with this name already exists.'); return; }
  const extension = name.includes('.') ? name.split('.').pop().slice(0,5).toUpperCase() : 'FILE';
  state.documents.push({id:`doc-${Date.now()}-${state.documents.length}`,name,type:extension,sensitivity:data.get('sensitivity'),createdAt:Date.now()});
  save(); render(); $('#add-dialog').close(); toast('Honey document added. Try simulating an interaction.');
});
$('#activity-search').addEventListener('input',renderActivity);
$('#severity-filter').addEventListener('change',renderActivity);
$('#alert-filter').addEventListener('change',renderAlerts);
window.addEventListener('hashchange',() => { navigate(); window.scrollTo({top:0,behavior:'instant'}); });
render(); navigate();
