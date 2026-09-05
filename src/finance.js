export const TYPES = ['십일조', '주일헌금', '감사헌금', '선교헌금', '건축헌금', '기타헌금', '구역헌금'];
export const COLORS = ['#365d98', '#6b8ec0', '#be9954', '#648f88', '#9199b0', '#9ab6ca', '#a28aaa'];
export const GIDS = { '2024-12': 412478555, '2025-01': 1362517380, '2025-02': 1898852102, '2025-03': 1946650267, '2025-04': 67822875, '2025-05': 1174752218, '2025-06': 414086671, '2025-07': 788642057, '2025-08': 1273520853, '2025-09': 1799917349, '2025-10': 81454662, '2025-11': 1339975151, '2025-12': 1763125208, '2026-01': 1362517380, '2026-02': 46075821, '2026-03': 1381108057, '2026-04': 455278357, '2026-05': 446292036, '2026-06': 722384860, '2026-07': 1820198916, '2026-08': 1282165554 };
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
export function parseSheet(csv, month) {
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

export function sourceURL(month) {
const base=month>='2026-01'?'https://docs.google.com/spreadsheets/d/e/2PACX-1vS9B_AT9_Cmokg5gAXHRzIkQFQMxzgutcEjP-ywamo0mpU7I4Ks6GV8zAzHaDxcLw/pub':'https://docs.google.com/spreadsheets/d/e/2PACX-1vSW5wXPoqAp90su9NGIwIojj3QbpUbPWGOArmUp1iykP-8vjcF1E7V_A_ExsAhNeA/pub';
return base+'?gid='+GIDS[month]+'&single=true';
}
export async function fetchLedger(month,signal){
if(GIDS[month]===undefined)throw Error('연결된 월별 시트가 없습니다.');
const r=await fetch(sourceURL(month)+'&output=csv',{signal,cache:'no-store'});
if(!r.ok)throw Error('구글 시트를 불러오지 못했습니다. 게시 설정과 인터넷 연결을 확인해 주세요.');
return parseSheet(await r.text(),month);
}
