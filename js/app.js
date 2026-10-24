import {
  toISO, fromISO, addDays, today, startOfWeek, weekLabel, DAY_NAMES,
  won, parseAmount, esc,
} from './utils.js';
import {
  CATEGORIES, catById, subscribe, getState, updateSettings,
  upsertEntry, deleteEntry, signed, balanceBefore, entriesBetween,
  getWeek, updateWeek, addPlan, togglePlan, deletePlan,
  exportData, importData, resetAll,
} from './store.js';

const APP_VERSION = '1.0.0';
const MIN_ROWS = 7; // 종이 양식처럼 빈 줄을 채워 보여줄 최소 줄 수

const view = document.getElementById('view');
const dialog = document.getElementById('entryDialog');
const toastEl = document.getElementById('toast');

const TABS = ['week', 'stats', 'settings'];
const ui = {
  tab: TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'week',
  week: startOfWeek(today()),
  month: new Date(today().getFullYear(), today().getMonth(), 1),
};

/* ============================================================
 * 공통
 * ============================================================ */
let toastTimer;
const toast = (msg) => {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2000);
};

const updateTitle = () => {
  const name = getState().settings.childName.trim();
  const title = name ? `${name}의 용돈 기입장` : '용돈 기입장';
  document.getElementById('appTitle').textContent = title;
  document.title = title;
};

const render = () => {
  updateTitle();
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === ui.tab));
  if (ui.tab === 'week') renderWeek();
  else if (ui.tab === 'stats') renderStats();
  else renderSettings();
};

subscribe(render);

document.querySelector('.tabbar').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-tab]');
  if (!btn) return;
  ui.tab = btn.dataset.tab;
  history.replaceState(null, '', ui.tab === 'week' ? location.pathname : `#${ui.tab}`);
  render();
  window.scrollTo(0, 0);
});

/* ============================================================
 * 주간 기입장
 * ============================================================ */
function computeWeek(monday) {
  const weekId = toISO(monday);
  const endId = toISO(addDays(monday, 6));
  const carry = balanceBefore(weekId);
  const list = entriesBetween(weekId, endId);
  let run = carry;
  let totalIn = 0;
  let totalOut = 0;
  const catSums = Object.fromEntries(CATEGORIES.map((c) => [c.id, 0]));
  const rows = list.map((e) => {
    run += signed(e);
    if (e.type === 'in') totalIn += e.amount;
    else {
      totalOut += e.amount;
      catSums[e.category] = (catSums[e.category] || 0) + e.amount;
    }
    return { e, balance: run };
  });
  return { weekId, endId, carry, rows, totalIn, totalOut, end: run, catSums };
}

function renderWeek() {
  const monday = ui.week;
  const sunday = addDays(monday, 6);
  const { month, week } = weekLabel(monday);
  const w = computeWeek(monday);
  const memo = getWeek(w.weekId);
  const isThisWeek = w.weekId === toISO(startOfWeek(today()));
  const fmtMD = (d) => `${d.getMonth() + 1}.${d.getDate()}`;

  const rowsHtml = w.rows.map(({ e, balance }) => {
    const d = fromISO(e.date);
    const cat = e.type === 'out' ? catById(e.category) : null;
    return `
      <tr class="entry-row" data-id="${e.id}">
        <td class="c-date">${d.getMonth() + 1}/${d.getDate()}</td>
        <td class="c-day ${d.getDay() === 0 ? 'sun' : d.getDay() === 6 ? 'sat' : ''}">${DAY_NAMES[d.getDay()]}</td>
        <td class="c-what">${cat ? `<span class="cat-dot">${cat.icon}</span>` : ''}${esc(e.what) || '<span class="muted">-</span>'}</td>
        <td class="c-where">${esc(e.where)}</td>
        <td class="c-num in">${e.type === 'in' ? won(e.amount) : ''}</td>
        <td class="c-num out">${e.type === 'out' ? won(e.amount) : ''}</td>
        <td class="c-num bal ${balance < 0 ? 'neg' : ''}">${won(balance)}</td>
      </tr>`;
  }).join('');

  const emptyCount = Math.max(1, MIN_ROWS - w.rows.length);
  const emptyHtml = Array.from({ length: emptyCount }, (_, i) => `
      <tr class="empty-row" data-act="add">
        <td class="c-date"></td><td class="c-day"></td>
        <td class="c-what">${i === 0 ? '<span class="add-hint">+ 기록 추가</span>' : ''}</td>
        <td class="c-where"></td><td class="c-num"></td><td class="c-num"></td><td class="c-num"></td>
      </tr>`).join('');

  const maxCat = Math.max(...Object.values(w.catSums));
  const catHtml = CATEGORIES.map((c) => {
    const v = w.catSums[c.id] || 0;
    return `
      <div class="cat-cell ${v > 0 && v === maxCat ? 'top' : ''}">
        <div class="cat-amount">${v ? won(v) + '원' : ''}</div>
        <div class="cat-label"><span>${c.icon}</span>${c.name}</div>
      </div>`;
  }).join('');

  const plansHtml = memo.plans.map((p) => `
      <li class="plan ${p.done ? 'done' : ''}">
        <button type="button" class="check" data-act="toggle-plan" data-id="${p.id}" aria-label="완료 표시">${p.done ? '✓' : ''}</button>
        <span class="plan-text">${esc(p.text)}</span>
        <button type="button" class="plan-del" data-act="del-plan" data-id="${p.id}" aria-label="삭제">✕</button>
      </li>`).join('');

  view.innerHTML = `
    <section class="sheet">
      <div class="week-head">
        <button type="button" class="nav-btn" data-act="prev-week" aria-label="지난 주">‹</button>
        <div class="badges">
          <span class="circle">${month}</span><span class="unit">월</span>
          <span class="circle">${week}</span><span class="unit">주</span>
        </div>
        <button type="button" class="nav-btn" data-act="next-week" aria-label="다음 주">›</button>
      </div>
      <div class="range">
        ${fmtMD(monday)}(월) ~ ${fmtMD(sunday)}(일)
        ${isThisWeek ? '<span class="this-week">이번 주</span>' : '<button type="button" class="link" data-act="this-week">이번 주로 가기</button>'}
      </div>

      <div class="pill">
        <span class="coin">🪙</span>
        <span>지난 주 남은 돈 :</span>
        <strong class="${w.carry < 0 ? 'neg' : ''}">${won(w.carry)}</strong><span>원</span>
      </div>

      <div class="block">
        <div class="block-title"><span class="box-check">✓</span>이번 주 계획</div>
        <ul class="plans">${plansHtml}</ul>
        <form class="plan-add" data-form="plan">
          <input name="plan" maxlength="60" placeholder="예: 간식은 일주일에 3천원만!" autocomplete="off">
          <button type="submit">추가</button>
        </form>
      </div>

      <div class="ledger">
        <table>
          <colgroup>
            <col style="width:11%"><col style="width:7%"><col style="width:22%"><col style="width:14%">
            <col style="width:15%"><col style="width:15%"><col style="width:16%">
          </colgroup>
          <thead>
            <tr>
              <th class="dash">날짜</th><th>요일</th><th class="dash">무엇을?</th><th>어디?</th>
              <th>들어온 돈</th><th>나간 돈</th><th>남은 돈</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}${emptyHtml}</tbody>
        </table>
        <div class="total-bar">
          <div class="totals">
            <span class="t-label">합계</span>
            <span class="sign plus">+</span><span class="t-in">${won(w.totalIn)}</span>
            <span class="sign minus">−</span><span class="t-out">${won(w.totalOut)}</span>
          </div>
          <div class="remain">
            <span class="coin">🪙</span>이번 주 남은 돈
            <strong class="${w.end < 0 ? 'neg' : ''}">${won(w.end)}</strong>원
          </div>
        </div>
      </div>

      <button type="button" class="add-btn" data-act="add">+ 기록하기</button>

      <div class="bottom-grid">
        <div class="box">
          <div class="box-title"><span class="ring">₩</span>어디에 용돈을 많이 썼나요?</div>
          <div class="cat-grid">${catHtml}</div>
        </div>
        <div class="box review">
          <div class="box-title"><span class="ring">🙂</span>좋았던 점</div>
          <textarea data-field="good" rows="3" placeholder="이번 주에 잘한 점을 적어보세요">${esc(memo.good)}</textarea>
          <div class="box-title"><span class="ring">😟</span>아쉬운 점</div>
          <textarea data-field="bad" rows="3" placeholder="다음 주에 고치고 싶은 점은?">${esc(memo.bad)}</textarea>
        </div>
      </div>
    </section>`;
}

/* ============================================================
 * 기록 입력/수정 (바텀 시트)
 * ============================================================ */
const QUICK_IN = ['용돈', '심부름', '칭찬 용돈', '세뱃돈'];

function openEntry(entry) {
  const t = today();
  const monday = ui.week;
  const inWeek = t >= monday && t <= addDays(monday, 6);
  const e = entry || {
    type: 'out', amount: 0, date: toISO(inWeek ? t : monday), what: '', where: '', category: 'snack',
  };

  dialog.innerHTML = `
    <form class="sheet-form" data-type="${e.type}" novalidate>
      <div class="sheet-head">
        <h2>${entry ? '기록 고치기' : '새 기록'}</h2>
        <button type="button" class="icon-btn" data-act="close" aria-label="닫기">✕</button>
      </div>

      <div class="seg">
        <button type="button" data-type="out" class="${e.type === 'out' ? 'on' : ''}">💸 나간 돈</button>
        <button type="button" data-type="in" class="${e.type === 'in' ? 'on' : ''}">💰 들어온 돈</button>
      </div>

      <label class="field">
        <span>금액</span>
        <div class="amount-wrap">
          <input name="amount" inputmode="numeric" autocomplete="off" placeholder="0" value="${e.amount ? won(e.amount) : ''}">
          <span>원</span>
        </div>
      </label>
      <div class="chips quick-amt">
        ${[500, 1000, 5000, 10000].map((v) => `<button type="button" data-add="${v}">+${won(v)}</button>`).join('')}
        <button type="button" data-add="0">지우기</button>
      </div>

      <label class="field">
        <span>날짜</span>
        <input type="date" name="date" value="${e.date}">
      </label>

      <label class="field">
        <span>무엇을?</span>
        <input name="what" maxlength="40" autocomplete="off" value="${esc(e.what)}" placeholder="${e.type === 'in' ? '예: 용돈' : '예: 떡볶이'}">
      </label>
      <div class="chips in-only">
        ${QUICK_IN.map((q) => `<button type="button" data-what="${q}">${q}</button>`).join('')}
      </div>

      <label class="field">
        <span>어디?</span>
        <input name="where" maxlength="40" autocomplete="off" value="${esc(e.where)}" placeholder="${e.type === 'in' ? '예: 엄마' : '예: 학교 앞 분식집'}">
      </label>

      <div class="field out-only">
        <span>어디에 썼나요?</span>
        <div class="cat-pick">
          ${CATEGORIES.map((c) => `
            <label class="cat-opt">
              <input type="radio" name="category" value="${c.id}" ${e.category === c.id ? 'checked' : ''}>
              <span><b>${c.icon}</b>${c.name}</span>
            </label>`).join('')}
        </div>
      </div>

      <div class="sheet-actions">
        ${entry ? '<button type="button" class="danger" data-act="delete">삭제</button>' : ''}
        <button type="submit" class="primary">저장</button>
      </div>
    </form>`;

  const form = dialog.querySelector('form');
  const amountInput = form.elements.amount;

  amountInput.addEventListener('input', () => {
    const n = parseAmount(amountInput.value);
    amountInput.value = n ? won(n) : '';
  });

  form.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.type) {
      form.dataset.type = b.dataset.type;
      form.querySelectorAll('.seg button').forEach((x) => x.classList.toggle('on', x === b));
      form.elements.what.placeholder = b.dataset.type === 'in' ? '예: 용돈' : '예: 떡볶이';
      form.elements.where.placeholder = b.dataset.type === 'in' ? '예: 엄마' : '예: 학교 앞 분식집';
    } else if (b.dataset.add !== undefined) {
      const add = Number(b.dataset.add);
      const n = add ? parseAmount(amountInput.value) + add : 0;
      amountInput.value = n ? won(n) : '';
    } else if (b.dataset.what) {
      form.elements.what.value = b.dataset.what;
    } else if (b.dataset.act === 'close') {
      dialog.close();
    } else if (b.dataset.act === 'delete') {
      if (confirm('이 기록을 삭제할까요?')) {
        deleteEntry(entry.id);
        dialog.close();
        toast('삭제했어요');
      }
    }
  });

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const amount = parseAmount(amountInput.value);
    const date = form.elements.date.value;
    if (!amount) { toast('금액을 입력해 주세요'); amountInput.focus(); return; }
    if (!date) { toast('날짜를 선택해 주세요'); return; }
    const type = form.dataset.type;
    upsertEntry({
      ...(entry ? { id: entry.id } : {}),
      type,
      amount,
      date,
      what: form.elements.what.value.trim(),
      where: form.elements.where.value.trim(),
      category: type === 'out' ? (form.elements.category.value || 'etc') : (entry?.category || 'etc'),
    });
    dialog.close();
    // 다른 주의 날짜로 저장했다면 그 주로 이동
    const savedWeek = startOfWeek(fromISO(date));
    if (toISO(savedWeek) !== toISO(ui.week)) { ui.week = savedWeek; render(); }
    toast(entry ? '고쳤어요' : '기록했어요 ✏️');
  });

  dialog.showModal();
  if (!entry) setTimeout(() => amountInput.focus(), 50);
}

dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });

/* ============================================================
 * 통계
 * ============================================================ */
function monthEntries(y, m) {
  const prefix = `${y}-${String(m + 1).padStart(2, '0')}`;
  return getState().entries.filter((e) => e.date.startsWith(prefix));
}

function renderStats() {
  const y = ui.month.getFullYear();
  const m = ui.month.getMonth();
  const list = monthEntries(y, m);
  const totalIn = list.filter((e) => e.type === 'in').reduce((s, e) => s + e.amount, 0);
  const outs = list.filter((e) => e.type === 'out');
  const totalOut = outs.reduce((s, e) => s + e.amount, 0);
  const endBalance = balanceBefore(toISO(new Date(y, m + 1, 1)));

  // 카테고리별
  const cats = CATEGORIES.map((c) => ({ ...c, sum: outs.filter((e) => e.category === c.id).reduce((s, e) => s + e.amount, 0) }))
    .sort((a, b) => b.sum - a.sum);
  const catMax = Math.max(1, ...cats.map((c) => c.sum));
  const catHtml = totalOut
    ? cats.map((c) => `
        <div class="hbar">
          <div class="hbar-label"><span>${c.icon}</span>${c.name}</div>
          <div class="hbar-track"><div class="hbar-fill cat-${c.id}" style="width:${(c.sum / catMax) * 100}%"></div></div>
          <div class="hbar-val">${won(c.sum)}원<small>${Math.round((c.sum / totalOut) * 100)}%</small></div>
        </div>`).join('')
    : '<p class="empty">이 달에는 쓴 돈이 없어요</p>';

  // 많이 쓴 곳 TOP 5
  const byWhere = {};
  outs.forEach((e) => { const k = e.where || '(장소 없음)'; byWhere[k] = (byWhere[k] || 0) + e.amount; });
  const topWhere = Object.entries(byWhere).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const whereHtml = topWhere.length
    ? `<ol class="rank">${topWhere.map(([k, v]) => `<li><span>${esc(k)}</span><b>${won(v)}원</b></li>`).join('')}</ol>`
    : '<p class="empty">기록이 없어요</p>';

  // 최근 6개월 추이
  const months = Array.from({ length: 6 }, (_, i) => new Date(y, m - 5 + i, 1)).map((d) => {
    const l = monthEntries(d.getFullYear(), d.getMonth());
    return {
      label: `${d.getMonth() + 1}월`,
      in: l.filter((e) => e.type === 'in').reduce((s, e) => s + e.amount, 0),
      out: l.filter((e) => e.type === 'out').reduce((s, e) => s + e.amount, 0),
    };
  });

  view.innerHTML = `
    <section class="sheet">
      <div class="week-head">
        <button type="button" class="nav-btn" data-act="prev-month" aria-label="지난 달">‹</button>
        <div class="month-title">${y}년 ${m + 1}월</div>
        <button type="button" class="nav-btn" data-act="next-month" aria-label="다음 달">›</button>
      </div>

      <div class="summary">
        <div class="sum-card"><span>들어온 돈</span><strong class="in">${won(totalIn)}원</strong></div>
        <div class="sum-card"><span>나간 돈</span><strong class="out">${won(totalOut)}원</strong></div>
        <div class="sum-card"><span>월말 남은 돈</span><strong class="${endBalance < 0 ? 'neg' : ''}">${won(endBalance)}원</strong></div>
      </div>

      <div class="box">
        <div class="box-title"><span class="ring">₩</span>어디에 용돈을 많이 썼나요?</div>
        ${catHtml}
      </div>

      <div class="box">
        <div class="box-title"><span class="ring">📈</span>최근 6개월</div>
        ${trendChart(months)}
        <div class="legend"><span class="lg in"></span>들어온 돈 <span class="lg out"></span>나간 돈</div>
      </div>

      <div class="box">
        <div class="box-title"><span class="ring">📍</span>많이 쓴 곳 TOP 5</div>
        ${whereHtml}
      </div>
    </section>`;
}

function trendChart(months) {
  const W = 340, H = 180, padL = 8, padR = 8, padT = 20, padB = 26;
  const max = Math.max(1, ...months.flatMap((d) => [d.in, d.out]));
  const gw = (W - padL - padR) / months.length;
  const bw = Math.min(16, gw / 3);
  const ch = H - padT - padB;
  const short = (n) => (n >= 10000 ? `${Math.round(n / 1000) / 10}만` : n >= 1000 ? `${Math.round(n / 100) / 10}천` : String(n));
  const bars = months.map((d, i) => {
    const cx = padL + gw * i + gw / 2;
    const hi = (d.in / max) * ch;
    const ho = (d.out / max) * ch;
    return `
      <rect class="b-in" x="${cx - bw - 1}" y="${padT + ch - hi}" width="${bw}" height="${hi}" rx="3"/>
      <rect class="b-out" x="${cx + 1}" y="${padT + ch - ho}" width="${bw}" height="${ho}" rx="3"/>
      ${d.in ? `<text class="v" x="${cx - bw / 2 - 1}" y="${padT + ch - hi - 4}">${short(d.in)}</text>` : ''}
      ${d.out ? `<text class="v" x="${cx + bw / 2 + 1}" y="${padT + ch - ho - 4}">${short(d.out)}</text>` : ''}
      <text class="x" x="${cx}" y="${H - 8}">${d.label}</text>`;
  }).join('');
  return `<svg class="trend" viewBox="0 0 ${W} ${H}" role="img" aria-label="최근 6개월 들어온 돈과 나간 돈">
    <line class="axis" x1="${padL}" x2="${W - padR}" y1="${padT + ch}" y2="${padT + ch}"/>${bars}</svg>`;
}

/* ============================================================
 * 설정
 * ============================================================ */
function renderSettings() {
  const s = getState().settings;
  const count = getState().entries.length;
  view.innerHTML = `
    <section class="sheet">
      <div class="box">
        <div class="box-title"><span class="ring">👧</span>기본 정보</div>
        <label class="field">
          <span>아이 이름</span>
          <input data-setting="childName" maxlength="20" value="${esc(s.childName)}" placeholder="예: 지우">
        </label>
        <label class="field">
          <span>처음 가지고 있던 돈</span>
          <div class="amount-wrap">
            <input data-setting="initialBalance" inputmode="numeric" value="${s.initialBalance ? won(s.initialBalance) : ''}" placeholder="0">
            <span>원</span>
          </div>
          <small class="help">기입장을 시작하기 전에 지갑에 있던 돈이에요. 첫 주의 '지난 주 남은 돈'이 됩니다.</small>
        </label>
      </div>

      <div class="box">
        <div class="box-title"><span class="ring">💾</span>백업 / 복원</div>
        <p class="help">기록은 이 기기 안에만 저장돼요. 앱을 지우거나 폰을 바꾸기 전에 꼭 백업해 주세요. (현재 기록 ${count}개)</p>
        <div class="btn-row">
          <button type="button" class="primary" data-act="export">백업 파일 저장</button>
          <label class="secondary file-btn">백업 불러오기<input type="file" accept="application/json,.json" data-act="import" hidden></label>
        </div>
      </div>

      <div class="box">
        <div class="box-title"><span class="ring">📲</span>홈 화면에 추가하기 (iPhone)</div>
        <ol class="howto">
          <li><b>Safari</b>로 이 페이지를 열어요.</li>
          <li>아래쪽 <b>공유 버튼(□↑)</b>을 눌러요.</li>
          <li><b>홈 화면에 추가</b>를 눌러요.</li>
          <li>홈 화면의 <b>용돈기입장</b> 아이콘으로 실행하면 앱처럼 쓸 수 있어요.</li>
        </ol>
      </div>

      <div class="box">
        <div class="box-title"><span class="ring">⚠️</span>초기화</div>
        <button type="button" class="danger wide" data-act="reset">모든 기록 지우기</button>
      </div>

      <p class="version">용돈 기입장 v${APP_VERSION}</p>
    </section>`;
}

async function doExport() {
  const data = exportData();
  const name = `용돈기입장-백업-${toISO(today())}.json`;
  const file = new File([data], name, { type: 'application/json' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: '용돈 기입장 백업' });
      return;
    }
  } catch (err) {
    if (err.name === 'AbortError') return;
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('백업 파일을 저장했어요');
}

/* ============================================================
 * 이벤트 (위임)
 * ============================================================ */
view.addEventListener('click', (e) => {
  const row = e.target.closest('tr.entry-row');
  if (row) {
    const entry = getState().entries.find((x) => x.id === row.dataset.id);
    if (entry) openEntry(entry);
    return;
  }
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const weekId = toISO(ui.week);
  switch (el.dataset.act) {
    case 'add': openEntry(null); break;
    case 'prev-week': ui.week = addDays(ui.week, -7); render(); break;
    case 'next-week': ui.week = addDays(ui.week, 7); render(); break;
    case 'this-week': ui.week = startOfWeek(today()); render(); break;
    case 'prev-month': ui.month = new Date(ui.month.getFullYear(), ui.month.getMonth() - 1, 1); render(); break;
    case 'next-month': ui.month = new Date(ui.month.getFullYear(), ui.month.getMonth() + 1, 1); render(); break;
    case 'toggle-plan': togglePlan(weekId, el.dataset.id); break;
    case 'del-plan': deletePlan(weekId, el.dataset.id); break;
    case 'export': doExport(); break;
    case 'reset':
      if (confirm('정말 모든 기록을 지울까요? 되돌릴 수 없어요.') && confirm('한 번 더 확인할게요. 모두 지울까요?')) {
        resetAll();
        toast('모두 지웠어요');
      }
      break;
    default: break;
  }
});

view.addEventListener('submit', (e) => {
  const form = e.target.closest('form[data-form="plan"]');
  if (!form) return;
  e.preventDefault();
  const text = form.elements.plan.value.trim();
  if (!text) return;
  addPlan(toISO(ui.week), text);
  view.querySelector('form[data-form="plan"] input')?.focus();
});

view.addEventListener('input', (e) => {
  const t = e.target;
  if (t.matches('textarea[data-field]')) {
    updateWeek(toISO(ui.week), { [t.dataset.field]: t.value }, { silent: true });
  } else if (t.matches('[data-setting="initialBalance"]')) {
    const n = parseAmount(t.value);
    t.value = n ? won(n) : '';
  }
});

view.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.matches('[data-setting="childName"]')) {
    updateSettings({ childName: t.value.trim() });
  } else if (t.matches('[data-setting="initialBalance"]')) {
    updateSettings({ initialBalance: parseAmount(t.value) });
    toast('저장했어요');
  } else if (t.matches('input[type="file"][data-act="import"]')) {
    const file = t.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      if (!confirm('지금 기록을 백업 파일 내용으로 바꿀까요?')) return;
      importData(text);
      toast('불러왔어요');
    } catch (err) {
      alert(`불러오기 실패: ${err.message}`);
    } finally {
      t.value = '';
    }
  }
});

/* ============================================================
 * 시작
 * ============================================================ */
render();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(console.error));
}
// 브라우저가 저장 공간을 임의로 정리하지 않도록 요청
navigator.storage?.persist?.().catch(() => {});
