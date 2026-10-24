// 데이터 저장소 (localStorage)
// 나중에 Firebase 등 클라우드 동기화를 붙일 때 이 파일만 교체/확장하면 되도록 분리했다.

import { uid } from './utils.js';

const KEY = 'allowance-book-v1';

export const CATEGORIES = [
  { id: 'snack', name: '간식', icon: '🍭' },
  { id: 'stationery', name: '문구', icon: '✏️' },
  { id: 'hobby', name: '취미', icon: '🎵' },
  { id: 'gift', name: '선물', icon: '🎁' },
  { id: 'saving', name: '저축', icon: '🐷' },
  { id: 'etc', name: '기타', icon: '❓' },
];

export const catById = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1];

/*
 * 데이터 구조
 * {
 *   version: 1,
 *   settings: { childName, initialBalance },
 *   entries: [{ id, date:'YYYY-MM-DD', type:'in'|'out', amount, what, where, category, createdAt }],
 *   weeks: { 'YYYY-MM-DD(월요일)': { plans:[{id,text,done}], good, bad } }
 * }
 */
const defaults = () => ({
  version: 1,
  settings: { childName: '', initialBalance: 0 },
  entries: [],
  weeks: {},
});

const normalize = (d) => {
  const base = defaults();
  return {
    version: 1,
    settings: { ...base.settings, ...(d?.settings || {}) },
    entries: Array.isArray(d?.entries)
      ? d.entries
          .filter((e) => e && typeof e.date === 'string')
          .map((e) => ({
            id: e.id || uid(),
            date: e.date,
            type: e.type === 'in' ? 'in' : 'out',
            amount: Math.max(0, Number(e.amount) || 0),
            what: e.what || '',
            where: e.where || '',
            category: e.category || 'etc',
            createdAt: e.createdAt || Date.now(),
          }))
      : [],
    weeks: d?.weeks && typeof d.weeks === 'object' ? d.weeks : {},
  };
};

const load = () => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalize(JSON.parse(raw)) : defaults();
  } catch (err) {
    console.error('데이터를 불러오지 못했습니다', err);
    return defaults();
  }
};

let state = load();
const listeners = new Set();

const persist = () => localStorage.setItem(KEY, JSON.stringify(state));
const save = () => {
  persist();
  listeners.forEach((fn) => fn());
};

export const subscribe = (fn) => listeners.add(fn);
export const getState = () => state;

/* ---------- 설정 ---------- */
export const updateSettings = (patch, { silent = false } = {}) => {
  state.settings = { ...state.settings, ...patch };
  silent ? persist() : save();
};

/* ---------- 기록 ---------- */
export const upsertEntry = (entry) => {
  if (entry.id) {
    const i = state.entries.findIndex((e) => e.id === entry.id);
    if (i >= 0) state.entries[i] = { ...state.entries[i], ...entry };
  } else {
    state.entries.push({ ...entry, id: uid(), createdAt: Date.now() });
  }
  save();
};

export const deleteEntry = (id) => {
  state.entries = state.entries.filter((e) => e.id !== id);
  save();
};

export const signed = (e) => (e.type === 'in' ? e.amount : -e.amount);

/** 특정 날짜 이전까지의 잔액 (시작 잔액 포함) */
export const balanceBefore = (dateISO) => {
  let b = Number(state.settings.initialBalance) || 0;
  for (const e of state.entries) if (e.date < dateISO) b += signed(e);
  return b;
};

/** 기간 내 기록 (날짜 → 입력 순 정렬) */
export const entriesBetween = (fromISO, toISO) =>
  state.entries
    .filter((e) => e.date >= fromISO && e.date <= toISO)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt));

/* ---------- 주간 메모 / 계획 ---------- */
export const getWeek = (weekId) => ({ plans: [], good: '', bad: '', ...(state.weeks[weekId] || {}) });

/** silent=true 이면 화면을 다시 그리지 않고 저장만 한다 (메모 입력 중 포커스 유지용) */
export const updateWeek = (weekId, patch, { silent = false } = {}) => {
  state.weeks[weekId] = { ...getWeek(weekId), ...patch };
  silent ? persist() : save();
};

export const addPlan = (weekId, text) => {
  const w = getWeek(weekId);
  updateWeek(weekId, { plans: [...w.plans, { id: uid(), text, done: false }] });
};

export const togglePlan = (weekId, planId) => {
  const w = getWeek(weekId);
  updateWeek(weekId, { plans: w.plans.map((p) => (p.id === planId ? { ...p, done: !p.done } : p)) });
};

export const deletePlan = (weekId, planId) => {
  const w = getWeek(weekId);
  updateWeek(weekId, { plans: w.plans.filter((p) => p.id !== planId) });
};

/* ---------- 백업 ---------- */
export const exportData = () => JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2);

export const importData = (text) => {
  const d = JSON.parse(text);
  if (!d || !Array.isArray(d.entries)) throw new Error('올바른 백업 파일이 아닙니다.');
  state = normalize(d);
  save();
};

export const resetAll = () => {
  state = defaults();
  save();
};
