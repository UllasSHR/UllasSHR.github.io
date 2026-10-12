export const weights = { sensitivity: { Low: 0, Medium: 15, High: 30 }, activity: { Access: 10, Download: 30, Copy: 50 } };
export function calculateRisk(sensitivity, activity, unknownIp = false, unknownDevice = false) {
  if (!(sensitivity in weights.sensitivity) || !(activity in weights.activity)) throw new Error('Invalid event');
  const score = Math.min(100, weights.sensitivity[sensitivity] + weights.activity[activity] + (unknownIp ? 10 : 0) + (unknownDevice ? 10 : 0));
  return { score, severity: score >= 70 ? 'HIGH' : score >= 40 ? 'MEDIUM' : 'LOW' };
}
export function recordEvent(state, documentId, activity, unknownIp, unknownDevice, timestamp = Date.now()) {
  const doc = state.documents.find(d => d.id === documentId);
  if (!doc) throw new Error('Document not found');
  const risk = calculateRisk(doc.sensitivity, activity, unknownIp, unknownDevice);
  const event = { id: `ev-${timestamp}-${state.events.length}`, documentId, documentName: doc.name, activity, unknownIp, unknownDevice, ip: unknownIp ? '203.0.113.42' : '192.168.1.10', device: unknownDevice ? 'Unrecognized device' : 'Demo workstation', timestamp, ...risk };
  state.events.unshift(event);
  if (risk.severity !== 'LOW') state.alerts.unshift({ id: `alert-${event.id}`, eventId: event.id, status: 'Open' });
  return event;
}
export function makeDemoState(now = Date.now()) {
  const state = { version: 1, documents: [
    { id: 'doc-1', name: 'Employee_Payroll.xlsx', type: 'XLSX', sensitivity: 'High', createdAt: now },
    { id: 'doc-2', name: 'Database_Credentials.txt', type: 'TXT', sensitivity: 'High', createdAt: now },
    { id: 'doc-3', name: 'Project_Roadmap.pdf', type: 'PDF', sensitivity: 'Medium', createdAt: now },
    { id: 'doc-4', name: 'Internal_Policies.docx', type: 'DOCX', sensitivity: 'Low', createdAt: now },
    { id: 'doc-5', name: 'Client_Contacts.csv', type: 'CSV', sensitivity: 'Medium', createdAt: now }
  ], events: [], alerts: [] };
  const scenarios = [ ['doc-4','Access',false,false], ['doc-3','Download',false,false], ['doc-1','Access',false,false], ['doc-2','Copy',true,true], ['doc-5','Access',false,true], ['doc-1','Copy',false,false], ['doc-4','Download',false,false], ['doc-3','Download',true,false] ];
  scenarios.forEach((s, i) => recordEvent(state, ...s, now - (scenarios.length - i) * 7 * 60000));
  state.alerts[state.alerts.length - 1].status = 'Acknowledged';
  return state;
}
export function acknowledgeAlert(state, id) {
  const alert = state.alerts.find(a => a.id === id);
  if (alert) alert.status = 'Acknowledged';
  return Boolean(alert);
}
