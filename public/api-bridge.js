// ═══════════════════════════════════════════
//  GeoRisk — 프론트엔드 API 브릿지
//  v4: 이벤트 중심 GeoRisk 대시보드 전용
// ═══════════════════════════════════════════

const API_BASE = '';

// ─── 1. 메인 데이터 로드 ───

async function loadHome() {
  try {
    const res = await fetch(`${API_BASE}/api/home`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // 핵심: renderRiskBoard는 dashboard.html 내부에 정의
    if (data.riskBoard && typeof renderRiskBoard === 'function') {
      renderRiskBoard(data.riskBoard);
    }

    // 알림 배너
    if (data.alerts?.length) {
      updateAlertBanner(data.alerts);
    }

    // Hot Issues 카드 업데이트 (API 데이터 있을 때)
    if (data.riskBoard) {
      updateHotGrid(data.riskBoard);
      updateCompactRegionGrid(data.riskBoard);
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

    console.log('[GeoRisk] 데이터 로드 완료:', data.updatedAt);
  } catch (err) {
    console.warn('[GeoRisk] API 연결 실패 — 데모 데이터 유지:', err.message);
  }
}

// ─── 2. 알림 배너 ───

function updateAlertBanner(alerts) {
  const banner = document.getElementById('alertBanner');
  if (!banner) return;
  const redAlerts = alerts.filter(a => a.level === 'red');
  const top = redAlerts[0] || alerts[0];
  if (!top) return;
  const isRed = top.level === 'red';
  banner.className = isRed ? 'alert-banner' : 'alert-banner warn';
  const textEl = banner.querySelector('.alert-text');
  if (textEl) {
    const regions = [...new Set(
      alerts.filter(a => a.level === 'red' || a.level === 'yellow')
        .map(a => a.region).filter(Boolean)
    )].slice(0, 3).join('·');
    const label = isRed ? '고위험 경보' : '주의 경보';
    textEl.innerHTML = `<strong>${label}</strong> — ${regions ? regions + ' 지역의 ' : ''}${top.text}`;
  }
  banner.style.display = 'flex';
}

// ─── 3. Hot Issues 카드 업데이트 ───

// 이미지 시드 매핑 (지역별 일관된 이미지)
const IMG_SEEDS = {
  middle_east: 'conflict11',
  east_asia: 'military22',
  eastern_europe: 'europe33',
  south_asia: 'asia44',
  africa: 'africa55',
  latin_america: 'latam66',
  north_america: 'northam77',
  western_europe: 'westeu88',
};

function updateHotGrid(board) {
  const grid = document.getElementById('hotGrid');
  if (!grid) return;

  const all = [
    ...(board.ongoingConflicts || []),
    ...(board.warRisks || []),
  ].sort((a, b) => (b.total_score || 0) - (a.total_score || 0)).slice(0, 4);

  if (all.length === 0) return;

  grid.innerHTML = all.map(item => {
    const lc = levelClass(item.total_score);
    const tc = trendClass(item.delta || 0);
    const trend = item.delta > 0 ? `↗ +${item.delta}` : item.delta < 0 ? `↘ ${item.delta}` : '— 유지';
    const seed = IMG_SEEDS[item.region_key] || 'geo' + Math.abs(hashCode(item.region_key || 'default') % 99);
    const imgUrl = `https://picsum.photos/seed/${seed}/600/300`;
    return `
      <div class="hot-card" onclick="selectEvent('${item.region_key}')">
        <div class="hot-img" style="background-image:url(${imgUrl})">
          <span class="hot-img-tag ${lc}">${levelKo(item.total_score)}</span>
          <span class="hot-img-trend ${tc}">${trend}</span>
        </div>
        <div class="hot-content">
          <div class="hot-meta">
            <span class="hot-region">${item.label_ko || item.region_key}</span>
            <span class="hot-dot"></span>
            <span class="hot-time">방금 업데이트</span>
          </div>
          <div class="hot-title">${item.label_ko || '이슈'}</div>
          <div class="hot-summary">${item.summary_ko || ''}</div>
        </div>
      </div>`;
  }).join('');
}

// ─── 4. 컴팩트 지역 그리드 업데이트 ───

const REGION_MAP = {
  east_asia:      { flag: '🌏', name: '동아시아', key: 'east-asia' },
  middle_east:    { flag: '🌍', name: '중동',     key: 'middle-east' },
  eastern_europe: { flag: '🇺🇦', name: '동유럽',  key: 'east-europe' },
  south_asia:     { flag: '🌏', name: '남아시아', key: 'south-asia' },
  africa:         { flag: '🌍', name: '아프리카', key: 'africa' },
  latin_america:  { flag: '🌎', name: '남미',     key: 'latin-america' },
  north_america:  { flag: '🇺🇸', name: '북미',    key: 'north-america' },
  western_europe: { flag: '🇪🇺', name: '서유럽',  key: 'west-europe' },
};

function updateCompactRegionGrid(board) {
  const grid = document.getElementById('regionGrid');
  if (!grid) return;

  const all = [
    ...(board.ongoingConflicts || []),
    ...(board.warRisks || []),
    ...(board.globalRisks || []),
  ];

  // region_key별 최고 점수 수집
  const byRegion = {};
  for (const item of all) {
    const rk = item.region_key;
    if (!rk) continue;
    if (!byRegion[rk] || item.total_score > byRegion[rk].score) {
      byRegion[rk] = { score: item.total_score, topEvent: item.label_ko || '' };
    }
  }

  const order = Object.keys(REGION_MAP);
  grid.innerHTML = order.map(rk => {
    const info = REGION_MAP[rk];
    const data = byRegion[rk] || { score: 25, topEvent: '안정적' };
    const score = data.score;
    const lc = levelClass(score);
    return `
      <div class="compact-card ${lc.replace('lv-','rc-')}" onclick="selectRegion('${info.key}')">
        <div class="cc-top">
          <div class="cc-name">${info.flag} ${info.name}</div>
          <div class="cc-score-wrap">
            <div class="cc-score ${lc}">${score}</div>
            <div class="cc-level">${levelKo(score)}</div>
          </div>
        </div>
        <div class="cc-event">${data.topEvent}</div>
        <div class="cc-bar"><div class="cc-fill ${lc}" style="width:${score}%"></div></div>
      </div>`;
  }).join('');
}

// ─── 유틸 ───

function levelClass(s) { return s >= 90 ? 'lv-vh' : s >= 70 ? 'lv-h' : s >= 50 ? 'lv-m' : 'lv-l'; }
function levelKo(s) { return s >= 90 ? '매우 높음' : s >= 70 ? '높음' : s >= 50 ? '중간' : '낮음'; }
function trendClass(d) { return d > 0 ? 't-up' : d < 0 ? 't-down' : 't-flat'; }
function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = Math.imul(31, h) + str.charCodeAt(i) | 0; }
  return h;
}

// ─── AI / 구독 API (향후 사용) ───

async function askAI_API(question) {
  try {
    const res = await fetch(`${API_BASE}/api/ask-ai`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    });
    return await res.json();
  } catch (e) { return null; }
}

async function subscribe_API(email) {
  try {
    const res = await fetch(`${API_BASE}/api/subscribe`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    return await res.json();
  } catch (e) { return null; }
}

// ─── 초기화 ───

document.addEventListener('DOMContentLoaded', () => {
  loadHome();
  setInterval(loadHome, 30000); // 30초마다 자동 갱신
});
