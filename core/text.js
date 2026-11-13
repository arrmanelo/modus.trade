// Модус Сигнал — обработка русского текста без внешних зависимостей.
// Токенизация, упрощённый стемминг, TF-IDF и косинусная близость.
// Используется для поиска похожих обращений, подсказки категории и выявления повторяющихся проблем.

const RU_STOP = new Set((
  'и в во не что он на я с со как а то все всё она так его но да ты к у же вы за бы по только ее её мне было вот от меня еще ещё нет о из ему теперь когда даже ну ли если уже или ни быть был него до вас нибудь опять уж вам ведь там потом себя ничего ей может они тут где есть надо ней для мы тебя их чем была сам чтоб без будто чего раз тоже себе под будет ж тогда кто этот того потому этого какой совсем ним здесь этом один почти мой тем чтобы нее сейчас были куда зачем всех никогда можно при наконец два об другой хоть после над больше тот через эти нас про всего них какая много разве три эту моя впрочем хорошо свою этой перед иногда лучше чуть том нельзя такой им более всегда конечно всю между это также которые который которая которых которой котором ' +
  'предлагаю предлагается нужно нужен нужна нужны хотелось хотел хотела полезно полезен полезна было бы стоит очень часто приходится бывает каждый каждая каждого просто своих свой свои своей тех этих такие такая таких данный данные ' +
  'сотрудник сотрудники сотрудников сотрудникам компании компания коллег коллегам коллеги спасибо хочу пожалуйста'
).split(/\s+/).filter(Boolean));

const RU_ENDINGS = [
  'иями', 'ями', 'ами', 'ией', 'иях', 'ием', 'ого', 'его', 'ому', 'ему', 'ыми', 'ими', 'ость', 'ости', 'ение', 'ения', 'ении', 'ением',
  'ание', 'ания', 'ании', 'анием', 'ться', 'тся', 'ешь', 'ишь', 'ешься', 'ая', 'яя', 'ое', 'ее', 'ые', 'ие', 'ый', 'ий', 'ой', 'ей',
  'ам', 'ям', 'ах', 'ях', 'ом', 'ем', 'ов', 'ев', 'ию', 'ия', 'ии', 'ью', 'ть', 'ет', 'ют', 'ит', 'ат', 'ят', 'им', 'ым', 'ую', 'юю',
  'а', 'я', 'о', 'е', 'ы', 'и', 'у', 'ю', 'ь', 'й'
].sort((a, b) => b.length - a.length);

export function stemRu(word) {
  let w = word.replace(/ё/g, 'е');
  if (w.length <= 4) return w;
  for (const e of RU_ENDINGS) {
    if (w.endsWith(e) && w.length - e.length >= 4) { w = w.slice(0, -e.length); break; }
  }
  return w.length > 7 ? w.slice(0, 7) : w;
}

export function tokenizeRu(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .split(/[^a-zа-я0-9]+/)
    .filter((t) => t.length > 2 && !RU_STOP.has(t) && !/^\d+$/.test(t));
}

function termsOf(text, surface) {
  const tf = new Map();
  for (const tok of tokenizeRu(text)) {
    const s = stemRu(tok);
    tf.set(s, (tf.get(s) || 0) + 1);
    if (surface) {
      const m = surface.get(s) || new Map();
      m.set(tok, (m.get(tok) || 0) + 1);
      surface.set(s, m);
    }
  }
  return tf;
}

function weigh(tf, idf, fallbackIdf) {
  const vec = new Map();
  let norm = 0;
  for (const [t, n] of tf) {
    const w = (1 + Math.log(n)) * (idf.has(t) ? idf.get(t) : fallbackIdf);
    vec.set(t, w);
    norm += w * w;
  }
  return { vec, norm: Math.sqrt(norm) || 1 };
}

// docs: [{ id, text }]
export function buildTextIndex(docs) {
  const surface = new Map();
  const tfs = docs.map((d) => ({ id: d.id, tf: termsOf(d.text, surface) }));
  const df = new Map();
  for (const { tf } of tfs) for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1);
  const N = docs.length || 1;
  const idf = new Map();
  for (const [t, n] of df) idf.set(t, Math.log((N + 1) / (n + 1)) + 1);
  const fallbackIdf = Math.log(N + 1) + 1;
  const vectors = new Map();
  for (const { id, tf } of tfs) vectors.set(id, weigh(tf, idf, fallbackIdf));
  return { idf, fallbackIdf, vectors, surface, df, N };
}

export function vectorizeText(index, text) {
  return weigh(termsOf(text), index.idf, index.fallbackIdf);
}

export function cosineSim(a, b) {
  let dot = 0;
  const [small, big] = a.vec.size < b.vec.size ? [a, b] : [b, a];
  for (const [t, w] of small.vec) { const o = big.vec.get(t); if (o) dot += w * o; }
  return dot / (a.norm * b.norm);
}

// Возвращает [{ id, score }] по убыванию близости
export function findSimilar(index, text, { limit = 5, threshold = 0.12, exclude = [] } = {}) {
  const q = vectorizeText(index, text);
  if (!q.vec.size) return [];
  const out = [];
  for (const [id, v] of index.vectors) {
    if (exclude.includes(id)) continue;
    const s = cosineSim(q, v);
    if (s >= threshold) out.push({ id, score: s });
  }
  return out.sort((x, y) => y.score - x.score).slice(0, limit);
}

// Кластеры похожих документов: компоненты связности графа близости
export function clusterTexts(index, ids, threshold = 0.2) {
  const parent = new Map(ids.map((id) => [id, id]));
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const edges = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const s = cosineSim(index.vectors.get(ids[i]), index.vectors.get(ids[j]));
      if (s >= threshold) { edges.push([ids[i], ids[j], s]); parent.set(find(ids[i]), find(ids[j])); }
    }
  }
  const groups = new Map();
  for (const id of ids) { const r = find(id); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(id); }
  return [...groups.values()].filter((g) => g.length > 1).map((members) => ({
    members,
    strength: edges.filter((e) => members.includes(e[0])).reduce((m, e) => Math.max(m, e[2]), 0),
  }));
}

// Наиболее характерные слова группы документов (в читаемой форме)
export function topTermsOf(index, ids, n = 3) {
  const acc = new Map();
  for (const id of ids) {
    const v = index.vectors.get(id);
    if (!v) continue;
    for (const [t, w] of v.vec) acc.set(t, (acc.get(t) || 0) + w / v.norm);
  }
  // термин должен встречаться хотя бы в двух документах группы
  const inDocs = (t) => ids.filter((id) => index.vectors.get(id)?.vec.has(t)).length;
  return [...acc.entries()]
    .filter(([t]) => ids.length < 2 || inDocs(t) >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([t]) => {
      const m = index.surface.get(t);
      if (!m) return t;
      return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0][0];
    });
}
