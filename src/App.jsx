import { useState, useMemo, useEffect, useCallback } from 'react';
import { FileSpreadsheet, User, DollarSign, TrendingUp, ChevronLeft, ChevronRight, RefreshCw, AlertCircle, Wallet, CreditCard, Banknote, Church, Calendar, Search, X, ChevronDown, ChevronUp, Receipt, Fuel, MinusCircle } from 'lucide-react';
import Papa from 'papaparse';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell, AreaChart, Area } from 'recharts';

// --- 구글 시트 설정 ---
const SHEET_BASE_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSW5wXPoqAp90su9NGIwIojj3QbpUbPWGOArmUp1iykP-8vjcF1E7V_A_ExsAhNeA/pub";

// 2026년용 새 시트
const SHEET_2026_BASE_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vS9B_AT9_Cmokg5gAXHRzIkQFQMxzgutcEjP-ywamo0mpU7I4Ks6GV8zAzHaDxcLw/pub";

const SHEET_GIDS = {
  // 2024-2025 (기존 시트)
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
  
  // 2026년 (새 시트)
  '2026-01': 1362517380,
  '2026-02': 1026844391,
};

// 연도에 따라 base URL 선택
const getSheetBaseUrl = (monthKey) => {
  const year = parseInt(monthKey.split('-')[0]);
  return year >= 2026 ? SHEET_2026_BASE_URL : SHEET_BASE_URL;
};

const AVAILABLE_MONTHS = Object.keys(SHEET_GIDS).sort();
const OFFERING_TYPES = ['전체', '십일조', '주일헌금', '감사헌금', '선교헌금', '건축헌금', '기타헌금', '구역헌금'];

const COLORS = {
  십일조: '#4f6d7a',
  주일헌금: '#6b8e7a',
  감사헌금: '#c4a35a',
  선교헌금: '#8b7355',
  건축헌금: '#7a6b8e',
  기타헌금: '#5a8e8b',
  구역헌금: '#8e7a6b'
};

const GRADIENTS = {
  십일조: 'from-slate-600 to-slate-700',
  주일헌금: 'from-emerald-700 to-emerald-800',
  감사헌금: 'from-amber-600 to-amber-700',
  선교헌금: 'from-stone-600 to-stone-700',
  건축헌금: 'from-slate-500 to-slate-600',
  기타헌금: 'from-teal-700 to-teal-800',
  구역헌금: 'from-stone-500 to-stone-600'
};

// --- 유틸리티 함수 ---
const getWeekOfMonth = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  const day = date.getDate();
  const week = Math.ceil(day / 7);
  return `${week}주차`;
};

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(amount);
};

const formatCompactCurrency = (amount) => {
  if (amount >= 10000) {
    const man = Math.floor(amount / 10000);
    const chun = Math.floor((amount % 10000) / 1000);
    if (chun > 0) return `${man}만 ${chun}천원`;
    return `${man}만원`;
  }
  if (amount >= 1000) {
    const chun = Math.floor(amount / 1000);
    const rest = amount % 1000;
    if (rest > 0) return `${chun}천 ${rest}원`;
    return `${chun}천원`;
  }
  return `${amount}원`;
};

const getMonthDisplay = (monthKey) => {
  if (!monthKey) return '';
  const [year, month] = monthKey.split('-');
  return `${year}년 ${parseInt(month)}월`;
};

// --- 데이터 처리 함수 (헌금 + 지출 + 잔액) ---
const processData = (rawData, expectedMonth) => {
  if (!rawData || rawData.length === 0) return { offerings: [], expenses: [], balance: 0 };

  const offerings = [];
  const expenses = [];
  let balance = 0;
  
  const offeringKeywords = ['십일조', '주일헌금', '감사헌금', '선교헌금', '건축헌금', '기타헌금', '구역헌금'];
  const stopKeywords = ['지출 결의서', '지출결의서', '지출 내역', '지출내역'];
  const excludeKeywords = ['총 계', '현금+온라인', '이월금', '잔액', '보유금액', '실제', '검증용'];
  
  // 유류세 관련 키워드
  const fuelKeywords = ['유류세', 'LPG', '경유', '휘발유'];
  
  let dateRowIndex = -1;
  let yearMonth = expectedMonth || '';
  let expenseStartIndex = -1;
  
  // 날짜 행 찾기
  for (let i = 0; i < Math.min(rawData.length, 10); i++) {
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
  
  for (let i = 1; i < dateRow.length; i++) {
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
  
  // 헌금 데이터 파싱
  let currentOfferingType = '';
  
  for (let i = dateRowIndex + 1; i < rawData.length; i++) {
    const row = Object.values(rawData[i]);
    const firstCell = String(row[0] || '').trim();
    
    if (!firstCell) continue;
    
    const shouldStop = stopKeywords.some(keyword => firstCell.includes(keyword));
    if (shouldStop) {
      expenseStartIndex = i;
      break;
    }
    
    const shouldExclude = excludeKeywords.some(keyword => firstCell.includes(keyword));
    if (shouldExclude) continue;
    
    const isOfferingTypeRow = offeringKeywords.some(keyword => firstCell === keyword);
    
    if (isOfferingTypeRow) {
      currentOfferingType = firstCell;
      continue;
    }
    
    if (currentOfferingType && firstCell) {
      const name = firstCell;
      
      for (const dateCol of dateColumns) {
        const cellValue = row[dateCol.colIndex];
        if (cellValue) {
          const amountStr = String(cellValue).replace(/[^0-9]/g, '');
          const amount = parseInt(amountStr, 10);
          
          if (amount > 0) {
            offerings.push({
              날짜: dateCol.date,
              이름: name,
              헌금종류: currentOfferingType,
              금액: amount,
              결제방식: dateCol.type
            });
          }
        }
      }
    }
  }
  
  // 지출 데이터 파싱
  if (expenseStartIndex > 0) {
    let fuelTotal = 0;
    const expenseExcludeKeywords = ['지출 결의서', '지출결의서', '각 지출', '지출비', '예금이자'];
    
    // 지출 섹션에서 온라인/현금 열 인덱스 찾기
    let expenseOnlineCol = -1;
    let expenseCashCol = -1;
    
    for (let i = expenseStartIndex; i < Math.min(expenseStartIndex + 5, rawData.length); i++) {
      const row = Object.values(rawData[i]);
      for (let j = 0; j < row.length; j++) {
        const cell = String(row[j] || '').trim();
        if (cell === '온라인') expenseOnlineCol = j;
        if (cell === '현금') expenseCashCol = j;
      }
      if (expenseOnlineCol > 0 || expenseCashCol > 0) break;
    }
    
    for (let i = expenseStartIndex + 1; i < rawData.length; i++) {
      const row = Object.values(rawData[i]);
      const firstCell = String(row[0] || '').trim();
      const secondCell = String(row[1] || '').trim();
      
      if (!firstCell && !secondCell) continue;
      
      // 제외 키워드 체크
      const shouldExclude = expenseExcludeKeywords.some(keyword => 
        firstCell.includes(keyword) || secondCell.includes(keyword)
      );
      if (shouldExclude) continue;
      
      // 날짜 형식 체크 (11월 05일 등)
      const dateMatch = firstCell.match(/(\d{1,2})월\s*(\d{1,2})일/);
      
      if (dateMatch && secondCell) {
        const month = dateMatch[1].padStart(2, '0');
        const day = dateMatch[2].padStart(2, '0');
        const expenseDate = `${year}-${month}-${day}`;
        const description = secondCell;
        
        // 금액 찾기
        let amount = 0;
        let paymentType = '';
        
        // 온라인 열에서 금액 찾기
        if (expenseOnlineCol > 0) {
          const onlineAmount = String(row[expenseOnlineCol] || '').replace(/[^0-9-]/g, '');
          if (onlineAmount && parseInt(onlineAmount, 10) > 0) {
            amount = parseInt(onlineAmount, 10);
            paymentType = '온라인';
          }
        }
        
        // 현금 열에서 금액 찾기
        if (amount === 0 && expenseCashCol > 0) {
          const cashAmount = String(row[expenseCashCol] || '').replace(/[^0-9-]/g, '');
          if (cashAmount && parseInt(cashAmount, 10) > 0) {
            amount = parseInt(cashAmount, 10);
            paymentType = '현금';
          }
        }
        
        // 유류세 체크
        const isFuel = fuelKeywords.some(keyword => description.includes(keyword));
        
        if (amount > 0) {
          if (isFuel) {
            fuelTotal += amount;
          } else {
            expenses.push({
              날짜: expenseDate,
              내역: description,
              금액: amount,
              결제방식: paymentType
            });
          }
        }
      }
    }
    
    // 유류세 총합 추가
    if (fuelTotal > 0) {
      expenses.unshift({
        날짜: '',
        내역: '유류세 (총합)',
        금액: fuelTotal,
        결제방식: '온라인',
        isFuel: true
      });
    }
  }
  
  // 잔액 파싱 - 전체 데이터에서 "잔액" 찾기
  for (let i = 0; i < rawData.length; i++) {
    const row = Object.values(rawData[i]);
    const firstCell = String(row[0] || '').trim();
    
    if (firstCell === '잔액') {
      const balanceStr = String(row[1] || '').replace(/[^0-9]/g, '');
      balance = parseInt(balanceStr, 10) || 0;
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

// --- 커스텀 툴팁 ---
const CustomTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white text-stone-800 px-4 py-3 rounded-lg shadow-lg border border-stone-200">
        <p className="font-semibold">{payload[0].payload.name}</p>
        <p className="text-emerald-700 font-bold">{formatCurrency(payload[0].value)}</p>
      </div>
    );
  }
  return null;
};

// --- 메인 컴포넌트 ---
export default function App() {
  const [data, setData] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [balance, setBalance] = useState(0);
  const [currentMonth, setCurrentMonth] = useState('2026-01');
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
    
    // 연도에 따라 다른 base URL 사용
    const baseUrl = getSheetBaseUrl(monthKey);
    const url = `${baseUrl}?gid=${gid}&single=true&output=csv`;
    
    Papa.parse(url, {
      download: true,
      header: false,
      skipEmptyLines: false,
      complete: (results) => {
        if (results.data && results.data.length > 0) {
          const objData = results.data.map(row => {
            const obj = {};
            row.forEach((cell, idx) => { obj[idx] = cell; });
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
      }
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
    return data.filter(item => {
      const matchesType = selectedType === '전체' || item['헌금종류'] === selectedType;
      const matchesSearch = !searchTerm || item['이름'].includes(searchTerm);
      return matchesType && matchesSearch;
    });
  }, [data, selectedType, searchTerm]);

  // 총 지출액 계산
  const totalExpenses = useMemo(() => {
    return expenses.reduce((sum, item) => sum + item.금액, 0);
  }, [expenses]);

  const stats = useMemo(() => {
    const totalAmount = filteredData.reduce((sum, item) => sum + item['금액'], 0);
    const count = filteredData.length;
    
    const typeSummary = {};
    const paymentSummary = { 현금: 0, 온라인: 0 };
    const personSummary = {};
    const weekSummary = {};
    
    filteredData.forEach(item => {
      const type = item['헌금종류'];
      typeSummary[type] = (typeSummary[type] || 0) + item['금액'];
      paymentSummary[item['결제방식']] = (paymentSummary[item['결제방식']] || 0) + item['금액'];
      
      const person = item['이름'];
      if (!personSummary[person]) {
        personSummary[person] = { total: 0, types: {}, count: 0 };
      }
      personSummary[person].total += item['금액'];
      personSummary[person].count += 1;
      personSummary[person].types[type] = (personSummary[person].types[type] || 0) + item['금액'];
      
      const week = getWeekOfMonth(item['날짜']);
      weekSummary[week] = (weekSummary[week] || 0) + item['금액'];
    });
    
    const chartData = Object.keys(typeSummary)
      .map(key => ({ name: key, value: typeSummary[key], color: COLORS[key] || '#94a3b8' }))
      .sort((a, b) => b.value - a.value);

    const weekChartData = Object.keys(weekSummary)
      .sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0))
      .map(key => ({ name: key, value: weekSummary[key] }));

    const topDonors = Object.entries(personSummary)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    return { totalAmount, count, chartData, paymentSummary, topDonors, weekChartData, personSummary };
  }, [filteredData]);

  const changeMonth = (direction) => {
    const currentIndex = AVAILABLE_MONTHS.indexOf(currentMonth);
    const newIndex = currentIndex + direction;
    if (newIndex >= 0 && newIndex < AVAILABLE_MONTHS.length) {
      setCurrentMonth(AVAILABLE_MONTHS[newIndex]);
    }
  };

  const canGoBack = AVAILABLE_MONTHS.indexOf(currentMonth) > 0;
  const canGoForward = AVAILABLE_MONTHS.indexOf(currentMonth) < AVAILABLE_MONTHS.length - 1;

  return (
    <div className="min-h-screen bg-stone-50 font-sans text-stone-800">
      {/* 헤더 */}
      <header className="bg-white border-b border-stone-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col lg:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-stone-700 rounded-xl">
                <Church size={28} className="text-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-stone-800">
                  운정그리스도의교회
                </h1>
                <p className="text-sm text-stone-500 flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${data.length > 0 ? 'bg-emerald-500' : 'bg-red-400'}`}></span>
                  헌금 관리
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center bg-stone-100 rounded-xl p-1 border border-stone-200">
                <button 
                  onClick={() => changeMonth(-1)} 
                  disabled={!canGoBack}
                  className={`p-2.5 rounded-lg transition-all ${canGoBack ? 'hover:bg-white hover:shadow-sm text-stone-600' : 'opacity-30 cursor-not-allowed text-stone-400'}`}
                >
                  <ChevronLeft size={20} />
                </button>
                
                <div className="relative">
                  <button 
                    onClick={() => setShowMonthPicker(!showMonthPicker)}
                    className="px-4 sm:px-6 py-2 min-w-[130px] sm:min-w-[160px] text-center hover:bg-white rounded-lg transition-colors"
                  >
                    <p className="text-[10px] sm:text-xs text-stone-400 uppercase tracking-wider">조회 기간</p>
                    <p className="text-base sm:text-lg font-bold text-stone-700 flex items-center justify-center gap-1">
                      {getMonthDisplay(currentMonth)}
                      <ChevronDown size={16} className={`transition-transform text-stone-400 ${showMonthPicker ? 'rotate-180' : ''}`} />
                    </p>
                  </button>
                  
                  {showMonthPicker && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowMonthPicker(false)}></div>
                      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-white border border-stone-200 rounded-xl shadow-xl p-2 z-50 w-48 max-h-64 overflow-y-auto">
                        {AVAILABLE_MONTHS.slice().reverse().map((month) => (
                          <button
                            key={month}
                            onClick={() => { setCurrentMonth(month); setShowMonthPicker(false); }}
                            className={`w-full px-4 py-2.5 rounded-lg text-left transition-all ${
                              currentMonth === month 
                                ? 'bg-stone-700 text-white' 
                                : 'hover:bg-stone-100 text-stone-600'
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
                  onClick={() => changeMonth(1)} 
                  disabled={!canGoForward}
                  className={`p-2.5 rounded-lg transition-all ${canGoForward ? 'hover:bg-white hover:shadow-sm text-stone-600' : 'opacity-30 cursor-not-allowed text-stone-400'}`}
                >
                  <ChevronRight size={20} />
                </button>
              </div>

              <button 
                onClick={() => fetchGoogleSheet(currentMonth)}
                disabled={isLoading}
                className="p-2.5 bg-stone-100 hover:bg-white hover:shadow-sm rounded-xl border border-stone-200 transition-all"
              >
                <RefreshCw size={20} className={`text-stone-600 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {isLoading && (
          <div className="flex flex-col justify-center items-center py-32">
            <div className="w-12 h-12 border-4 border-stone-200 border-t-stone-600 rounded-full animate-spin"></div>
            <p className="mt-6 text-stone-500">데이터를 불러오는 중...</p>
          </div>
        )}

        {errorMsg && !isLoading && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-5 rounded-xl mb-8 flex items-center gap-4">
            <AlertCircle size={24} />
            <p>{errorMsg}</p>
          </div>
        )}

        {!isLoading && data.length > 0 && (
          <>
            {/* 상단 요약 카드 */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 mb-6 sm:mb-8">
              {/* 총 헌금액 */}
              <div className="col-span-2 lg:col-span-1 bg-stone-700 text-white p-5 sm:p-6 rounded-2xl">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-white/20 rounded-lg">
                    <DollarSign size={20} />
                  </div>
                  <p className="text-stone-200 text-sm">총 헌금액</p>
                </div>
                <h3 className="text-2xl sm:text-3xl font-bold">{formatCompactCurrency(stats.totalAmount)}</h3>
                <p className="text-stone-300 text-sm mt-2">{stats.count}건</p>
              </div>

              {/* 총 지출액 */}
              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-stone-200 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-1.5 bg-red-100 rounded-lg">
                    <MinusCircle size={18} className="text-red-600" />
                  </div>
                  <p className="text-stone-500 text-sm">총 지출액</p>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-red-600">{formatCompactCurrency(totalExpenses)}</h3>
                <p className="text-stone-400 text-xs mt-1">{expenses.length}건</p>
              </div>

              {/* 잔액 */}
              <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 p-4 sm:p-5 rounded-2xl shadow-lg">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-1.5 bg-white/20 rounded-lg">
                    <Wallet size={18} className="text-white" />
                  </div>
                  <p className="text-emerald-100 text-sm">잔액</p>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-white">
                  {formatCompactCurrency(balance)}
                </h3>
              </div>
            </div>

            {/* 현금/온라인 요약 */}
            <div className="grid grid-cols-2 gap-4 sm:gap-5 mb-6 sm:mb-8">
              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-stone-200 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-1.5 bg-emerald-100 rounded-lg">
                    <Banknote size={18} className="text-emerald-600" />
                  </div>
                  <p className="text-stone-500 text-sm">현금 헌금</p>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-stone-800">{formatCompactCurrency(stats.paymentSummary.현금 || 0)}</h3>
                <div className="mt-3 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${stats.totalAmount ? ((stats.paymentSummary.현금 || 0) / stats.totalAmount) * 100 : 0}%` }}></div>
                </div>
              </div>

              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-stone-200 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-1.5 bg-blue-100 rounded-lg">
                    <CreditCard size={18} className="text-blue-600" />
                  </div>
                  <p className="text-stone-500 text-sm">온라인 헌금</p>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-stone-800">{formatCompactCurrency(stats.paymentSummary.온라인 || 0)}</h3>
                <div className="mt-3 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: `${stats.totalAmount ? ((stats.paymentSummary.온라인 || 0) / stats.totalAmount) * 100 : 0}%` }}></div>
                </div>
              </div>
              {/* 참여 성도 */}
              <div className="bg-white p-4 sm:p-5 rounded-2xl border border-stone-200 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-1.5 bg-amber-100 rounded-lg">
                    <User size={18} className="text-amber-600" />
                  </div>
                  <p className="text-stone-500 text-sm">참여 성도</p>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-stone-800">{Object.keys(stats.personSummary).length}명</h3>
                <p className="text-stone-400 text-xs mt-1">{stats.chartData.length}개 종류</p>
              </div>
            </div>

            {/* 필터 */}
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-stone-200 shadow-sm mb-6 sm:mb-8">
              <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
                <div className="flex flex-wrap gap-2">
                  {OFFERING_TYPES.map((type) => (
                    <button
                      key={type}
                      onClick={() => setSelectedType(type)}
                      className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-sm font-medium transition-all ${
                        selectedType === type
                          ? 'bg-stone-700 text-white'
                          : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>

                <div className="relative w-full lg:w-auto">
                  <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                  <input
                    type="text"
                    placeholder="이름 검색..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full lg:w-56 pl-10 pr-10 py-2.5 bg-stone-50 border border-stone-200 rounded-lg text-stone-800 placeholder-stone-400 focus:outline-none focus:border-stone-400 focus:ring-1 focus:ring-stone-400 text-sm"
                  />
                  {searchTerm && (
                    <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600">
                      <X size={18} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* 차트 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6 mb-6 sm:mb-8">
              {/* 헌금 종류별 현황 */}
              <div className="lg:col-span-2 bg-gradient-to-br from-stone-50 to-stone-100 p-5 sm:p-6 rounded-2xl border border-stone-200 shadow-md">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                  <h3 className="text-lg font-bold text-stone-800 flex items-center gap-2">
                    <div className="p-2 bg-stone-700 rounded-lg">
                      <TrendingUp size={18} className="text-white" />
                    </div>
                    헌금 종류별 현황
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {stats.chartData.slice(0, 4).map((item, index) => (
                      <div key={index} className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-full border border-stone-200 shadow-sm">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }}></div>
                        <span className="text-xs font-medium text-stone-600">{item.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div className="bg-white rounded-xl p-4 shadow-inner border border-stone-100">
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stats.chartData} layout="vertical" margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                        <defs>
                          {stats.chartData.map((entry, index) => (
                            <linearGradient key={`gradient-${index}`} id={`barGradient-${index}`} x1="0" y1="0" x2="1" y2="0">
                              <stop offset="0%" stopColor={entry.color} stopOpacity={0.8}/>
                              <stop offset="100%" stopColor={entry.color} stopOpacity={1}/>
                            </linearGradient>
                          ))}
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#e7e5e4" />
                        <XAxis type="number" hide />
                        <YAxis 
                          dataKey="name" 
                          type="category" 
                          width={75} 
                          tick={{ fontSize: 12, fill: '#57534e', fontWeight: 500 }} 
                          axisLine={false} 
                          tickLine={false} 
                        />
                        <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(120, 113, 108, 0.1)' }} />
                        <Bar dataKey="value" radius={[0, 8, 8, 0]} barSize={28}>
                          {stats.chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={`url(#barGradient-${index})`} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* 종류별 금액 카드 */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
                  {stats.chartData.slice(0, 4).map((item, index) => (
                    <div 
                      key={index} 
                      className="bg-white rounded-xl p-3 border border-stone-200 shadow-sm hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                        <span className="text-xs font-medium text-stone-500">{item.name}</span>
                      </div>
                      <p className="text-lg font-bold text-stone-800">{formatCompactCurrency(item.value)}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* 주차별 추이 */}
              <div className="lg:col-span-2 bg-gradient-to-br from-stone-50 to-stone-100 p-5 sm:p-6 rounded-2xl border border-stone-200 shadow-md">
                <h3 className="text-lg font-bold text-stone-800 mb-6 flex items-center gap-2">
                  <div className="p-2 bg-emerald-600 rounded-lg">
                    <Calendar size={18} className="text-white" />
                  </div>
                  주차별 추이
                </h3>
                
                <div className="bg-white rounded-xl p-4 shadow-inner border border-stone-100">
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={stats.weekChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#059669" stopOpacity={0.4}/>
                            <stop offset="100%" stopColor="#059669" stopOpacity={0.05}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#d1d5db" vertical={false} />
                        <XAxis 
                          dataKey="name" 
                          tick={{ fontSize: 11, fill: '#57534e', fontWeight: 500 }} 
                          axisLine={false} 
                          tickLine={false} 
                        />
                        <YAxis hide />
                        <RechartsTooltip content={<CustomTooltip />} cursor={{ stroke: '#059669', strokeWidth: 1, strokeDasharray: '5 5' }} />
                        <Area 
                          type="monotone" 
                          dataKey="value" 
                          stroke="#059669" 
                          strokeWidth={3}
                          fill="url(#areaGradient)" 
                          dot={{ fill: '#059669', strokeWidth: 2, stroke: '#fff', r: 4 }}
                          activeDot={{ fill: '#059669', strokeWidth: 3, stroke: '#fff', r: 6 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* 주차별 금액 리스트 */}
                <div className="mt-5 space-y-2">
                  {stats.weekChartData.map((item, index) => (
                    <div 
                      key={index} 
                      className="bg-white rounded-xl p-4 shadow-inner border border-stone-100"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-stone-700">{item.name}</span>
                      </div>
                      <span className="text-sm font-bold text-emerald-700">{formatCompactCurrency(item.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 성도별 현황 */}
            <div className="bg-white p-5 sm:p-6 rounded-2xl border border-stone-200 shadow-sm mb-6 sm:mb-8">
              <h3 className="text-lg font-bold text-stone-800 mb-5 flex items-center gap-2">
                <User size={20} className="text-stone-500" />
                성도별 헌금 현황
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
                {stats.topDonors.map((donor, index) => (
                  <div key={index} className="p-4 rounded-xl bg-stone-50 border border-stone-100 hover:border-stone-300 transition-all">
                    <div className="w-10 h-10 rounded-full bg-stone-200 flex items-center justify-center text-stone-600 font-bold mb-2">
                      {donor.name.slice(0, 1)}
                    </div>
                    <p className="font-semibold text-stone-800 truncate">{donor.name}</p>
                    <p className="text-stone-400 text-xs">{donor.count}건</p>
                    <p className="text-emerald-700 font-bold mt-1">{formatCompactCurrency(donor.total)}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* 상세 내역 */}
            <div className="mb-6 sm:mb-8">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-5">
                <h3 className="text-xl font-bold text-stone-800 flex items-center gap-2">
                  <FileSpreadsheet size={20} className="text-stone-500" />
                  상세 내역
                </h3>
                <span className="bg-stone-100 text-stone-600 px-3 py-1.5 rounded-lg text-sm font-medium">
                  {filteredData.filter(item => selectedWeek === '전체' || getWeekOfMonth(item['날짜']) === selectedWeek).length}건
                </span>
              </div>

              {/* 주차 필터 */}
              {filteredData.length > 0 && (
                <div className="mb-5">
                  <div className="flex flex-wrap gap-2">
                    {(() => {
                      const existingWeeks = [...new Set(filteredData.map(item => getWeekOfMonth(item['날짜'])))];
                      const weekOptions = ['전체', '1주차', '2주차', '3주차', '4주차', '5주차'];
                      return weekOptions.filter(week => week === '전체' || existingWeeks.includes(week)).map((week) => (
                        <button
                          key={week}
                          onClick={() => setSelectedWeek(week)}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                            selectedWeek === week
                              ? 'bg-stone-600 text-white'
                              : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                          }`}
                        >
                          {week}
                        </button>
                      ));
                    })()}
                  </div>
                </div>
              )}

              {filteredData.length > 0 ? (
                <div className="space-y-6">
                  {OFFERING_TYPES.filter(type => type !== '전체').map((offeringType) => {
                    const typeData = filteredData.filter(item => {
                      const matchType = item['헌금종류'] === offeringType;
                      const matchWeek = selectedWeek === '전체' || getWeekOfMonth(item['날짜']) === selectedWeek;
                      return matchType && matchWeek;
                    });
                    
                    if (typeData.length === 0) return null;
                    
                    const typeTotal = typeData.reduce((sum, item) => sum + item['금액'], 0);
                    
                    const weekGroups = {};
                    typeData.forEach(item => {
                      const week = getWeekOfMonth(item['날짜']);
                      if (!weekGroups[week]) weekGroups[week] = [];
                      weekGroups[week].push(item);
                    });
                    
                    const sortedWeeks = Object.keys(weekGroups).sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0));
                    
                    return (
                      <div key={offeringType} className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 p-5 bg-stone-50 border-b border-stone-200">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-stone-600 flex items-center justify-center">
                              <Wallet size={18} className="text-white" />
                            </div>
                            <div>
                              <h4 className="text-lg font-bold text-stone-800">{offeringType}</h4>
                              <p className="text-sm text-stone-500">{typeData.length}건</p>
                            </div>
                          </div>
                          <p className="text-xl font-bold text-emerald-700">{formatCurrency(typeTotal)}</p>
                        </div>
                        
                        <div className="p-4 sm:p-5 space-y-5">
                          {sortedWeeks.map((week) => {
                            const weekData = weekGroups[week];
                            const weekTotal = weekData.reduce((sum, item) => sum + item['금액'], 0);
                            
                            return (
                              <div key={week} className="bg-stone-50 rounded-xl p-4 border border-stone-100">
                                <div className="flex justify-between items-center mb-4 pb-3 border-b border-stone-200">
                                  <div className="flex items-center gap-2">
                                    <Calendar size={16} className="text-stone-400" />
                                    <span className="font-semibold text-stone-700">{week}</span>
                                    <span className="text-stone-400 text-sm">({weekData.length}건)</span>
                                  </div>
                                  <span className="font-bold text-amber-700">{formatCurrency(weekTotal)}</span>
                                </div>
                                
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                                  {weekData.map((item, index) => (
                                    <div key={index} className="bg-white p-3 sm:p-4 rounded-lg border border-stone-200 hover:border-stone-300 transition-all">
                                      <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                          <div className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-sm font-bold text-stone-600">
                                            {item['이름'].slice(0, 1)}
                                          </div>
                                          <div>
                                            <p className="font-semibold text-stone-800">{item['이름']}</p>
                                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                                              item['결제방식'] === '온라인' 
                                                ? 'bg-blue-100 text-blue-700' 
                                                : 'bg-emerald-100 text-emerald-700'
                                            }`}>
                                              {item['결제방식']}
                                            </span>
                                          </div>
                                        </div>
                                        <span className="font-bold text-stone-800">{formatCurrency(item['금액'])}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-stone-50 rounded-2xl p-12 text-center border border-dashed border-stone-300">
                  <Search size={32} className="text-stone-300 mx-auto mb-3" />
                  <p className="text-stone-500">검색 결과가 없습니다</p>
                </div>
              )}
            </div>

            {/* 지출 내역 */}
            {expenses.length > 0 && (
              <div className="mb-6 sm:mb-8">
                <button
                  onClick={() => setShowExpenses(!showExpenses)}
                  className="w-full flex items-center justify-between p-5 bg-white rounded-2xl border border-stone-200 shadow-sm hover:bg-stone-50 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-red-100 rounded-xl">
                      <Receipt size={20} className="text-red-600" />
                    </div>
                    <div className="text-left">
                      <h3 className="text-lg font-bold text-stone-800">지출 내역</h3>
                      <p className="text-sm text-stone-500">{expenses.length}건 · 총 {formatCurrency(totalExpenses)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-stone-500">
                    <span className="text-sm">{showExpenses ? '접기' : '펼치기'}</span>
                    {showExpenses ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </div>
                </button>

                {showExpenses && (
                  <div className="mt-4 bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
                    <div className="divide-y divide-stone-100">
                      {expenses.map((expense, index) => (
                        <div 
                          key={index} 
                          className={`p-4 sm:p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 ${
                            expense.isFuel ? 'bg-amber-50' : ''
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${expense.isFuel ? 'bg-amber-100' : 'bg-stone-100'}`}>
                              {expense.isFuel ? (
                                <Fuel size={18} className="text-amber-600" />
                              ) : (
                                <Receipt size={18} className="text-stone-500" />
                              )}
                            </div>
                            <div>
                              <p className="font-semibold text-stone-800">{expense.내역}</p>
                              <div className="flex items-center gap-2 mt-1">
                                {expense.날짜 && (
                                  <span className="text-xs text-stone-400">{expense.날짜}</span>
                                )}
                                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                                  expense.결제방식 === '온라인' 
                                    ? 'bg-blue-100 text-blue-700' 
                                    : 'bg-emerald-100 text-emerald-700'
                                }`}>
                                  {expense.결제방식}
                                </span>
                              </div>
                            </div>
                          </div>
                          <p className="font-bold text-red-600 text-lg">-{formatCurrency(expense.금액)}</p>
                        </div>
                      ))}
                    </div>
                    
                    {/* 지출 총계 */}
                    <div className="p-5 bg-stone-50 border-t border-stone-200 flex justify-between items-center">
                      <span className="font-bold text-stone-700">총 지출액</span>
                      <span className="text-2xl font-bold text-red-600">{formatCurrency(totalExpenses)}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {!isLoading && data.length === 0 && !errorMsg && (
          <div className="text-center py-24">
            <FileSpreadsheet size={48} className="text-stone-300 mx-auto mb-4" />
            <p className="text-stone-500 text-lg">데이터가 없습니다</p>
          </div>
        )}
      </main>

      {/* 푸터 */}
      <footer className="border-t border-stone-200 mt-12 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 text-center">
          <p className="text-stone-400 text-sm">
            운정그리스도의교회 © {new Date().getFullYear()}
          </p>
        </div>
      </footer>
    </div>
  );
}