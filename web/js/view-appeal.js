/* Карточка обращения: суть, итог, история, сроки, маршрут, действия */
(function () {
  'use strict';
  const MS = window.MS;
  const U = MS.ui; const h = U.h; const icon = U.icon;
  const api = MS.api;
  const ACT = () => MS.appealActs;
  const idLink = (id) => h('a', { class: 'id', href: '#/appeal/' + id }, id);

  function slaBar(label, due, doneAt, startAt, now) {
    if (!due) return null;
    const total = Math.max(1, due - startAt);
    const end = doneAt || now;
    const ratio = Math.max(0, Math.min(1, (end - startAt) / total));
    const late = end > due;
    const status = doneAt ? (late ? 'выполнено ' + U.fDT(doneAt) + ' — с опозданием' : 'выполнено ' + U.fDT(doneAt) + ' — в срок') : late ? 'просрочено на ' + U.span(now - due) : 'осталось ' + U.span(due - now);
    return h('div', { class: 'deadline' },
      h('div', { class: 'row between small' }, h('b', null, label), h('span', { class: late && !doneAt ? 'tx-red' : 'muted' }, 'до ' + U.fDT(due))),
      h('div', { class: 'bar' + (late ? ' bad' : !doneAt && ratio > 0.75 ? ' warn' : '') }, h('i', { style: { width: Math.round((doneAt ? 1 : ratio) * 100) + '%', background: doneAt && !late ? 'var(--green)' : null } })),
      h('div', { class: 'small ' + (late && !doneAt ? 'tx-red' : 'muted') }, status));
  }

  function stars(n) { return h('span', { class: 'tx-orange', 'aria-label': n + ' из 5' }, ''.repeat(n) + ''.repeat(5 - n)); }

  function evItem(e) {
    const b = MS.state.boot; const st = (k) => (b.statuses[k] ? b.statuses[k].label : k);
    const who = h('b', null, e.actorLabel || 'Система');
    let cls = '', what = '', body = e.text || '', extra = null;
    switch (e.kind) {
      case 'created': what = 'обращение зарегистрировано'; break;
      case 'assigned': what = (e.system ? 'назначен ответственный: ' : 'передано: ') + (e.assigneeLabel || ''); body = e.reason || ''; break;
      case 'status': cls = 'status';
        what = e.withdrawn ? 'обращение отозвано автором' : e.reopen ? 'возврат на рассмотрение' : 'статус: ' + (e.from ? st(e.from) + ' → ' : '') + st(e.to);
        if (e.dueDate) extra = h('div', { class: 'small muted', style: { marginTop: '4px' } }, 'Плановый срок: ' + U.fDate(e.dueDate));
        break;
      case 'comment': cls = 'comment'; what = e.internal ? 'внутренний комментарий' : e.byAuthor ? 'ответ автора' : 'комментарий'; break;
      case 'due': what = 'срок реализации: ' + (e.from ? U.fDate(e.from) + ' → ' : '') + U.fDate(e.to); break;
      case 'priority': what = 'приоритет: ' + MS.label('priorities', e.from) + ' → ' + MS.label('priorities', e.to); break;
      case 'nextAction': what = 'следующий шаг'; break;
      case 'publish': what = e.isPublic ? 'опубликовано в ленте коллег' : 'скрыто из ленты коллег'; body = ''; break;
      case 'duplicate': what = 'присоединено дублирующее обращение '; extra = idLink(e.sourceId); break;
      case 'merged': cls = 'status'; what = 'объединено с '; extra = idLink(e.targetId); break;
      case 'rated': what = 'оценка результата '; extra = stars(e.score || 0); break;
      case 'escalated': cls = 'esc'; what = 'эскалация (уровень ' + (e.level || 1) + ') → ' + (e.toLabel || '');
        body = 'Пропущен срок: ' + (U.SLA_LABEL[e.slaKind] || e.slaKind) + (e.due ? ' (до ' + U.fDT(e.due) + ')' : '') + (e.text ? '. ' + e.text : ''); break;
      default: what = e.kind;
    }
    if (e.internal) cls += ' internal';
    const inlineExtra = e.kind === 'duplicate' || e.kind === 'merged' || e.kind === 'rated';
    return h('li', { class: 'tl-item ' + cls },
      h('span', { class: 'tl-dot' }),
      h('div', { class: 'tl-meta' }, who, ' · ' + what, inlineExtra ? extra : null, ' · ' + U.fDT(e.at), e.internal ? h('span', { class: 'badge t-yellow', style: { marginLeft: '6px' } }, icon('lock', 12), 'видно только сотрудникам') : null),
      body ? h('div', { class: 'tl-body' }, body) : null,
      inlineExtra ? null : extra);
  }

  function outcome(a) {
    const evs = a.events || [];
    if (a.mergedInto) return h('div', { class: 'outcome closed' }, h('div', { class: 'h' }, icon('merge'), 'Объединено с ', idLink(a.mergedInto)), h('div', null, 'Этот вопрос решается в основном обращении — уведомления о его ходе придут и вам.'));
    if (a.status === 'clarify') {
      const q = evs.slice().reverse().find((e) => e.kind === 'status' && e.to === 'clarify');
      return h('div', { class: 'outcome clarify' }, h('div', { class: 'h' }, icon('message'), 'Нужно уточнение'), h('div', { class: 'text-block' }, q ? q.text : ''),
        a.mine ? h('div', { class: 'small', style: { marginTop: '6px' } }, 'Ответьте комментарием ниже — обращение автоматически вернётся на рассмотрение.') : h('div', { class: 'small muted', style: { marginTop: '6px' } }, 'Срок на паузе до ответа автора.'));
    }
    if (a.status === 'progress') return h('div', { class: 'outcome progress' }, h('div', { class: 'h' }, icon('zap'), 'Принято решение'), h('div', { class: 'text-block' }, a.decision), a.dueDate ? h('div', { class: 'small', style: { marginTop: '6px' } }, h('b', null, 'Плановый срок: '), U.fDate(a.dueDate) + ' (' + U.dueText(a.dueDate) + ')') : null);
    if (a.status === 'done') return h('div', { class: 'outcome done' }, h('div', { class: 'h' }, icon('check'), 'Реализовано'), a.decision ? h('div', { class: 'small muted' }, 'Решение: ' + a.decision) : null, h('div', { class: 'text-block', style: { marginTop: '4px' } }, a.result),
      a.rating ? h('div', { class: 'small', style: { marginTop: '8px' } }, 'Оценка автора: ', stars(a.rating.score), a.rating.text ? ' — «' + a.rating.text + '»' : '') : null);
    if (a.status === 'rejected') return h('div', { class: 'outcome rejected' }, h('div', { class: 'h' }, icon('x'), 'Отклонено'), h('div', { class: 'text-block' }, a.rejection),
      a.rating ? h('div', { class: 'small', style: { marginTop: '8px' } }, 'Оценка автора: ', stars(a.rating.score)) : null);
    if (a.status === 'closed') return h('div', { class: 'outcome closed' }, h('div', { class: 'h' }, icon('lock'), 'Закрыто'), h('div', { class: 'text-block' }, a.closingNote || '—'));
    return null;
  }

  function commentBox(a, reload) {
    const ac = a.actions || {};
    if (!ac.comment) return null;
    const ta = h('textarea', { class: 'input', rows: '3', maxlength: '3000', placeholder: a.mine && a.status === 'clarify' ? 'Ваш ответ на вопрос ответственного' : 'Написать комментарий', 'aria-label': 'Комментарий' });
    const internal = ac.internalComment ? h('input', { type: 'checkbox' }) : null;
    const btn = h('button', { class: 'btn primary', type: 'button', onclick: async () => {
      const text = ta.value.trim(); if (!text) { ta.focus(); return; }
      btn.disabled = true;
      try { const r = await ACT().post(a, 'comments', { text, internal: internal ? internal.checked : false }); MS.app.afterAction(r); U.toast(a.mine && a.status === 'clarify' ? 'Уточнение отправлено — обращение возвращено на рассмотрение' : 'Комментарий добавлен'); reload(); }
      catch (e) { U.toast(e.message, 'err'); btn.disabled = false; }
    } }, icon('send', 16), a.mine && a.status === 'clarify' ? 'Ответить' : 'Отправить');
    return h('div', { class: 'stack tight', style: { marginTop: '8px' } }, ta,
      h('div', { class: 'row' }, btn, internal ? h('label', { class: 'check small' }, internal, 'Внутренний (автор не увидит)') : null));
  }

  function staffActions(a, reload) {
    const ac = a.actions || {}; const b = MS.state.boot;
    const tr = ac.transitions || [];
    const fin = b.statuses[a.status] && b.statuses[a.status].final;
    const btns = tr.map((to) => {
      const m = b.transitionMeta[to] || { label: to };
      const label = fin && to === 'review' ? m.reopenLabel : m.label;
      return h('button', { type: 'button', class: 'btn' + (to === 'progress' || to === 'done' || (to === 'review' && a.status === 'new') ? ' primary' : '') + (to === 'rejected' ? ' danger' : ''), onclick: () => ACT().transition(a, to, reload) }, label);
    });
    const more = [
      ac.assign ? h('button', { type: 'button', class: 'btn', onclick: () => ACT().assign(a, reload) }, icon('users', 16), 'Передать другому') : null,
      ac.priority ? h('button', { type: 'button', class: 'btn', onclick: () => ACT().priority(a, reload) }, icon('flag', 16), 'Изменить приоритет') : null,
      ac.due ? h('button', { type: 'button', class: 'btn', onclick: () => ACT().due(a, reload) }, icon('calendar', 16), 'Перенести срок') : null,
      ac.nextAction ? h('button', { type: 'button', class: 'btn', onclick: () => ACT().nextAction(a, reload) }, icon('edit', 16), 'Следующий шаг') : null,
      ac.merge ? h('button', { type: 'button', class: 'btn', onclick: () => ACT().merge(a, reload) }, icon('merge', 16), 'Объединить с дублем') : null,
      ac.publish ? h('button', { type: 'button', class: 'btn', onclick: () => ACT().publish(a, reload) }, icon(a.isPublic ? 'eyeoff' : 'globe', 16), a.isPublic ? 'Скрыть из ленты' : 'Опубликовать в ленте') : null,
    ].filter(Boolean);
    if (!btns.length && !more.length) return null;
    return h('div', { class: 'card' }, h('h3', null, 'Действия'), btns.length ? h('div', { class: 'row', style: { marginBottom: more.length ? '12px' : 0 } }, btns) : null, more.length ? h('div', { class: 'row' }, more.map((x) => { x.classList.add('sm'); return x; })) : null);
  }

  function sidePanel(a, reload) {
    const now = MS.now(); const staff = a.level === 'staff'; const ac = a.actions || {};
    const cards = [];
    cards.push(h('div', { class: 'card' }, h('div', { class: 'section-label' }, 'Ответственный'),
      a.assignee ? h('div', { class: 'row nw' }, U.avatar(a.assignee.name), h('div', null, h('b', null, a.assignee.name), h('div', { class: 'small muted' }, a.assignee.position))) : h('div', { class: 'muted' }, '—'),
      staff && a.routing ? h('div', { style: { marginTop: '10px' } }, h('div', { class: 'section-label' }, 'Маршрут' + (a.routing.fallback ? ' · резерв' : '')), h('ol', { class: 'trace' }, (a.routing.trace || []).map((t) => h('li', null, t)))) : null,
      staff && a.nextAction ? h('div', { style: { marginTop: '10px' } }, h('div', { class: 'section-label' }, 'Следующий шаг'), h('div', { class: 'small' }, a.nextAction)) : null));
    const dl = [];
    if (staff) {
      dl.push(slaBar('Первый ответ', a.firstResponseDue, a.firstResponseAt, a.createdAt, now));
      dl.push(slaBar('Решение по обращению', a.decisionDue, a.decisionAt, a.createdAt, now));
      if (a.dueDate) dl.push(slaBar('Реализация', a.dueDate, a.status === 'done' ? a.updatedAt : null, a.decisionAt || a.createdAt, now));
    } else if (a.deadline) {
      dl.push(a.deadline.kind === 'paused' ? h('div', { class: 'small' }, 'Срок на паузе — ждём вашего уточнения') : h('div', { class: 'small' }, h('b', null, U.SLA_LABEL[a.deadline.kind] + ': '), 'до ' + U.fDT(a.deadline.due), h('div', { class: 'muted' }, U.dueText(a.deadline.due))));
    }
    if (dl.filter(Boolean).length) cards.push(h('div', { class: 'card stack' }, h('div', { class: 'section-label', style: { marginBottom: 0 } }, 'Сроки по регламенту'), dl));
    if (staff && a.escalations && a.escalations.length) cards.push(h('div', { class: 'card' }, h('div', { class: 'section-label' }, 'Эскалации'),
      h('div', { class: 'stack tight' }, a.escalations.map((e) => h('div', { class: 'small' }, h('span', { class: 'badge t-red' }, 'ур. ' + e.level), ' ' + e.toLabel, h('div', { class: 'muted' }, (U.SLA_LABEL[e.kind] || e.kind) + ' · ' + U.fDT(e.at)))))));
    const sup = (a.supporters || []).map((s) => (typeof s === 'string' ? ((MS.user(s) || {}).name || s) : s.name || s.label || ''));
    cards.push(h('div', { class: 'card' }, h('div', { class: 'section-label' }, 'Поддержка коллег'),
      h('div', { class: 'row' }, ac.support ? MS.parts.supportButton(a, () => reload()) : h('b', null, (a.supportersCount || 0) + ' ' + U.plural(a.supportersCount || 0, 'человек', 'человека', 'человек')), h('span', { class: 'small muted' }, a.isPublic ? 'В ленте коллег' : 'Не публикуется')),
      sup.length ? h('div', { class: 'small muted', style: { marginTop: '6px' } }, sup.join(', ')) : null));
    const links = [];
    (a.duplicates || []).forEach((id) => links.push(h('div', { class: 'small' }, 'Дубль: ', idLink(id))));
    (a.related || []).forEach((r) => links.push(h('div', { class: 'small' }, idLink(r.id), ' ' + r.title + ' · ', U.statusBadge(r.status))));
    if (links.length) cards.push(h('div', { class: 'card' }, h('div', { class: 'section-label' }, 'Связанные'), h('div', { class: 'stack tight' }, links)));
    if ((a.similar && a.similar.length) || a.similarHidden) cards.push(h('div', { class: 'card' }, h('div', { class: 'section-label' }, 'Похожие обращения'),
      (a.similar || []).map((s) => h('div', { class: 'sim-item' }, h('div', { class: 'grow' }, h('div', { class: 'row', style: { gap: '6px' } }, idLink(s.id), U.statusBadge(s.status)), h('div', { class: 'small', style: { marginTop: '2px' } }, s.title), h('div', { class: 'score' }, 'сходство ' + Math.round(s.score * 100) + '%')),
        ac.merge && !s.isFinal ? h('button', { type: 'button', class: 'btn sm', title: 'Объединить ' + a.id + ' с ' + s.id, onclick: () => ACT().merge(a, reload, s.id) }, icon('merge', 14), 'Слить') : null)),
      a.similarHidden ? h('div', { class: 'small muted', style: { marginTop: '6px' } }, 'Ещё непубличных: ' + a.similarHidden) : null));
    return h('div', { class: 'stack' }, cards);
  }

  function stageBar(a, evs) {
    const st = a.status;
    const firstAt = (pred) => { const e = evs.find(pred); return e ? e.at : null; };
    const reviewAt = firstAt((e) => e.kind === 'status' && e.to === 'review') || a.firstResponseAt;
    const decAt = firstAt((e) => e.kind === 'status' && (e.to === 'progress' || e.to === 'rejected'));
    const endAt = firstAt((e) => e.kind === 'status' && (e.to === 'done' || e.to === 'closed'));
    const lvl = { new: 0, review: 1, clarify: 1, progress: 2, rejected: 3, done: 3, closed: 3 }[st] ?? 0;
    const rejected = st === 'rejected';
    const steps = [
      ['Подано', a.createdAt],
      [st === 'clarify' ? 'Ждём уточнения' : 'Рассмотрение', reviewAt],
      [rejected ? 'Решение принято' : 'В работе', decAt],
      [rejected ? 'Отклонено' : st === 'closed' ? 'Закрыто' : 'Результат', endAt || (rejected ? decAt : null)],
    ];
    return h('div', { class: 'stagebar' + (rejected ? ' rej' : '') + (st === 'clarify' ? ' wait' : '') }, steps.map((x, i) => h('div', { class: 'sb-step' + (i < lvl || (i === lvl && lvl === 3) ? ' done' : i === lvl ? ' cur' : '') },
      h('div', { class: 'sb-dot' }, i < lvl || (i === lvl && lvl === 3) ? icon(rejected && i === 3 ? 'x' : 'check', 14) : String(i + 1)),
      h('div', { class: 'sb-txt' }, h('b', null, x[0]), h('span', null, x[1] && i <= lvl ? U.fShort(x[1]) : i === lvl + 1 && a.deadline && a.deadline.due ? 'до ' + U.fShort(a.deadline.due) : '')))));
  }
  MS.views.appeal = async function (el, params, alive) {
    const id = String(params.id || '').toUpperCase();
    let created = params.query.created === '1';
    async function load() {
      const r = await api.get('/appeals/' + encodeURIComponent(id));
      if (!alive()) return;
      MS.app.afterAction(r);
      render(r.appeal);
    }
    const reload = () => load().catch((e) => U.toast(e.message, 'err'));
    function render(a) {
      const ac = a.actions || {}; const staff = a.level === 'staff';
      const evs = (a.events || []).slice().sort((x, y) => x.at - y.at);
      U.mount(el,
        h('div', { class: 'row', style: { marginBottom: '10px' } }, h('button', { type: 'button', class: 'btn ghost sm', onclick: () => (history.length > 1 ? history.back() : MS.go('/')) }, icon('back', 16), 'Назад')),
        created ? h('div', { class: 'callout green', style: { marginBottom: '14px' } }, icon('check'), h('div', null, h('b', null, 'Обращение ' + a.id + ' зарегистрировано. '), 'Ответственный: ' + (a.assignee ? a.assignee.name + ', ' + a.assignee.position : '—') + '.' + (a.deadline && a.deadline.due ? ' Первый ответ — до ' + U.fDT(a.deadline.due) + '.' : '') + ' Об изменениях придёт уведомление.')) : null,
        h('div', { class: 'page-head rf-page-heading' }, h('div', { style: { minWidth: 0 } },
          h('div', { class: 'row', style: { marginBottom: '6px' } }, h('span', { class: 'id' }, a.id), U.typeBadge(a.type), U.statusBadge(a.status), U.prioBadge(a.priority), U.deadlineChip(a),
            a.anonymous ? h('span', { class: 'badge t-gray' }, icon('eyeoff', 12), 'анонимно') : null),
          h('h1', null, a.title),
          h('div', { class: 'sub' }, MS.catName(a.categoryId) + ' · ' + MS.groupName(a.groupId) + ' · автор: ' + a.authorLabel + (a.authorDepartmentId ? ' (' + MS.deptName(a.authorDepartmentId) + ')' : '') + ' · ' + U.fDT(a.createdAt)))),
        a.mergedInto ? null : stageBar(a, evs),
        h('div', { class: 'layout-side' },
          h('div', { class: 'stack' },
            outcome(a),
            h('div', { class: 'card' },
              h('div', { class: 'section-label' }, 'Описание'), h('div', { class: 'text-block' }, a.description),
              a.proposedSolution ? h('div', { style: { marginTop: '14px' } }, h('div', { class: 'section-label' }, a.type === 'idea' ? 'Как реализовать' : 'Предлагаемое решение'), h('div', { class: 'text-block' }, a.proposedSolution)) : null,
              a.attachments && a.attachments.length ? h('div', { style: { marginTop: '14px' } }, h('div', { class: 'section-label' }, 'Вложения'),
                h('div', { class: 'files' }, a.attachments.map((f) => h('button', { type: 'button', class: 'file-chip', style: { cursor: 'pointer' }, onclick: () => api.openFile(f).catch((e) => U.toast(e.message, 'err')) }, icon('clip', 14), f.name, h('span', { class: 'muted' }, U.size(f.size)))))) : null),
            staff ? staffActions(a, reload) : null,
            ac.rate ? ACT().rateBox(a, reload) : null,
            ac.withdraw ? h('div', null, h('button', { type: 'button', class: 'btn ghost sm', onclick: () => ACT().withdraw(a, reload) }, icon('x', 16), 'Отозвать обращение')) : null,
            h('div', { class: 'card' }, h('h3', null, 'История рассмотрения'),
              evs.length ? h('ol', { class: 'timeline' }, evs.map(evItem)) : U.empty('Событий пока нет'),
              commentBox(a, reload))),
          sidePanel(a, reload)));
      created = false;
    }
    await load();
  };
})();
