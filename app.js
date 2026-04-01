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
let currentWeatherCtx = '';

let currentDetailPlace = null;

document.addEventListener('DOMContentLoaded', () => {
  const savedPref = localStorage.getItem('what2eat_pref') || '想減內臟脂肪，盡量推薦健康、高蛋白或低碳水的餐點'; 
  const prefInput = document.getElementById('userPref');
  if(prefInput) prefInput.value = savedPref;
});

function savePref(val) {
  localStorage.setItem('what2eat_pref', val.trim());
  showToast('偏好設定已儲存');
}

async function fetchWeather(lat, lng) {
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true`);
    const data = await res.json();
    const temp = data.current_weather.temperature;
    const code = data.current_weather.weathercode;
    const isRaining = code >= 50; 
    currentWeatherCtx = `目前當地天氣：氣溫 ${temp} 度C，${isRaining ? '正在下雨 (請優先推薦室內舒適、好停車或極近距離的店)' : '天氣穩定'}。`;
  } catch(e) { currentWeatherCtx = ''; }
}

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

function switchTab(tab) {
  const pageMap = { ai: 'aiPage', search: 'searchPage', map: 'mapPage' };
  document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');
  showPage(pageMap[tab]);
  if (tab === 'map') initMap();
}

function showPage(id) {
  document.querySelectorAll('#appShell .page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.addEventListener('scroll', () => {
  document.getElementById('mainNav').classList.toggle('scrolled', window.scrollY > 8);
});

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

function showSkeleton(containerId) {
  const el = document.getElementById(containerId);
  let html = '<div style="padding: 16px 16px 0;">';
  for(let i=0; i<4; i++) {
    html += `
      <div class="skeleton-card">
        <div class="sk-thumb sk-anim"></div>
        <div style="flex:1;">
          <div class="sk-line sk-anim w-70"></div>
          <div class="sk-line sk-anim w-40"></div>
          <div class="sk-line sk-anim w-40" style="margin-top:16px"></div>
        </div>
      </div>`;
  }
  html += '</div>';
  el.innerHTML = html;
}

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

function locateMe(page) {
  const s = document.getElementById(`${page}LocateStatus`);
  s.textContent = '定位中…'; s.className = 'locate-status';
  if (!navigator.geolocation) { s.textContent = '定位未授權'; return; }
  navigator.geolocation.getCurrentPosition(
    pos => {
      state[page].lat = pos.coords.latitude;
      state[page].lng = pos.coords.longitude;
      s.textContent = `已鎖定 (${state[page].lat.toFixed(3)}, ${state[page].lng.toFixed(3)})`;
      s.className = 'locate-status ok';
    },
    () => {
      state[page].lat = 24.1477; state[page].lng = 120.6736;
      s.textContent = '使用預設位置 (台中市)';
      s.className = 'locate-status ok';
    }
  );
}

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

async function initMap() {
  if (mapInstance) return;
  try {
    await loadGMaps();
    const lat = state.search.lat || 24.1477;
    const lng = state.search.lng || 120.6736;
    mapInstance = new google.maps.Map(document.getElementById('googleMap'), {
      center: { lat, lng }, zoom: 15, mapTypeControl: false, fullscreenControl: false
    });
  } catch(e) {}
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

function openMaps() {
  if (!currentDetailPlace) return;
  const { name, lat, lng, placeId } = currentDetailPlace;
  const isIOS     = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isAndroid = /Android/.test(navigator.userAgent);
  if (isIOS) {
    window.location.href = `maps://?q=${encodeURIComponent(name)}&ll=${lat},${lng}`;
  } else if (isAndroid) {
    window.location.href = `geo:${lat},${lng}?q=${encodeURIComponent(name)}`;
  } else {
    const url = placeId
      ? `https://www.google.com/maps/place/?q=place_id:${placeId}`
      : `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    window.open(url, '_blank');
  }
}

async function sharePlace() {
  if (!currentDetailPlace) return;
  const { name, rating, address, placeId, lat, lng } = currentDetailPlace;
  const stars = rating ? `評分: ${rating}⭐` : '';
  const url = placeId
    ? `https://www.google.com/maps/place/?q=place_id:${placeId}`
    : `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

  const shareData = {
    title: `今晚吃這個！${name}`,
    text: `推薦一間不錯的店「${name}」\n${stars}\n${address ? '地址: '+address : ''}\n`,
    url: url
  };

  if (navigator.share) {
    try { await navigator.share(shareData); } catch (err) {}
  } else {
    navigator.clipboard.writeText(`${shareData.text}\n${shareData.url}`);
    showToast('連結已複製至剪貼簿');
  }
}

function getRadius(t) { return t === '開車' ? 5000 : t === '騎車' ? 3000 : 1500; }
function priceLevelStr(lvl) { return {0:'免費',1:'$ 平價',2:'$$ 中等',3:'$$$ 偏高',4:'$$$$ 高級'}[lvl] ?? '未提供'; }
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
    const queries = [
      { type: 'restaurant' },
      { type: 'meal_takeaway' },
      { type: 'food', keyword: '小吃 OR 路邊攤 OR 夜市' },
      { type: 'food', keyword: '外帶 OR 便當 OR 飲料' }
    ];
    const seen = new Set(), combined = [];
    let done = 0;
    queries.forEach(q => {
      svc.nearbySearch({ location, radius, ...q }, (results, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && results?.length) {
          results.forEach(p => { 
            if (!seen.has(p.place_id)) { 
              seen.add(p.place_id); 
              combined.push(p); 
            } 
          });
        }
        if (++done === queries.length) resolve(combined);
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

// 🌟 修正：嘗試第一時間從 Places API 的基礎資料抓出營業狀態
function formatPlace(p) {
  const photos = [];
  if (p.photos?.length)
    for (let i = 0; i < Math.min(p.photos.length, 5); i++)
      photos.push(p.photos[i].getUrl({ maxWidth: 400 }));
  
  let isOpen = null;
  if (p.opening_hours && typeof p.opening_hours.isOpen === 'function') {
    isOpen = p.opening_hours.isOpen();
  } else if (p.business_status === 'CLOSED_TEMPORARILY' || p.business_status === 'CLOSED_PERMANENTLY') {
    isOpen = false;
  }

  return {
    placeId: p.place_id, name: p.name,
    lat: p.geometry.location.lat(), lng: p.geometry.location.lng(),
    dist: null, mins: null,
    rating: p.rating ?? 0, reviews: p.user_ratings_total ?? 0,
    priceLevel: p.price_level,
    isOpen: isOpen,
    weekdayText: null,
    types: (p.types||[]).filter(t => !['food','point_of_interest','establishment'].includes(t)).slice(0, 2),
    photos, address: p.vicinity || '',
  };
}

// 🌟 修正：只去查詢「尚未確認狀態」的店家，並稍微加長延遲避免被 API 鎖定
function fetchOpenStatusBatch(list, svc) {
  return new Promise(resolve => {
    const needsFetch = list.filter(r => r.isOpen === null && r.placeId);
    if (!svc || !needsFetch.length) { resolve(); return; }

    const targetList = needsFetch.slice(0, 30); // 確保最多只額外打 30 次 API，避免卡住
    let pending = targetList.length;

    targetList.forEach((r, i) => {
      setTimeout(() => {
        svc.getDetails(
          { placeId: r.placeId, fields: ['opening_hours', 'utc_offset_minutes', 'business_status'] },
          (res, status) => {
            if (status === google.maps.places.PlacesServiceStatus.OK) {
              if (res?.opening_hours) {
                r.isOpen      = res.opening_hours.isOpen();
                r.weekdayText = res.opening_hours.weekday_text || null;
              } else if (res?.business_status === 'CLOSED_TEMPORARILY' || res?.business_status === 'CLOSED_PERMANENTLY') {
                r.isOpen = false;
              }
            }
            if (--pending === 0) resolve();
          }
        );
      }, i * 150); // 150ms 的安全間隔
    });

    // 設定安全超時時間，避免 API 卡死導致畫面一直轉圈圈
    setTimeout(() => { resolve(); }, targetList.length * 150 + 1000);
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
  header.textContent = '系統掃描周邊店家…';
  
  showSkeleton('aiResultBody');

  try {
    const [_, raw] = await Promise.all([
      fetchWeather(pg.lat, pg.lng),
      (async () => {
        await loadGMaps();
        const map = createHiddenMap(pg.lat, pg.lng);
        aiPlacesService = new google.maps.places.PlacesService(map);
        distMatrixSvc   = new google.maps.DistanceMatrixService();
        return await nearbySearchBoth(aiPlacesService, new google.maps.LatLng(pg.lat, pg.lng), getRadius(pg.transport));
      })()
    ]);
    
    // 🌟 修正：先過濾預算
    let list = raw.map(p => formatPlace(p));
    list = list.filter(r => budgetMatch(r.priceLevel, pg.budget));

    if (list.length && distMatrixSvc) {
      header.textContent = '計算交通時間…';
      const times = await fetchTravelTimes(
        [new google.maps.LatLng(pg.lat, pg.lng)],
        list.map(r => new google.maps.LatLng(r.lat, r.lng)),
        TRAVEL_MODE[pg.transport]
      ).catch(() => []);
      list.forEach((r, i) => {
        if (times[i] != null) r.mins = times[i]; else fallbackMins(r, pg);
      });
    } else {
      list.forEach(r => fallbackMins(r, pg));
    }

    // 🌟 修正：先依照距離排序
    list.sort((a, b) => (a.mins || 0) - (b.mins || 0));

    // 🌟 修正：只針對過濾排序後的最前面 25 家查確認狀態，確保精準
    header.textContent = '確認店家營業狀態…';
    await fetchOpenStatusBatch(list.slice(0, 25), aiPlacesService);

    aiRestaurants = list;

    const listCtx  = aiRestaurants.length
      ? aiRestaurants.slice(0, 30).map((r, i) => {
          const openStr = r.isOpen === true ? '營業中' : r.isOpen === false ? '未營業' : '狀態未知';
          return `${i+1}. ${r.name}｜${r.mins}分鐘｜評分${r.rating}｜${priceLevelStr(r.priceLevel)}｜${openStr}｜${r.types.join('/')}`;
        }).join('\n')
      : '（無資料，請根據台中市一般情況推薦）';

    const userPref = localStorage.getItem('what2eat_pref') || document.getElementById('userPref').value;
    const prefCtx = userPref ? `使用者長期飲食偏好：「${userPref}」，請在推薦時將此條件納入考量。\n` : '';

    const prompt =
      `你是台灣美食推薦助理。使用者目前在台中市附近。\n` +
      `交通：${pg.transport}，時段：${pg.meal}，預算上限：${pg.budget >= 1500 ? '不限' : pg.budget + '元'}。\n` +
      `${currentWeatherCtx}\n${prefCtx}\n` +
      `當下具體需求：「${inp}」\n\n附近真實餐廳清單：\n${listCtx}\n\n` +
      `從清單中嚴選最符合上述所有條件的 3-5 間（優先選「營業中」的），只輸出 JSON（不要其他文字）：\n` +
      `[{"name":"店名","mins":分鐘數,"rating":評分,"priceLevel":0-4,"isOpen":true/false/null,"desc":"20字內介紹為何推薦這家(需結合天氣或偏好)"}]`;

    header.textContent = 'AI 認真思考中…';
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

    header.textContent = `根據您的需求，找到了 ${matched.length} 個絕佳選項`;
    body.innerHTML = '';
    renderAIGroup(body, matched.filter(r => (r.mins||0) <= 10),              '🟢 近（10 分鐘內）',     'near');
    renderAIGroup(body, matched.filter(r => (r.mins||0) > 10 && (r.mins||0) <= 20), '🔵 一般（10–20 分鐘）', 'mid');
    renderAIGroup(body, matched.filter(r => (r.mins||0) > 20),               '🟣 遠（20 分鐘以上）',   'far');

  } catch(e) {
    body.innerHTML = `<div style="color:var(--red);padding:8px 0;font-size:13px;">錯誤：${e.message}</div>`;
    header.textContent = '連線失敗';
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
                  : s.isOpen === false ? '<span class="r-tag closed">休息中</span>' : '';
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
            <span class="dbadge b-${bc}">${s.mins} min</span>${openTag}
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

  showSkeleton('searchResults');

  try {
    await loadGMaps();
    const map     = createHiddenMap(pg.lat, pg.lng);
    placesService = new google.maps.places.PlacesService(map);
    distMatrixSvc = new google.maps.DistanceMatrixService();

    const combined = await nearbySearchBoth(
      placesService, new google.maps.LatLng(pg.lat, pg.lng), getRadius(pg.transport)
    );
    if (!combined.length) {
      showErr('searchErrBanner', '搜尋無結果，啟用模擬數據');
      allRestaurants = getMockData(pg); renderResults(allRestaurants); return;
    }
    
    // 🌟 修正：先過濾預算，砍掉不需要的資料
    let list = combined.map(p => formatPlace(p));
    list = list.filter(r => budgetMatch(r.priceLevel, pg.budget));

    // 🌟 修正：再計算交通時間
    const times = await fetchTravelTimes(
      [new google.maps.LatLng(pg.lat, pg.lng)],
      list.map(r => new google.maps.LatLng(r.lat, r.lng)),
      TRAVEL_MODE[pg.transport]
    ).catch(() => []);
    list.forEach((r, i) => {
      if (times[i] != null) r.mins = times[i]; else fallbackMins(r, pg);
    });

    // 🌟 修正：排好順序
    list.sort((a, b) => (a.mins || 0) - (b.mins || 0));

    // 🌟 修正：最後才針對排好序的「前 30 家」精準查詢營業狀態
    await fetchOpenStatusBatch(list.slice(0, 30), placesService);
    
    allRestaurants = list;
    renderResults(allRestaurants);

  } catch(e) {
    showErr('searchErrBanner', '系統連線異常，啟用模擬數據');
    allRestaurants = getMockData(pg);
    renderResults(allRestaurants);
  }
}

function pickRandom() {
  if (!allRestaurants || allRestaurants.length === 0) {
    showToast('請先搜尋附近餐廳載入名單！');
    return;
  }
  let pool = allRestaurants.filter(r => r.isOpen === true);
  if (pool.length === 0) pool = allRestaurants;

  const overlay = document.getElementById('diceOverlay');
  const textEl  = document.getElementById('diceText');
  overlay.classList.add('show');
  
  let count = 0;
  const interval = setInterval(() => {
    const tempPlace = pool[Math.floor(Math.random() * pool.length)];
    textEl.textContent = tempPlace.name;
    count++;
    
    if (count > 15) {
      clearInterval(interval);
      const finalPlace = pool[Math.floor(Math.random() * pool.length)];
      textEl.innerHTML = `<span style="font-size:16px;color:var(--mt);">這餐就吃...</span><br><br><span style="color:var(--mb);font-size:26px;">${finalPlace.name}</span>`;
      const originalIdx = allRestaurants.indexOf(finalPlace);

      setTimeout(() => {
        overlay.classList.remove('show');
        showDetail(originalIdx);
      }, 1200);
    }
  }, 80);
}

function renderResults(list) {
  const pg = state.search;
  const sorted = list; // 🌟 已經在上一動過濾與排序完了
  
  const t1 = sorted[Math.floor(sorted.length/3)]?.mins   || 10;
  const t2 = sorted[Math.floor(sorted.length*2/3)]?.mins || 20;

  const el = document.getElementById('searchResults');
  el.innerHTML = '';

  const sum = document.createElement('div');
  sum.className = 'results-summary';
  sum.textContent = `共 ${sorted.length} 間 · ${pg.transport} · ${pg.budget >= 1500 ? '預算不限' : '< $'+pg.budget}`;
  el.appendChild(sum);

  document.getElementById('detailBackBtn').setAttribute('onclick', "showPage('searchPage')");
  
  renderGroup(el, sorted.filter(r => (r.mins||0) <= t1),                         `🟢 近距離 ( < ${t1} 分鐘 )`,        'near');
  renderGroup(el, sorted.filter(r => (r.mins||0) > t1 && (r.mins||0) <= t2),     `🔵 一般距離 ( ${t1}–${t2} 分鐘 )`, 'mid');
  renderGroup(el, sorted.filter(r => (r.mins||0) > t2),                          `🟣 較遠 ( > ${t2} 分鐘 )`,      'far');
}

function renderGroup(container, list, label, bc) {
  const sec = document.createElement('div');
  if (!list.length) {
    sec.innerHTML = `
      <div class="sec-label">${label} <span class="sec-count">0</span></div>
      <div class="empty-group">
        <div style="font-size:36px; margin-bottom:12px;">🔍</div>
        <div style="font-size:15px; font-weight:bold; color:var(--mt); margin-bottom:4px;">找不到餐廳</div>
        <div style="font-size:13px; color:var(--mm);">此距離沒有符合條件的結果<br>建議調整預算或交通工具</div>
      </div>`;
    container.appendChild(sec); return;
  }
  
  const cards = list.slice(0, 15).map((r, i) => {
    const ri    = allRestaurants.indexOf(r);
    const emoji = typeEmoji(r.types);
    const thumb = r.photos[0]
      ? `<img class="r-thumb lazy-fade" src="${r.photos[0]}" loading="lazy" alt="" onerror="this.outerHTML='<div class=\\'r-thumb-placeholder\\'>${emoji}</div>'">`
      : `<div class="r-thumb-placeholder">${emoji}</div>`;
    const openTag = r.isOpen === true  ? '<span class="r-tag open">營業中</span>'
                  : r.isOpen === false ? '<span class="r-tag closed">休息中</span>'
                  :                     '<span class="r-tag unknown">確認中</span>';
    const typeTag = r.types.length ? `<span class="r-tag">${r.types[0].replace(/_/g,' ')}</span>` : '';
    return `<div class="r-card" style="animation-delay:${i*0.04}s" onclick="showDetail(${ri})">
      ${thumb}
      <div class="r-body">
        <div class="r-name">${r.name}</div>
        <div class="r-tags"><span class="dbadge b-${bc}">${r.mins ?? '?'} min</span>${typeTag}${openTag}</div>
        <div class="r-footer">
          <span class="r-stars" style="color:var(--amber)">${starsStr(r.rating)} ${r.rating||'—'}</span>
          <span style="font-size:12px;color:var(--mm);">${priceLevelStr(r.priceLevel)}</span>
        </div>
      </div>
    </div>`;
  }).join('');
  sec.innerHTML = `<div class="sec-label">${label} <span class="sec-count">${list.length}</span></div>
    <div class="r-list">${cards}</div>`;
  container.appendChild(sec);
}

function showDetail(idx) {
  const r     = allRestaurants[idx];
  const emoji = typeEmoji(r.types);
  currentDetailPlace = r;

  const hero = document.getElementById('dHero');
  hero.innerHTML = r.photos[0]
    ? `<img class="detail-hero-img lazy-fade" src="${r.photos[0]}" loading="lazy" alt="" onerror="this.outerHTML='<div class=\\'detail-hero-placeholder\\'>${emoji}</div>'">`
    : `<div class="detail-hero-placeholder">${emoji}</div>`;

  document.getElementById('dName').textContent    = r.name;
  document.getElementById('dDist').textContent    = r.mins != null ? `${r.mins} 分鐘` : '';
  document.getElementById('dRating').innerHTML    = `<span class="stars-lg" style="color:var(--amber)">${starsStr(r.rating)}</span> ${r.rating||'—'}`;
  document.getElementById('dReviews').textContent = r.reviews ? `${r.reviews.toLocaleString()} 則評論` : '—';
  document.getElementById('dPrice').textContent   = priceLevelStr(r.priceLevel);
  document.getElementById('dAddr').textContent    = r.address || '—';
  document.getElementById('dPhone').textContent   = '查詢中…';

  const openBadge = document.getElementById('dOpenBadge');
  const setOpen   = v => {
    openBadge.textContent = v === true ? '✓ 營業中' : v === false ? '✗ 休息中' : '';
    openBadge.style.color = v === true ? 'var(--green)' : v === false ? 'var(--red)' : '';
  };
  setOpen(r.isOpen);

  const hoursEl = document.getElementById('dHours');
  hoursEl.innerHTML = r.weekdayText?.length
    ? renderHoursHTML(r.weekdayText)
    : '<span style="color:var(--mg)">查詢中…</span>';

  const ph = document.getElementById('dPhotos');
  const renderPhotos = photos => {
    ph.innerHTML = photos.length
      ? photos.map(u => `<img class="lazy-fade" src="${u}" loading="lazy" alt="" onclick="openLightbox('${u}')" onerror="this.outerHTML='<div class=\\'photo-ph\\'>${emoji}<span>暫無</span></div>'">`).join('')
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
        hero.innerHTML = `<img class="detail-hero-img lazy-fade" src="${newPhotos[0]}" loading="lazy" alt="" onerror="this.outerHTML='<div class=\\'detail-hero-placeholder\\'>${emoji}</div>'">`;
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
    `<div class="${i === dayIdx ? 'hours-today' : ''}" style="${i === dayIdx ? 'color:var(--mb);font-weight:bold;' : ''}">${d}</div>`
  ).join('');
}

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
      `<div style="margin-bottom:6px;font-size:11px;color:var(--mb);letter-spacing:1px;font-weight:bold;">正面評價</div>` +
      obj.pos.map(p => `<span class="review-tag pos">✓ ${p}</span>`).join('') +
      `<div style="margin:10px 0 6px;font-size:11px;color:var(--red);letter-spacing:1px;font-weight:bold;">負面評價</div>` +
      obj.neg.map(n => `<span class="review-tag neg">✕ ${n}</span>`).join('');
  } catch(e) {
    el.innerHTML = '<span style="font-size:13px;color:var(--mm);">無法取得 AI 摘要</span>';
  }
}

function openLightbox(url) {
  document.getElementById('lightboxImg').src = url;
  document.getElementById('lightbox').classList.add('show');
}
function closeLightbox() { document.getElementById('lightbox').classList.remove('show'); }

function getMockData(pg) {
  const items = [
    {n:'春水堂',     c:['taiwanese'],p:2,d:200,  o:true,  wt:['星期一: 10:00 – 22:00','星期二: 10:00 – 22:00','星期三: 10:00 – 22:00','星期四: 10:00 – 22:00','星期五: 10:00 – 22:00','星期六: 10:00 – 22:00','星期日: 10:00 – 22:00']},
    {n:'鼎王麻辣鍋', c:['chinese'],  p:3,d:550,  o:true,  wt:['星期一: 11:30 – 23:00','星期二: 11:30 – 23:00','星期三: 11:30 – 23:00','星期四: 11:30 – 23:00','星期五: 11:30 – 23:00','星期六: 11:30 – 23:00','星期日: 11:30 – 23:00']},
    {n:'老張牛肉麵', c:['chinese'],  p:1,d:450,  o:true,  wt:['星期一: 10:30 – 20:00','星期二: 10:30 – 20:00','星期三: 公休','星期四: 10:30 – 20:00','星期五: 10:30 – 20:00','星期六: 10:30 – 20:00','星期日: 10:30 – 20:00']},
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
