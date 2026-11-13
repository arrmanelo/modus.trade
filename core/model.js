// Модус Сигнал — справочники, статусная модель и работа со сроками.

export const APP_NAME = 'Модус Сигнал';
export const APP_VERSION = '1.0.0-mvp';

export const TYPES = {
  problem: { label: 'Проблема', hint: 'Что-то мешает работе или приводит к потерям времени', icon: 'alert' },
  idea: { label: 'Предложение', hint: 'Идея, как улучшить процесс, инструмент или условия', icon: 'bulb' },
  praise: { label: 'Положительный отзыв', hint: 'Что работает хорошо и стоит сохранить', icon: 'heart' },
};

export const PRIORITIES = {
  high: { label: 'Высокий', rank: 3, impact: 'Блокирует работу или влияет на клиента' },
  medium: { label: 'Средний', rank: 2, impact: 'Заметно замедляет работу' },
  low: { label: 'Низкий', rank: 1, impact: 'Улучшение без срочности' },
};

export const STATUSES = {
  new: { label: 'Новое', tone: 'blue', final: false, order: 1 },
  review: { label: 'На рассмотрении', tone: 'purple', final: false, order: 2 },
  clarify: { label: 'Ожидает уточнения', tone: 'orange', final: false, order: 3 },
  progress: { label: 'В работе', tone: 'yellow', final: false, order: 4 },
  done: { label: 'Реализовано', tone: 'green', final: true, order: 5 },
  rejected: { label: 'Отклонено', tone: 'red', final: true, order: 6 },
  closed: { label: 'Закрыто', tone: 'gray', final: true, order: 7 },
};

// Допустимые переходы между статусами
export const TRANSITIONS = {
  new: ['review', 'clarify', 'progress', 'rejected', 'closed'],
  review: ['clarify', 'progress', 'rejected', 'closed'],
  clarify: ['review', 'rejected', 'closed'],
  progress: ['done', 'clarify', 'rejected'],
  done: ['review'],
  rejected: ['review'],
  closed: ['review'],
};

// Что нужно заполнить при переходе
export const TRANSITION_META = {
  review: { label: 'Взять в рассмотрение', text: 'optional', textLabel: 'Комментарий автору (необязательно)', reopenLabel: 'Вернуть на рассмотрение' },
  clarify: { label: 'Запросить уточнение', text: 'required', textLabel: 'Вопрос автору' },
  progress: { label: 'Принять в работу', text: 'required', textLabel: 'Решение и план действий', due: true },
  done: { label: 'Отметить реализованным', text: 'required', textLabel: 'Что сделано (результат)' },
  rejected: { label: 'Отклонить', text: 'required', textLabel: 'Мотивированная причина отказа' },
  closed: { label: 'Закрыть', text: 'required', textLabel: 'Итоговый комментарий' },
};

export const REJECT_TEMPLATES = [
  'Сейчас нет ресурсов на реализацию; вернёмся к вопросу при планировании следующего квартала.',
  'Предложение дублирует уже действующий процесс — прикладываем ссылку на него.',
  'Реализация противоречит требованиям безопасности или договорным обязательствам.',
];

export const ROLES = {
  employee: { label: 'Сотрудник', about: 'Подаёт обращения, следит за статусом, поддерживает идеи коллег' },
  handler: { label: 'Ответственный', about: 'Рассматривает назначенные обращения, фиксирует решение и результат' },
  manager: { label: 'Руководитель', about: 'Контролирует обращения подразделения, переназначает, получает эскалации, видит аналитику' },
  admin: { label: 'Администратор', about: 'Настраивает категории, маршрутизацию и сроки, распределяет обращения без ответственного' },
};

// Сроки в рабочих днях: first — первый ответ, decision — решение по обращению
export const DEFAULT_SLA = {
  high: { first: 1, decision: 5 },
  medium: { first: 2, decision: 10 },
  low: { first: 3, decision: 15 },
};

export const SLA_KINDS = {
  first: 'первый ответ',
  decision: 'решение по обращению',
  implementation: 'срок реализации',
};

export const HOUR = 3600 * 1000;
export const DAY = 24 * HOUR;

export function addBusinessDays(ts, days) {
  const d = new Date(ts);
  let left = Math.max(0, Math.round(days));
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const w = d.getDay();
    if (w !== 0 && w !== 6) left--;
  }
  return d.getTime();
}

export function subBusinessDays(ts, days) {
  const d = new Date(ts);
  let left = Math.max(0, Math.round(days));
  while (left > 0) {
    d.setDate(d.getDate() - 1);
    const w = d.getDay();
    if (w !== 0 && w !== 6) left--;
  }
  return d.getTime();
}

let uidCounter = 0;
export function makeId(prefix) {
  uidCounter = (uidCounter + 1) % 1e6;
  // Непредсказуемый идентификатор (128 бит из криптостойкого генератора)
  const c = globalThis.crypto;
  if (c && c.getRandomValues) { const b = new Uint8Array(16); c.getRandomValues(b); return prefix + '_' + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(''); }
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10) + uidCounter.toString(36);
}

export function deepClone(x) {
  return x === undefined ? undefined : JSON.parse(JSON.stringify(x));
}
