import crypto from 'node:crypto';
import { buildSeedState } from '../core/seed-build.js';
import { overdueOf } from '../core/engine-core.js';
const env = { now: () => Date.now(), hmac: (s) => crypto.createHmac('sha256', 'test').update(s).digest('hex'), bitrixLive: false };
const st = buildSeedState(env);
console.log('warnings', st.seedWarnings);
const now = Date.now();
for (const a of st.appeals) {
  const od = overdueOf(a, now);
  console.log(a.id, a.type, a.categoryId, a.status, 'asg=' + a.assigneeId, a.routing.fallback ? 'FB' : '', od ? 'OD:' + od.kind : '', (a.escalations || []).map((e) => e.level + '>' + e.toId).join(','), a.mergedInto || '', a.rating ? 'r' + a.rating.score : '');
}
console.log('notifs', st.notifications.length, 'outbox', st.outbox.length, 'files', Object.keys(st.files).length);
