// js/avatar.js
// 프로필 사진 관련 공통 모듈 (업로드 전처리 + 표시)
// - 업로드: Supabase 스토리지 avatars/{uid}/avatar (profile.js / supabase.js)
// - 표시: 다른 유저의 users 문서는 규칙상 읽을 수 없으므로, uid로 공개 URL을 직접 만든다 (배틀 목록 / 대기실)
export const SUPABASE_URL = "https://xnbegbwpqhhfbnhwjbuw.supabase.co";
export const AVATAR_BUCKET = "avatars";

/** 업로드 경로: avatars/{uid}/avatar  (스토리지 정책이 폴더명 = Firebase uid 로 검사) */
export const avatarPath = (uid) => `${uid}/avatar`;

/* ───────────────────────── 표시 ───────────────────────── */

// 페이지를 새로 열 때마다 최신 이미지를 받도록 (프로필에서 같은 경로에 덮어쓰기 때문)
const PAGE_VERSION = Date.now();

// 이미지가 없는(업로드 안 한) uid는 다시 요청하지 않고 바로 기본 아이콘으로 표시
const missing = new Set();
// 한 번 불러온 URL은 다시 그릴 때 기본 아이콘을 거치지 않고 바로 이미지로 (대기실은 스냅샷마다 다시 그림)
const loaded = new Set();

/** 사진이 없을 때 보여주는 사람 모양 아이콘 */
export const PERSON_SVG =
  '<svg class="avatar-person" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
  '<circle cx="12" cy="8.2" r="4.2"/><path d="M3.6 21.2c.6-4.6 4-7.6 8.4-7.6s7.8 3 8.4 7.6Z"/></svg>';

export function avatarUrl(uid) {
  return `${SUPABASE_URL}/storage/v1/object/public/${AVATAR_BUCKET}/${avatarPath(uid)}?v=${PAGE_VERSION}`;
}

/**
 * container 안을 프로필 이미지로 채우고, 없거나 실패하면 사람 모양 아이콘을 보여준다.
 * src를 주면 그 URL을 우선 사용 (내 users 문서의 profileImage 등)
 */
export function fillAvatar(container, { uid, src, label } = {}) {
  container.innerHTML = PERSON_SVG;
  container.classList.remove("has-image");
  if (label) container.setAttribute("aria-label", label);

  const url = src || (uid && !missing.has(uid) ? avatarUrl(uid) : null);
  if (!url) return;

  const show = (img) => {
    container.replaceChildren(img);
    container.classList.add("has-image");
  };

  const img = new Image();
  img.alt = "";
  img.decoding = "async";
  img.onload = () => {
    loaded.add(url);
    show(img);
  };
  img.onerror = () => {
    if (uid && !src) missing.add(uid);
  };
  img.src = url;
  if (loaded.has(url)) show(img);
}

/* ───────────────────────── 업로드 전처리 ───────────────────────── */

/** 업로드 전에 정사각형으로 자르고 줄여서 용량(=스토리지/전송 비용)을 줄인다 */
export async function resizeImage(file, size = 400) {
  const img = await loadImage(file);
  const s = Math.min(img.width, img.height);
  const sx = (img.width - s) / 2;
  const sy = (img.height - s) / 2;
  const out = Math.min(size, s);

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = out;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, s, s, 0, 0, out, out);

  const blob =
    (await toBlob(canvas, "image/webp", 0.86)) ||
    (await toBlob(canvas, "image/jpeg", 0.88));
  if (!blob) throw new Error("이미지를 변환하지 못했어요.");
  return blob;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("이미지를 읽을 수 없어요.")); };
    img.src = url;
  });
}

function toBlob(canvas, type, q) {
  return new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b && b.type === type ? b : null), type, q)
  );
}
