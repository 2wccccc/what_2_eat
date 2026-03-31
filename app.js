/* ══════════════════════════════════════
   吃什麼？— app.js
   ══════════════════════════════════════ */

const GKEY       = 'AIzaSyAf96oPZjdLci_LV74k4DzvjgaHSsGTFW8';
const WORKER_URL = 'https://what2eat.evan34021.workers.dev';

const state = {
  ai:     { lat: null, lng: null, transport: '步行', meal: '早餐', budget: 300 },
  search: { lat: null, lng: null, transport: '步行', meal: '早餐', budget: 300 }
};
const TRAVEL_MODE = { '步行': 'WALKING', '騎車': 'BICYCLING', '開車': 'DRIVING' };

let allRestaurants  = [];
let aiRestaurants   = [];
let placesService   = null;
let aiPlacesService = null;
let distMatrixSvc   = null;
let mapInstance     = null;
let mapsLoaded      = false;

// 目前在 detail 的店家資料（供 openMaps 使用）
let currentDetailPlace = null;

/* ══════════════════════════════════════
   Landing / App shell
══════════════════════════════════════ */
function showLanding() {
  document.getElementById('appShell').style.display = 'none';
  document.getElementById('landingPage').style.display = 'block';
  document.getElementById('landingPage').classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function enterApp() {
  document.getElementById('landingPage').style.display = 'none';
  document.getElementById('appShell').style.display = 'block';
  locateMe('ai');
  locateMe('search');
}

/* ══════════════════════════════════════
   Tab / Page
══════════════════════════════════════ */
function switchTab(tab) {
  const pageMap = { ai: 'aiPage', search: 'searchPage', map: 'mapPage' };
  document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');
  showPage(pageMap[tab]);
  if (tab === 'map') initMap();
}

function showPage(id) {
  // 只隱藏 appShell 內的 page
  document.querySelectorAll('#appShell .page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.addEventListener('scroll', () => {
  document.getElementById('mainNav').classList.toggle('scrolled', window.scrollY > 8);
});

/* ══════════════════════════════════════
   UI helpers
══════════════════════════════════════ */
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}
function showErr(bannerId, msg) {
  const b = document.getElementById(bannerId);
  b.textContent = msg; b.classList.add('show');
  setTimeout(() => b.classList.remove('show'), 6000);
}
function showLoading(txt) {
  document.getElementById('loadText').textContent = txt || '搜尋中…';
  document.getElementById('loadingOverlay').classList.add('show');
}
function hideLoading() {
  document.getElementById('loadingOverlay').classList.remove('show');
}

/* ══════════════════════════════════════
   Filters
══════════════════════════════════════ */
function setChip(el, groupId, stateKey) {
  document.getElementById(groupId).querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  const map = {
    aiTransport: ['ai','transport'], aiMeal: ['ai','meal'],
    searchTransport: ['search','transport'], searchMeal: ['search','meal']
  };
  const [page, prop] = map[stateKey];
  state[page][prop] = el.textContent.trim();
}
function updateBudget(page, val) {
  state[page].budget = +val;
  document.getElementById(`${page}BudgetVal`).textContent = +val >= 1500 ? '1500+' : val;
}
function budgetMatch(priceLevel, budget) {
  if (budget >= 1500) return true;
  const map = { 0:50, 1:150, 2:400, 3:800, 4:1500 };
  return (map[priceLevel ?? 1] ?? 150) <= budget;
}

/* ══════════════════════════════════════
   Locate
══════════════════════════════════════ */
function locateMe(page) {
  const s = document.getElementById(`${page}LocateStatus`);
  s.textContent = '定位中…'; s.className = 'locate-status';
  if (!navigator.geolocation) { s.textContent = '不支援定位'; return; }
  navigator.geolocation.getCurrentPosition(
    pos => {
      state[page].lat = pos.coords.latitude;
      state[page].lng = pos.coords.longitude;
      s.textContent = `已定位 (${state[page].lat.toFixed(3)}, ${state[page].lng.toFixed(3)})`;
      s.className = 'locate-status ok';
    },
    () => {
      state[page].lat = 24.1477; state[page].lng = 120.6736;
      s.textContent = '使用預設位置（台中市）';
      s.className = 'locate-status ok';
    }
  );
}

/* ══════════════════════════════════════
   Google Maps Loader
══════════════════════════════════════ */
function loadGMaps() {
  return new Promise((res, rej) => {
    if (mapsLoaded && window.google?.maps) { res(); return; }
    if (document.getElementById('gmaps-script')) {
      const wait = setInterval(() => {
        if (window.google?.maps) { clearInterval(wait); mapsLoaded = true; res(); }
      }, 100);
      setTimeout(() => { clearInterval(wait); rej(new Error('timeout')); }, 12000);
      return;
    }
    window._gmapsReady = () => { mapsLoaded = true; res(); };
    const s = document.createElement('script');
    s.id  = 'gmaps-script';
    s.src = `https://maps.googleapis.com/maps/api/js?key=${GKEY}&libraries=places,geometry&callback=_gmapsReady`;
    s.async = true; s.defer = true;
    s.onerror = () => rej(new Error('載入失敗'));
    document.head.appendChild(s);
  });
}
function createHiddenMap(lat, lng) {
  const div = Object.assign(document.createElement('div'), {
    style: 'width:1px;height:1px;position:absolute;top:-9999px'
  });
  document.body.appendChild(div);
  return new google.maps.Map(div, { center: { lat, lng }, zoom: 15 });
}

/* ══════════════════════════════════════
   Map Page
══════════════════════════════════════ */
async function initMap() {
  if (mapInstance) return;
  try {
    await loadGMaps();
    const lat = state.search.lat || 24.1477;
    const lng = state.search.lng || 120.6736;
    mapInstance = new google.maps.Map(document.getElementById('googleMap'), {
      center: { lat, lng }, zoom: 15, mapTypeControl: false, fullscreenControl: false,
    });
  } catch(e) { console.error('Map init failed', e); }
}
function searchOnMap() {
  const q = document.getElementById('mapSearchInput').value.trim();
  if (!q || !mapInstance) return;
  const svc = new google.maps.places.PlacesService(mapInstance);
  svc.textSearch({ query: q, location: mapInstance.getCenter(), radius: 5000 }, (results, status) => {
    if (status === google.maps.places.PlacesServiceStatus.OK && results[0]) {
      mapInstance.setCenter(results[0].geometry.location);
      mapInstance.setZoom(16);
      new google.maps.Marker({ map: mapInstance, position: results[0].geometry.location, title: results[0].name });
    }
  });
}

/* ══════════════════════════════════════
   跨平台地圖開啟（修正手機問題）
══════════════════════════════════════ */
function openMaps() {
  if (!currentDetailPlace) return;
  const { name, lat, lng, placeId } = currentDetailPlace;
  const isIOS     = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isAndroid = /Android/.test(navigator.userAgent);

  if (isIOS) {
    // iOS：優先用 Apple Maps，若有座標直接用 geo
    window.location.href = `maps://?q=${encodeURIComponent(name)}&ll=${lat},${lng}`;
  } else if (isAndroid) {
    // Android：用 geo: scheme，Google Maps App 會攔截
    window.location.href = `geo:${lat},${lng}?q=${encodeURIComponent(name)}`;
  } else {
    // 電腦：開 Google Maps 網頁
    const url = placeId
      ? `https://www.google.com/maps/place/?q=place_id:${placeId}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`;
    window.open(url, '_blank');
  }
}

/* ══════════════════════════════════════
   Helpers
══════════════════════════════════════ */
function getRadius(t) { return t === '開車' ? 5000 : t === '騎車' ? 3000 : 1500; }
function priceLevelStr(lvl) { return {0:'免費',1:'$ 便宜',2:'$$ 中等',3:'$$$ 較貴',4:'$$$$ 高級'}[lvl] ?? '未提供'; }
function starsStr(r) { const f = Math.round(r||0); return '★'.repeat(f)+'☆'.repeat(5-f); }
function typeEmoji(types) {
  const t = (types||[]).join(',');
  if (t.includes('japanese')) return '🍱';
  if (t.includes('korean'))   return '🥩';
  if (t.includes('chinese'))  return '🥢';
  if (t.includes('cafe'))     return '☕';
  if (t.includes('fast_food'))return '🍔';
  if (t.includes('bar'))      return '🍺';
  if (t.includes('dessert'))  return '🍡';
  if (t.includes('bakery'))   return '🥐';
  return '🍽️';
}

function nearbySearchBoth(svc, location, radius) {
  return new Promise(resolve => {
    const types = ['restaurant', 'meal_takeaway'];
    const seen = new Set(), combined = [];
    let done = 0;
    types.forEach(type => {
      svc.nearbySearch({ location, radius, type }, (results, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && results?.length)
          results.forEach(p => { if (!seen.has(p.place_id)) { seen.add(p.place_id); combined.push(p); } });
        if (++done === types.length) resolve(combined);
      });
    });
  });
}

function fetchTravelTimes(origins, destinations, travelMode) {
  return new Promise(resolve => {
    if (!distMatrixSvc || !destinations.length) { resolve([]); return; }
    const chunks = [], size = 25;
    for (let i = 0; i < destinations.length; i += size) chunks.push(destinations.slice(i, i + size));
    const results = new Array(destinations.length).fill(null);
    let done = 0;
    chunks.forEach((chunk, ci) => {
      distMatrixSvc.getDistanceMatrix({
        origins, destinations: chunk,
        travelMode: google.maps.TravelMode[travelMode],
        unitSystem: google.maps.UnitSystem.METRIC,
      }, (resp, status) => {
        if (status === 'OK' && resp?.rows?.[0]?.elements)
          resp.rows[0].elements.forEach((el, j) => {
            if (el.status === 'OK') results[ci * size + j] = Math.ceil(el.duration.value / 60);
          });
        if (++done === chunks.length) resolve(results);
      });
    });
  });
}

function formatPlace(p) {
  const photos = [];
  if (p.photos?.length)
    for (let i = 0; i < Math.min(p.photos.length, 5); i++)
      photos.push(p.photos[i].getUrl({ maxWidth: 400 }));
  return {
    placeId: p.place_id, name: p.name,
    lat: p.geometry.location.lat(), lng: p.geometry.location.lng(),
    dist: null, mins: null,
    rating: p.rating ?? 0, reviews: p.user_ratings_total ?? 0,
    priceLevel: p.price_level,
    isOpen: null,        // ← 必須由 getDetails 填入，nearbySearch 的值不可靠
    weekdayText: null,
    types: (p.types||[]).filter(t => !['food','point_of_interest','establishment'].includes(t)).slice(0, 2),
    photos, address: p.vicinity || '',
  };
}

/* ── 批次 getDetails 取得精確營業狀態（重點修正）── */
function fetchOpenStatusBatch(list, svc) {
  return new Promise(resolve => {
    if (!svc || !list.length) { resolve(); return; }
    let pending = list.length;
    list.forEach((r, i) => {
      if (!r.placeId) { if (--pending === 0) resolve(); return; }
      // 每筆間隔 120ms，避免超過 QPS 限制
      setTimeout(() => {
        svc.getDetails(
          { placeId: r.placeId, fields: ['opening_hours', 'utc_offset_minutes'] },
          (res, status) => {
            if (status === google.maps.places.PlacesServiceStatus.OK && res?.opening_hours) {
              r.isOpen      = res.opening_hours.isOpen();      // 這裡才是準確的
              r.weekdayText = res.opening_hours.weekday_text || null;
            }
            if (--pending === 0) resolve();
          }
        );
      }, i * 120);
    });
  });
}

function fallbackMins(r, pg) {
  const dx = (r.lat - pg.lat) * 111000;
  const dy = (r.lng - pg.lng) * 111000 * Math.cos(pg.lat * Math.PI / 180);
  r.dist = Math.round(Math.sqrt(dx*dx + dy*dy));
  const spd = { '步行':80, '騎車':583, '開車':917 };
  r.mins = Math.max(1, Math.round(r.dist / spd[pg.transport]));
}

/* ══════════════════════════════════════
   AI SEARCH
══════════════════════════════════════ */
async function askAI() {
  const inp = document.getElementById('aiInput').value.trim();
  if (!inp) return;
  const pg = state.ai;
  if (!pg.lat) { pg.lat = 24.1477; pg.lng = 120.6736; }

  const box    = document.getElementById('aiResultBox');
  const body   = document.getElementById('aiResultBody');
  const header = document.getElementById('aiResultHeader');
  box.classList.add('show');
  header.textContent = '搜尋附近餐廳中…';
  body.innerHTML = '<div class="loading-dots"><div class="ld"></div><div class="ld"></div><div class="ld"></div></div>';

  try {
    await loadGMaps();
    const map = createHiddenMap(pg.lat, pg.lng);
    aiPlacesService = new google.maps.places.PlacesService(map);
    distMatrixSvc   = new google.maps.DistanceMatrixService();
    const raw = await nearbySearchBoth(aiPlacesService, new google.maps.LatLng(pg.lat, pg.lng), getRadius(pg.transport));
    aiRestaurants   = raw.map(p => formatPlace(p));
  } catch(e) { aiRestaurants = []; }

  // 交通時間
  if (aiRestaurants.length && distMatrixSvc) {
    header.textContent = '計算距離中…';
    const times = await fetchTravelTimes(
      [new google.maps.LatLng(pg.lat, pg.lng)],
      aiRestaurants.map(r => new google.maps.LatLng(r.lat, r.lng)),
      TRAVEL_MODE[pg.transport]
    ).catch(() => []);
    aiRestaurants.forEach((r, i) => {
      if (times[i] != null) r.mins = times[i]; else fallbackMins(r, pg);
    });
  } else {
    aiRestaurants.forEach(r => fallbackMins(r, pg));
  }

  // 取得營業狀態（前15間）
  header.textContent = '確認營業狀態…';
  await fetchOpenStatusBatch(aiRestaurants.slice(0, 15), aiPlacesService);

  const filtered = aiRestaurants.filter(r => budgetMatch(r.priceLevel, pg.budget));
  const listCtx  = filtered.length
    ? filtered.slice(0, 20).map((r, i) => {
        const openStr = r.isOpen === true ? '營業中' : r.isOpen === false ? '未營業' : '狀態未知';
        return `${i+1}. ${r.name}｜${r.mins}分鐘｜評分${r.rating}｜${priceLevelStr(r.priceLevel)}｜${openStr}｜${r.types.join('/')}`;
      }).join('\n')
    : '（無資料，請根據台中市一般情況推薦）';

  const prompt =
    `你是台灣美食推薦助理。使用者目前在台中市附近，` +
    `交通：${pg.transport}，時段：${pg.meal}，預算：${pg.budget >= 1500 ? '不限' : pg.budget + '元以內'}。\n\n` +
    `需求：「${inp}」\n\n附近真實餐廳清單：\n${listCtx}\n\n` +
    `從清單中選出最符合的 3-5 間（優先選「營業中」的），只輸出 JSON（不要其他文字）：\n` +
    `[{"name":"店名","mins":分鐘數,"rating":評分,"priceLevel":0-4,"isOpen":true/false/null,"desc":"20字內介紹"}]`;

  header.textContent = 'AI 分析中…';
  try {
    const resp = await fetch(WORKER_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
    let txt = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').replace(/```json|```/g,'').trim();
    let shops = [];
    try { shops = JSON.parse(txt); } catch(e) {
      header.textContent = 'AI 推薦如下';
      body.innerHTML = `<div style="padding:4px 0;font-size:14px;color:var(--mt);line-height:1.8;">${txt.replace(/\n/g,'<br>')}</div>`;
      return;
    }

    const matched = shops.map(s => {
      const found = aiRestaurants.find(r => r.name === s.name);
      return found ? { ...found, desc: s.desc } : {
        placeId: null, name: s.name, lat: pg.lat, lng: pg.lng,
        dist: null, mins: s.mins || 5, rating: s.rating || 0, reviews: 0,
        priceLevel: s.priceLevel ?? null, isOpen: s.isOpen ?? null,
        weekdayText: null, types: [], photos: [], address: '台中市', desc: s.desc,
      };
    });

    header.textContent = `根據您的需求，在附近找到了 ${matched.length} 個店家`;
    body.innerHTML = '';
    renderAIGroup(body, matched.filter(r => (r.mins||0) <= 10),              '🟢 近（10 分鐘內）',     'near');
    renderAIGroup(body, matched.filter(r => (r.mins||0) > 10 && (r.mins||0) <= 20), '🔵 一般（10–20 分鐘）', 'mid');
    renderAIGroup(body, matched.filter(r => (r.mins||0) > 20),               '🟣 遠（20 分鐘以上）',   'far');

  } catch(e) {
    body.innerHTML = `<div style="color:var(--red);padding:8px 0;font-size:13px;">錯誤：${e.message}</div>`;
    header.textContent = '無法取得建議';
  }
}

function renderAIGroup(container, list, label, bc) {
  if (!list.length) return;
  const sec = document.createElement('div');
  sec.innerHTML = `<div class="ai-group-label">${label}</div>`;
  list.forEach(s => {
    const ri = aiRestaurants.findIndex(r => r.name === s.name);
    const clickable = ri >= 0;
    const openTag = s.isOpen === true  ? '<span class="r-tag open">營業中</span>'
                  : s.isOpen === false ? '<span class="r-tag closed">未營業</span>' : '';
    const card = document.createElement('div');
    card.className = `ai-shop-card${clickable ? ' clickable' : ''}`;
    if (clickable) card.onclick = () => {
      allRestaurants = aiRestaurants;
      placesService  = aiPlacesService;
      document.getElementById('detailBackBtn').setAttribute('onclick', "showPage('aiPage')");
      showDetail(ri);
    };
    card.innerHTML = `
      <div style="display:flex;align-items:flex-start;gap:10px;">
        <div style="flex:1;min-width:0;">
          <div class="ai-shop-name">${s.name}</div>
          <div class="ai-shop-desc">${s.desc || ''}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;align-items:center;">
            <span class="dbadge b-${bc}">${s.mins} 分鐘</span>${openTag}
          </div>
          <div class="ai-shop-rating">${starsStr(s.rating)} ${s.rating || '—'}</div>
        </div>
        ${clickable ? '<div style="font-size:20px;color:var(--mb);align-self:center;padding-left:4px;">›</div>' : ''}
      </div>`;
    sec.appendChild(card);
  });
  container.appendChild(sec);
}

/* ══════════════════════════════════════
   GENERAL SEARCH
══════════════════════════════════════ */
async function searchNearby() {
  const pg = state.search;
  if (!pg.lat) { pg.lat = 24.1477; pg.lng = 120.6736; }

  showLoading('正在搜尋附近餐廳…');
  try {
    await loadGMaps();
    const map     = createHiddenMap(pg.lat, pg.lng);
    placesService = new google.maps.places.PlacesService(map);
    distMatrixSvc = new google.maps.DistanceMatrixService();

    const combined = await nearbySearchBoth(
      placesService, new google.maps.LatLng(pg.lat, pg.lng), getRadius(pg.transport)
    );
    if (!combined.length) {
      hideLoading();
      showErr('searchErrBanner', '找不到附近餐廳，使用示範資料');
      allRestaurants = getMockData(pg); renderResults(allRestaurants); return;
    }
    allRestaurants = combined.map(p => formatPlace(p));

    // Step 1：交通時間
    document.getElementById('loadText').textContent = '計算交通時間…';
    const times = await fetchTravelTimes(
      [new google.maps.LatLng(pg.lat, pg.lng)],
      allRestaurants.map(r => new google.maps.LatLng(r.lat, r.lng)),
      TRAVEL_MODE[pg.transport]
    ).catch(() => []);
    allRestaurants.forEach((r, i) => {
      if (times[i] != null) r.mins = times[i]; else fallbackMins(r, pg);
    });

    // Step 2：批次取得精確營業狀態（前20間）← 這是修正重點
    document.getElementById('loadText').textContent = '確認營業狀態…';
    await fetchOpenStatusBatch(allRestaurants.slice(0, 20), placesService);

    hideLoading();
    renderResults(allRestaurants);

  } catch(e) {
    hideLoading();
    showErr('searchErrBanner', 'Google Maps 載入失敗，使用示範資料');
    allRestaurants = getMockData(pg);
    renderResults(allRestaurants);
  }
}

function renderResults(list) {
  const pg       = state.search;
  const filtered = list.filter(r => budgetMatch(r.priceLevel, pg.budget));
  const sorted   = [...filtered].sort((a,b) => (a.mins||0) - (b.mins||0));
  const t1 = sorted[Math.floor(sorted.length/3)]?.mins   || 10;
  const t2 = sorted[Math.floor(sorted.length*2/3)]?.mins || 20;

  const el = document.getElementById('searchResults');
  el.innerHTML = '';

  const sum = document.createElement('div');
  sum.className = 'results-summary';
  sum.textContent = `${filtered.length} 間 · ${pg.transport} · ${pg.meal} · ${pg.budget >= 1500 ? '不限預算' : '$'+pg.budget}`;
  el.appendChild(sum);

  document.getElementById('detailBackBtn').setAttribute('onclick', "showPage('searchPage')");
  renderGroup(el, filtered.filter(r => (r.mins||0) <= t1),                         `🟢 近（${t1} 分鐘內）`,        'near');
  renderGroup(el, filtered.filter(r => (r.mins||0) > t1 && (r.mins||0) <= t2),     `🔵 一般（${t1}–${t2} 分鐘）`, 'mid');
  renderGroup(el, filtered.filter(r => (r.mins||0) > t2),                          `🟣 遠（${t2} 分鐘以上）`,      'far');
}

function renderGroup(container, list, label, bc) {
  const sec = document.createElement('div');
  if (!list.length) {
    sec.innerHTML = `<div class="sec-label">${label} <span class="sec-count">0</span></div>
      <div class="empty-group">此區間目前沒有符合條件的餐廳</div>`;
    container.appendChild(sec); return;
  }
  const cards = list.slice(0, 12).map((r, i) => {
    const ri    = allRestaurants.indexOf(r);
    const emoji = typeEmoji(r.types);
    const thumb = r.photos[0]
      ? `<img class="r-thumb" src="${r.photos[0]}" alt="" onerror="this.outerHTML='<div class=\\'r-thumb-placeholder\\'>${emoji}</div>'">`
      : `<div class="r-thumb-placeholder">${emoji}</div>`;
    const openTag = r.isOpen === true  ? '<span class="r-tag open">營業中</span>'
                  : r.isOpen === false ? '<span class="r-tag closed">未營業</span>'
                  :                     '<span class="r-tag unknown">確認中</span>';
    const typeTag = r.types.length ? `<span class="r-tag">${r.types[0].replace(/_/g,' ')}</span>` : '';
    return `<div class="r-card" style="animation-delay:${i*0.04}s" onclick="showDetail(${ri})">
      ${thumb}
      <div class="r-body">
        <div class="r-name">${r.name}</div>
        <div class="r-tags"><span class="dbadge b-${bc}">${r.mins ?? '?'} 分鐘</span>${typeTag}${openTag}</div>
        <div class="r-footer">
          <span class="r-stars">${starsStr(r.rating)} ${r.rating||'—'}</span>
          <span class="r-meta">${priceLevelStr(r.priceLevel)}</span>
        </div>
      </div>
    </div>`;
  }).join('');
  sec.innerHTML = `<div class="sec-label">${label} <span class="sec-count">${list.length}</span></div>
    <div class="r-list">${cards}</div>`;
  container.appendChild(sec);
}

/* ══════════════════════════════════════
   Detail
══════════════════════════════════════ */
function showDetail(idx) {
  const r     = allRestaurants[idx];
  const emoji = typeEmoji(r.types);
  currentDetailPlace = r;

  // Hero
  const hero = document.getElementById('dHero');
  hero.innerHTML = r.photos[0]
    ? `<img class="detail-hero-img" src="${r.photos[0]}" alt="" onerror="this.outerHTML='<div class=\\'detail-hero-placeholder\\'>${emoji}</div>'">`
    : `<div class="detail-hero-placeholder">${emoji}</div>`;

  document.getElementById('dName').textContent    = r.name;
  document.getElementById('dDist').textContent    = r.mins != null ? `${r.mins} 分鐘` : '';
  document.getElementById('dRating').innerHTML    = `<span class="stars-lg">${starsStr(r.rating)}</span> ${r.rating||'—'}`;
  document.getElementById('dReviews').textContent = r.reviews ? `${r.reviews.toLocaleString()} 則` : '—';
  document.getElementById('dPrice').textContent   = priceLevelStr(r.priceLevel);
  document.getElementById('dAddr').textContent    = r.address || '—';
  document.getElementById('dPhone').textContent   = '查詢中…';

  const openBadge = document.getElementById('dOpenBadge');
  const setOpen   = v => {
    openBadge.textContent = v === true ? '✓ 現在營業中' : v === false ? '✗ 目前未營業' : '';
    openBadge.style.color = v === true ? '#3B6D11' : v === false ? '#A32D2D' : '';
  };
  setOpen(r.isOpen);

  const hoursEl = document.getElementById('dHours');
  hoursEl.innerHTML = r.weekdayText?.length
    ? renderHoursHTML(r.weekdayText)
    : '<span style="color:var(--mg)">查詢中…</span>';

  // Photos
  const ph = document.getElementById('dPhotos');
  const renderPhotos = photos => {
    ph.innerHTML = photos.length
      ? photos.map(u => `<img src="${u}" alt="" onclick="openLightbox('${u}')" onerror="this.outerHTML='<div class=\\'photo-ph\\'>${emoji}<span>暫無</span></div>'">`).join('')
        + (photos.length < 3 ? Array(3-photos.length).fill(`<div class="photo-ph">${emoji}</div>`).join('') : '')
      : Array(3).fill(`<div class="photo-ph">${emoji}</div>`).join('');
  };
  renderPhotos(r.photos);

  document.getElementById('dReviewSummary').innerHTML =
    '<div class="loading-dots"><div class="ld"></div><div class="ld"></div><div class="ld"></div></div>';

  showPage('detailPage');

  if (placesService && r.placeId) {
    placesService.getDetails({
      placeId: r.placeId,
      fields: ['formatted_phone_number','opening_hours','photos','utc_offset_minutes']
    }, (res, status) => {
      if (status !== google.maps.places.PlacesServiceStatus.OK) {
        document.getElementById('dPhone').textContent = '未提供';
        if (!r.weekdayText) hoursEl.textContent = '未提供';
        fetchReviewSummary(r); return;
      }
      document.getElementById('dPhone').textContent = res?.formatted_phone_number || '未提供';

      if (res?.opening_hours) {
        r.isOpen      = res.opening_hours.isOpen();
        r.weekdayText = res.opening_hours.weekday_text || null;
        setOpen(r.isOpen);
        hoursEl.innerHTML = r.weekdayText ? renderHoursHTML(r.weekdayText) : '未提供';
      } else {
        if (!r.weekdayText) hoursEl.textContent = '未提供';
      }

      if (res?.photos?.length) {
        const newPhotos = [];
        for (let i = 0; i < Math.min(res.photos.length, 6); i++)
          newPhotos.push(res.photos[i].getUrl({ maxWidth: 500 }));
        r.photos = newPhotos;
        renderPhotos(newPhotos);
        hero.innerHTML = `<img class="detail-hero-img" src="${newPhotos[0]}" alt="" onerror="this.outerHTML='<div class=\\'detail-hero-placeholder\\'>${emoji}</div>'">`;
      }
      fetchReviewSummary(r);
    });
  } else {
    document.getElementById('dPhone').textContent = '—';
    if (!r.weekdayText) hoursEl.textContent = '—';
    fetchReviewSummary(r);
  }
}

function renderHoursHTML(weekdayText) {
  const today  = new Date().getDay();
  const dayIdx = today === 0 ? 6 : today - 1;
  return weekdayText.map((d, i) =>
    `<div class="${i === dayIdx ? 'hours-today' : ''}">${d}</div>`
  ).join('');
}

/* ══════════════════════════════════════
   AI Review Summary
══════════════════════════════════════ */
async function fetchReviewSummary(r) {
  const el = document.getElementById('dReviewSummary');
  const prompt =
    `你是餐廳評論分析師。「${r.name}」：評分${r.rating}/5，${r.reviews}則評論，` +
    `類型：${r.types.join('/')}，台中市。\n` +
    `根據這間餐廳的評分與類型，統整常見正面與負面評價（各2-3點），只輸出 JSON：\n` +
    `{"pos":["...","..."],"neg":["...","..."]}`;
  try {
    const res  = await fetch(WORKER_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });
    const data = await res.json();
    let txt = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').replace(/```json|```/g,'').trim();
    const obj = JSON.parse(txt);
    el.innerHTML =
      `<div style="margin-bottom:6px;font-size:11px;color:var(--mg);letter-spacing:1px;text-transform:uppercase;">正面評價</div>` +
      obj.pos.map(p => `<span class="review-tag pos">👍 ${p}</span>`).join('') +
      `<div style="margin:10px 0 6px;font-size:11px;color:var(--mg);letter-spacing:1px;text-transform:uppercase;">負面評價</div>` +
      obj.neg.map(n => `<span class="review-tag neg">👎 ${n}</span>`).join('');
  } catch(e) {
    el.innerHTML = '<span style="font-size:13px;color:var(--mg);">評論摘要暫時無法取得</span>';
  }
}

/* ══════════════════════════════════════
   Lightbox
══════════════════════════════════════ */
function openLightbox(url) {
  document.getElementById('lightboxImg').src = url;
  document.getElementById('lightbox').classList.add('show');
}
function closeLightbox() { document.getElementById('lightbox').classList.remove('show'); }

/* ══════════════════════════════════════
   Mock Data
══════════════════════════════════════ */
function getMockData(pg) {
  const items = [
    {n:'春水堂',     c:['taiwanese'],p:2,d:200,  o:true,  wt:['星期一: 10:00 – 22:00','星期二: 10:00 – 22:00','星期三: 10:00 – 22:00','星期四: 10:00 – 22:00','星期五: 10:00 – 22:00','星期六: 10:00 – 22:00','星期日: 10:00 – 22:00']},
    {n:'鼎王麻辣鍋', c:['chinese'],  p:3,d:550,  o:true,  wt:['星期一: 11:30 – 23:00','星期二: 11:30 – 23:00','星期三: 11:30 – 23:00','星期四: 11:30 – 23:00','星期五: 11:30 – 23:00','星期六: 11:30 – 23:00','星期日: 11:30 – 23:00']},
    {n:'好初早餐',   c:['cafe'],     p:1,d:100,  o:false, wt:['星期一: 07:00 – 11:00','星期二: 07:00 – 11:00','星期三: 07:00 – 11:00','星期四: 07:00 – 11:00','星期五: 07:00 – 11:00','星期六: 07:00 – 11:00','星期日: 公休']},
    {n:'老乾杯燒肉', c:['japanese'], p:3,d:900,  o:true,  wt:['星期一: 17:30 – 00:00','星期二: 17:30 – 00:00','星期三: 17:30 – 00:00','星期四: 17:30 – 00:00','星期五: 17:30 – 01:00','星期六: 17:30 – 01:00','星期日: 17:30 – 00:00']},
    {n:'韓國村',     c:['korean'],   p:2,d:1200, o:true,  wt:['星期一: 11:00 – 21:00','星期二: 11:00 – 21:00','星期三: 11:00 – 21:00','星期四: 11:00 – 21:00','星期五: 11:00 – 21:30','星期六: 11:00 – 21:30','星期日: 11:00 – 21:00']},
    {n:'老張牛肉麵', c:['chinese'],  p:1,d:450,  o:true,  wt:['星期一: 10:30 – 20:00','星期二: 10:30 – 20:00','星期三: 公休','星期四: 10:30 – 20:00','星期五: 10:30 – 20:00','星期六: 10:30 – 20:00','星期日: 10:30 – 20:00']},
    {n:'三媽臭臭鍋', c:['chinese'],  p:1,d:750,  o:false, wt:['星期一: 11:00 – 22:00','星期二: 11:00 – 22:00','星期三: 11:00 – 22:00','星期四: 11:00 – 22:00','星期五: 11:00 – 22:30','星期六: 11:00 – 22:30','星期日: 11:00 – 22:00']},
    {n:'呷二嘴',     c:['taiwanese'],p:1,d:1500, o:true,  wt:['星期一: 13:00 – 22:30','星期二: 公休','星期三: 13:00 – 22:30','星期四: 13:00 – 22:30','星期五: 13:00 – 22:30','星期六: 13:00 – 22:30','星期日: 13:00 – 22:30']},
    {n:'清新咖啡',   c:['cafe'],     p:2,d:2000, o:true,  wt:['星期一: 08:00 – 20:00','星期二: 08:00 – 20:00','星期三: 08:00 – 20:00','星期四: 08:00 – 20:00','星期五: 08:00 – 21:00','星期六: 08:00 – 21:00','星期日: 09:00 – 19:00']},
    {n:'夜間拉麵',   c:['japanese'], p:2,d:800,  o:false, wt:['星期一: 20:00 – 03:00','星期二: 20:00 – 03:00','星期三: 20:00 – 03:00','星期四: 20:00 – 03:00','星期五: 20:00 – 04:00','星期六: 20:00 – 04:00','星期日: 20:00 – 03:00']},
  ];
  const spd = { '步行':80, '騎車':583, '開車':917 };
  return items.map((it, i) => {
    const dist = it.d + Math.round((Math.random()-0.5)*80);
    const mins = Math.max(1, Math.round(dist / spd[pg.transport]));
    return {
      placeId: String(i), name: it.n,
      lat: (pg.lat||24.1477) + (Math.random()-0.5)*0.01,
      lng: (pg.lng||120.6736)+ (Math.random()-0.5)*0.01,
      dist, mins, rating: +(3.5+Math.random()*1.5).toFixed(1),
      reviews: Math.round(50+Math.random()*500),
      priceLevel: it.p, isOpen: it.o, weekdayText: it.wt,
      types: it.c, photos: [], address: '台中市',
    };
  });
}
