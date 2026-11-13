// Модус Сигнал — сборка демонстрационного состояния: обращения из датасета (A-001…A-020)
// и дополнительные (A-021…A-040) проигрываются по единой временной шкале через те же функции,
// что и в живой системе. Поэтому история, сроки, эскалации и уведомления в демо — настоящие.
import { HOUR, DAY, subBusinessDays } from './model.js';
import { STATE_VERSION, createEmptyState, getUser, findAppeal, runSlaCheck } from './engine-core.js';
import { b64OfText, createAppeal, changeStatus, addComment, reassignAppeal, setNextAction, rateAppeal, mergeAppeals } from './engine-actions.js';
import { SEED_APPEALS_1 } from './seed-appeals1.js';
import { SEED_APPEALS_2, SEED_MERGES } from './seed-appeals2.js';

export const SEED_SPECS = SEED_APPEALS_1.concat(SEED_APPEALS_2);

export function seedCreatedAt(spec, now) {
  const c = spec.created || {};
  if (c.h) return now - c.h * HOUR;
  const base = c.bd ? subBusinessDays(now, c.bd) : now - (c.d || 0) * DAY;
  const d = new Date(base);
  d.setHours(9 + (spec.n % 8), (spec.n * 7) % 60, 0, 0);
  let t = d.getTime();
  if (t > now - HOUR) t -= DAY;
  return t;
}

function seedApplyAbsence(state, at, now) {
  for (const u of state.users) {
    if (!u.seedAbsentFromDaysAgo) continue;
    u.absentFrom = now - u.seedAbsentFromDaysAgo * DAY;
    u.absentUntil = now + (u.seedAbsentUntilDays || 7) * DAY;
    u.absent = at >= u.absentFrom;
  }
}

export function buildSeedState(env) {
  const now = env.now();
  const state = createEmptyState(now);
  const ctx = { state, env, now };
  const warnings = [];
  const timeline = [];
  let order = 0;
  const clamp = (t) => Math.min(t, now - 60 * 1000);

  for (const spec of SEED_SPECS) {
    const createdAt = seedCreatedAt(spec, now);
    const id = 'A-' + String(spec.n).padStart(3, '0');
    timeline.push({ at: createdAt, order: order++, label: id + ' create', run: (at) => {
      const author = getUser(state, spec.author);
      const files = (spec.files || []).map((f) => ({ name: f.name, type: 'text/plain', data: b64OfText(f.text) }));
      const a = createAppeal(ctx, author, {
        type: spec.type, categoryId: spec.cat, title: spec.title, description: spec.text, proposedSolution: spec.solution || '',
        priority: spec.prio, anonymous: !!spec.anonymous, isPublic: spec.isPublic, nextAction: spec.next || '', files,
      }, at, { seq: spec.n, source: spec.n <= 20 ? 'dataset' : 'extra' });
      a.supporters = (spec.supporters || []).filter((x) => x !== spec.author && getUser(state, x));
    } });
    (spec.flow || []).forEach((step, i) => {
      const at = clamp(createdAt + step[1] * HOUR) + i;
      timeline.push({ at, order: order++, label: id + ' ' + step[0], run: (t) => {
        const a = findAppeal(state, id);
        const assignee = () => getUser(state, a.assigneeId);
        const by = (who) => (who === 'assignee' ? assignee() : who === 'author' ? getUser(state, spec.author) : getUser(state, who));
        if (step[0] === 'status') {
          const payload = { to: step[2], text: step[3] || '' };
          if (step[4] !== undefined && step[4] !== null) payload.dueDate = now + step[4] * DAY;
          changeStatus(ctx, assignee(), a, payload, t, { seed: true });
        } else if (step[0] === 'comment') {
          addComment(ctx, by(step[2]), a, { text: step[3], internal: !!step[4] }, t);
        } else if (step[0] === 'assign') {
          reassignAppeal(ctx, by(step[2]), a, { assigneeId: step[3], reason: step[4] }, t, { seed: true });
        } else if (step[0] === 'rate') {
          rateAppeal(ctx, getUser(state, spec.author), a, { score: step[2], text: step[3] || '' }, t);
        } else if (step[0] === 'next') {
          setNextAction(ctx, assignee(), a, { text: step[2] }, t);
        }
      } });
    });
  }

  for (const m of SEED_MERGES) {
    const spec = SEED_SPECS.find((s) => 'A-' + String(s.n).padStart(3, '0') === m[0]);
    const at = clamp(seedCreatedAt(spec, now) + m[3] * HOUR);
    timeline.push({ at, order: order++, label: m[0] + ' merge', run: (t) => {
      mergeAppeals(ctx, getUser(state, m[2]), findAppeal(state, m[0]), findAppeal(state, m[1]), t);
    } });
  }

  const first = Math.min(...timeline.map((x) => x.at));
  for (let t = first + 6 * HOUR; t < now; t += 6 * HOUR) {
    timeline.push({ at: t, order: order++, label: 'sla', run: (tt) => { runSlaCheck(ctx, tt); } });
  }

  timeline.sort((x, y) => x.at - y.at || x.order - y.order);
  for (const step of timeline) {
    ctx.now = step.at;
    seedApplyAbsence(state, step.at, now);
    try { step.run(step.at); } catch (e) { warnings.push(step.label + ': ' + e.message); }
  }

  ctx.now = now;
  seedApplyAbsence(state, now, now);
  runSlaCheck(ctx, now);
  for (const n of state.notifications) if (n.at < now - 2 * DAY) n.read = true;
  state.appeals.sort((x, y) => x.seq - y.seq);
  state.seq = Math.max(state.seq, SEED_SPECS.length);
  state.version = STATE_VERSION;
  state.seededAt = now;
  state.seedWarnings = warnings;
  return state;
}
