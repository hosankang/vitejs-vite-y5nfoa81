export const TYPES = ['십일조', '주일헌금', '감사헌금', '선교헌금', '건축헌금', '기타헌금', '구역헌금'];
export const COLORS = ['#365d98', '#6b8ec0', '#be9954', '#648f88', '#9199b0', '#9ab6ca', '#a28aaa'];
export const GIDS = { '2024-07': 56730213, '2024-08': 67822875, '2024-09': 1946650267, '2024-10': 1898852102, '2024-11': 1362517380, '2024-12': 412478555, '2025-01': 1362517380, '2025-02': 1898852102, '2025-03': 1946650267, '2025-04': 67822875, '2025-05': 1174752218, '2025-06': 414086671, '2025-07': 788642057, '2025-08': 1273520853, '2025-09': 1799917349, '2025-10': 81454662, '2025-11': 1339975151, '2025-12': 1763125208, '2026-01': 1362517380, '2026-02': 46075821, '2026-03': 1381108057, '2026-04': 455278357, '2026-05': 446292036, '2026-06': 722384860, '2026-07': 1820198916, '2026-08': 1282165554 };
export const MONTHS = Object.keys(GIDS).sort();
export const emptyLedger = { entries: [], opening: null, reportedBalance: null, warnings: [], updatedAt: null, sourceStatus: 'unconfigured' };
export const won = (v) => new Intl.NumberFormat('ko-KR').format(v);
export const week = (d) => Math.ceil(Number(d.slice(8, 10)) / 7);
export const monthLabel = (m) => `${m.slice(0, 4)}년 ${Number(m.slice(5))}월`;
export const sum = (a) => a.reduce((s, r) => s + r.amount, 0);
export function parseCSV(s) {
    const out = [];
    let row = [], value = '', quoted = false;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (c === '"') {
            if (quoted && s[i + 1] === '"') {
                value += '"';
                i++;
            }
            else if (quoted || value === '')
                quoted = !quoted;
            else
                value += c;
        }
        else if (c === ',' && !quoted) {
            row.push(value);
            value = '';
        }
        else if ((c === '\r' || c === '\n') && !quoted) {
            if (c === '\r' && s[i + 1] === '\n')
                i++;
            row.push(value);
            out.push(row);
            row = [];
            value = '';
        }
        else
            value += c;
    }
    if (quoted)
        throw Error('CSV 따옴표 형식이 올바르지 않습니다.');
    if (row.length || value) {
        row.push(value);
        out.push(row);
    }
    return out;
}
export function money(value) {
    const s = (value || '').trim().replace(/[,₩원\s]/g, '');
    if (!s || /^[-–—]+$/.test(s))
        return 0;
    const n = /^\(\d+\)$/.test(s) ? -Number(s.slice(1, -1)) : /^-?\d+$/.test(s) ? Number(s) : NaN;
    return Number.isSafeInteger(n) ? n : null;
}
function dateFrom(s, y) { const m = s.match(/(\d{1,2})월\s*(\d{1,2})일/); if (!m)
    return null; const d = `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`; return !Number.isNaN(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d ? d : null; }
function parseLegacySheet(csv, month) {
    const rows = parseCSV(csv.replace(/^\uFEFF/, ''));
    const warnings = [];
    const entries = [];
    const hi = rows.findIndex((r, i) => i < 15 && /20\d{2}년\s*\d{1,2}월/.test(r[0] || ''));
    if (hi < 0)
        throw Error('시트의 월별 날짜 머리글을 찾지 못했습니다.');
    const match = rows[hi][0].match(/(20\d{2})년\s*(\d{1,2})월/);
    if (`${match[1]}-${match[2].padStart(2, '0')}` !== month)
        throw Error('선택한 월과 시트에 적힌 월이 다릅니다. 연결 정보를 확인해 주세요.');
    const cols = [];
    rows[hi].forEach((s, i) => { const date = dateFrom(s, month.slice(0, 4)); if (date) {
        if (!date.startsWith(month)) {
            warnings.push(`${i + 1}열 날짜가 선택한 월과 달라 제외했습니다.`);
            return;
        }
        cols.push({ i, date, payment: '현금' });
        if (rows[hi][i + 1]?.trim() === '온라인')
            cols.push({ i: i + 1, date, payment: '온라인' });
    } });
    if (!cols.length)
        throw Error('헌금 날짜 열을 인식할 수 없습니다.');
    let category = '', expenseStart = -1, opening = null, reportedBalance = null;
    const add = (r, i, col, date, name, category, payment, kind) => {
        const amount = money(r[col]);
        if (amount === null) {
            warnings.push(`${i + 1}행 ${col + 1}열 금액 형식을 확인해 주세요.`);
            return;
        }
        if (amount === 0)
            return;
        entries.push({ id: `sheet:${month}:${i}:${col}`, date, name, category, amount, payment, kind, source: 'sheet', note: '' });
    };
    rows.forEach(r => { const name = r[0]?.trim(); if (name === '이월금')
        opening = money(r[1]); if (name === '잔액')
        reportedBalance = money(r[1]); });
    for (let i = hi + 1; i < rows.length; i++) {
        const r = rows[i];
        const name = r[0]?.trim();
        if (!name)
            continue;
        if (/지출\s*(결의서|내역)/.test(name)) {
            expenseStart = i;
            break;
        }
        if (TYPES.includes(name)) {
            category = name;
            continue;
        }
        if (/총\s*계|합계|소계|현금\+온라인|이월금|잔액|보유금액|실제|검증용/.test(name))
            continue;
        if (category)
            cols.forEach(c => add(r, i, c.i, c.date, name, category, c.payment, 'income'));
    }
    if (expenseStart >= 0) {
        let cash = -1, online = -1, headerEnd = expenseStart;
        for (let i = expenseStart + 1; i < Math.min(rows.length, expenseStart + 6); i++) {
            const r = rows[i];
            const ca = r.findIndex(c => c.trim() === '현금');
            const on = r.findIndex(c => c.trim() === '온라인');
            if (ca >= 0 || on >= 0) {
                cash = ca;
                online = on;
                headerEnd = i;
                break;
            }
        }
        if (cash < 0 && online < 0)
            warnings.push('지출의 현금·온라인 열을 찾지 못했습니다.');
        let lastDate = '';
        for (let i = headerEnd + 1; i < rows.length; i++) {
            const r = rows[i];
            const first = r[0]?.trim() || '';
            const name = r[1]?.trim() || '';
            if (/각 지출|지출비|총\s*계|합계/.test(first))
                break;
            const date = dateFrom(first, month.slice(0, 4));
            if (date)
                lastDate = date;
            if (!name || /지출내역/.test(name))
                continue;
            if (!lastDate || (!date && first)) {
                if ((cash >= 0 && money(r[cash])) || (online >= 0 && money(r[online])))
                    warnings.push(`${i + 1}행 지출 날짜를 확인해 주세요.`);
                continue;
            }
            if (!lastDate.startsWith(month)) {
                warnings.push(`${i + 1}행 날짜가 선택한 월과 달라 제외했습니다.`);
                continue;
            }
            const kind = /예금이자/.test(name) ? 'income' : 'expense';
            const category = kind === 'income' ? '기타수입' : /유류|LPG|경유|휘발유/i.test(name) ? '차량·유류비' : '일반지출';
            if (online >= 0)
                add(r, i, online, lastDate, name, category, '온라인', kind);
            if (cash >= 0)
                add(r, i, cash, lastDate, name, category, '현금', kind);
        }
    }
    return { entries, opening, reportedBalance, warnings: [...new Set(warnings)], updatedAt: new Date().toISOString(), sourceStatus: 'ok' };
}
export function sampleLedger(month) {
    const names = ['김하은', '이은성', '박지훈', '정은혜', '최서준', '한지영', '김도윤', '윤소망', '이성민', '박선영', '정다은', '무명'];
    const entries = [];
    [2, 9, 16, 23, 30].filter(d => d <= new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate()).forEach((d, w) => { names.forEach((name, i) => { entries.push({ id: `demo:${w}:${i}`, date: `${month}-${String(d).padStart(2, '0')}`, name, category: TYPES[(i + w) % 6], amount: [300000, 50000, 100000, 20000, 150000, 30000, 200000, 50000, 100000, 10000, 50000, 20000][i] + w * 10000, payment: i % 3 ? '온라인' : '현금', kind: 'income', source: 'sheet', note: '예시 데이터' }); }); });
    ['예배당 관리비', '선교 후원금', '교육부 교재', '전기·수도 요금', '차량 주유비'].forEach((name, i) => entries.push({ id: `demo:expense:${i}`, date: `${month}-${String(i * 4 + 3).padStart(2, '0')}`, name, category: ['시설관리', '선교·구제', '교육·행사', '공과금', '차량·유류비'][i], amount: [850000, 500000, 185000, 243500, 96000][i], payment: i === 2 ? '현금' : '온라인', kind: 'expense', source: 'sheet', note: '예시 데이터' }));
    return { entries, opening: 3450000, reportedBalance: 3450000 + sum(entries.filter(e => e.kind === 'income')) - sum(entries.filter(e => e.kind === 'expense')), warnings: [], updatedAt: null, sourceStatus: 'ok' };
}
export function csvExport(rows) { return '\uFEFF' + rows.map(r => r.map(v => { let s = String(v); if (typeof v === 'string' && /^[\s]*[=+\-@\t\r]/.test(s))
    s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; }).join(',')).join('\r\n'); }

// 2024 workbook: leading blank columns, older payment/date layouts and
// a separate July founding-service offering table.
function parse2024Sheet(csv, month) {
  const rows = parseCSV(csv.replace(/^\uFEFF/, ''));
  const warnings = [], entries = [];
  const text = v => String(v ?? '').trim();
  const headerRow = rows.findIndex((r, i) => i < 15 && r.slice(0, 3).some(v => /2024년\s*\d{1,2}월/.test(v)));
  if (headerRow < 0) throw Error('2024년 장부의 날짜 머리글을 찾지 못했습니다.');
  const nameCol = rows[headerRow].findIndex(v => /2024년\s*\d{1,2}월/.test(v));
  const match = rows[headerRow][nameCol].match(/(2024)년\s*(\d{1,2})월/);
  if (`${match[1]}-${match[2].padStart(2, '0')}` !== month) throw Error('선택한 월과 원본 시트의 월이 다릅니다.');
  const dateOf = value => {
    const s = text(value);
    const korean = s.match(/(?:(20\d{2})년\s*)?(\d{1,2})월\s*(\d{1,2})일/);
    const numeric = s.match(/^(20\d{2})[.\/-]\s*(\d{1,2})[.\/-]\s*(\d{1,2})(?:\D|$)/);
    const m = korean || numeric;
    if (!m) return null;
    const d = `${m[1] || month.slice(0, 4)}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    return !Number.isNaN(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d ? d : null;
  };
  function add(row, col, date, name, category, payment, kind, note = '', positiveInterest = false) {
    let value = money(rows[row][col]);
    if (value === null) { warnings.push(`${row + 1}행 ${col + 1}열: 금액 형식을 확인해 주세요.`); return; }
    if (!value) return;
    if (!date) {
      if (kind !== 'income') { warnings.push(`${row + 1}행 ${col + 1}열: 지출 날짜가 없어 제외했습니다.`); return; }
      // Retain known month precision without inventing a day of the month.
      date = month;
      warnings.push(`${col + 1}열: 헌금 일자가 비어 있습니다. 월·연간 합계에는 포함하고 주차별 그래프에서는 제외합니다.`);
      note = ['일자 미기재 · 월 단위로만 확인됨', note].filter(Boolean).join(' · ');
    }
    if (positiveInterest) value = Math.abs(value);
    entries.push({id:`sheet:${month}:${row}:${col}`, date, name:name || '무명', category, payment, kind, amount:value, source:'sheet', note});
  }
  const expenseStart = rows.findIndex((r, i) => i > headerRow && r.slice(0, nameCol + 2).some(v => /지출\s*(결의서|내역)/.test(v)));
  const end = expenseStart < 0 ? rows.length : expenseStart;
  const specialCol = rows[headerRow].findIndex(v => /창립예배/.test(v));
  const regularEnd = specialCol < 0 ? rows[headerRow].length : specialCol - 1;
  const separatePayments = rows[headerRow].slice(nameCol + 1, regularEnd).some(v => text(v) === '온라인');
  const cols = [];
  for (let c = nameCol + 1; c < regularEnd; c++) {
    const date = dateOf(rows[headerRow][c]);
    const next = text(rows[headerRow][c + 1]);
    if (date || (!text(rows[headerRow][c]) && (next === '온라인' || next === '비고'))) {
      if (date && !date.startsWith(month)) { warnings.push(`${c + 1}열 날짜가 선택한 월과 다릅니다.`); continue; }
      cols.push({col:c,date,payment:separatePayments ? '현금' : '미구분'});
      if (next === '온라인') cols.push({col:c + 1,date,payment:'온라인'});
    }
  }
  if (!cols.some(c => c.date)) throw Error('헌금 날짜 열을 인식하지 못했습니다.');
  let category = '', opening = null, reportedBalance = null;
  const summary = /총\s*계|합계|소계|현금\+온라인|이월금|잔액|보유금액|실제|검증용/;
  for (let i = headerRow + 1; i < end; i++) {
    const label = text(rows[i][nameCol]);
    if (label === '이월금') opening = text(rows[i][nameCol + 1]) ? money(rows[i][nameCol + 1]) : null;
    if (label === '잔액') reportedBalance = text(rows[i][nameCol + 1]) ? money(rows[i][nameCol + 1]) : null;
    if (TYPES.includes(label)) {
      category = label;
      // Older group offerings can be recorded directly on the category row.
      if (label === '구역헌금') {
        const hasDetails = rows.slice(i + 1, end).some(r => text(r[nameCol]) && !summary.test(text(r[nameCol])) && !TYPES.includes(text(r[nameCol])));
        if (!hasDetails) cols.forEach(c => add(i,c.col,c.date,'무명',category,c.payment,'income','구역헌금 항목에 직접 기입된 금액 · 이름 미기재'));
      }
      continue;
    }
    if (!label || summary.test(label) || !category) continue;
    cols.forEach(c => add(i,c.col,c.date,label,category,c.payment,'income',separatePayments ? '' : '원본에 현금·온라인 구분 없음'));
  }
  const regularIncome = sum(entries);
  if (specialCol >= 0) {
    const date = dateOf(rows[headerRow][specialCol]);
    for (let i = headerRow + 1; i < end; i++) {
      const label = text(rows[i][specialCol]);
      if (!label || /총\s*계|합계/.test(label)) continue;
      // The sequence-number column identifies individual donors, not totals.
      if (!/^\d+$/.test(text(rows[i][specialCol - 1]))) continue;
      add(i,specialCol + 1,date,label,'감사헌금','미구분','income',`창립예배 감사헌금${text(rows[i][specialCol + 2]) ? ' · ' + text(rows[i][specialCol + 2]) : ''}`);
    }
  }
  const declaredIncomeRow = rows.slice(headerRow + 1, end).reverse().find(r => /^(현금\+온라인\s*총계|총계)$/.test(text(r[nameCol]).replace(/\s/g,'')));
  if (declaredIncomeRow) {
    const raw = declaredIncomeRow.slice(nameCol + 1, nameCol + 3).find(v => text(v) && money(v) != null);
    const declared = raw === undefined ? null : money(raw);
    if (declared != null && declared !== regularIncome) warnings.push(`원본 헌금 총계(${won(declared)}원)와 인식한 일반 헌금(${won(regularIncome)}원)이 다릅니다. 날짜 없는 열과 비고란 금액을 확인해 주세요.`);
  }
  if (expenseStart >= 0) {
    let hr = -1, cash = -1, online = -1, expenseNameCol = nameCol + 1;
    for (let i = expenseStart; i < Math.min(rows.length, expenseStart + 6); i++) {
      const r = rows[i];
      const ca = r.findIndex(v => text(v) === '현금'), on = r.findIndex(v => text(v) === '온라인');
      if (ca >= 0 || on >= 0) { hr=i; cash=ca; online=on; const n=r.findIndex(v => /지출\s*내역/.test(v)); if(n >= 0) expenseNameCol=n; break; }
    }
    if (hr < 0) warnings.push('지출의 현금·온라인 열을 찾지 못했습니다.');
    else {
      let lastDate = '', lastName = '';
      for (let i = hr + 1; i < rows.length; i++) {
        const r = rows[i], first = text(r[nameCol]), label = text(r[expenseNameCol]);
        if (r.some(v => /^(각\s*지출\s*금액|지출비|잔금)$/.test(text(v)))) break;
        if (/총\s*계|합계/.test(first)) break;
        const date = dateOf(first);
        if (date) lastDate = date; else if (first) lastDate = '';
        if (label) lastName = label;
        const hasMoney = [cash,online].some(c => c >= 0 && money(r[c]) !== 0);
        if (!hasMoney) { if (!first && !label) lastName = ''; continue; }
        if (!lastName) { warnings.push(`${i + 1}행: 지출 내역 이름이 없어 제외했습니다.`); continue; }
        const interest = /예금이자/.test(lastName);
        const kind = interest ? 'income' : 'expense';
        const cat = interest ? '기타수입' : /유류|LPG|경유|휘발유/i.test(lastName) ? '차량·유류비' : '일반지출';
        const notes = [];
        if (lastDate && !lastDate.startsWith(month)) notes.push(`${monthLabel(month)} 장부에 기록된 이전/다른 달 거래 · 원본 날짜 유지`);
        if (interest) notes.push('지출란 예금이자를 수입으로 분류');
        [online,cash].filter(c => c >= 0).forEach(c => add(i,c,lastDate,lastName,cat,c === online ? '온라인':'현금',kind,notes.join(' · '),interest));
      }
    }
  } else warnings.push('지출 표를 찾지 못했습니다. 지출이 없는 월인지 확인해 주세요.');
  if (opening != null && reportedBalance != null) {
    const calculated = opening + sum(entries.filter(e => e.kind === 'income')) - sum(entries.filter(e => e.kind === 'expense'));
    if (calculated !== reportedBalance) warnings.push(`원본 잔액과 계산 잔액이 ${won(calculated - reportedBalance)}원 다릅니다. 원본 내역을 확인해 주세요.`);
  }
  return {entries,opening,reportedBalance,warnings:[...new Set(warnings)],updatedAt:new Date().toISOString(),sourceStatus:'ok'};
}

export function parseSheet(csv, month) {
  return month.startsWith('2024-') ? parse2024Sheet(csv, month) : parseLegacySheet(csv, month);
}
const BASE_URLS = {
  '2024': 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSNF4cZdlLwKB-ndFmK0st6q6qC49KA-m6ozBQpikBJ3oSiB_BU_fNfKLGgtGbnPQ/pub',
  '2025': 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSW5wXPoqAp90su9NGIwIojj3QbpUbPWGOArmUp1iykP-8vjcF1E7V_A_ExsAhNeA/pub',
  '2026': 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS9B_AT9_Cmokg5gAXHRzIkQFQMxzgutcEjP-ywamo0mpU7I4Ks6GV8zAzHaDxcLw/pub',
};
export function sourceURL(month) {
  const base = BASE_URLS[month.slice(0,4)];
  if (!base || GIDS[month] === undefined) throw Error('연결된 월별 시트가 없습니다.');
  return `${base}?gid=${GIDS[month]}&single=true`;
}
export async function fetchLedger(month, signal) {
  const response = await fetch(`${sourceURL(month)}&output=csv`, {signal,cache:'no-store'});
  if (!response.ok) throw Error('구글 시트를 불러오지 못했습니다. 게시 설정과 인터넷 연결을 확인해 주세요.');
  return parseSheet(await response.text(), month);
}
