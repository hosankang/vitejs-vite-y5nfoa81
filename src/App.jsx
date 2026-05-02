import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  FileSpreadsheet,
  User,
  DollarSign,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  Wallet,
  CreditCard,
  Banknote,
  Church,
  Calendar,
  Search,
  X,
  ChevronDown,
  ChevronUp,
  Receipt,
  Fuel,
  MinusCircle,
  Sparkles,
  Landmark,
  Users,
  Layers,
} from 'lucide-react';
import Papa from 'papaparse';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
  AreaChart,
  Area,
} from 'recharts';

// --- 구글 시트 설정 ---
const SHEET_BASE_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSW5wXPoqAp90su9NGIwIojj3QbpUbPWGOArmUp1iykP-8vjcF1E7V_A_ExsAhNeA/pub';
const SHEET_2026_BASE_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS9B_AT9_Cmokg5gAXHRzIkQFQMxzgutcEjP-ywamo0mpU7I4Ks6GV8zAzHaDxcLw/pub';

const SHEET_GIDS = {
  '2024-12': 412478555,
  '2025-01': 1362517380,
  '2025-02': 1898852102,
  '2025-03': 1946650267,
  '2025-04': 67822875,
  '2025-05': 1174752218,
  '2025-06': 414086671,
  '2025-07': 788642057,
  '2025-08': 1273520853,
  '2025-09': 1799917349,
  '2025-10': 81454662,
  '2025-11': 1339975151,
  '2025-12': 1763125208,
  '2026-01': 1362517380,
  '2026-02': 46075821,
  '2026-03': 1381108057,
  '2026-04': 455278357,
  '2026-05': 1830407425,
};

const getSheetBaseUrl = (monthKey) => {
  const year = parseInt(monthKey.split('-')[0], 10);
  return year >= 2026 ? SHEET_2026_BASE_URL : SHEET_BASE_URL;
};

const AVAILABLE_MONTHS = Object.keys(SHEET_GIDS).sort();
const OFFERING_TYPES = ['전체', '십일조', '주일헌금', '감사헌금', '선교헌금', '건축헌금', '기타헌금', '구역헌금'];

const COLORS = {
  십일조: '#53675B',
  주일헌금: '#758C6A',
  감사헌금: '#B08D57',
  선교헌금: '#8A765E',
  건축헌금: '#667085',
  기타헌금: '#597D86',
  구역헌금: '#9A735F',
};

const getWeekOfMonth = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return dateString;
  return `${Math.ceil(date.getDate() / 7)}주차`;
};

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(amount);
};

const formatCompactCurrency = (amount) => {
  if (amount >= 10000) {
    const man = Math.floor(amount / 10000);
    const chun = Math.floor((amount % 10000) / 1000);
    return chun > 0 ? `${man}만 ${chun}천원` : `${man}만원`;
  }
  if (amount >= 1000) {
    const chun = Math.floor(amount / 1000);
    const rest = amount % 1000;
    return rest > 0 ? `${chun}천 ${rest}원` : `${chun}천원`;
  }
  return `${amount}원`;
};

const getMonthDisplay = (monthKey) => {
  if (!monthKey) return '';
  const [year, month] = monthKey.split('-');
  return `${year}년 ${parseInt(month, 10)}월`;
};

const processData = (rawData, expectedMonth) => {
  if (!rawData || rawData.length === 0) return { offerings: [], expenses: [], balance: 0 };

  const offerings = [];
  const expenses = [];
  let balance = 0;

  const offeringKeywords = ['십일조', '주일헌금', '감사헌금', '선교헌금', '건축헌금', '기타헌금', '구역헌금'];
  const stopKeywords = ['지출 결의서', '지출결의서', '지출 내역', '지출내역'];
  const excludeKeywords = ['총 계', '현금+온라인', '이월금', '잔액', '보유금액', '실제', '검증용'];
  const fuelKeywords = ['유류세', 'LPG', '경유', '휘발유'];

  let dateRowIndex = -1;
  let yearMonth = expectedMonth || '';
  let expenseStartIndex = -1;

  for (let i = 0; i < Math.min(rawData.length, 10); i += 1) {
    const row = Object.values(rawData[i]);
    const firstCell = String(row[0] || '');
    if (firstCell.match(/20\d{2}년\s*\d{1,2}월/)) {
      dateRowIndex = i;
      const match = firstCell.match(/(20\d{2})년\s*(\d{1,2})월/);
      if (match) yearMonth = `${match[1]}-${match[2].padStart(2, '0')}`;
      break;
    }
  }

  if (dateRowIndex === -1) return { offerings: [], expenses: [], balance: 0 };

  const dateRow = Object.values(rawData[dateRowIndex]);
  const dateColumns = [];
  const year = yearMonth.split('-')[0] || '2024';

  for (let i = 1; i < dateRow.length; i += 1) {
    const cell = String(dateRow[i] || '').trim();
    if (cell === '비고') continue;

    const dateMatch = cell.match(/(\d{1,2})월\s*(\d{1,2})일/);
    if (dateMatch) {
      const month = dateMatch[1].padStart(2, '0');
      const day = dateMatch[2].padStart(2, '0');
      const fullDate = `${year}-${month}-${day}`;

      dateColumns.push({ colIndex: i, date: fullDate, type: '현금' });
      if (i + 1 < dateRow.length) {
        const nextCell = String(dateRow[i + 1] || '').trim();
        if (nextCell === '온라인') {
          dateColumns.push({ colIndex: i + 1, date: fullDate, type: '온라인' });
        }
      }
    }
  }

  let currentOfferingType = '';

  for (let i = dateRowIndex + 1; i < rawData.length; i += 1) {
    const row = Object.values(rawData[i]);
    const firstCell = String(row[0] || '').trim();

    if (!firstCell) continue;

    if (stopKeywords.some((keyword) => firstCell.includes(keyword))) {
      expenseStartIndex = i;
      break;
    }

    if (excludeKeywords.some((keyword) => firstCell.includes(keyword))) continue;

    if (offeringKeywords.some((keyword) => firstCell === keyword)) {
      currentOfferingType = firstCell;
      continue;
    }

    if (currentOfferingType && firstCell) {
      for (const dateCol of dateColumns) {
        const cellValue = row[dateCol.colIndex];
        if (cellValue) {
          const amount = parseInt(String(cellValue).replace(/[^0-9]/g, ''), 10);
          if (amount > 0) {
            offerings.push({
              날짜: dateCol.date,
              이름: firstCell,
              헌금종류: currentOfferingType,
              금액: amount,
              결제방식: dateCol.type,
            });
          }
        }
      }
    }
  }

  if (expenseStartIndex > 0) {
    let fuelTotal = 0;
    const expenseExcludeKeywords = ['지출 결의서', '지출결의서', '각 지출', '지출비', '예금이자'];
    let expenseOnlineCol = -1;
    let expenseCashCol = -1;

    for (let i = expenseStartIndex; i < Math.min(expenseStartIndex + 5, rawData.length); i += 1) {
      const row = Object.values(rawData[i]);
      for (let j = 0; j < row.length; j += 1) {
        const cell = String(row[j] || '').trim();
        if (cell === '온라인') expenseOnlineCol = j;
        if (cell === '현금') expenseCashCol = j;
      }
      if (expenseOnlineCol > 0 || expenseCashCol > 0) break;
    }

    for (let i = expenseStartIndex + 1; i < rawData.length; i += 1) {
      const row = Object.values(rawData[i]);
      const firstCell = String(row[0] || '').trim();
      const secondCell = String(row[1] || '').trim();

      if (!firstCell && !secondCell) continue;

      const shouldExclude = expenseExcludeKeywords.some((keyword) => (
        firstCell.includes(keyword) || secondCell.includes(keyword)
      ));
      if (shouldExclude) continue;

      const dateMatch = firstCell.match(/(\d{1,2})월\s*(\d{1,2})일/);

      if (dateMatch && secondCell) {
        const month = dateMatch[1].padStart(2, '0');
        const day = dateMatch[2].padStart(2, '0');
        const expenseDate = `${year}-${month}-${day}`;
        const description = secondCell;

        let amount = 0;
        let paymentType = '';

        if (expenseOnlineCol > 0) {
          const onlineAmount = String(row[expenseOnlineCol] || '').replace(/[^0-9-]/g, '');
          if (onlineAmount && parseInt(onlineAmount, 10) > 0) {
            amount = parseInt(onlineAmount, 10);
            paymentType = '온라인';
          }
        }

        if (amount === 0 && expenseCashCol > 0) {
          const cashAmount = String(row[expenseCashCol] || '').replace(/[^0-9-]/g, '');
          if (cashAmount && parseInt(cashAmount, 10) > 0) {
            amount = parseInt(cashAmount, 10);
            paymentType = '현금';
          }
        }

        const isFuel = fuelKeywords.some((keyword) => description.includes(keyword));

        if (amount > 0) {
          if (isFuel) {
            fuelTotal += amount;
          } else {
            expenses.push({
              날짜: expenseDate,
              내역: description,
              금액: amount,
              결제방식: paymentType,
            });
          }
        }
      }
    }

    if (fuelTotal > 0) {
      expenses.unshift({
        날짜: '',
        내역: '유류세 (총합)',
        금액: fuelTotal,
        결제방식: '온라인',
        isFuel: true,
      });
    }
  }

  for (let i = 0; i < rawData.length; i += 1) {
    const row = Object.values(rawData[i]);
    const firstCell = String(row[0] || '').trim();

    if (firstCell === '잔액') {
      balance = parseInt(String(row[1] || '').replace(/[^0-9]/g, ''), 10) || 0;
      break;
    }
  }

  offerings.sort((a, b) => a.날짜.localeCompare(b.날짜));
  expenses.sort((a, b) => {
    if (a.isFuel) return -1;
    if (b.isFuel) return 1;
    return a.날짜.localeCompare(b.날짜);
  });

  return { offerings, expenses, balance };
};

const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-stone-900 shadow-[0_20px_60px_rgba(40,34,24,0.16)] backdrop-blur-xl">
        <p className="text-sm font-semibold">{payload[0].payload.name}</p>
        <p className="mt-1 text-base font-semibold text-[#53675B]">{formatCurrency(payload[0].value)}</p>
      </div>
    );
  }
  return null;
};

const StatTile = ({ icon: Icon, label, value, meta, tone = 'stone', className = '' }) => {
  const toneMap = {
    stone: 'bg-[#252A27] text-white border-white/10',
    olive: 'bg-[#53675B] text-white border-white/10',
    gold: 'bg-[#B08D57] text-white border-white/10',
    rose: 'bg-[#A35F5D] text-white border-white/10',
    light: 'bg-white/70 text-stone-900 border-white/80',
  };

  return (
    <div className={`relative overflow-hidden rounded-[28px] border p-5 shadow-[0_24px_70px_rgba(49,43,34,0.10)] ${toneMap[tone]} ${className}`}>
      <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-white/20 blur-2xl" />
      <div className="relative flex h-full flex-col justify-between gap-5">
        <div className="flex items-center justify-between">
          <div className="rounded-2xl bg-white/20 p-2.5 backdrop-blur">
            <Icon size={20} />
          </div>
          <span className="text-xs font-medium opacity-70">{label}</span>
        </div>
        <div>
          <p className="text-2xl font-semibold tabular-nums tracking-normal sm:text-3xl">{value}</p>
          {meta && <p className="mt-2 text-sm opacity-70">{meta}</p>}
        </div>
      </div>
    </div>
  );
};

const PaymentMeter = ({ icon: Icon, label, value, total, colorClass }) => {
  const percentage = total ? Math.round((value / total) * 100) : 0;

  return (
    <div className="rounded-[24px] border border-white/70 bg-white/70 p-5 shadow-[0_22px_60px_rgba(49,43,34,0.08)] backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`rounded-2xl p-2.5 ${colorClass.iconBg}`}>
            <Icon size={18} className={colorClass.icon} />
          </div>
          <div>
            <p className="text-sm font-medium text-stone-500">{label}</p>
            <p className="text-xl font-semibold text-stone-900 tabular-nums">{formatCompactCurrency(value)}</p>
          </div>
        </div>
        <p className="text-sm font-semibold text-stone-400">{percentage}%</p>
      </div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-stone-200/70">
        <div className={`h-full rounded-full ${colorClass.bar}`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
};

export default function App() {
  const [data, setData] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [balance, setBalance] = useState(0);
  const [currentMonth, setCurrentMonth] = useState(AVAILABLE_MONTHS[AVAILABLE_MONTHS.length - 1] || '2026-01');
  const [selectedType, setSelectedType] = useState('전체');
  const [selectedWeek, setSelectedWeek] = useState('전체');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showExpenses, setShowExpenses] = useState(false);

  const fetchGoogleSheet = useCallback((monthKey) => {
    const gid = SHEET_GIDS[monthKey];
    if (gid === undefined) {
      setErrorMsg(`${monthKey} 데이터가 없습니다.`);
      return;
    }

    setIsLoading(true);
    setErrorMsg('');

    const baseUrl = getSheetBaseUrl(monthKey);
    const url = `${baseUrl}?gid=${gid}&single=true&output=csv`;

    Papa.parse(url, {
      download: true,
      header: false,
      skipEmptyLines: false,
      complete: (results) => {
        if (results.data && results.data.length > 0) {
          const objData = results.data.map((row) => {
            const obj = {};
            row.forEach((cell, idx) => {
              obj[idx] = cell;
            });
            return obj;
          });

          const { offerings, expenses: expenseData, balance: balanceValue } = processData(objData, monthKey);
          setData(offerings);
          setExpenses(expenseData);
          setBalance(balanceValue);

          if (offerings.length === 0) {
            setErrorMsg('데이터 형식을 인식할 수 없습니다.');
          }
        } else {
          setErrorMsg('데이터를 불러왔지만 내용이 비어있습니다.');
        }
        setIsLoading(false);
      },
      error: (err) => {
        console.error(err);
        setErrorMsg('데이터를 불러오지 못했습니다.');
        setIsLoading(false);
      },
    });
  }, []);

  useEffect(() => {
    fetchGoogleSheet(currentMonth);
  }, [currentMonth, fetchGoogleSheet]);

  useEffect(() => {
    setSelectedWeek('전체');
    setShowExpenses(false);
  }, [currentMonth]);

  const filteredData = useMemo(() => {
    if (data.length === 0) return [];
    return data.filter((item) => {
      const matchesType = selectedType === '전체' || item.헌금종류 === selectedType;
      const matchesSearch = !searchTerm || item.이름.includes(searchTerm);
      return matchesType && matchesSearch;
    });
  }, [data, selectedType, searchTerm]);

  const totalExpenses = useMemo(() => {
    return expenses.reduce((sum, item) => sum + item.금액, 0);
  }, [expenses]);

  const stats = useMemo(() => {
    const totalAmount = filteredData.reduce((sum, item) => sum + item.금액, 0);
    const count = filteredData.length;
    const typeSummary = {};
    const paymentSummary = { 현금: 0, 온라인: 0 };
    const personSummary = {};
    const weekSummary = {};

    filteredData.forEach((item) => {
      const type = item.헌금종류;
      typeSummary[type] = (typeSummary[type] || 0) + item.금액;
      paymentSummary[item.결제방식] = (paymentSummary[item.결제방식] || 0) + item.금액;

      const person = item.이름;
      if (!personSummary[person]) {
        personSummary[person] = { total: 0, types: {}, count: 0 };
      }
      personSummary[person].total += item.금액;
      personSummary[person].count += 1;
      personSummary[person].types[type] = (personSummary[person].types[type] || 0) + item.금액;

      const week = getWeekOfMonth(item.날짜);
      weekSummary[week] = (weekSummary[week] || 0) + item.금액;
    });

    const chartData = Object.keys(typeSummary)
      .map((key) => ({ name: key, value: typeSummary[key], color: COLORS[key] || '#8E938B' }))
      .sort((a, b) => b.value - a.value);

    const weekChartData = Object.keys(weekSummary)
      .sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0))
      .map((key) => ({ name: key, value: weekSummary[key] }));

    const people = Object.entries(personSummary)
      .map(([name, personData]) => ({ name, ...personData }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
      .slice(0, 12);

    return { totalAmount, count, chartData, paymentSummary, people, weekChartData, personSummary };
  }, [filteredData]);

  const visibleRows = useMemo(() => {
    return filteredData
      .filter((item) => selectedWeek === '전체' || getWeekOfMonth(item.날짜) === selectedWeek)
      .sort((a, b) => a.날짜.localeCompare(b.날짜) || a.헌금종류.localeCompare(b.헌금종류, 'ko'));
  }, [filteredData, selectedWeek]);

  const changeMonth = (direction) => {
    const currentIndex = AVAILABLE_MONTHS.indexOf(currentMonth);
    const newIndex = currentIndex + direction;
    if (newIndex >= 0 && newIndex < AVAILABLE_MONTHS.length) {
      setCurrentMonth(AVAILABLE_MONTHS[newIndex]);
    }
  };

  const canGoBack = AVAILABLE_MONTHS.indexOf(currentMonth) > 0;
  const canGoForward = AVAILABLE_MONTHS.indexOf(currentMonth) < AVAILABLE_MONTHS.length - 1;
  const existingWeeks = [...new Set(filteredData.map((item) => getWeekOfMonth(item.날짜)))];
  const weekOptions = ['전체', '1주차', '2주차', '3주차', '4주차', '5주차'].filter((week) => (
    week === '전체' || existingWeeks.includes(week)
  ));

  return (
    <div className="min-h-screen bg-[#F5F1E8] font-sans text-stone-900 selection:bg-[#B08D57]/20">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-[-8rem] top-[-8rem] h-96 w-96 rounded-full bg-[#D7C39A]/30 blur-3xl" />
        <div className="absolute right-[-6rem] top-32 h-80 w-80 rounded-full bg-[#9CB1A0]/25 blur-3xl" />
        <div className="absolute bottom-[-10rem] left-1/3 h-96 w-96 rounded-full bg-[#CFAF90]/20 blur-3xl" />
      </div>

      <header className="sticky top-0 z-50 border-b border-white/40 bg-[#F5F1E8]/70 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#252A27] text-white shadow-[0_18px_45px_rgba(37,42,39,0.24)]">
              <Church size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold tracking-normal text-stone-950 sm:text-2xl">운정그리스도의교회</h1>
                <Sparkles size={16} className="text-[#B08D57]" />
              </div>
              <p className="mt-1 flex items-center gap-2 text-sm text-stone-500">
                <span className={`h-2 w-2 rounded-full ${data.length > 0 ? 'bg-[#758C6A]' : 'bg-[#A35F5D]'}`} />
                Sacred Finance Console
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center rounded-2xl border border-white/60 bg-white/60 p-1 shadow-[0_18px_50px_rgba(49,43,34,0.08)] backdrop-blur-xl">
              <button
                type="button"
                onClick={() => changeMonth(-1)}
                disabled={!canGoBack}
                className={`grid h-10 w-10 place-items-center rounded-xl transition ${canGoBack ? 'text-stone-600 hover:bg-white' : 'cursor-not-allowed text-stone-300'}`}
                aria-label="이전 월"
              >
                <ChevronLeft size={20} />
              </button>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowMonthPicker(!showMonthPicker)}
                  className="flex min-w-[168px] items-center justify-center gap-2 rounded-xl px-4 py-2 text-stone-900 transition hover:bg-white"
                >
                  <span className="text-sm font-semibold">{getMonthDisplay(currentMonth)}</span>
                  <ChevronDown size={16} className={`text-stone-400 transition ${showMonthPicker ? 'rotate-180' : ''}`} />
                </button>

                {showMonthPicker && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowMonthPicker(false)} />
                    <div className="absolute left-1/2 top-full z-50 mt-3 max-h-72 w-56 -translate-x-1/2 overflow-y-auto rounded-3xl border border-white/70 bg-white/80 p-2 shadow-[0_24px_80px_rgba(49,43,34,0.18)] backdrop-blur-2xl">
                      {AVAILABLE_MONTHS.slice().reverse().map((month) => (
                        <button
                          type="button"
                          key={month}
                          onClick={() => {
                            setCurrentMonth(month);
                            setShowMonthPicker(false);
                          }}
                          className={`w-full rounded-2xl px-4 py-3 text-left text-sm font-medium transition ${
                            currentMonth === month
                              ? 'bg-[#252A27] text-white shadow-lg'
                              : 'text-stone-600 hover:bg-[#F5F1E8]'
                          }`}
                        >
                          {getMonthDisplay(month)}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={() => changeMonth(1)}
                disabled={!canGoForward}
                className={`grid h-10 w-10 place-items-center rounded-xl transition ${canGoForward ? 'text-stone-600 hover:bg-white' : 'cursor-not-allowed text-stone-300'}`}
                aria-label="다음 월"
              >
                <ChevronRight size={20} />
              </button>
            </div>

            <button
              type="button"
              onClick={() => fetchGoogleSheet(currentMonth)}
              disabled={isLoading}
              className="grid h-12 w-12 place-items-center rounded-2xl border border-white/60 bg-white/60 text-stone-700 shadow-[0_18px_50px_rgba(49,43,34,0.08)] backdrop-blur-xl transition hover:bg-white"
              aria-label="새로고침"
            >
              <RefreshCw size={20} className={isLoading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-7xl px-4 py-7 sm:px-6 sm:py-10">
        {isLoading && (
          <div className="grid min-h-[560px] place-items-center">
            <div className="text-center">
              <div className="mx-auto h-14 w-14 rounded-full border-4 border-white/70 border-t-[#53675B] animate-spin" />
              <p className="mt-6 text-sm font-medium text-stone-500">데이터를 불러오는 중...</p>
            </div>
          </div>
        )}

        {errorMsg && !isLoading && (
          <div className="mb-8 flex items-center gap-4 rounded-3xl border border-[#A35F5D]/20 bg-[#FFF6F4]/80 p-5 text-[#8F4442] shadow-[0_18px_50px_rgba(49,43,34,0.08)] backdrop-blur-xl">
            <AlertCircle size={24} />
            <p className="font-medium">{errorMsg}</p>
          </div>
        )}

        {!isLoading && data.length > 0 && (
          <>
            <section className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-12">
              <StatTile
                icon={DollarSign}
                label="총 헌금액"
                value={formatCompactCurrency(stats.totalAmount)}
                meta={`${stats.count}건의 기록`}
                tone="stone"
                className="lg:col-span-5 lg:min-h-[260px]"
              />
              <StatTile
                icon={Wallet}
                label="잔액"
                value={formatCompactCurrency(balance)}
                meta="현재 잔고"
                tone="olive"
                className="lg:col-span-3"
              />
              <StatTile
                icon={MinusCircle}
                label="총 지출액"
                value={formatCompactCurrency(totalExpenses)}
                meta={`${expenses.length}건`}
                tone="rose"
                className="lg:col-span-4"
              />
              <div className="grid gap-4 lg:col-span-8 sm:grid-cols-2">
                <PaymentMeter
                  icon={Banknote}
                  label="현금 헌금"
                  value={stats.paymentSummary.현금 || 0}
                  total={stats.totalAmount}
                  colorClass={{ iconBg: 'bg-[#758C6A]/12', icon: 'text-[#53675B]', bar: 'bg-[#758C6A]' }}
                />
                <PaymentMeter
                  icon={CreditCard}
                  label="온라인 헌금"
                  value={stats.paymentSummary.온라인 || 0}
                  total={stats.totalAmount}
                  colorClass={{ iconBg: 'bg-[#597D86]/12', icon: 'text-[#597D86]', bar: 'bg-[#597D86]' }}
                />
              </div>
              <StatTile
                icon={Users}
                label="참여 성도"
                value={`${Object.keys(stats.personSummary).length}명`}
                meta={`${stats.chartData.length}개 헌금 종류`}
                tone="light"
                className="lg:col-span-4"
              />
            </section>

            <section className="mb-8 rounded-[32px] border border-white/70 bg-white/60 p-4 shadow-[0_24px_80px_rgba(49,43,34,0.10)] backdrop-blur-xl sm:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap gap-2">
                  {OFFERING_TYPES.map((type) => (
                    <button
                      type="button"
                      key={type}
                      onClick={() => setSelectedType(type)}
                      className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${
                        selectedType === type
                          ? 'bg-[#252A27] text-white shadow-[0_12px_30px_rgba(37,42,39,0.20)]'
                          : 'bg-white/60 text-stone-600 hover:bg-white'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>

                <div className="relative w-full lg:w-72">
                  <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" />
                  <input
                    type="text"
                    placeholder="이름 검색..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-12 w-full rounded-2xl border border-white/80 bg-white/70 pl-11 pr-11 text-sm text-stone-900 outline-none transition placeholder:text-stone-400 focus:border-[#B08D57]/50 focus:bg-white focus:ring-4 focus:ring-[#B08D57]/10"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400 transition hover:text-stone-700"
                      aria-label="검색어 지우기"
                    >
                      <X size={18} />
                    </button>
                  )}
                </div>
              </div>
            </section>

            <section className="mb-8 grid grid-cols-1 gap-5 lg:grid-cols-12">
              <div className="rounded-[32px] border border-white/70 bg-white/60 p-5 shadow-[0_24px_80px_rgba(49,43,34,0.10)] backdrop-blur-xl lg:col-span-7 sm:p-6">
                <div className="mb-6 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-stone-400">Offering Composition</p>
                    <h2 className="mt-1 flex items-center gap-2 text-xl font-semibold text-stone-950">
                      <TrendingUp size={20} className="text-[#B08D57]" />
                      헌금 종류별 현황
                    </h2>
                  </div>
                  <Layers size={22} className="text-stone-300" />
                </div>

                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.chartData} layout="vertical" margin={{ top: 8, right: 24, left: 0, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} stroke="#E7DFD2" />
                      <XAxis type="number" hide />
                      <YAxis
                        dataKey="name"
                        type="category"
                        width={78}
                        tick={{ fontSize: 12, fill: '#57534e', fontWeight: 500 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(176, 141, 87, 0.08)' }} />
                      <Bar dataKey="value" radius={[0, 14, 14, 0]} barSize={24}>
                        {stats.chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {stats.chartData.slice(0, 4).map((item) => (
                    <div key={item.name} className="rounded-3xl border border-[#E8DFD0] bg-[#F8F4EC] p-4">
                      <div className="mb-3 h-1.5 w-10 rounded-full" style={{ backgroundColor: item.color }} />
                      <p className="text-xs font-medium text-stone-500">{item.name}</p>
                      <p className="mt-1 text-base font-semibold text-stone-900 tabular-nums">{formatCompactCurrency(item.value)}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[32px] border border-white/70 bg-[#252A27] p-5 text-white shadow-[0_24px_80px_rgba(49,43,34,0.18)] lg:col-span-5 sm:p-6">
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-white/50">Weekly Flow</p>
                    <h2 className="mt-1 flex items-center gap-2 text-xl font-semibold">
                      <Calendar size={20} className="text-[#D7B36A]" />
                      주차별 추이
                    </h2>
                  </div>
                  <Landmark size={22} className="text-white/30" />
                </div>

                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={stats.weekChartData} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#D7B36A" stopOpacity={0.5} />
                          <stop offset="100%" stopColor="#D7B36A" stopOpacity={0.03} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.12)" vertical={false} />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.65)', fontWeight: 500 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis hide />
                      <RechartsTooltip content={<CustomTooltip />} cursor={{ stroke: '#D7B36A', strokeWidth: 1, strokeDasharray: '5 5' }} />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke="#D7B36A"
                        strokeWidth={3}
                        fill="url(#areaGradient)"
                        dot={{ fill: '#D7B36A', strokeWidth: 2, stroke: '#252A27', r: 4 }}
                        activeDot={{ fill: '#D7B36A', strokeWidth: 3, stroke: '#fff', r: 6 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-5 space-y-2">
                  {stats.weekChartData.map((item) => (
                    <div key={item.name} className="flex items-center justify-between rounded-2xl bg-white/10 px-4 py-3">
                      <span className="text-sm font-medium text-white/70">{item.name}</span>
                      <span className="text-sm font-semibold text-[#D7B36A] tabular-nums">{formatCompactCurrency(item.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="mb-8 rounded-[32px] border border-white/70 bg-white/60 p-5 shadow-[0_24px_80px_rgba(49,43,34,0.10)] backdrop-blur-xl sm:p-6">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-stone-400">Member Overview</p>
                  <h2 className="mt-1 flex items-center gap-2 text-xl font-semibold text-stone-950">
                    <User size={20} className="text-[#53675B]" />
                    성도별 조회
                  </h2>
                </div>
                <span className="rounded-full bg-[#F5F1E8] px-4 py-2 text-sm font-medium text-stone-500">
                  가나다순 {stats.people.length}명 표시
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {stats.people.map((person) => (
                  <div key={person.name} className="flex items-center justify-between rounded-3xl border border-[#E8DFD0] bg-[#F8F4EC]/80 p-4">
                    <div className="flex items-center gap-3">
                      <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white text-sm font-semibold text-stone-700">
                        {person.name.slice(0, 1)}
                      </div>
                      <div>
                        <p className="font-semibold text-stone-900">{person.name}</p>
                        <p className="text-xs text-stone-400">{person.count}건</p>
                      </div>
                    </div>
                    <p className="text-sm font-semibold text-[#53675B] tabular-nums">{formatCompactCurrency(person.total)}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="mb-8">
              <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-stone-400">Detailed Ledger</p>
                  <h2 className="mt-1 flex items-center gap-2 text-xl font-semibold text-stone-950">
                    <FileSpreadsheet size={20} className="text-[#53675B]" />
                    상세 내역
                  </h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  {weekOptions.map((week) => (
                    <button
                      type="button"
                      key={week}
                      onClick={() => setSelectedWeek(week)}
                      className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${
                        selectedWeek === week
                          ? 'bg-[#252A27] text-white shadow-[0_12px_30px_rgba(37,42,39,0.20)]'
                          : 'bg-white/60 text-stone-600 hover:bg-white'
                      }`}
                    >
                      {week}
                    </button>
                  ))}
                </div>
              </div>

              {visibleRows.length > 0 ? (
                <div className="overflow-hidden rounded-[32px] border border-white/70 bg-white/70 shadow-[0_24px_80px_rgba(49,43,34,0.10)] backdrop-blur-xl">
                  <div className="hidden grid-cols-[1.1fr_1fr_1fr_0.8fr_1fr] gap-4 border-b border-[#E8DFD0] px-5 py-4 text-xs font-semibold uppercase text-stone-400 sm:grid">
                    <span>날짜</span>
                    <span>이름</span>
                    <span>헌금종류</span>
                    <span>방식</span>
                    <span className="text-right">금액</span>
                  </div>
                  <div className="divide-y divide-[#E8DFD0]">
                    {visibleRows.map((item, index) => (
                      <div key={`${item.날짜}-${item.이름}-${item.헌금종류}-${index}`} className="grid gap-3 px-5 py-4 transition hover:bg-white/70 sm:grid-cols-[1.1fr_1fr_1fr_0.8fr_1fr] sm:items-center sm:gap-4">
                        <div>
                          <p className="text-sm font-medium text-stone-900">{item.날짜}</p>
                          <p className="text-xs text-stone-400 sm:hidden">{getWeekOfMonth(item.날짜)}</p>
                        </div>
                        <p className="font-semibold text-stone-900">{item.이름}</p>
                        <div>
                          <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ backgroundColor: `${COLORS[item.헌금종류] || '#8E938B'}20`, color: COLORS[item.헌금종류] || '#8E938B' }}>
                            {item.헌금종류}
                          </span>
                        </div>
                        <div>
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            item.결제방식 === '온라인'
                              ? 'bg-[#597D86]/12 text-[#597D86]'
                              : 'bg-[#758C6A]/12 text-[#53675B]'
                          }`}
                          >
                            {item.결제방식}
                          </span>
                        </div>
                        <p className="text-right text-base font-semibold text-stone-950 tabular-nums">{formatCurrency(item.금액)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-[32px] border border-dashed border-[#D9CCB9] bg-white/50 p-14 text-center">
                  <Search size={32} className="mx-auto mb-3 text-stone-300" />
                  <p className="text-stone-500">검색 결과가 없습니다</p>
                </div>
              )}
            </section>

            {expenses.length > 0 && (
              <section className="mb-8">
                <button
                  type="button"
                  onClick={() => setShowExpenses(!showExpenses)}
                  className="flex w-full items-center justify-between rounded-[32px] border border-white/70 bg-white/70 p-5 text-left shadow-[0_24px_80px_rgba(49,43,34,0.10)] backdrop-blur-xl transition hover:bg-white/75"
                >
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl bg-[#A35F5D]/12 p-3">
                      <Receipt size={20} className="text-[#A35F5D]" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-stone-950">지출 내역</h2>
                      <p className="text-sm text-stone-500">{expenses.length}건 · 총 {formatCurrency(totalExpenses)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-stone-500">
                    <span className="hidden text-sm sm:inline">{showExpenses ? '접기' : '펼치기'}</span>
                    {showExpenses ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </div>
                </button>

                {showExpenses && (
                  <div className="mt-4 overflow-hidden rounded-[32px] border border-white/70 bg-white/70 shadow-[0_24px_80px_rgba(49,43,34,0.10)] backdrop-blur-xl">
                    <div className="divide-y divide-[#E8DFD0]">
                      {expenses.map((expense, index) => (
                        <div
                          key={`${expense.내역}-${index}`}
                          className={`flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between ${expense.isFuel ? 'bg-[#B08D57]/10' : ''}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`rounded-2xl p-2.5 ${expense.isFuel ? 'bg-[#B08D57]/15' : 'bg-stone-100'}`}>
                              {expense.isFuel ? (
                                <Fuel size={18} className="text-[#B08D57]" />
                              ) : (
                                <Receipt size={18} className="text-stone-500" />
                              )}
                            </div>
                            <div>
                              <p className="font-semibold text-stone-900">{expense.내역}</p>
                              <div className="mt-1 flex items-center gap-2">
                                {expense.날짜 && <span className="text-xs text-stone-400">{expense.날짜}</span>}
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                  expense.결제방식 === '온라인'
                                    ? 'bg-[#597D86]/12 text-[#597D86]'
                                    : 'bg-[#758C6A]/12 text-[#53675B]'
                                }`}
                                >
                                  {expense.결제방식}
                                </span>
                              </div>
                            </div>
                          </div>
                          <p className="text-lg font-semibold text-[#A35F5D] tabular-nums">-{formatCurrency(expense.금액)}</p>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center justify-between border-t border-[#E8DFD0] bg-[#F8F4EC] p-5">
                      <span className="font-semibold text-stone-700">총 지출액</span>
                      <span className="text-2xl font-semibold text-[#A35F5D] tabular-nums">{formatCurrency(totalExpenses)}</span>
                    </div>
                  </div>
                )}
              </section>
            )}
          </>
        )}

        {!isLoading && data.length === 0 && !errorMsg && (
          <div className="grid min-h-[520px] place-items-center text-center">
            <div>
              <FileSpreadsheet size={48} className="mx-auto mb-4 text-stone-300" />
              <p className="text-lg font-medium text-stone-500">데이터가 없습니다</p>
            </div>
          </div>
        )}
      </main>

      <footer className="relative border-t border-white/40 bg-white/40">
        <div className="mx-auto max-w-7xl px-4 py-7 text-center sm:px-6">
          <p className="text-sm text-stone-400">운정그리스도의교회 © {new Date().getFullYear()}</p>
        </div>
      </footer>
    </div>
  );
}