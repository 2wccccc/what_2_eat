/* ══════════════════════════════════════
   吃什麼？— app.js
   ══════════════════════════════════════ */

const GKEY       = 'AIzaSyAf96oPZjdLci_LV74k4DzvjgaHSsGTFW8';
const WORKER_URL = 'https://what2eat.evan34021.workers.dev';

const state = {
  ai:     { lat: null, lng: null, transport: '步行', meal: '早餐', budget: 300 },
  search: { lat: null, lng: null, transport: '步行', meal: '早餐', budget: 300 }
};

// Google Distance Matrix travelMode
const TRAVEL_MODE = { '步行': 'walking', '騎車': 'bicycling', '開車': 'driving' };

const MEAL_HOURS = {
  '早餐': { start: 6,  end: 11 },
  '午餐': { start: 11, end: 14 },
  '晚餐': { start: 17, end: 21 },
  '消夜': { start: 21, end: 26 },
};

let allRestaurants  = [];
let aiRestaurants   = [];
let placesService   = null;
let aiPlacesService = null;
let distMatrixSvc   = null;
let mapInstance     = null;
let mapsLoaded      = false;
let loggedIn        = false;

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
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
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
  const [page, prop] = stateKey === 'aiTransport'    ? ['ai','transport']    :
                       stateKey === 'aiMeal'          ? ['ai','meal']         :
                       stateKey === 'searchTransport' ? ['search','transport']:
                                                        ['search','meal'];
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

/* ── 用 weekday_text 判斷時段（僅用於「標示」，不硬篩） ── */
function mealTimeLabel(weekdayText, isOpen, meal) {
  // 優先用 Google isOpen()
  if (isOpen === true)  return { ok: true,  tag: 'open',    text: '營業中' };
  if (isOpen === false) return { ok: false, tag: 'closed',  text: '未營業' };

  // isOpen 為 null（無資料）→ 嘗試解析 weekday_text
  if (!weekdayText?.length) return { ok: null, tag: 'unknown', text: '狀態未知' };

  const dayIdx   = new Date().getDay();
  const twIdx    = dayIdx === 0 ? 6 : dayIdx - 1;
  const todayTxt = weekdayText[twIdx] || '';

  if (todayTxt.includes('公休') || todayTxt.toLowerCase().includes('closed'))
    return { ok: false, tag: 'closed', text: '今日公休' };
  if (todayTxt.includes('24') || todayTxt.toLowerCase().includes('open 24'))
    return { ok: true, tag: 'open', text: '24小時' };

  const range = MEAL_HOURS[meal];
  const timeReg = /(\d{1,2}):(\d{2})\s*[–\-~～]\s*(\d{1,2}):(\d{2})/g;
  let m;
  while ((m = timeReg.exec(todayTxt)) !== null) {
    let oh = +m[1], ch = +m[3];
    if (ch <= oh) ch += 24;
    if (range && range.start < ch && range.end > oh)
      return { ok: true, tag: 'open', text: '時段符合' };
  }
  return { ok: null, tag: 'unknown', text: '時段未知' };
}

/* ══════════════════════════════════════
   Login / Locate
══════════════════════════════════════ */
function handleLogin() {
  loggedIn = !loggedIn;
  document.getElementById('loginText').textContent = loggedIn ? '已登入' : 'Google 登入';
  showToast(loggedIn ? '✓ 登入成功（模擬）' : '已登出');
}
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
   Helpers
══════════════════════════════════════ */
function getRadius(transport) { return transport === '開車' ? 5000 : transport === '騎車' ? 3000 : 1500; }
function priceLevelStr(lvl)   { return {0:'免費',1:'$ 便宜',2:'$$ 中等',3:'$$$ 較貴',4:'$$$$ 高級'}[lvl] ?? '未提供'; }
function starsStr(r)          { const f = Math.round(r||0); return '★'.repeat(f)+'☆'.repeat(5-f); }
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

/* ── 雙類型搜尋，合併去重 ── */
function nearbySearchBoth(svc, location, radius) {
  return new Promise(resolve => {
    const types = ['restaurant', 'meal_takeaway'];
    const seen = new Set(), combined = [];
    let done = 0;
    types.forEach(type => {
      svc.nearbySearch({ location, radius, type }, (results, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && results?.length) {
          results.forEach(p => {
            if (!seen.has(p.place_id)) { seen.add(p.place_id); combined.push(p); }
          });
        }
        if (++done === types.length) resolve(combined);
      });
    });
  });
}

/* ── 用 Distance Matrix API 取得真實交通時間（分鐘）── */
function fetchTravelTimes(origins, destinations, travelMode) {
  return new Promise(resolve => {
    if (!distMatrixSvc) resolve(null);
    // Distance Matrix 一次最多 25 destinations
    const chunks = [];
    for (let i = 0; i < destinations.length; i += 25)
      chunks.push(destinations.slice(i, i + 25));

    const results = new Array(destinations.length).fill(null);
    let done = 0;

    chunks.forEach((chunk, ci) => {
      distMatrixSvc.getDistanceMatrix({
        origins,
        destinations: chunk,
        travelMode: google.maps.TravelMode[travelMode.toUpperCase()],
        unitSystem: google.maps.UnitSystem.METRIC,
      }, (resp, status) => {
        if (status === 'OK' && resp?.rows?.[0]?.elements) {
          resp.rows[0].elements.forEach((el, j) => {
            const idx = ci * 25 + j;
            if (el.status === 'OK') results[idx] = Math.ceil(el.duration.value / 60);
          });
        }
        if (++done === chunks.length) resolve(results);
      });
    });
  });
}

/* ── formatPlace（不含距離，距離由 Distance Matrix 填入）── */
function formatPlace(p) {
  const photos = [];
  if (p.photos?.length)
    for (let i = 0; i < Math.min(p.photos.length, 5); i++)
      photos.push(p.photos[i].getUrl({ maxWidth: 400 }));
  return {
    placeId: p.place_id,
    name: p.name,
    lat: p.geometry.location.lat(),
    lng: p.geometry.location.lng(),
    dist: null,   // 由 Distance Matrix 填入
    mins: null,   // 由 Distance Matrix 填入
    rating: p.rating ?? 0,
    reviews: p.user_ratings_total ?? 0,
    priceLevel: p.price_level,
    isOpen: null,       // 由 getDetails 填入
    weekdayText: null,  // 由 getDetails 填入
    types: (p.types||[]).filter(t => !['food','point_of_interest','establishment'].includes(t)).slice(0, 2),
    photos,
    address: p.vicinity || '',
  };
}

/* ── 批次 getDetails 取得 opening_hours（每間間隔 150ms）── */
function fetchDetailsBatch(list, svc, callback) {
  let pending = list.length;
  if (!pending) { callback(); return; }
  list.forEach((r, i) => {
    setTimeout(() => {
      if (!svc || !r.placeId) { if (--pending === 0) callback(); return; }
      svc.getDetails(
        { placeId: r.placeId, fields: ['opening_hours'] },
        (res, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && res?.opening_hours) {
            r.weekdayText = res.opening_hours.weekday_text || null;
            r.isOpen      = res.opening_hours.isOpen();
          }
          if (--pending === 0) callback();
        }
      );
    }, i * 150);
  });
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
  header.textContent = '搜尋中，請稍候…';
  body.innerHTML = '<div class="loading-dots"><div class="ld"></div><div class="ld"></div><div class="ld"></div></div>';

  let nearbyList = [];
  try {
    await loadGMaps();
    const map = createHiddenMap(pg.lat, pg.lng);
    aiPlacesService = new google.maps.places.PlacesService(map);
    distMatrixSvc   = new google.maps.DistanceMatrixService();
    nearbyList = await nearbySearchBoth(aiPlacesService, new google.maps.LatLng(pg.lat, pg.lng), getRadius(pg.transport));
  } catch(e) { /* 繼續 */ }

  aiRestaurants = nearbyList.map(p => formatPlace(p));

  // 用 Distance Matrix 填入真實交通時間
  if (aiRestaurants.length && distMatrixSvc) {
    const origin = new google.maps.LatLng(pg.lat, pg.lng);
    const dests  = aiRestaurants.map(r => new google.maps.LatLng(r.lat, r.lng));
    const times  = await fetchTravelTimes([origin], dests, TRAVEL_MODE[pg.transport]).catch(() => null);
    if (times) aiRestaurants.forEach((r, i) => { if (times[i] !== null) r.mins = times[i]; });
  }
  // fallback：若 Distance Matrix 失敗，用直線距離估算
  aiRestaurants.forEach(r => {
    if (r.mins === null) {
      const dx = (r.lat - pg.lat) * 111000;
      const dy = (r.lng - pg.lng) * 111000 * Math.cos(pg.lat * Math.PI / 180);
      r.dist = Math.round(Math.sqrt(dx*dx + dy*dy));
      const spd = { '步行': 80, '騎車': 583, '開車': 917 };
      r.mins = Math.max(1, Math.round(r.dist / spd[pg.transport]));
    }
  });

  const budgetFiltered = aiRestaurants.filter(r => budgetMatch(r.priceLevel, pg.budget));
  const listCtx = budgetFiltered.length > 0
    ? budgetFiltered.slice(0, 20).map((r, i) =>
        `${i+1}. ${r.name}｜${r.mins}分鐘｜評分${r.rating}｜${priceLevelStr(r.priceLevel)}｜${r.types.join('/')}`
      ).join('\n')
    : '（無資料，請根據台中市一般情況推薦）';

  const prompt =
    `你是台灣美食推薦助理。使用者目前在台中市附近，` +
    `交通：${pg.transport}，時段：${pg.meal}，預算：${pg.budget >= 1500 ? '不限' : pg.budget + '元以內'}。\n\n` +
    `需求：「${inp}」\n\n附近餐廳：\n${listCtx}\n\n` +
    `從清單選出最符合的 3-5 間，只輸出 JSON（不要其他文字）：\n` +
    `[{"name":"店名","mins":分鐘數,"rating":評分,"priceLevel":0-4,"desc":"20字內介紹"}]`;

  try {
    const resp = await fetch(WORKER_URL, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ prompt }) });
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
        dist: null, mins: s.mins || 5,
        rating: s.rating || 0, reviews: 0,
        priceLevel: s.priceLevel ?? null, isOpen: null, weekdayText: null,
        types: [], photos: [], address: '台中市', desc: s.desc,
      };
    });

    header.textContent = `找到 ${matched.length} 間推薦店家`;
    body.innerHTML = '';
    renderAIGroup(body, matched.filter(r => r.mins <= 10),              '🟢 近（10 分鐘內）',    'near');
    renderAIGroup(body, matched.filter(r => r.mins > 10 && r.mins <= 20),'🔵 一般（10–20 分鐘）', 'mid');
    renderAIGroup(body, matched.filter(r => r.mins > 20),               '🟣 遠（20 分鐘以上）',  'far');

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
    const pTag = s.priceLevel != null ? `<span class="r-tag">${priceLevelStr(s.priceLevel)}</span>` : '';
    const card = document.createElement('div');
    card.className = `ai-shop-card${clickable ? ' clickable' : ''}`;
    if (clickable) card.onclick = () => showDetailFromAI(ri);
    card.innerHTML = `
      <div style="display:flex;align-items:flex-start;gap:10px;">
        <div style="flex:1;min-width:0;">
          <div class="ai-shop-name">${s.name}</div>
          <div class="ai-shop-desc">${s.desc || ''}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">
            <span class="dbadge b-${bc}">${s.mins} 分鐘</span>${pTag}
          </div>
          <div class="ai-shop-rating">${starsStr(s.rating)} ${s.rating || '—'}</div>
        </div>
        ${clickable ? '<div style="font-size:18px;color:var(--mb);align-self:center;">›</div>' : ''}
      </div>`;
    sec.appendChild(card);
  });
  container.appendChild(sec);
}

function showDetailFromAI(ri) {
  allRestaurants = aiRestaurants;
  placesService  = aiPlacesService;
  document.querySelector('#detailPage .back-btn').setAttribute('onclick', "showPage('aiPage')");
  showDetail(ri);
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
      showErr('searchErrBanner', 'Google Places 回應異常，改用示範資料');
      allRestaurants = getMockData(pg); renderResults(allRestaurants); return;
    }

    allRestaurants = combined.map(p => formatPlace(p));

    // Step 1：Distance Matrix → 真實交通時間
    document.getElementById('loadText').textContent = '計算交通時間…';
    const origin = new google.maps.LatLng(pg.lat, pg.lng);
    const dests  = allRestaurants.map(r => new google.maps.LatLng(r.lat, r.lng));
    const times  = await fetchTravelTimes([origin], dests, TRAVEL_MODE[pg.transport]).catch(() => null);
    allRestaurants.forEach((r, i) => {
      if (times?.[i] !== null && times?.[i] !== undefined) {
        r.mins = times[i];
      } else {
        // fallback
        const dx = (r.lat - pg.lat) * 111000;
        const dy = (r.lng - pg.lng) * 111000 * Math.cos(pg.lat * Math.PI / 180);
        r.dist = Math.round(Math.sqrt(dx*dx + dy*dy));
        r.mins = Math.max(1, Math.round(r.dist / { '步行':80,'騎車':583,'開車':917 }[pg.transport]));
      }
    });

    // Step 2：getDetails → 真實營業時間（前20間，避免超配額）
    document.getElementById('loadText').textContent = '確認營業時間…';
    fetchDetailsBatch(allRestaurants.slice(0, 20), placesService, () => {
      hideLoading();
      renderResults(allRestaurants);
    });

  } catch(e) {
    hideLoading();
    showErr('searchErrBanner', 'Google Maps 載入失敗');
    allRestaurants = getMockData(pg);
    renderResults(allRestaurants);
  }
}

function renderResults(list) {
  const pg = state.search;

  // 只用預算篩選；時段改為「標示」不硬篩，讓使用者自己判斷
  const filtered = list.filter(r => budgetMatch(r.priceLevel, pg.budget));

  // 依 mins 三等分
  const sorted = [...filtered].sort((a,b) => (a.mins||0) - (b.mins||0));
  const t1idx  = Math.floor(sorted.length / 3);
  const t2idx  = Math.floor(sorted.length * 2 / 3);
  const m1     = sorted[t1idx]?.mins || 10;
  const m2     = sorted[t2idx]?.mins || 20;

  const el = document.getElementById('searchResults');
  el.innerHTML = '';

  const budgetLabel = pg.budget >= 1500 ? '不限預算' : `$${pg.budget} 以內`;
  const sum = document.createElement('div');
  sum.className = 'results-summary';
  sum.textContent = `${filtered.length} 間 · ${pg.transport} · ${pg.meal} · ${budgetLabel}`;
  el.appendChild(sum);

  document.querySelector('#detailPage .back-btn').setAttribute('onclick', "showPage('searchPage')");
  renderGroup(el, filtered.filter(r => (r.mins||0) <= m1),                        `🟢 近（${m1} 分鐘內）`,       'near');
  renderGroup(el, filtered.filter(r => (r.mins||0) > m1 && (r.mins||0) <= m2),    `🔵 一般（${m1}–${m2} 分鐘）`, 'mid');
  renderGroup(el, filtered.filter(r => (r.mins||0) > m2),                         `🟣 遠（${m2} 分鐘以上）`,      'far');
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

    // 營業標籤：直接用 isOpen（由 getDetails 填入的正確值）
    const openTag = r.isOpen === true  ? '<span class="r-tag open">營業中</span>'
                  : r.isOpen === false ? '<span class="r-tag closed">未營業</span>'
                  :                     '<span class="r-tag unknown">狀態未知</span>';
    const typeTag = r.types.length ? `<span class="r-tag">${r.types[0].replace(/_/g,' ')}</span>` : '';
    const minsLabel = r.mins !== null ? `${r.mins} 分鐘` : '計算中';
    return `<div class="r-card" style="animation-delay:${i*0.04}s" onclick="showDetail(${ri})">
      ${thumb}
      <div class="r-body">
        <div class="r-name">${r.name}</div>
        <div class="r-tags"><span class="dbadge b-${bc}">${minsLabel}</span>${typeTag}${openTag}</div>
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

  const hero = document.getElementById('dHero');
  hero.innerHTML = r.photos[0]
    ? `<img class="detail-hero-img" src="${r.photos[0]}" alt="" onerror="this.outerHTML='<div class=\\'detail-hero-placeholder\\'>${emoji}</div>'">`
    : `<div class="detail-hero-placeholder">${emoji}</div>`;

  document.getElementById('dName').textContent    = r.name;
  document.getElementById('dDist').textContent    = r.mins !== null ? `${r.mins} 分鐘` : '計算中…';
  document.getElementById('dRating').innerHTML    = `<span class="stars-lg">${starsStr(r.rating)}</span> ${r.rating||'—'}`;
  document.getElementById('dReviews').textContent = r.reviews ? `${r.reviews.toLocaleString()} 則` : '—';
  document.getElementById('dPrice').textContent   = priceLevelStr(r.priceLevel);
  document.getElementById('dAddr').textContent    = r.address || '—';
  document.getElementById('dPhone').textContent   = '查詢中…';
  document.getElementById('dMapsLink').href       = `https://www.google.com/maps/place/?q=place_id:${r.placeId}`;

  const openBadge = document.getElementById('dOpenBadge');
  const setOpenBadge = (isOpen) => {
    openBadge.textContent = isOpen === true ? '✓ 現在營業中' : isOpen === false ? '✗ 目前未營業' : '';
    openBadge.style.color = isOpen === true ? '#3B6D11' : isOpen === false ? '#A32D2D' : '';
  };
  setOpenBadge(r.isOpen);

  const hoursEl = document.getElementById('dHours');
  r.weekdayText?.length
    ? renderHours(hoursEl, r.weekdayText)
    : (hoursEl.innerHTML = '<span style="color:var(--mg)">查詢中…</span>');

  const ph = document.getElementById('dPhotos');
  const renderPhotos = (photos) => {
    ph.innerHTML = photos.length
      ? photos.map(u => `<img src="${u}" alt="" onclick="openLightbox('${u}')" onerror="this.outerHTML='<div class=\\'photo-ph\\'>${emoji}<span>暫無圖片</span></div>'">`).join('')
        + (photos.length < 3 ? Array(3-photos.length).fill(`<div class="photo-ph">${emoji}<span>更多照片</span></div>`).join('') : '')
      : Array(3).fill(`<div class="photo-ph">${emoji}<span>暫無圖片</span></div>`).join('');
  };
  renderPhotos(r.photos);

  document.getElementById('dReviewSummary').innerHTML =
    '<div class="loading-dots"><div class="ld"></div><div class="ld"></div><div class="ld"></div></div>';

  showPage('detailPage');

  if (placesService && r.placeId) {
    placesService.getDetails({
      placeId: r.placeId,
      fields: ['formatted_phone_number','opening_hours','photos','business_status','website']
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
        setOpenBadge(r.isOpen);
        renderHours(hoursEl, r.weekdayText);
      } else if (!r.weekdayText) {
        hoursEl.textContent = '未提供';
      }

      if (res?.photos?.length) {
        const newPhotos = [];
        for (let i = 0; i < Math.min(res.photos.length, 6); i++)
          newPhotos.push(res.photos[i].getUrl({ maxWidth: 500 }));
        r.photos = newPhotos;
        renderPhotos(newPhotos);
        if (newPhotos[0]) hero.innerHTML = `<img class="detail-hero-img" src="${newPhotos[0]}" alt="" onerror="this.outerHTML='<div class=\\'detail-hero-placeholder\\'>${emoji}</div>'">`;
      }
      fetchReviewSummary(r);
    });
  } else {
    document.getElementById('dPhone').textContent = '—';
    if (!r.weekdayText) hoursEl.textContent = '—';
    fetchReviewSummary(r);
  }
}

function renderHours(el, weekdayText) {
  if (!weekdayText?.length) { el.textContent = '未提供'; return; }
  const today  = new Date().getDay();
  const dayIdx = today === 0 ? 6 : today - 1;
  el.innerHTML = weekdayText.map((d, i) =>
    `<div class="${i === dayIdx ? 'hours-today' : ''}">${d}</div>`
  ).join('');
}

/* ══════════════════════════════════════
   AI Review Summary
══════════════════════════════════════ */
async function fetchReviewSummary(r) {
  const el = document.getElementById('dReviewSummary');
  const prompt =
    `你是餐廳評論分析師。「${r.name}」：評分${r.rating}/5，${r.reviews}則評論，類型：${r.types.join('/')}，台中市。\n` +
    `統整常見正面與負面評價（各2-3點），只輸出 JSON：\n{"pos":["...","..."],"neg":["...","..."]}`;
  try {
    const res  = await fetch(WORKER_URL, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ prompt }) });
    const data = await res.json();
    let txt = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').replace(/```json|```/g,'').trim();
    const obj = JSON.parse(txt);
    el.innerHTML =
      `<div style="margin-bottom:6px;font-size:12px;color:var(--mg);letter-spacing:1px;">正面評價</div>` +
      obj.pos.map(p => `<span class="review-tag pos">👍 ${p}</span>`).join('') +
      `<div style="margin:10px 0 6px;font-size:12px;color:var(--mg);letter-spacing:1px;">負面評價</div>` +
      obj.neg.map(n => `<span class="review-tag neg">👎 ${n}</span>`).join('');
  } catch(e) {
    el.innerHTML = '<span style="font-size:13px;color:var(--mg);">評論摘要暫時無法取得</span>';
  }
}

/* ══════════════════════════════════════
   Lightbox
══════════════════════════════════════ */
function openLightbox(url) { document.getElementById('lightboxImg').src = url; document.getElementById('lightbox').classList.add('show'); }
function closeLightbox()   { document.getElementById('lightbox').classList.remove('show'); }

/* ══════════════════════════════════════
   Mock Data
══════════════════════════════════════ */
function getMockData(pg) {
  const items = [
    {n:'春水堂',     c:['taiwanese'],p:2,d:200, wt:['星期一: 10:00 – 22:00','星期二: 10:00 – 22:00','星期三: 10:00 – 22:00','星期四: 10:00 – 22:00','星期五: 10:00 – 22:00','星期六: 10:00 – 22:00','星期日: 10:00 – 22:00']},
    {n:'鼎王麻辣鍋', c:['chinese'],  p:3,d:550, wt:['星期一: 11:30 – 23:00','星期二: 11:30 – 23:00','星期三: 11:30 – 23:00','星期四: 11:30 – 23:00','星期五: 11:30 – 23:00','星期六: 11:30 – 23:00','星期日: 11:30 – 23:00']},
    {n:'好初早餐',   c:['cafe'],     p:1,d:100, wt:['星期一: 07:00 – 11:00','星期二: 07:00 – 11:00','星期三: 07:00 – 11:00','星期四: 07:00 – 11:00','星期五: 07:00 – 11:00','星期六: 07:00 – 11:00','星期日: 公休']},
    {n:'老乾杯燒肉', c:['japanese'], p:3,d:900, wt:['星期一: 17:30 – 00:00','星期二: 17:30 – 00:00','星期三: 17:30 – 00:00','星期四: 17:30 – 00:00','星期五: 17:30 – 01:00','星期六: 17:30 – 01:00','星期日: 17:30 – 00:00']},
    {n:'韓國村',     c:['korean'],   p:2,d:1200,wt:['星期一: 11:00 – 21:00','星期二: 11:00 – 21:00','星期三: 11:00 – 21:00','星期四: 11:00 – 21:00','星期五: 11:00 – 21:30','星期六: 11:00 – 21:30','星期日: 11:00 – 21:00']},
    {n:'老張牛肉麵', c:['chinese'],  p:1,d:450, wt:['星期一: 10:30 – 20:00','星期二: 10:30 – 20:00','星期三: 公休','星期四: 10:30 – 20:00','星期五: 10:30 – 20:00','星期六: 10:30 – 20:00','星期日: 10:30 – 20:00']},
    {n:'三媽臭臭鍋', c:['chinese'],  p:1,d:750, wt:['星期一: 11:00 – 22:00','星期二: 11:00 – 22:00','星期三: 11:00 – 22:00','星期四: 11:00 – 22:00','星期五: 11:00 – 22:30','星期六: 11:00 – 22:30','星期日: 11:00 – 22:00']},
    {n:'呷二嘴',     c:['taiwanese'],p:1,d:1500,wt:['星期一: 13:00 – 22:30','星期二: 公休','星期三: 13:00 – 22:30','星期四: 13:00 – 22:30','星期五: 13:00 – 22:30','星期六: 13:00 – 22:30','星期日: 13:00 – 22:30']},
    {n:'清新咖啡',   c:['cafe'],     p:2,d:2000,wt:['星期一: 08:00 – 20:00','星期二: 08:00 – 20:00','星期三: 08:00 – 20:00','星期四: 08:00 – 20:00','星期五: 08:00 – 21:00','星期六: 08:00 – 21:00','星期日: 09:00 – 19:00']},
    {n:'夜間拉麵',   c:['japanese'], p:2,d:800, wt:['星期一: 20:00 – 03:00','星期二: 20:00 – 03:00','星期三: 20:00 – 03:00','星期四: 20:00 – 03:00','星期五: 20:00 – 04:00','星期六: 20:00 – 04:00','星期日: 20:00 – 03:00']},
  ];
  const spd = { '步行':80,'騎車':583,'開車':917 };
  return items.map((it,i) => {
    const dist = it.d + Math.round((Math.random()-0.5)*80);
    const mins = Math.max(1, Math.round(dist / spd[pg.transport]));
    return {
      placeId: String(i), name: it.n,
      lat: (pg.lat||24.1477) + (Math.random()-0.5)*0.01,
      lng: (pg.lng||120.6736)+ (Math.random()-0.5)*0.01,
      dist, mins,
      rating: +(3.5+Math.random()*1.5).toFixed(1),
      reviews: Math.round(50+Math.random()*500),
      priceLevel: it.p, isOpen: null, weekdayText: it.wt,
      types: it.c, photos: [], address: '台中市',
    };
  });
}

/* ── Init ── */
locateMe('ai');
locateMe('search');
