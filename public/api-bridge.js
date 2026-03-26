// ═══════════════════════════════════════════
//  GeoInvest — GeoWeather 프론트엔드 API 연동
//  v3: GeoWeather MVP 대시보드 전용
//
//  dashboard.html의 renderRiskBoard()가 핵심 렌더링 담당.
//  이 스크립트는 API 호출 + 보조 UI 업데이트만 수행.
// ═══════════════════════════════════════════

const API_BASE = ''; // 같은 도메인이면 빈 문자열

// ─── 1. 메인 데이터 로드 (/api/home) ───

async function loadHome() {
  try {
    const res = await fetch(`${API_BASE}/api/home`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // 리스크 보드 (핵심 — dashboard.html의 renderRiskBoard에 위임)
    if (data.riskBoard && typeof renderRiskBoard === 'function') {
      renderRiskBoard(data.riskBoard);
    }

    // 알림 배너 업데이트
    if (data.alerts?.length) {
      updateAlertBanner(data.alerts);
    }

    // 지역 카드 업데이트 (리스크 보드에서 보강)
    if (data.riskBoard) {
      updateRegionCards(data.riskBoard);
      updateTrendList(data.riskBoard);
    }

    // 사이드바 시간
    const sbTime = document.getElementById('sbTime');
    if (sbTime && data.updatedAt) {
      const t = new Date(data.updatedAt);
      sbTime.textContent = t.toLocaleString('ko-KR', {
        hour12: false, month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    }

    console.log(`[GeoWeather] 데이터 로드 완료 (${data.updatedAt})`);
  } catch (err) {
    console.warn('[GeoWeather] API 연결 실패 — 데모 데이터 유지:', err.message);
  }
}

// ─── 2. 알림 배너 업데이트 ───

function updateAlertBanner(alerts) {
  const banner = document.getElementById('alertBanner');
  if (!banner) return;

  // 가장 심각한 알림 선택
  const redAlerts = alerts.filter(a => a.level === 'red');
  const yellowAlerts = alerts.filter(a => a.level === 'yellow');
  const top = redAlerts[0] || yellowAlerts[0] || alerts[0];
  if (!top) return;

  const isRed = top.level === 'red';
  banner.className = isRed ? 'alert-banner' : 'alert-banner warn';

  const textEl = banner.querySelector('.alert-text');
  if (textEl) {
    const label = isRed ? '고위험 경보' : '주의 경보';
    const regions = [...new Set(alerts
      .filter(a => a.level === 'red' || a.level === 'yellow')
      .map(a => a.region)
      .filter(Boolean)
    )].slice(0, 3).join('·');

    textEl.innerHTML = `<strong>${label}</strong> — ${regions ? regions + ' 지역의 ' : ''}${top.text}`;
  }

  banner.style.display = 'flex';
}

// ─── 3. 지역 카드 동적 업데이트 ───

// 리스크 보드 데이터 → 지역 카드에 실시간 반영
const REGION_CARD_MAP = {
  'east-asia': { flag: '🌏', name: '동아시아' },
  'middle-east': { flag: '🌍', name: '중동' },
  'east-europe': { flag: '🇺🇦', name: '동유럽' },
  'south-asia': { flag: '🌏', name: '남아시아' },
  'africa': { flag: '🌍', name: '아프리카' },
  'latin-america': { flag: '🌎', name: '남미' },
  'north-america': { flag: '🇺🇸', name: '북미' },
  'west-europe': { flag: '🇪🇺', name: '서유럽' },
};

// DB region_key → 카드 key 매핑
const DB_TO_CARD_KEY = {
  '동아시아': 'east-asia',
  '중동': 'middle-east',
  '동유럽': 'east-europe',
  '남아시아': 'south-asia',
  '아프리카': 'africa',
  '남미': 'latin-america',
  '북미': 'north-america',
  '서유럽': 'west-europe',
  'east_asia': 'east-asia',
  'middle_east': 'middle-east',
  'eastern_europe': 'east-europe',
  'south_asia': 'south-asia',
  'africa': 'africa',
  'latin_america': 'latin-america',
  'north_america': 'north-america',
  'western_europe': 'west-europe',
};

function levelClass(score) { return score >= 90 ? 'lv-vh' : score >= 70 ? 'lv-h' : score >= 50 ? 'lv-m' : 'lv-l'; }
function levelKo(score) { return score >= 90 ? '매우 높음' : score >= 70 ? '높음' : score >= 50 ? '중간' : '낮음'; }
function cardClass(score) { return score >= 90 ? 'rc-vh' : score >= 70 ? 'rc-h' : score >= 50 ? 'rc-m' : 'rc-l'; }
function trendClass(d) { return d > 0 ? 't-up' : d < 0 ? 't-down' : 't-flat'; }
function trendStr(d) { return d > 0 ? '↗' : d < 0 ? '↘' : '—'; }

function updateRegionCards(board) {
  const grid = document.getElementById('regionGrid');
  if (!grid) return;

  // 모든 리스크 항목을 하나로 합침
  const all = [
    ...(board.ongoingConflicts || []),
    ...(board.warRisks || []),
    ...(board.globalRisks || []),
  ];

  // 지역별로 그룹핑 (같은 지역의 여러 항목 → 최고점 사용)
  const regionScores = {};
  for (const item of all) {
    const key = DB_TO_CARD_KEY[item.region_key] || DB_TO_CARD_KEY[item.label_ko];
    if (!key) continue;

    if (!regionScores[key] || item.total_score > regionScores[key].score) {
      regionScores[key] = {
        score: item.total_score,
        issues: regionScores[key]?.issues || [],
      };
    }
    if (item.label_ko) {
      regionScores[key].issues = regionScores[key].issues || [];
      if (!regionScores[key].issues.includes(item.label_ko)) {
        regionScores[key].issues.push(item.label_ko);
      }
    }
  }

  // 카드 HTML 갱신
  const keys = Object.keys(REGION_CARD_MAP);
  grid.innerHTML = keys.map(key => {
    const info = REGION_CARD_MAP[key];
    const data = regionScores[key] || { score: 30, issues: [] };
    const score = data.score;
    const issues = data.issues.slice(0, 3);
    // delta는 현재 API에 없으므로 0으로 표시
    const delta = 0;

    return `
      <div class="region-card ${cardClass(score)}" onclick="selectRegion('${key}')">
        <div class="rg-top">
          <div class="rg-info">
            <div class="rg-name">${info.flag} ${info.name}</div>
            <div class="rg-level ${levelClass(score)}">${levelKo(score)} <span class="rg-trend ${trendClass(delta)}">${trendStr(delta)}</span></div>
          </div>
          <div>
            <div class="rg-score ${levelClass(score)}">${score}</div>
            <div class="rg-score-sub">위험 지수</div>
          </div>
        </div>
        <div class="rg-issues">
          ${issues.map(i => `<div class="rg-issue">${i}</div>`).join('')}
        </div>
      </div>`;
  }).join('');
}

// ─── 4. 추세 리스트 업데이트 ───

function updateTrendList(board) {
  const list = document.getElementById('trendList');
  if (!list) return;

  const all = [
    ...(board.ongoingConflicts || []),
    ...(board.warRisks || []),
    ...(board.globalRisks || []),
  ];

  // 지역별 최고점 집계
  const regionMap = {};
  for (const item of all) {
    const labelKey = item.label_ko || item.region_key;
    if (!regionMap[labelKey] || item.total_score > regionMap[labelKey].score) {
      regionMap[labelKey] = {
        name: item.flag_emoji ? `${item.flag_emoji} ${item.label_ko}` : item.label_ko,
        score: item.total_score,
      };
    }
  }

  // 상위 5개
  const sorted = Object.values(regionMap)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  list.innerHTML = sorted.map((r, i) => {
    const lc = levelClass(r.score);
    const color = r.score >= 70 ? 'var(--red)' : r.score >= 50 ? 'var(--orange)' : 'var(--yellow)';
    return `
      <div class="trend-row">
        <span class="trend-rank">${i + 1}</span>
        <span class="trend-name">${r.name}</span>
        <div class="trend-bar"><div class="trend-bar-fill ${lc}" style="width:${r.score}%"></div></div>
        <span class="trend-score" style="color:${color}">${r.score}</span>
        <span class="trend-delta" style="color:var(--text3)">—</span>
      </div>`;
  }).join('');
}

// ─── 5. AI 분석 연동 (/api/ask-ai) ───
// 향후 대시보드에 AI 질의 기능 추가 시 사용

async function askAI_API(question) {
  try {
    const res = await fetch(`${API_BASE}/api/ask-ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('[GeoWeather] AI API 실패:', err.message);
    return null;
  }
}

// ─── 6. 구독 연동 (/api/subscribe) ───
// 향후 이메일 구독 UI 추가 시 사용

async function subscribe_API(email) {
  try {
    const res = await fetch(`${API_BASE}/api/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    return await res.json();
  } catch (err) {
    console.warn('[GeoWeather] 구독 API 실패:', err.message);
    return null;
  }
}

// ─── 7. 초기화 ───

document.addEventListener('DOMContentLoaded', () => {
  // 첫 로드
  loadHome();

  // 30초마다 자동 새로고침
  setInterval(loadHome, 30000);
});
