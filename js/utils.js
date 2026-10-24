// 날짜·숫자·문자열 공통 유틸

export const pad = (n) => String(n).padStart(2, '0');

/** Date → 'YYYY-MM-DD' (로컬 시간 기준) */
export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** 'YYYY-MM-DD' → Date (로컬 자정) */
export const fromISO = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const addDays = (d, n) => {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  r.setDate(r.getDate() + n);
  return r;
};

export const today = () => {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
};

/** 해당 날짜가 속한 주의 월요일 */
export const startOfWeek = (d) => {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  r.setDate(r.getDate() - ((r.getDay() + 6) % 7));
  return r;
};

export const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

/**
 * 주차 라벨. 그 주의 목요일이 속한 달을 기준으로 'N월 M주'를 계산한다.
 * (월말·월초에 걸친 주가 어느 달에 속하는지 일관되게 결정)
 */
export const weekLabel = (monday) => {
  const thu = addDays(monday, 3);
  return {
    year: thu.getFullYear(),
    month: thu.getMonth() + 1,
    week: Math.floor((thu.getDate() - 1) / 7) + 1,
  };
};

export const won = (n) => Number(n || 0).toLocaleString('ko-KR');

export const parseAmount = (s) => {
  const n = parseInt(String(s ?? '').replace(/[^0-9]/g, ''), 10);
  return Number.isNaN(n) ? 0 : n;
};

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
