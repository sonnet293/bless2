// js/common.js — 여러 페이지에서 공통으로 쓰는 것들
import { auth, db } from "./firebase.js";
import {
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection,
  query,
  where,
  documentId,
  getDocs,
  getDoc,
  setDoc,
  doc,
  serverTimestamp,
  writeBatch,
  updateDoc,
  getCountFromServer,
  Timestamp,
  orderBy,
  startAt,
  endAt,
  limit,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export const APP_NAME = "UTOPIA";

/* ───────────────────────── DOM 헬퍼 ───────────────────────── */
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 본문 텍스트: 이스케이프 + @아이디 강조 (줄바꿈은 CSS pre-wrap) */
export function formatText(t) {
  return esc(t).replace(
    /(^|[\s(])@([A-Za-z0-9_.가-힣]+)/g,
    '$1<span class="mention">@$2</span>'
  );
}

export const toDate = (v) => (v?.toDate ? v.toDate() : v instanceof Date ? v : v ? new Date(v) : new Date());

export function timeAgo(v) {
  const d = toDate(v);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "방금";
  if (s < 3600) return `${Math.floor(s / 60)}분`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}일`;
  const now = new Date();
  return d.getFullYear() === now.getFullYear()
    ? `${d.getMonth() + 1}월 ${d.getDate()}일`
    : `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export function fullTime(v) {
  const d = toDate(v);
  return d.toLocaleString("ko-KR", {
    year: "numeric", month: "long", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

export const fmt = (n) => Number(n || 0).toLocaleString("ko-KR");

/* ───────────────────────── SVG 아이콘 ───────────────────────── */
const P = {
  logo: '<path d="M12 2.5l2.2 6.3 6.3 2.2-6.3 2.2L12 19.5l-2.2-6.3L3.5 11l6.3-2.2Z"/><path d="M19 17.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8Z"/>',
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
  swords: '<path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="m13 19 6-6"/><path d="m16 16 4 4"/><path d="m19 21 2-2"/><path d="M14.5 6.5 18 3h3v3l-3.5 3.5"/><path d="m5 14 4 4"/><path d="m7 17-3 3"/><path d="m3 19 2 2"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3.5 7 8.5 6 8.5-6"/>',
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  heart: '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z"/>',
  comment: '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.8-.9L3 21l1.9-5.2A8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4Z"/>',
  reply: '<path d="M9 17 4 12l5-5"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  back: '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3Z"/><circle cx="12" cy="13" r="3.2"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.8-3.8"/>',
  ghost: '<path d="M9 10h.01M15 10h.01"/><path d="M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8Z"/>',
  gem: '<path d="M6 3h12l4 6-10 13L2 9Z"/><path d="M11 3 8 9l4 13 4-13-3-6"/><path d="M2 9h20"/>',
  flower: '<circle cx="12" cy="12" r="3"/><path d="M12 16.5A4.5 4.5 0 1 1 7.5 12 4.5 4.5 0 1 1 12 7.5a4.5 4.5 0 1 1 4.5 4.5 4.5 4.5 0 1 1-4.5 4.5"/><path d="M12 7.5V9M7.5 12H9M16.5 12H15M12 16.5V15M8 8l1.9 1.9M14.1 9.9 16 8M8 16l1.9-1.9M14.1 14.1 16 16"/>',
  peace: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18"/><path d="M12 12 5.6 18.4"/><path d="m12 12 6.4 6.4"/>',
  bag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  at: '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.9 7.9"/>',
  eye: '<path d="M2 12s3-7.5 10-7.5S22 12 22 12s-3 7.5-10 7.5S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M10 4.6A9.7 9.7 0 0 1 12 4.5c7 0 10 7.5 10 7.5a14 14 0 0 1-2 3"/><path d="M6.6 6.6C3.6 8.5 2 12 2 12s3 7.5 10 7.5a9.6 9.6 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="m2 2 20 20"/>',
  pokeball: '<circle cx="12" cy="12" r="9"/><path d="M3 12h6M15 12h6"/><circle cx="12" cy="12" r="3"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4.5M12 16h.01"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  feather: '<path d="M20.2 12.2a6 6 0 0 0-8.5-8.5L5 10.5V19h8.5Z"/><path d="M16 8 2 22"/><path d="M17.5 15H9"/>',
};
const FILLED = { heartFill: "heart" };

// 면으로 채워 그리는 아이콘 (선 없음)
const SOLID = {
  ball: '<path d="M14.5 12a2.5 2.5 0 0 1-5 0a2.5 2.5 0 0 1 5 0m7.5 0c0 5.52-4.48 10-10 10S2 17.52 2 12S6.48 2 12 2s10 4.48 10 10m-2 0h-4c0-2.21-1.79-4-4-4s-4 1.79-4 4H4c0 4.41 3.59 8 8 8s8-3.59 8-8"/>',
};

export function icon(name, cls = "") {
  if (SOLID[name]) {
    return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">${SOLID[name]}</svg>`;
  }
  const fill = FILLED[name];
  const path = P[fill || name] || "";
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="${fill ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

/** <span data-icon="mail"></span> → SVG */
export function hydrateIcons(root = document) {
  $$("[data-icon]", root).forEach((el) => {
    el.innerHTML = icon(el.dataset.icon);
  });
}

/* ───────────────────────── 아바타 ───────────────────────── */
export const DEFAULT_AVATAR =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F59A8E"/><stop offset="1" stop-color="#D2302A"/></linearGradient></defs><rect width="64" height="64" fill="url(#g)"/><circle cx="32" cy="25" r="11" fill="#fff" fill-opacity=".9"/><path d="M12 58c2-11 10-17 20-17s18 6 20 17" fill="#fff" fill-opacity=".9"/></svg>`
  );

export const avatarSrc = (u) => u?.profileImage || DEFAULT_AVATAR;

export function avatarHTML(u, size = "") {
  return `<img class="avatar ${size}" src="${esc(avatarSrc(u))}" alt="" loading="lazy" decoding="async">`;
}

// 깨진 프로필 이미지는 기본 이미지로
document.addEventListener(
  "error",
  (e) => {
    const t = e.target;
    if (t instanceof HTMLImageElement && t.classList.contains("avatar") && t.src !== DEFAULT_AVATAR) {
      t.src = DEFAULT_AVATAR;
    }
  },
  true
);

/* ───────────────────────── 인증 ───────────────────────── */
export function requireAuth() {
  return new Promise((resolve) => {
    const off = onAuthStateChanged(auth, (user) => {
      off();
      if (!user) {
        location.replace("index.html");
        return;
      }
      resolve(user);
    });
  });
}

export function ready() {
  document.body.classList.remove("is-loading");
}

export async function logout() {
  if (!(await confirmDialog("로그아웃할까요?", { ok: "로그아웃" }))) return;
  await signOut(auth);
  clearUserCache();
  location.replace("index.html");
}

/* ───────────────── 사용자 캐시 (Firestore 읽기 절약) ─────────────────
 * 내 정보는 users/{내 uid} 에서, 다른 사람은 공개 복사본인 profiles 에서 읽는다.
 * (users 는 본인과 GM 만 읽을 수 있음)
 * localStorage 에 10분간 캐시하고, 여러 명은 'in' 쿼리(30개씩)로 한 번에 읽는다. */
const UC_KEY = "utopia:users:v2";
const UC_TTL = 10 * 60 * 1000;
let uc = {};
try { uc = JSON.parse(localStorage.getItem(UC_KEY)) || {}; } catch { uc = {}; }
const saveUC = () => { try { localStorage.setItem(UC_KEY, JSON.stringify(uc)); } catch {} };

/** 공개용 엔트리: 포켓몬 이름(name, cardName)만. 능력치 · 기술은 profiles 에 올리지 않는다.
 *  규칙(firestore.rules pubEntryOk)이 users.entry 와 같은지 앞 6마리까지 검사한다. */
export function publicEntry(entry) {
  return (Array.isArray(entry) ? entry : []).slice(0, 6).map((p) => {
    const m = { name: p?.name ?? null };
    if (p?.cardName != null) m.cardName = p.cardName;
    return m;
  });
}

/** 내 users 문서를 profiles/{uid} 에 복사. 내용이 바뀌었거나 하루가 지났을 때만 쓴다. */
const SYNC_KEY = "utopia:profileSync:v2";
const SYNC_TTL = 24 * 60 * 60 * 1000;
async function syncProfile(uid, data) {
  const pub = {
    nickname: data.nickname ?? null,
    id: data.id ?? null,
    profileImage: data.profileImage ?? "",
    entry: publicEntry(data.entry),
  };
  const sig = uid + ":" + JSON.stringify(pub);
  let last = null;
  try { last = JSON.parse(localStorage.getItem(SYNC_KEY)); } catch {}
  if (last?.sig === sig && Date.now() - last.t < SYNC_TTL) return;
  try {
    await setDoc(doc(db, "profiles", uid), { ...pub, updatedAt: serverTimestamp() }, { merge: true });
    try { localStorage.setItem(SYNC_KEY, JSON.stringify({ sig, t: Date.now() })); } catch {}
  } catch (e) { console.warn("profile sync", e); }
}

export async function getUsers(uids, { fresh = false } = {}) {
  const ids = [...new Set(uids.filter(Boolean))];
  const now = Date.now();
  // 못 찾은 사용자(null)는 30초만 캐시 — 그 사이 로그인해서 profiles 가 생길 수 있음
  const need = ids.filter((id) => fresh || !uc[id] || now - uc[id].t > (uc[id].u ? UC_TTL : 30 * 1000));
  const myUid = auth.currentUser?.uid;
  const others = need.filter((id) => id !== myUid);

  const jobs = [];
  if (myUid && need.includes(myUid)) {
    jobs.push(
      getDoc(doc(db, "users", myUid)).then((s) => {
        uc[myUid] = { t: now, u: s.exists() ? { uid: myUid, ...s.data() } : null };
        if (s.exists()) syncProfile(myUid, s.data());
      })
    );
  }
  for (let i = 0; i < others.length; i += 30) {
    const chunk = others.slice(i, i + 30);
    jobs.push(
      getDocs(query(collection(db, "profiles"), where(documentId(), "in", chunk))).then((snap) => {
        const found = new Set();
        snap.forEach((d) => { found.add(d.id); uc[d.id] = { t: now, u: { uid: d.id, ...d.data() } }; });
        chunk.forEach((id) => { if (!found.has(id)) uc[id] = { t: now, u: null }; });
      })
    );
  }
  await Promise.all(jobs);
  if (need.length) saveUC();

  const out = {};
  ids.forEach((id) => (out[id] = uc[id]?.u || null));
  return out;
}

export async function getUser(uid, opts) {
  return (await getUsers([uid], opts))[uid] || null;
}

export function patchCachedUser(uid, patch) {
  if (uc[uid]?.u) { uc[uid].u = { ...uc[uid].u, ...patch }; saveUC(); }
}
export function invalidateUser(uid) { delete uc[uid]; saveUC(); }
export function clearUserCache() { uc = {}; try { localStorage.removeItem(UC_KEY); } catch {} }

/** 닉네임 / @아이디 앞부분 검색 (각 최대 6명) */
const searchMemo = new Map();
export async function searchUsers(term, excludeUid) {
  const t = term.trim().replace(/^@/, "");
  if (!t) return [];
  if (!searchMemo.has(t)) {
    const col = collection(db, "profiles");
    const run = (field) => getDocs(query(col, orderBy(field), startAt(t), endAt(t + ""), limit(6)));
    const [a, b] = await Promise.all([run("nickname"), run("id")]);
    const map = new Map();
    const now = Date.now();
    [...a.docs, ...b.docs].forEach((d) => {
      const u = { uid: d.id, ...d.data() };
      map.set(d.id, u);
      if (d.id !== auth.currentUser?.uid) uc[d.id] = { t: now, u }; // 내 캐시는 users 문서(PEACE 포함) 유지
    });
    saveUC();
    searchMemo.set(t, [...map.values()]);
  }
  return searchMemo.get(t).filter((u) => u.uid !== excludeUid);
}

/* ───────────────────────── 레이아웃(사이드바 / 하단 탭) ───────────────────────── */
export function renderShell(active, me) {
  const items = [
    { key: "home", href: "main.html", icon: "home", label: "홈" },
    { key: "profile", href: "profile.html", icon: "user", label: "프로필" },
    { key: "battle", href: "battle.html", icon: "ball", label: "배틀" },
  ];
  const link = (it) =>
    `<a class="nav-item ${active === it.key ? "active" : ""}" href="${it.href}" aria-label="${it.label}" ${active === it.key ? 'aria-current="page"' : ""}>${icon(it.icon)}<span class="nav-label">${it.label}</span></a>`;
  const bell = `<button class="nav-item" type="button" data-noti aria-label="알림"><span class="nav-ic">${icon("bell")}<span class="nav-badge" hidden></span></span><span class="nav-label">알림</span></button>`;

  const side = $("#sidebar");
  if (side) {
    side.innerHTML = `
      <a class="brand" href="main.html" aria-label="${APP_NAME} 홈"><img class="brand-logo" src="img/logo.svg" alt="${APP_NAME}"></a>
      <nav class="side-nav">${items.map(link).join("")}${bell}</nav>
      <div class="side-foot">
        <a class="me-card" href="profile.html">
          ${avatarHTML(me, "sm")}
          <span class="nav-label me-meta"><b>${esc(me?.nickname || "알 수 없음")}</b><small>@${esc(me?.id || "")}</small></span>
        </a>
        <button class="nav-item" type="button" data-logout aria-label="로그아웃">${icon("logout")}<span class="nav-label">로그아웃</span></button>
      </div>`;
  }
  const bottom = $("#bottomnav");
  if (bottom) bottom.innerHTML = items.map(link).join("") + bell;

  if (side) $$("[data-logout]", side).forEach((b) => b.addEventListener("click", logout));
  $$("[data-noti]").forEach((b) => b.addEventListener("click", openNotifications));
  initNotifications(me);
}

/* ───────────────────────── 알림 (댓글 · 답글) ─────────────────────────
 * notifications/{id} : { to, from, type: "comment"|"reply", postId, commentId, nickname, handle, text, createdAt, expireAt }
 * 비용 절약:
 *  - 개수는 getCountFromServer(집계) → 알림이 몇 개든 읽기 1회. 결과는 sessionStorage 에 60초 캐시해서
 *    페이지를 옮겨 다녀도 다시 읽지 않고, 탭으로 돌아왔을 때만(60초 지났으면) 다시 센다. 실시간 리스너 없음.
 *  - '읽음' 처리는 알림마다 쓰지 않고 마지막 확인 시각(notiSeenAt) 하나만 저장 (localStorage + users 문서).
 *  - 목록은 알림창을 열 때만 최대 NOTI_PAGE 개 읽고, 새 알림이 없으면 5분간 캐시를 그대로 보여준다. */
const NOTI_PAGE = 20;
const NOTI_CNT_TTL = 60 * 1000;
const NOTI_LIST_TTL = 5 * 60 * 1000;
const NOTI_SEEN_KEY = "utopia:notiSeen:";
const NOTI_CNT_KEY = "utopia:notiCount:v1";
const NOTI_LIST_KEY = "utopia:notiList:v1";
let notiMe = null;
let notiCount = 0;
let notiBound = false;

/** Firestore Timestamp · {seconds} (캐시된 JSON) · Date · number → ms */
const toMs = (v) =>
  v == null ? 0
    : typeof v === "number" ? v
    : v.toMillis ? v.toMillis()
    : v.seconds != null ? v.seconds * 1000
    : toDate(v).getTime();

const ssGet = (k) => { try { return JSON.parse(sessionStorage.getItem(k)); } catch { return null; } };
const ssSet = (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} };

function notiSeenAt() {
  const uid = auth.currentUser?.uid;
  let local = 0;
  try { local = Number(localStorage.getItem(NOTI_SEEN_KEY + uid)) || 0; } catch {}
  return Math.max(local, toMs(notiMe?.notiSeenAt));
}

function setNotiBadge(n) {
  notiCount = n;
  $$("[data-noti]").forEach((b) => {
    const badge = $(".nav-badge", b);
    badge.hidden = !n;
    badge.textContent = n > 99 ? "99+" : String(n);
    b.setAttribute("aria-label", n ? `알림 (새 알림 ${n}개)` : "알림");
  });
}

async function refreshNotiCount({ force = false } = {}) {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const seen = notiSeenAt();
  const c = ssGet(NOTI_CNT_KEY);
  if (!force && c?.uid === uid && c.seen === seen && Date.now() - c.t < NOTI_CNT_TTL) return setNotiBadge(c.n);
  try {
    const snap = await getCountFromServer(query(
      collection(db, "notifications"),
      where("to", "==", uid),
      where("createdAt", ">", Timestamp.fromMillis(seen)),
      orderBy("createdAt", "desc")
    ));
    const n = snap.data().count;
    ssSet(NOTI_CNT_KEY, { uid, seen, n, t: Date.now() });
    setNotiBadge(n);
  } catch (e) { console.warn("noti count", e); }
}

function initNotifications(me) {
  notiMe = me;
  refreshNotiCount();
  if (notiBound) return;
  notiBound = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") refreshNotiCount();
  });
}

const onHome = () => /(^|\/)(main\.html)?$/.test(location.pathname);

let notiDlg = null;
function notiDialog() {
  if (notiDlg) return notiDlg;
  notiDlg = document.createElement("dialog");
  notiDlg.className = "dlg";
  notiDlg.id = "notiDlg";
  notiDlg.setAttribute("aria-labelledby", "notiTitle");
  notiDlg.innerHTML = `
    <div class="dlg-inner">
      <header class="dlg-head">
        <button type="button" class="icon-btn" data-close aria-label="닫기">${icon("x")}</button>
        <h2 id="notiTitle">알림</h2>
        <span></span>
      </header>
      <div class="dlg-body noti-list"></div>
    </div>`;
  document.body.appendChild(notiDlg);
  wireDialog(notiDlg);
  $(".noti-list", notiDlg).addEventListener("click", (e) => {
    const a = e.target.closest("a.noti");
    if (!a || !onHome()) return;
    // 홈에 있으면 새로고침 없이 해시만 바꿔서 글을 연다 (main.js 의 hashchange)
    e.preventDefault();
    notiDlg.close();
    location.hash = a.getAttribute("href").split("#")[1];
  });
  return notiDlg;
}

async function openNotifications() {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const dlg = notiDialog();
  const list = $(".noti-list", dlg);
  const seen = notiSeenAt();
  openDialog(dlg);

  let items;
  const cached = ssGet(NOTI_LIST_KEY);
  if (!notiCount && cached?.uid === uid && Date.now() - cached.t < NOTI_LIST_TTL) {
    items = cached.items; // 새 알림이 없으면 다시 읽지 않음
  } else {
    list.innerHTML = `<div class="skel small"><span class="skel-avatar"></span><span class="skel-lines"><i></i><i></i><i></i></span></div>`.repeat(3);
    try {
      const snap = await getDocs(query(
        collection(db, "notifications"), where("to", "==", uid), orderBy("createdAt", "desc"), limit(NOTI_PAGE)
      ));
      items = snap.docs.map((d) => {
        const x = d.data();
        return {
          id: d.id, type: x.type, from: x.from, postId: x.postId, commentId: x.commentId,
          nickname: x.nickname, handle: x.handle, text: x.text, at: toMs(x.createdAt) || Date.now(),
        };
      });
      ssSet(NOTI_LIST_KEY, { uid, t: Date.now(), items });
    } catch (e) {
      console.error(e);
      list.innerHTML = `<div class="empty">${icon("alert")}<b>알림을 불러오지 못했어요</b><span>${esc(errMsg(e))}</span></div>`;
      return;
    }
  }

  let authors = {};
  try { authors = await getUsers(items.map((n) => n.from)); } catch {}
  list.innerHTML = items.length
    ? items.map((n) => notiHTML(n, authors[n.from], n.at > seen)).join("")
    : `<div class="empty">${icon("bell")}<b>아직 알림이 없어요</b><span>내 글에 댓글이나 답글이 달리면 여기에 표시돼요.</span></div>`;

  // 확인 처리: 새 알림이 있었을 때만 기록 (없으면 쓰기 0회)
  if (notiCount || (items[0] && items[0].at > seen)) {
    const now = Math.max(Date.now(), items[0]?.at || 0);
    try { localStorage.setItem(NOTI_SEEN_KEY + uid, String(now)); } catch {}
    ssSet(NOTI_CNT_KEY, { uid, seen: notiSeenAt(), n: 0, t: Date.now() });
    setNotiBadge(0);
    // 다른 기기와 맞추려고 users 문서에도 저장 (규칙에서 막혀도 이 기기는 localStorage 로 동작)
    updateDoc(doc(db, "users", uid), { notiSeenAt: Timestamp.fromMillis(now) })
      .then(() => patchCachedUser(uid, { notiSeenAt: now }))
      .catch((e) => console.warn("notiSeenAt", e));
  }
}

function notiHTML(n, author, unread) {
  const name = `<b>${esc(author?.nickname || n.nickname || "알 수 없음")}</b>`;
  const title = n.type === "reply"
    ? `${name}님이 회원님의 댓글에 답글을 남겼어요`
    : `${name}님이 회원님의 게시물에 댓글을 남겼어요`;
  const href = `main.html#post-${encodeURIComponent(n.postId)}${n.commentId ? "/" + encodeURIComponent(n.commentId) : ""}`;
  return `
  <a class="noti ${unread ? "unread" : ""}" href="${esc(href)}">
    <span class="noti-av">${avatarHTML(author, "sm")}<span class="noti-type ${n.type === "reply" ? "reply" : ""}">${icon(n.type === "reply" ? "reply" : "comment")}</span></span>
    <span class="noti-main">
      <span class="noti-head"><span class="noti-title">${title}</span><time title="${esc(fullTime(n.at))}">${timeAgo(n.at)}</time></span>
      ${n.text ? `<span class="noti-text">${formatText(n.text)}</span>` : ""}
    </span>
  </a>`;
}

/** 댓글/답글을 단 뒤 받는 사람들에게 알림 생성 (쓰기 = 받는 사람 수). targets: Map<uid, "comment"|"reply"> */
export async function sendNotifications(targets, { postId, commentId, me, text }) {
  const uid = auth.currentUser?.uid;
  const list = [...targets].filter(([to]) => to && to !== uid);
  if (!list.length) return;
  const b = writeBatch(db);
  // TTL 정책(expireAt)을 켜 두면 30일 지난 알림은 자동 삭제 → 저장 용량 · 색인 절약
  const expireAt = Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000);
  list.forEach(([to, type]) => {
    b.set(doc(collection(db, "notifications")), {
      to, from: uid, type, postId, commentId,
      nickname: me?.nickname || "", handle: me?.id || "",
      text: String(text || "").slice(0, 80),
      createdAt: serverTimestamp(), expireAt,
    });
  });
  await b.commit();
}

/* ───────────────────────── 토스트 ───────────────────────── */
export function toast(msg, type = "") {
  let wrap = $(".toast-wrap");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.className = "toast-wrap";
    wrap.setAttribute("role", "status");
    document.body.appendChild(wrap);
  }
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `${icon(type === "error" ? "alert" : "check")}<span>${esc(msg)}</span>`;
  wrap.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 300);
  }, 2600);
}

/* ───────────────────────── 다이얼로그 ───────────────────────── */
export function openDialog(dlg) {
  if (!dlg.open) dlg.showModal();
}
export function closeDialog(dlg) {
  if (dlg.open) dlg.close();
}
/** 배경 클릭 · [data-close] 클릭으로 닫기 */
export function wireDialog(dlg) {
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg || e.target.closest("[data-close]")) dlg.close();
  });
}

export function confirmDialog(message, { ok = "확인", danger = false } = {}) {
  return new Promise((resolve) => {
    const dlg = document.createElement("dialog");
    dlg.className = "dlg-confirm";
    dlg.innerHTML = `
      <div class="confirm-body">
        <p>${esc(message)}</p>
        <div class="confirm-actions">
          <button class="btn ghost" value="no">취소</button>
          <button class="btn ${danger ? "danger" : "primary"}" value="yes">${esc(ok)}</button>
        </div>
      </div>`;
    document.body.appendChild(dlg);
    let result = false;
    dlg.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (b) { result = b.value === "yes"; dlg.close(); }
      else if (e.target === dlg) dlg.close();
    });
    dlg.addEventListener("close", () => { dlg.remove(); resolve(result); });
    dlg.showModal();
    $("button[value=yes]", dlg).focus();
  });
}

/* ───────────────────────── 받는 사람 선택기 ───────────────────────── */
export function recipientPicker(root, { excludeUid, onChange } = {}) {
  root.classList.add("picker");
  root.innerHTML = `
    <div class="picker-input">
      ${icon("search")}
      <input type="search" placeholder="닉네임 또는 @아이디로 검색" autocomplete="off" spellcheck="false" aria-label="받는 사람 검색">
    </div>
    <ul class="picker-results" hidden></ul>
    <div class="picker-chosen" hidden></div>`;
  const input = $("input", root);
  const list = $(".picker-results", root);
  const chosenEl = $(".picker-chosen", root);
  let chosen = null;
  let timer;
  let seq = 0;

  const set = (u) => {
    chosen = u;
    $(".picker-input", root).hidden = !!u;
    list.hidden = true;
    chosenEl.hidden = !u;
    chosenEl.innerHTML = u
      ? `${avatarHTML(u, "sm")}<span class="pc-meta"><b>${esc(u.nickname)}</b><small>@${esc(u.id)}</small></span>
         <button type="button" class="icon-btn sm" aria-label="다시 선택">${icon("x")}</button>`
      : "";
    if (!u) { input.value = ""; input.focus(); }
    onChange?.(u);
  };

  input.addEventListener("input", () => {
    clearTimeout(timer);
    const term = input.value;
    if (!term.trim().replace(/^@/, "")) { list.hidden = true; return; }
    timer = setTimeout(async () => {
      const my = ++seq;
      list.hidden = false;
      list.innerHTML = `<li class="picker-empty">검색 중…</li>`;
      try {
        const res = await searchUsers(term, excludeUid);
        if (my !== seq) return;
        list.innerHTML = res.length
          ? res.map((u, i) => `<li><button type="button" data-i="${i}">${avatarHTML(u, "sm")}<span class="pc-meta"><b>${esc(u.nickname)}</b><small>@${esc(u.id)}</small></span></button></li>`).join("")
          : `<li class="picker-empty">일치하는 사람이 없어요</li>`;
        list.onclick = (e) => {
          const b = e.target.closest("button[data-i]");
          if (b) set(res[+b.dataset.i]);
        };
      } catch (err) {
        console.error(err);
        list.innerHTML = `<li class="picker-empty">검색하지 못했어요</li>`;
      }
    }, 350);
  });
  chosenEl.addEventListener("click", (e) => { if (e.target.closest("button")) set(null); });

  return { get value() { return chosen; }, reset: () => set(null) };
}

/* 버튼 로딩 상태 */
export async function withBusy(btn, fn) {
  if (btn.disabled) return;
  btn.disabled = true;
  btn.classList.add("busy");
  try { return await fn(); }
  finally { btn.disabled = false; btn.classList.remove("busy"); }
}

export function errMsg(e) {
  const c = e?.code || "";
  if (c.includes("permission-denied")) return "권한이 없거나 조건이 맞지 않아요.";
  if (c.includes("unavailable") || c.includes("network")) return "네트워크 연결을 확인해 주세요.";
  if (c.includes("failed-precondition")) return "Firestore 색인이 필요해요. 콘솔(F12)의 링크를 확인해 주세요.";
  return e?.message || "알 수 없는 오류가 발생했어요.";
}
