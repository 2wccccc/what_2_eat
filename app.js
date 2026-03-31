/* ══════════════════════════════════════
   吃什麼？— app.js
   ══════════════════════════════════════ */

const GKEY = 'AIzaSyAf96oPZjdLci_LV74k4DzvjgaHSsGTFW8';

// ── State ──
let userLat = null, userLng = null;
let allRestaurants = [];
let transport = '步行', meal = '早餐';
let budgetMax = 300;
let loggedIn = false;
let placesService = null;
let mapsLoaded = false;

// 速度（公尺／分鐘）
const SPEED = { '步行': 67, '騎車': 167, '開車': 400 };

/* ── Page / UI helpers ── */
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const el = document.getElementById(id);
  el.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

function showErr(msg) {
  const b = document.getElementById('errBanner');
  b.textContent = msg;
  b.classList.add('show');
  setTimeout(() => b.classList.remove('show'), 6000);
}

function showLoading(txt) {
  document.getElementById('loadText').textContent = txt || '搜尋中…';
  document.getElementById('loadingOverlay').classList.add('show');
}
function hideLoading() {
  document.getElementById('loadingOverlay').classList.remove('show');
}

/* ── Nav scroll shadow ── */
window.addEventListener('scroll', () => {
  document.querySelector('nav').classList.toggle('scrolled', window.scrollY > 8);
});

/* ── Filters ── */
function setChip(el, group) {
  el.closest('.chip-group').querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  if (group === 'transport') transport = el.textContent;
  if (group === 'meal') meal = el.textContent;
}

function updateBudget(val) {
  budgetMax = +val;
  document.getElementById('budgetVal').textContent = +val >= 1500 ? '1500+' : val;
}

function budgetMatch(priceLevel) {
  if (budgetMax >= 1500) return true;
  const map = { 0: 50, 1: 150, 2: 400, 3: 800, 4: 1500 };
  return (map[priceLevel ?? 1] ?? 150) <= budgetMax;
}

/* ── Login ── */
function handleLogin() {
  loggedIn = !loggedIn;
  document.getElementById('loginText').textContent = loggedIn ? '已登入' : 'Google 登入';
  showToast(loggedIn ? '✓ 登入成功（模擬）' : '已登出');
}

/* ── Geolocation ── */
function locateMe() {
  const s = document.getElementById('locateStatus');
  s.textContent = '定位中…'; s.className = 'locate-status';
  if (!navigator.geolocation) { s.textContent = '不支援定位'; return; }
  navigator.geolocation.getCurrentPosition(
    pos => {
      userLat = pos.coords.latitude;
      userLng = pos.coords.longitude;
      s.textContent = `已定位 (${userLat.toFixed(3)}, ${userLng.toFixed(3)})`;
      s.className = 'locate-status ok';
    },
    () => {
      userLat = 24.1477; userLng = 120.6736;
      s.textContent = '使用預設位置（台中市）';
      s.className = 'locate-status ok';
    }
  );
}

/* ── Google Maps Loader ── */
function loadGMaps() {
  return new Promise((res, rej) => {
    if (mapsLoaded && window.google?.maps) { res(); return; }
    if (document.getElementById('gmaps-script')) {
      const wait = setInterval(() => {
        if (window.google?.maps) { clearInterval(wait); mapsLoaded = true; res(); }
      }, 100);
      setTimeout(() => { clearInterval(wait); rej(new Error('timeout')); }, 10000);
      return;
    }
    window._gmapsReady = () => { mapsLoaded = true; res(); };
    const s = document.createElement('script');
    s.id = 'gmaps-script';
    s.src = `https://maps.googleapis.com/maps/api/js?key=${GKEY}&libraries=places&callback=_gmapsReady`;
    s.async = true; s.defer = true;
    s.onerror = () => rej(new Error('載入失敗'));
    document.head.appendChild(s);
  });
}

function getRadius() {
  return transport === '開車' ? 5000 : transport === '騎車' ? 3000 : 1500;
}

function getMins(distM) {
  return Math.max(1, Math.round(distM / SPEED[transport]));
}

/* ── Search ── */
async function searchNearby() {
  if (!userLat) {
    userLat = 24.1477; userLng = 120.6736;
    document.getElementById('locateStatus').textContent = '使用預設位置（台中市）';
    document.getElementById('locateStatus').className = 'locate-status ok';
  }
  showLoading('正在載入 Google Maps…');
  try {
    await loadGMaps();
    document.getElementById('loadText').textContent = '正在搜尋附近餐廳…';
    const mapDiv = document.createElement('div');
    mapDiv.style.cssText = 'width:1px;height:1px;position:absolute;top:-9999px';
    document.body.appendChild(mapDiv);
    const map = new google.maps.Map(mapDiv, {
      center: { lat: userLat, lng: userLng }, zoom: 15
    });
    placesService = new google.maps.places.PlacesService(map);
    placesService.nearbySearch({
      location: new google.maps.LatLng(userLat, userLng),
      radius: getRadius(),
      type: 'restaurant'
    }, (results, status) => {
      hideLoading();
      if (status === google.maps.places.PlacesServiceStatus.OK && results?.length) {
        allRestaurants = results.map(p => formatPlace(p));
        renderResults(allRestaurants);
      } else {
        showErr('Google Places 回應異常，改用示範資料');
        allRestaurants = getMockData();
        renderResults(allRestaurants);
      }
    });
  } catch (e) {
    hideLoading();
    showErr('Google Maps 載入失敗，請確認 API 設定');
    allRestaurants = getMockData();
    renderResults(allRestaurants);
  }
}

/* ── Math / Format helpers ── */
function haversine(la1, lo1, la2, lo2) {
  const R = 6371000;
  const dLa = (la2 - la1) * Math.PI / 180;
  const dLo = (lo2 - lo1) * Math.PI / 180;
  const a = Math.sin(dLa / 2) ** 2
    + Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.sin(dLo / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function priceLevelStr(lvl) {
  return { 0: '免費', 1: '$ 便宜', 2: '$$ 中等', 3: '$$$ 較貴', 4: '$$$$ 高級' }[lvl] ?? '未提供';
}

function starsStr(r) {
  const f = Math.round(r || 0);
  return '★'.repeat(f) + '☆'.repeat(5 - f);
}

function typeEmoji(types) {
  const t = (types || []).join(',');
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

function genDesc(types) {
  const t = (types || []).join(',');
  if (t.includes('japanese')) return '提供道地日式料理，食材新鮮，環境清雅靜謐。';
  if (t.includes('korean'))   return '韓式料理風味道地，烤肉與小菜豐富多樣。';
  if (t.includes('chinese'))  return '傳統中式口味，家常料理溫暖踏實。';
  if (t.includes('cafe'))     return '咖啡與輕食兼備，空間舒適適合休憩。';
  if (t.includes('fast_food'))return '快速便利，適合忙碌時補充能量的好選擇。';
  if (t.includes('bar'))      return '氣氛輕鬆，適合下班後和朋友小聚。';
  const d = [
    '提供多樣化料理，食材新鮮，深受在地人喜愛。',
    '風格獨特，烹調用心，每道料理都有驚喜。',
    '環境舒適整潔，適合朋友家人一起用餐。'
  ];
  return d[Math.floor(Math.random() * d.length)];
}

/* ── Place formatter ── */
function formatPlace(p) {
  const lat  = p.geometry.location.lat();
  const lng  = p.geometry.location.lng();
  const dist = haversine(userLat, userLng, lat, lng);
  const mins = getMins(dist);
  const photos = [];
  if (p.photos?.length) {
    for (let i = 0; i < Math.min(p.photos.length, 5); i++) {
      photos.push(p.photos[i].getUrl({ maxWidth: 400 }));
    }
  }
  return {
    id: p.place_id, name: p.name, lat, lng,
    dist: Math.round(dist), mins,
    rating: p.rating ?? 0,
    reviews: p.user_ratings_total ?? 0,
    priceLevel: p.price_level,
    open: p.opening_hours?.isOpen() ?? null,
    types: (p.types || []).filter(t => !['food','point_of_interest','establishment'].includes(t)).slice(0, 2),
    photos,
    address: p.vicinity || '',
    desc: genDesc(p.types),
    placeId: p.place_id
  };
}

/* ── Render Results ── */
function renderResults(list) {
  const filtered = list.filter(r => budgetMatch(r.priceLevel));

  // 用距離三等分，確保每個區間都有資料
  const dists = filtered.map(r => r.dist).sort((a, b) => a - b);
  const t1 = dists[Math.floor(dists.length / 3)]     || 400;
  const t2 = dists[Math.floor(dists.length * 2 / 3)] || 900;

  const near = filtered.filter(r => r.dist <= t1);
  const mid  = filtered.filter(r => r.dist > t1 && r.dist <= t2);
  const far  = filtered.filter(r => r.dist > t2);

  // 換算成分鐘顯示給使用者
  const m1 = getMins(t1), m2 = getMins(t2);

  const budgetLabel = budgetMax >= 1500 ? '不限預算' : `${budgetMax}`;
  document.getElementById('resSummary').textContent =
    `${filtered.length} 間 · ${transport} · ${budgetLabel}`;

  renderGroup('nearList', near, `🟢 近（${m1} 分鐘內）`,           'near');
  renderGroup('midList',  mid,  `🔵 一般（${m1}–${m2} 分鐘）`,     'mid');
  renderGroup('farList',  far,  `🟣 遠（${m2} 分鐘以上）`,          'far');
  showPage('resultsPage');
}

function renderGroup(cid, list, label, bc) {
  const el = document.getElementById(cid);
  if (!list.length) {
    el.innerHTML = `
      <div class="sec-label">${label} <span class="sec-count">0</span></div>
      <div class="empty-group">此區間目前沒有符合條件的餐廳</div>`;
    return;
  }
  const cards = list.slice(0, 10).map((r, i) => {
    const ri = allRestaurants.indexOf(r);
    const openTag = r.open === null ? '' :
      r.open ? '' : '<span class="r-tag closed">未營業</span>';
    const typeTag = r.types.length
      ? `<span class="r-tag">${r.types[0].replace(/_/g, ' ')}</span>` : '';
    return `<div class="r-card" style="animation-delay:${i * 0.05}s" onclick="showDetail(${ri})">
      <div>
        <div class="r-name">${r.name}</div>
        <div class="r-tags">
          <span class="dbadge b-${bc}">${r.mins} 分鐘</span>${typeTag}${openTag}
        </div>
      </div>
      <div class="r-right">
        <div class="r-stars">${starsStr(r.rating)}</div>
        <div class="r-meta">${r.rating || '—'} · ${'$'.repeat((r.priceLevel ?? 0) + 1)}</div>
      </div>
    </div>`;
  }).join('');

  el.innerHTML = `
    <div class="sec-label">${label} <span class="sec-count">${list.length}</span></div>
    <div class="r-list">${cards}</div>`;
}

/* ── Detail ── */
function showDetail(idx) {
  const r = allRestaurants[idx];
  document.getElementById('dName').textContent = r.name;
  document.getElementById('dDist').textContent = `${r.dist}m · ${r.mins} 分鐘`;

  const openEl = document.getElementById('dOpen');
  if (r.open === null) {
    openEl.textContent = '';
  } else {
    openEl.textContent = r.open ? '✓ 現在營業中' : '✗ 目前未營業';
    openEl.style.color  = r.open ? '#3B6D11' : '#A32D2D';
  }

  document.getElementById('dType').textContent =
    (r.types || []).join(' · ').replace(/_/g, ' ');
  document.getElementById('dDesc').textContent = r.desc;
  document.getElementById('dRating').innerHTML =
    `<span class="stars-lg">${starsStr(r.rating)}</span> ${r.rating || '—'}`;
  document.getElementById('dReviews').textContent =
    r.reviews ? `${r.reviews.toLocaleString()} 則` : '—';
  document.getElementById('dPrice').textContent = priceLevelStr(r.priceLevel);
  document.getElementById('dAddr').textContent  = r.address || '—';
  document.getElementById('dPhone').textContent = '查詢中…';

  // Photos
  const ph = document.getElementById('dPhotos');
  const emoji = typeEmoji(r.types);
  if (r.photos.length) {
    const imgs = r.photos.map(u =>
      `<img src="${u}" alt="餐廳照片"
        onerror="this.outerHTML='<div class=\\'photo-placeholder\\'>${emoji}<span>暫無圖片</span></div>'">`
    ).join('');
    const extra = r.photos.length < 3
      ? Array(3 - r.photos.length)
          .fill(`<div class="photo-placeholder">${emoji}<span>更多照片</span></div>`)
          .join('')
      : '';
    ph.innerHTML = imgs + extra;
  } else {
    ph.innerHTML = Array(3)
      .fill(`<div class="photo-placeholder">${emoji}<span>暫無圖片</span></div>`)
      .join('');
  }

  document.getElementById('dMapsLink').href =
    `https://www.google.com/maps/place/?q=place_id:${r.placeId}`;

  // Fetch phone & extra photos via Details API
  if (placesService && r.placeId) {
    placesService.getDetails(
      { placeId: r.placeId, fields: ['formatted_phone_number', 'photos'] },
      (res, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK) {
          document.getElementById('dPhone').textContent =
            res?.formatted_phone_number || '未提供';
          if (res?.photos?.length > r.photos.length) {
            const newPhotos = [];
            for (let i = 0; i < Math.min(res.photos.length, 5); i++) {
              newPhotos.push(res.photos[i].getUrl({ maxWidth: 400 }));
            }
            r.photos = newPhotos;
            ph.innerHTML = newPhotos.map(u =>
              `<img src="${u}" alt="餐廳照片"
                onerror="this.outerHTML='<div class=\\'photo-placeholder\\'>${emoji}<span>暫無圖片</span></div>'">`
            ).join('');
          }
        } else {
          document.getElementById('dPhone').textContent = '未提供';
        }
      }
    );
  } else {
    document.getElementById('dPhone').textContent = '—';
  }

  showPage('detailPage');
}

/* ── AI（Gemini 免費版）── */
const GEMINI_KEY = 'AIzaSyCamxBr6pOS0qvdcwNoXCG-fWd-4JwbMp0'; // ← 貼上你的 Gemini API Key
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_KEY}`;

async function askAI() {
  const inp = document.getElementById('aiInput').value.trim();
  if (!inp) return;
  const res = document.getElementById('aiResult');
  res.className = 'ai-result show';
  res.innerHTML = '<div class="ai-loading"><div class="ald"></div><div class="ald"></div><div class="ald"></div></div>';
  try {
    const loc = userLat
      ? `使用者在台灣台中市附近（${userLat.toFixed(2)},${userLng.toFixed(2)}）。`
      : '使用者在台灣台中市。';
    const budgetCtx = budgetMax >= 1500 ? '不限預算' : `預算每人約 ${budgetMax} 元以內`;
    const prompt = `你是台灣美食推薦助理。${loc}${budgetCtx}。使用者說：「${inp}」\n\n請用繁體中文推薦2-3種適合的餐廳類型，每個一行，格式：【餐廳類型】理由（30字內）。`;

    const r = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 512, temperature: 0.7 }
      })
    });
    const data = await r.json();
    if (data.error) {
      res.innerHTML = `API 錯誤：${data.error.message}`;
      return;
    }
    const txt = data.candidates?.[0]?.content?.parts?.[0]?.text || '無法取得建議';
    res.innerHTML = txt.replace(/\n/g, '<br>');
  } catch (e) {
    res.innerHTML = `連線失敗：${e.message}`;
  }
}

/* ── Mock Data ── */
function getMockData() {
  const items = [
    { n: '春水堂',     c: ['taiwanese'], p: 2, d: 200  },
    { n: '鼎王麻辣鍋', c: ['chinese'],   p: 3, d: 550  },
    { n: '一中豆花',   c: ['dessert'],   p: 1, d: 350  },
    { n: '老乾杯燒肉', c: ['japanese'],  p: 3, d: 900  },
    { n: '韓國村',     c: ['korean'],    p: 2, d: 1200 },
    { n: '老張牛肉麵', c: ['chinese'],   p: 1, d: 450  },
    { n: '三媽臭臭鍋', c: ['chinese'],   p: 1, d: 750  },
    { n: '呷二嘴',     c: ['taiwanese'], p: 1, d: 1500 },
    { n: '清新咖啡',   c: ['cafe'],      p: 2, d: 2000 },
    { n: '好初早餐',   c: ['cafe'],      p: 1, d: 100  }
  ];
  return items.map((it, i) => {
    const dist = it.d + Math.round((Math.random() - 0.5) * 100);
    const mins = getMins(dist);
    return {
      id: i, name: it.n,
      lat: userLat + (Math.random() - 0.5) * 0.01,
      lng: userLng + (Math.random() - 0.5) * 0.01,
      dist, mins,
      rating: +(3.5 + Math.random() * 1.5).toFixed(1),
      reviews: Math.round(50 + Math.random() * 500),
      priceLevel: it.p,
      open: Math.random() > 0.3,
      types: it.c,
      photos: [],
      address: '台中市',
      desc: genDesc(it.c),
      placeId: null
    };
  });
}

/* ── Init ── */
locateMe();
