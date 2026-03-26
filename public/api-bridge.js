// ═══════════════════════════════════════════
//  GeoInvest — 프론트엔드 API 연동 스크립트
//  기존 HTML 대시보드의 하드코딩 데이터를
//  /api 엔드포인트 호출로 교체한다.
//
//  사용법: 기존 HTML의 <script> 블록 바로 위에
//         <script src="/api-bridge.js"></script> 추가
//
//  또는 이 내용을 기존 <script> 블록 맨 위에 붙여넣기
// ═══════════════════════════════════════════

const API_BASE = ''; // 같은 도메인이면 빈 문자열, 아니면 'https://your-api.vercel.app'

// ─── 1. 메인 데이터 로드 (/api/home) ───

async function loadHome() {
  try {
    const res = await fetch(`${API_BASE}/api/home`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // 시그널 카드 업데이트
    if (data.signals?.length) {
      renderSignals(data.signals);
    }

    // 뉴스 리스트 업데이트
    if (data.articles?.length) {
      renderNewsFromAPI(data.articles);
    }

    // 리스크 게이지 업데이트
    if (data.riskIndex != null) {
      updateGauge(data.riskIndex, data.riskDelta ?? null);
    }

    // 알림 업데이트
    if (data.alerts?.length) {
      renderAlerts(data.alerts);
    }

    // v2: 리스크 보드 업데이트 (3섹션 시스템)
    if (data.riskBoard && typeof renderRiskBoard === 'function') {
      renderRiskBoard(data.riskBoard);
    }

    console.log(`[GeoInvest] 홈 데이터 로드 완료 (${data.updatedAt})`);
  } catch (err) {
    console.warn('[GeoInvest] API 연결 실패 — 데모 데이터 유지:', err.message);
    // 실패 시 기존 하드코딩 데이터 그대로 유지
  }
}

// ─── 2. 시그널 카드 렌더 ───

function renderSignals(signals) {
  const grid = document.querySelector('.signals-grid');
  if (!grid) return;

  const urgencyMap = {
    critical: { cls: 's-red', badge: 'sb-red', icon: '🔴 긴급 주목' },
    opportunity: { cls: 's-green', badge: 'sb-green', icon: '🟢 수혜 기회' },
    monitor: { cls: 's-yellow', badge: 'sb-yellow', icon: '🟡 모니터링' },
  };

  grid.innerHTML = signals.slice(0, 3).map((s, i) => {
    const u = urgencyMap[s.urgency] || urgencyMap.monitor;
    const gain = (s.tickers_gain || []);
    const loss = (s.tickers_loss || []);

    return `
      <div class="signal-card ${u.cls}">
        <div class="signal-top">
          <span class="signal-num">시그널 0${i + 1}</span>
          <span class="signal-badge ${u.badge}">${u.icon}</span>
        </div>
        <div class="signal-headline">${s.title}</div>
        <div class="signal-impact">
          <div class="impact-col">
            <div class="impact-col-lbl lbl-gain">▲ 수혜</div>
            <div class="impact-pills">
              ${gain.length ? gain.map(t => `<span class="pill pill-gain">${t}</span>`).join('') : '<span class="pill" style="color:var(--text3)">없음</span>'}
            </div>
          </div>
          <div class="impact-col">
            <div class="impact-col-lbl lbl-loss">▼ 피해</div>
            <div class="impact-pills">
              ${loss.length ? loss.map(t => `<span class="pill pill-loss">${t}</span>`).join('') : '<span class="pill" style="color:var(--text3)">없음</span>'}
            </div>
          </div>
        </div>
        <div class="signal-sector">${(s.sectors || []).join(' · ')}</div>
      </div>`;
  }).join('');
}

// ─── 3. 뉴스 리스트 렌더 (API 데이터용) ───

const TAG_CLASS = {
  war: 't-war', trade: 't-trade', energy: 't-energy',
  market: 't-market', political: 't-pol',
};

const TAG_LABEL = {
  war: '전쟁', trade: '무역', energy: '에너지',
  market: '시장', political: '지정학',
};

function renderNewsFromAPI(articles) {
  const list = document.getElementById('newsList');
  if (!list) return;

  list.innerHTML = articles.map(a => {
    const tagCls = TAG_CLASS[a.risk_type] || 't-trade';
    const tagLbl = TAG_LABEL[a.risk_type] || a.risk_type || '뉴스';
    const gain = a.tickers_gain || [];
    const loss = a.tickers_loss || [];
    const timeAgo = getTimeAgo(a.published_at);

    return `
      <div class="ni" onclick="window.open('${a.url}','_blank')">
        <div class="ni-top">
          <span class="nt ${tagCls}">${tagLbl}</span>
          <span class="n-region">${a.region || ''}</span>
          <span class="n-time">${timeAgo}</span>
        </div>
        <div class="n-title">${a.title}</div>
        ${a.summary ? `<div class="n-summary"><span class="n-summary-lbl">AI 요약</span><span class="n-summary-txt">${a.summary}</span></div>` : ''}
        <div class="n-impact">
          <div class="n-ic">
            <div class="n-ic-lbl lbl-g">▲ 수혜</div>
            <div class="n-pills">${gain.length ? gain.map(s => `<span class="np np-g">${s}</span>`).join('') : '<span style="font-size:9px;color:var(--text3)">—</span>'}</div>
          </div>
          <div class="n-ic">
            <div class="n-ic-lbl lbl-r">▼ 피해</div>
            <div class="n-pills">${loss.length ? loss.map(s => `<span class="np np-r">${s}</span>`).join('') : '<span style="font-size:9px;color:var(--text3)">—</span>'}</div>
          </div>
          <div class="n-ic">
            <div class="n-ic-lbl lbl-s">업종 / 방향</div>
            <div class="horizon">${(a.sectors || []).join(' · ')}<br><span style="font-size:10px;color:var(--text2)">${a.impact_horizon || ''}</span></div>
          </div>
        </div>
      </div>`;
  }).join('');
}

function getTimeAgo(isoStr) {
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '방금';
  if (mins < 60) return `${mins}분 전`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}시간 전`;
  return `${Math.floor(hrs / 24)}일 전`;
}

// ─── 4. 리스크 게이지 업데이트 ───

function updateGauge(score, delta) {
  // 새 대시보드의 updateGaugeColor 함수 호출 (dashboard.html에 정의됨)
  if (typeof updateGaugeColor === 'function') {
    updateGaugeColor(score, delta);
    return;
  }
  // 폴백
  const circle = document.getElementById('gCircle');
  const numEl = document.getElementById('gNum') || document.querySelector('.g-num');
  const statusEl = document.getElementById('gStatus') || document.querySelector('.g-status');
  const deltaEl = document.getElementById('gDelta') || document.querySelector('.g-delta');

  if (numEl) numEl.textContent = String(score);

  if (circle) {
    const offset = 264 * (1 - score / 100);
    circle.style.strokeDashoffset = String(offset);
    if (score >= 70) { circle.style.stroke = '#e03e3e'; if(numEl) numEl.style.color = '#e03e3e'; }
    else if (score >= 30) { circle.style.stroke = '#d4880f'; if(numEl) numEl.style.color = '#d4880f'; }
    else { circle.style.stroke = '#0a8a3e'; if(numEl) numEl.style.color = '#0a8a3e'; }
  }

  if (statusEl) {
    if (score >= 70) { statusEl.textContent = '⚠ 위험 높음'; statusEl.style.color = '#e03e3e'; }
    else if (score >= 30) { statusEl.textContent = '◆ 보통'; statusEl.style.color = '#d4880f'; }
    else { statusEl.textContent = '✓ 안전'; statusEl.style.color = '#0a8a3e'; }
  }

  // 어제 대비 변화 표시
  if (deltaEl && delta != null) {
    const abs = Math.abs(delta);
    if (delta > 0) {
      deltaEl.textContent = `▲ +${abs} 어제보다`;
      deltaEl.style.color = '#e03e3e';
    } else if (delta < 0) {
      deltaEl.textContent = `▼ ${delta} 어제보다`;
      deltaEl.style.color = '#0a8a3e';
    } else {
      deltaEl.textContent = '— 어제와 동일';
      deltaEl.style.color = '#8b949e';
    }
    deltaEl.style.display = 'block';
  }
}

// ─── 5. 알림 업데이트 ───

function renderAlerts(alerts) {
  const box = document.getElementById('alerts');
  if (!box) return;

  const icons = { red: '🔴', yellow: '🟡', green: '🟢' };

  box.innerHTML = alerts.slice(0, 5).map(a => `
    <div class="al">
      <div class="al-i">${icons[a.level] || '🟡'}</div>
      <div class="al-t">${a.text}</div>
    </div>
  `).join('');
}

// ─── 6. AI 분석 연동 (/api/ask-ai) ───

async function askAI_API() {
  const input = document.getElementById('aiIn');
  const resp = document.getElementById('aiResp');
  const txt = document.getElementById('aiTxt');
  const q = input?.value?.trim();

  if (!q) return;

  resp.classList.add('on');
  txt.innerHTML = '<span style="color:var(--text3)">AI 분석 중...</span>';

  try {
    const res = await fetch(`${API_BASE}/api/ask-ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    let html = data.answer.replace(/\n/g, '<br>');

    if (data.relatedTickers?.length) {
      html += '<br><div style="margin-top:8px;display:flex;gap:4px;flex-wrap:wrap;">';
      data.relatedTickers.forEach(t => {
        html += `<span class="np np-g">${t}</span>`;
      });
      html += '</div>';
    }

    if (data.disclaimer) {
      html += `<div style="margin-top:8px;font-size:9px;color:var(--text3);">${data.disclaimer}</div>`;
    }

    txt.innerHTML = html;
  } catch (err) {
    console.warn('[GeoInvest] AI API 실패 — 데모 응답 사용:', err.message);
    throw err; // override의 .catch()에서 originalAskAI 호출
  }
}

// ─── 7. 구독 연동 (/api/subscribe) ───

async function subscribe_API() {
  const emailInput = document.getElementById('emailIn');
  const btn = document.getElementById('subBtn');
  const email = emailInput?.value?.trim();

  if (!email || !email.includes('@')) {
    emailInput.style.borderColor = 'var(--accent2)';
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    const data = await res.json();

    emailInput.style.borderColor = 'var(--accent3)';
    btn.textContent = '✓ 구독 완료!';
    btn.style.background = 'var(--accent3)';
  } catch (err) {
    console.warn('[GeoInvest] 구독 API 실패:', err.message);
    throw err; // override의 .catch()에서 originalSubscribe 호출
  }
}

// ─── 8. 지역 필터 연동 (/api/news?region=...) ───

async function filterByRegion(region) {
  try {
    const res = await fetch(`${API_BASE}/api/news?region=${encodeURIComponent(region)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (data.articles?.length) {
      renderNewsFromAPI(data.articles);
    }
  } catch (err) {
    console.warn('[GeoInvest] 뉴스 필터 실패:', err.message);
  }
}

// ─── 9. 초기화 — 기존 함수 오버라이드 ───

// 페이지 로드 시 API 데이터로 교체 시도
document.addEventListener('DOMContentLoaded', () => {
  loadHome();

  // 기존 askAI 함수를 API 버전으로 교체
  // (기존 데모 함수는 폴백으로 유지)
  const originalAskAI = window.askAI;
  window.askAI = function () {
    askAI_API().catch(() => {
      if (originalAskAI) originalAskAI();
    });
  };

  // 기존 subscribe 함수를 API 버전으로 교체
  const originalSubscribe = window.subscribe;
  window.subscribe = function () {
    subscribe_API().catch(() => {
      if (originalSubscribe) originalSubscribe();
    });
  };

  // 기존 sel 함수에 API 필터 추가
  const originalSel = window.sel;
  window.sel = function (el, region) {
    if (originalSel) originalSel(el, region);
    filterByRegion(region);
  };

  // 30초마다 자동 새로고침
  setInterval(loadHome, 30000);
});
