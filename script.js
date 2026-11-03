// 주요 DOM 요소들을 변수로 참조
const sidoSelect = document.getElementById('sidoSelect'); // 시·도 선택 드롭다운
const trafficLightCard = document.getElementById('trafficLightCard'); // 공기 신호등 상단 카드
const summaryRegion = document.getElementById('summaryRegion'); // 지역 제목
const trafficEmoji = document.getElementById('trafficEmoji'); // 신호등 대표 이모지 (🔵🟢🟠🔴)
const trafficGradeText = document.getElementById('trafficGradeText'); // 대표 등급 텍스트 (좋음/보통/나쁨/매우나쁨)
const avgPm10 = document.getElementById('avgPm10'); // 평균 미세먼지 수치
const trafficAdvice = document.getElementById('trafficAdvice'); // 신호등 아래 한 줄 행동 요령 안내 문구
const cardGrid = document.getElementById('cardGrid'); // 측정소 카드 격자 컨테이너
const chartCard = document.getElementById('chartCard'); // 차트 카드 섹션
const chartTitle = document.getElementById('chartTitle'); // 차트 제목 요소

// Chart.js 인스턴스 전역 변수 (재렌더링 시 기존 차트 정리용)
let dustChartInstance = null;

// 측정소 카드용 등급별(1~4) 텍스트 및 CSS 클래스 매핑 설정
const CARD_GRADE_MAP = {
  '1': { label: '좋음', cardClass: 'card-good' },
  '2': { label: '보통', cardClass: 'card-normal' },
  '3': { label: '나쁨', cardClass: 'card-bad' },
  '4': { label: '매우나쁨', cardClass: 'card-very-bad' },
  'default': { label: '정보없음', cardClass: 'card-unknown' }
};

// 측정 시각을 '2026년 10월 28일 16시 기준' 형식의 자연스러운 한국어로 변환하는 함수
function formatKoreanTime(dataTimeString) {
  if (!dataTimeString) return '측정 시각 미제공';
  // "YYYY-MM-DD HH:mm" 형태의 정규식 매칭
  const match = dataTimeString.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
  if (match) {
    const [, year, month, day, hour] = match;
    return `${year}년 ${parseInt(month, 10)}월 ${parseInt(day, 10)}일 ${parseInt(hour, 10)}시 기준`;
  }
  return `${dataTimeString} 기준`;
}

// 평균 미세먼지 수치에 따라 신호등 대표 상태(이모지, 상태명, 안내문구, 테마)를 반환하는 함수
function getTrafficLightState(pm10Value) {
  if (pm10Value <= 30) {
    return {
      emoji: '🔵',
      gradeText: '좋음',
      advice: '공기가 맑아요! 산책이나 환기하기 좋은 날이에요.',
      themeClass: 'theme-good'
    };
  } else if (pm10Value <= 80) {
    return {
      emoji: '🟢',
      gradeText: '보통',
      advice: '무난한 공기질이에요. 일상 활동에 지장 없어요.',
      themeClass: 'theme-normal'
    };
  } else if (pm10Value <= 150) {
    return {
      emoji: '🟠',
      gradeText: '나쁨',
      advice: '외출 시 마스크를 챙기세요!',
      themeClass: 'theme-bad'
    };
  } else {
    return {
      emoji: '🔴',
      gradeText: '매우나쁨',
      advice: '외출 시 마스크를 챙기세요! 야외활동을 자제하세요.',
      themeClass: 'theme-very-bad'
    };
  }
}

// 데이터를 불러오는 동안 화면을 '불러오는 중...' 상태로 초기화하는 함수
function setLoadingState(sidoName) {
  summaryRegion.textContent = `${sidoName} 대기질`;
  trafficEmoji.textContent = '⏳';
  trafficGradeText.textContent = '불러오는 중...';
  avgPm10.textContent = '--';
  trafficAdvice.textContent = '불러오는 중...';
  trafficLightCard.className = 'traffic-light-card theme-loading';
  cardGrid.innerHTML = '<div class="message-box">데이터를 불러오는 중입니다...</div>';
  if (chartCard) chartCard.style.opacity = '0.5'; // 차트 영역 반투명 로딩 효과
}

// 백엔드 서버리스 함수(/api/dust)를 호출하여 대기오염 데이터를 받아오는 비동기 함수
async function fetchAirQualityData(sidoName) {
  const targetSido = sidoName || '서울';

  // 로딩 상태 화면 표시
  setLoadingState(targetSido);

  try {
    // Vercel 서버리스 엔드포인트 호출
    const requestUrl = `/api/dust?sido=${encodeURIComponent(targetSido)}`;
    const response = await fetch(requestUrl);

    // 404 등 HTTP 에러 시 사용자 친화적인 안내 메시지 제공
    if (!response.ok) {
      if (response.status === 404) {
        showNoticeMessage('백엔드 서버(/api/dust)를 찾을 수 없습니다. Vercel에 배포하거나 vercel dev 명령어로 로컬 서버를 실행해주세요.');
        return;
      }
      throw new Error(`서버 응답 오류 (HTTP ${response.status})`);
    }

    // JSON 데이터 파싱
    const data = await response.json();

    // 서버리스 함수에서 에러를 반환했을 경우 메시지 출력
    if (data.error) {
      showNoticeMessage(data.error);
      return;
    }

    // 측정소 데이터 목록 추출
    const items = data?.response?.body?.items;
    if (!items || items.length === 0) {
      showNoticeMessage(`'${targetSido}' 지역의 측정소 데이터가 없거나 점검 중입니다.`);
      return;
    }

    // 데이터 정상 수신 시 화면 렌더링
    renderAirQuality(targetSido, items);

  } catch (error) {
    console.error('API 호출 중 오류:', error);
    showNoticeMessage('서버와 통신하는 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.');
  }
}

// 가져온 측정 데이터를 분석하여 공기 신호등 및 측정소 카드를 렌더링하는 함수
function renderAirQuality(sidoName, items) {
  summaryRegion.textContent = `${sidoName} 대기질`;

  let totalPm10 = 0; // 유효 미세먼지 수치 누적 합
  let validCount = 0; // 유효 측정소 개수
  cardGrid.innerHTML = ''; // 기존 카드 초기화

  // 각 측정소별 카드를 순회하며 생성
  items.forEach(item => {
    const stationName = item.stationName || '측정소명 없음';
    // 측정 시각을 '2026년 10월 28일 16시 기준' 형태로 변환
    const koreanTime = formatKoreanTime(item.dataTime);

    // 미세먼지(PM10) 값 처리 ("-" 또는 유효하지 않은 값 제외)
    const rawPm10 = item.pm10Value;
    const isPm10Valid = rawPm10 && rawPm10.trim() !== '-' && !isNaN(Number(rawPm10));
    const pm10Display = isPm10Valid ? `${rawPm10} ㎍/㎥` : '측정 안 됨';

    // 초미세먼지(PM2.5) 값 처리
    const rawPm25 = item.pm25Value;
    const isPm25Valid = rawPm25 && rawPm25.trim() !== '-' && !isNaN(Number(rawPm25));
    const pm25Display = isPm25Valid ? `${rawPm25} ㎍/㎥` : '측정 안 됨';

    // 유효한 수치인 경우에만 평균 합산에 반영
    if (isPm10Valid) {
      totalPm10 += Number(rawPm10);
      validCount += 1;
    }

    // 측정소 등급 확인 및 은은한 테두리/배경 카드 클래스 매핑
    const gradeCode = item.pm10Grade ? String(item.pm10Grade).trim() : '';
    const gradeConfig = CARD_GRADE_MAP[gradeCode] || CARD_GRADE_MAP['default'];

    // 개별 측정소 카드 요소 생성
    const card = document.createElement('div');
    card.className = `station-card ${gradeConfig.cardClass}`;

    // 카드 내부 마크업
    card.innerHTML = `
      <div class="card-top">
        <h3 class="station-name">${stationName}</h3>
        <span class="station-badge">${gradeConfig.label}</span>
      </div>
      <div class="card-body">
        <div class="data-row">
          <span class="data-label">미세먼지 (PM10)</span>
          <span class="data-val">${pm10Display}</span>
        </div>
        <div class="data-row">
          <span class="data-label">초미세먼지 (PM2.5)</span>
          <span class="data-val">${pm25Display}</span>
        </div>
      </div>
      <div class="card-time">${koreanTime}</div>
    `;

    cardGrid.appendChild(card);
  });

  // 상단 공기 신호등 대표 상태 갱신
  if (validCount > 0) {
    const average = Math.round(totalPm10 / validCount);
    const trafficState = getTrafficLightState(average);

    // 대표 상태 이모지, 등급 텍스트, 평균 수치 반영
    trafficEmoji.textContent = trafficState.emoji;
    trafficGradeText.textContent = trafficState.gradeText;
    avgPm10.textContent = average;

    // 한 줄 행동 요령 안내 문구 반영 (나쁨 이상 시 '외출 시 마스크를 챙기세요')
    trafficAdvice.textContent = trafficState.advice;

    // 신호등 카드 전체 테마 클래스 반영 (은은한 배경 및 테두리 색)
    trafficLightCard.className = `traffic-light-card ${trafficState.themeClass}`;
  } else {
    trafficEmoji.textContent = '⚪';
    trafficGradeText.textContent = '정보없음';
    avgPm10.textContent = '--';
    trafficAdvice.textContent = '유효한 측정 수치가 없어 대기질 상태를 판별할 수 없습니다.';
    trafficLightCard.className = 'traffic-light-card theme-loading';
  }

  // 상위 10개 측정소 가로 막대그래프 렌더링 호출
  renderDustChart(sidoName, items);
}

// 등급에 일치하는 막대그래프 색상 반환 함수 (1 파랑 / 2 초록 / 3 주황 / 4 빨강)
function getBarColor(gradeCode, pm10Value) {
  if (gradeCode === '1' || pm10Value <= 30) return '#2563eb'; // 좋음 (파랑)
  if (gradeCode === '2' || pm10Value <= 80) return '#16a34a'; // 보통 (초록)
  if (gradeCode === '3' || pm10Value <= 150) return '#ea580c'; // 나쁨 (주황)
  return '#dc2626'; // 매우나쁨 (빨강)
}

// Chart.js를 사용하여 측정소별 미세먼지 수치를 가로 막대그래프로 렌더링하는 함수
function renderDustChart(sidoName, items) {
  const chartCanvas = document.getElementById('dustBarChart');
  if (!chartCanvas || typeof Chart === 'undefined') return;

  if (chartCard) chartCard.style.opacity = '1';

  // 1. '측정 안 됨'인 측정소 제외 ('-' 또는 유효하지 않은 숫자 필터링)
  const validList = items
    .filter(item => {
      const raw = item.pm10Value;
      return raw && raw.trim() !== '-' && !isNaN(Number(raw));
    })
    .map(item => ({
      stationName: item.stationName || '측정소',
      pm10Value: Number(item.pm10Value),
      pm10Grade: item.pm10Grade ? String(item.pm10Grade).trim() : ''
    }));

  // 유효한 측정소가 없을 경우 차트 숨김 처리
  if (validList.length === 0) {
    if (dustChartInstance) {
      dustChartInstance.destroy();
      dustChartInstance = null;
    }
    if (chartCard) chartCard.style.display = 'none';
    return;
  }

  if (chartCard) chartCard.style.display = 'block';
  if (chartTitle) chartTitle.textContent = `${sidoName} 미세먼지 농도 상위 10개 측정소`;

  // 2. 수치가 높은 순으로 내림차순 정렬
  validList.sort((a, b) => b.pm10Value - a.pm10Value);

  // 3. 상위 10개만 추출
  const top10 = validList.slice(0, 10);

  // 4. 차트 레이블(측정소명), 수치 데이터, 등급별 막대 색상 배열 추출
  const labels = top10.map(item => item.stationName);
  const dataValues = top10.map(item => item.pm10Value);
  const backgroundColors = top10.map(item => getBarColor(item.pm10Grade, item.pm10Value));

  // 기존 차트가 존재하면 메모리 누수 방지 및 갱신을 위해 파괴(destroy)
  if (dustChartInstance) {
    dustChartInstance.destroy();
  }

  // 5. Chart.js 인스턴스 생성 (indexAxis: 'y' 옵션으로 가로 막대그래프 구현)
  dustChartInstance = new Chart(chartCanvas, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: '미세먼지 (PM10)',
        data: dataValues,
        backgroundColor: backgroundColors,
        borderRadius: 6,
        barPercentage: 0.65
      }]
    },
    options: {
      indexAxis: 'y', // 가로 막대그래프 설정
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false // 단일 지표이므로 범례 숨김
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return ` 미세먼지: ${context.parsed.x} ㎍/㎥`;
            }
          }
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          title: {
            display: true,
            text: '농도 (㎍/㎥)',
            color: '#64748b',
            font: { family: 'Pretendard', size: 12, weight: 'bold' }
          },
          grid: {
            color: '#f1f5f9'
          },
          ticks: {
            color: '#64748b',
            font: { family: 'Pretendard', size: 11 }
          }
        },
        y: {
          ticks: {
            color: '#1e293b',
            font: { family: 'Pretendard', size: 12, weight: '600' }
          },
          grid: {
            display: false
          }
        }
      }
    }
  });
}

// 안내 메시지 화면 표시
function showNoticeMessage(message) {
  trafficEmoji.textContent = '⚠️';
  trafficGradeText.textContent = '안내';
  avgPm10.textContent = '--';
  trafficAdvice.textContent = '상태를 확인할 수 없습니다.';
  trafficLightCard.className = 'traffic-light-card theme-loading';
  cardGrid.innerHTML = `<div class="message-box">${message}</div>`;
  if (chartCard) chartCard.style.display = 'none'; // 에러 시 차트 숨김
}

// 지역 선택 드롭다운 변경 시 데이터 재조회
sidoSelect.addEventListener('change', (event) => {
  fetchAirQualityData(event.target.value);
});

// 페이지 첫 로딩 시 기본 지역(서울)으로 데이터 조회
window.addEventListener('DOMContentLoaded', () => {
  fetchAirQualityData(sidoSelect.value || '서울');
});
