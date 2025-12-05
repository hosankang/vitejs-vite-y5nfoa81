import React, { useState, useMemo, useEffect } from 'react';
import {
  Upload,
  FileSpreadsheet,
  Calendar,
  User,
  DollarSign,
  PieChart,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  Link as LinkIcon,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import * as XLSX from 'xlsx';
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
} from 'recharts';

// --- 사용자 제공 기본 CSV 링크 ---
const DEFAULT_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vSW5wXPoqAp90su9NGIwIojj3QbpUbPWGOArmUp1iykP-8vjcF1E7V_A_ExsAhNeA/pub?output=csv';

const OFFERING_TYPES = [
  '전체',
  '십일조',
  '주일헌금',
  '감사헌금',
  '선교헌금',
  '건축헌금',
  '기타헌금',
];
const COLORS = [
  '#6366f1',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
];

// --- 유틸리티 함수 ---
const getWeekOfMonth = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  const day = date.getDate();
  const week = Math.ceil(day / 7);
  return `${date.getMonth() + 1}월 ${week}주차`;
};

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
  }).format(amount);
};

export default function App() {
  const [data, setData] = useState([]);
  const [fileName, setFileName] = useState('');
  const [currentMonth, setCurrentMonth] = useState(''); // 데이터 로드 후 자동 설정
  const [selectedType, setSelectedType] = useState('전체');
  const [sheetUrl, setSheetUrl] = useState(DEFAULT_SHEET_URL);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // --- 스마트 데이터 처리 (컬럼명 추론) ---
  const processData = (rawData) => {
    if (!rawData || rawData.length === 0) return [];

    // 1. 헤더(키) 찾기
    const keys = Object.keys(rawData[0]);

    // 컬럼명 매핑 도우미
    const findKey = (keywords) =>
      keys.find((k) => keywords.some((keyword) => k.includes(keyword)));

    const dateKey = findKey(['날짜', '일자', 'Date', 'date', '주차']);
    const nameKey = findKey(['이름', '성명', 'Name', 'name', '성도']);
    const typeKey = findKey(['헌금', '종류', '비목', 'Type', '내역']);
    const amountKey = findKey(['금액', '수입', 'Amount', '헌금액']);

    const processed = rawData
      .map((row) => {
        // 날짜 처리
        let dateVal = row[dateKey] ? String(row[dateKey]).trim() : '2025-01-01';
        // 엑셀 날짜 시리얼 번호 처리 (예: 45290 -> 2024-01-01)
        if (!isNaN(dateVal) && Number(dateVal) > 40000) {
          const dateObj = new Date(
            (Number(dateVal) - (25567 + 2)) * 86400 * 1000
          );
          dateVal = dateObj.toISOString().split('T')[0];
        }

        return {
          날짜: dateVal,
          이름: row[nameKey] || '익명',
          헌금종류: row[typeKey] || '기타헌금',
          금액:
            Number(String(row[amountKey] || '0').replace(/[^0-9]/g, '')) || 0,
        };
      })
      .filter((row) => row.금액 > 0);

    return processed;
  };

  // 구글 시트 데이터 가져오기
  const fetchGoogleSheet = (url) => {
    setIsLoading(true);
    setErrorMsg('');

    Papa.parse(url, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.data && results.data.length > 0) {
          const processed = processData(results.data);
          setData(processed);
          setFileName('구글 스프레드시트 (자동연동)');

          // 가장 최근 날짜의 달로 초기 설정
          if (processed.length > 0) {
            const lastDate = processed[processed.length - 1]['날짜'];
            if (lastDate.length >= 7) setCurrentMonth(lastDate.substring(0, 7));
            else setCurrentMonth('2025-12');
          }
        } else {
          setErrorMsg('데이터를 불러왔지만 내용이 비어있습니다.');
        }
        setIsLoading(false);
      },
      error: (err) => {
        console.error(err);
        setErrorMsg('데이터를 불러오지 못했습니다. 링크를 확인해주세요.');
        setIsLoading(false);
      },
    });
  };

  // 앱 시작 시 자동 로드
  useEffect(() => {
    fetchGoogleSheet(DEFAULT_SHEET_URL);
  }, []);

  // 엑셀 파일 업로드 핸들러 (백업용)
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const jsonData = XLSX.utils.sheet_to_json(ws);
      const processed = processData(jsonData);
      setData(processed);
      if (processed.length > 0) {
        const lastDate = processed[processed.length - 1]['날짜'];
        if (lastDate.length >= 7) setCurrentMonth(lastDate.substring(0, 7));
      }
    };
    reader.readAsBinaryString(file);
  };

  // --- 데이터 필터링 및 통계 ---
  const filteredData = useMemo(() => {
    if (data.length === 0) return [];
    return data.filter((item) => {
      const itemDate = String(item['날짜']);
      const matchesMonth = currentMonth
        ? itemDate.startsWith(currentMonth)
        : true;
      const matchesType =
        selectedType === '전체' || item['헌금종류'] === selectedType;
      return matchesMonth && matchesType;
    });
  }, [data, currentMonth, selectedType]);

  const stats = useMemo(() => {
    const totalAmount = filteredData.reduce(
      (sum, item) => sum + item['금액'],
      0
    );
    const count = filteredData.length;

    const typeSummary = {};
    filteredData.forEach((item) => {
      const type = item['헌금종류'] || '기타';
      typeSummary[type] = (typeSummary[type] || 0) + item['금액'];
    });

    // 차트 데이터 정렬 (금액순)
    const chartData = Object.keys(typeSummary)
      .map((key, index) => ({
        name: key,
        value: typeSummary[key],
        color: COLORS[index % COLORS.length],
      }))
      .sort((a, b) => b.value - a.value);

    return { totalAmount, count, chartData };
  }, [filteredData]);

  // 월 변경
  const changeMonth = (direction) => {
    if (!currentMonth) return;
    const [year, month] = currentMonth.split('-').map(Number);
    const date = new Date(year, month - 1 + direction, 1);
    const newYear = date.getFullYear();
    const newMonth = String(date.getMonth() + 1).padStart(2, '0');
    setCurrentMonth(`${newYear}-${newMonth}`);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800">
      {/* --- 헤더 --- */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600 rounded-lg text-white">
              <FileSpreadsheet size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                교회 재정 뷰어
              </h1>
              <p className="text-xs text-slate-500 flex items-center gap-1">
                <span
                  className={`w-2 h-2 rounded-full ${
                    data.length > 0 ? 'bg-green-500' : 'bg-red-500'
                  }`}
                ></span>
                {fileName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 flex-wrap justify-end">
            {/* 월 선택기 */}
            <div className="flex items-center bg-slate-100 rounded-full px-2 py-1">
              <button
                onClick={() => changeMonth(-1)}
                className="p-2 hover:bg-slate-200 rounded-full transition"
              >
                <ChevronLeft size={20} />
              </button>
              <span className="mx-4 font-semibold text-lg w-24 text-center tabular-nums">
                {currentMonth || '---- --'}
              </span>
              <button
                onClick={() => changeMonth(1)}
                className="p-2 hover:bg-slate-200 rounded-full transition"
              >
                <ChevronRight size={20} />
              </button>
            </div>

            <button
              onClick={() => fetchGoogleSheet(sheetUrl)}
              disabled={isLoading}
              className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition"
              title="새로고침"
            >
              <RefreshCw
                size={20}
                className={isLoading ? 'animate-spin' : ''}
              />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* --- 로딩 및 에러 상태 --- */}
        {isLoading && (
          <div className="flex justify-center items-center py-20">
            <div className="animate-bounce mr-2 text-indigo-600">●</div>
            <div className="animate-bounce mr-2 delay-100 text-indigo-600">
              ●
            </div>
            <div className="animate-bounce delay-200 text-indigo-600">●</div>
            <span className="ml-2 text-slate-500">
              데이터를 불러오는 중입니다...
            </span>
          </div>
        )}

        {errorMsg && (
          <div className="bg-red-50 border border-red-200 text-red-600 p-4 rounded-xl mb-6 flex items-center gap-3">
            <AlertCircle size={24} />
            <p>{errorMsg}</p>
          </div>
        )}

        {!isLoading && data.length === 0 && !errorMsg && (
          <div className="text-center py-20 text-slate-400">
            데이터가 없습니다. 구글 시트 링크를 확인해주세요.
          </div>
        )}

        {/* --- 메인 콘텐츠 --- */}
        {!isLoading && data.length > 0 && (
          <>
            {/* 요약 카드 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
                <div>
                  <p className="text-slate-500 text-sm font-medium mb-1">
                    {selectedType} 총 합계
                  </p>
                  <h3 className="text-3xl font-bold text-slate-900 tracking-tight">
                    {formatCurrency(stats.totalAmount)}
                  </h3>
                </div>
                <div className="w-12 h-12 bg-green-100 text-green-600 rounded-xl flex items-center justify-center">
                  <DollarSign size={24} />
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
                <div>
                  <p className="text-slate-500 text-sm font-medium mb-1">
                    총 헌금 건수
                  </p>
                  <h3 className="text-3xl font-bold text-slate-900 tracking-tight">
                    {stats.count}{' '}
                    <span className="text-lg font-normal text-slate-400">
                      건
                    </span>
                  </h3>
                </div>
                <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
                  <User size={24} />
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-center">
                <p className="text-slate-500 text-sm font-medium mb-3">
                  헌금 구성비
                </p>
                <div className="h-4 flex rounded-full overflow-hidden w-full bg-slate-100 mb-3">
                  {stats.chartData.map((entry, idx) => (
                    <div
                      key={idx}
                      style={{
                        width: `${(entry.value / stats.totalAmount) * 100}%`,
                        backgroundColor: entry.color,
                      }}
                      title={`${entry.name}: ${formatCurrency(entry.value)}`}
                    />
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {stats.chartData.slice(0, 4).map((d, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-1.5 text-xs text-slate-500"
                    >
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ background: d.color }}
                      ></div>
                      <span>{d.name}</span>
                      <span className="font-semibold text-slate-700">
                        {Math.round((d.value / stats.totalAmount) * 100)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 차트 및 필터 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
              <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                  <PieChart size={20} className="text-indigo-500" /> 종류별 헌금
                  현황
                </h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={stats.chartData}
                      layout="vertical"
                      margin={{ top: 0, right: 30, left: 40, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        horizontal={true}
                        vertical={false}
                        stroke="#f1f5f9"
                      />
                      <XAxis type="number" hide />
                      <YAxis
                        dataKey="name"
                        type="category"
                        width={80}
                        tick={{ fontSize: 12, fill: '#64748b' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <RechartsTooltip
                        formatter={(value) => formatCurrency(value)}
                        contentStyle={{
                          borderRadius: '12px',
                          border: 'none',
                          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                        }}
                      />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={24}>
                        {stats.chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <Filter size={20} className="text-indigo-500" /> 보기 설정
                </h3>
                <div className="space-y-3">
                  <p className="text-sm text-slate-500 font-medium">
                    헌금 종류 선택
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {OFFERING_TYPES.map((type) => (
                      <button
                        key={type}
                        onClick={() => setSelectedType(type)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                          selectedType === type
                            ? 'bg-indigo-600 text-white shadow-md'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* 상세 리스트 (카드 그리드) */}
            <div>
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-slate-800">
                  {currentMonth} {selectedType} 상세 내역
                </h3>
                <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-xs font-semibold">
                  총 {filteredData.length}건
                </span>
              </div>

              {filteredData.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filteredData.map((item, index) => (
                    <div
                      key={index}
                      className="bg-white p-5 rounded-xl shadow-sm border border-slate-100 hover:border-indigo-200 hover:shadow-md transition group"
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold
                            ${
                              index % 3 === 0
                                ? 'bg-indigo-50 text-indigo-600'
                                : index % 3 === 1
                                ? 'bg-emerald-50 text-emerald-600'
                                : 'bg-amber-50 text-amber-600'
                            }
                          `}
                          >
                            {item['이름'].slice(0, 1)}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900">
                              {item['이름']}
                            </p>
                            <p className="text-xs text-slate-500">
                              {item['헌금종류']}
                            </p>
                          </div>
                        </div>
                        <span className="text-[11px] font-medium px-2 py-1 bg-slate-50 text-slate-500 rounded border border-slate-100">
                          {getWeekOfMonth(item['날짜'])}
                        </span>
                      </div>
                      <div className="flex justify-between items-baseline border-t border-slate-50 pt-3 mt-1">
                        <span className="text-xs text-slate-400 font-mono">
                          {item['날짜']}
                        </span>
                        <span className="text-lg font-bold text-slate-800">
                          {formatCurrency(item['금액'])}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-slate-50 rounded-xl p-12 text-center border border-dashed border-slate-200">
                  <p className="text-slate-400 mb-1">
                    해당 조건의 헌금 내역이 없습니다.
                  </p>
                  <p className="text-xs text-slate-300">
                    날짜나 헌금 종류를 변경해보세요.
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
