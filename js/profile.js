// js/profile.js — 프로필 사진(Supabase) / 닉네임·아이디 / 엔트리 스프라이트
import { db } from "./firebase.js";
import { doc, writeBatch, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { supabase, AVATAR_BUCKET } from "./supabase.js";
import { avatarPath, resizeImage } from "./avatar.js";
import { spriteFor } from "./pokemon.js";
import {
  $, esc, icon, hydrateIcons, requireAuth, ready, getUser, renderShell, avatarSrc,
  patchCachedUser, toast, errMsg, fmt, logout, publicEntry,
} from "./common.js";
import { TYPE_COLORS } from "./typeColors.js";


init();

async function init() {
  hydrateIcons();
  const authUser = await requireAuth();
  const targetUid = new URLSearchParams(location.search).get("uid") || authUser.uid;
  const isMe = targetUid === authUser.uid;

  let user = null, me = null, loadErr = null;
  try {
    // 내 프로필은 users(PEACE 등 최신 값), 다른 사람은 profiles 를 새로 읽음
    user = await getUser(targetUid, { fresh: true });
    me = isMe ? user : await getUser(authUser.uid);
  } catch (e) { console.error(e); loadErr = e; }

  renderShell(isMe ? "profile" : null, me);
  ready();

  if (!user) {
    const [title, sub] = loadErr
      ? ["프로필을 불러오지 못했어요", errMsg(loadErr)]
      : isMe
        ? ["내 사용자 정보가 없어요", `Firestore 의 users/${targetUid} 문서를 확인해 주세요.`]
        : ["아직 공개 프로필이 없어요", "이 사용자가 한 번 로그인하면 프로필이 만들어져요."];
    $("#profile").innerHTML = `<div class="empty">${icon("user")}<b>${esc(title)}</b><p>${esc(sub)}</p></div>`;
    $(".entry-section").hidden = true;
    return;
  }

  document.title = `${user.nickname} (@${user.id}) · UTOPIA`;
  $("#pAvatar").src = avatarSrc(user);
  $("#pName").textContent = user.nickname;
  $("#pHandle").textContent = `@${user.id}`;

  if (isMe) {
    $("#peaceChip").hidden = false;
    $("#peaceVal").textContent = fmt(user.peace);
    $("#readonlyNote").hidden = false;
    $("#avatarEdit").hidden = false;
    $("#mLogout").hidden = false;
    $("#mLogout").addEventListener("click", logout);
    $("#avatarInput").addEventListener("change", (e) => onAvatarPicked(e, authUser.uid, user));
  }

  renderEntry(user.entry || []);
}

/* ───────────────────────── 프로필 사진 변경 ───────────────────────── */
async function onAvatarPicked(e, uid, user) {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;
  if (!file.type.startsWith("image/")) return toast("이미지 파일만 올릴 수 있어요", "error");
  if (file.size > 15 * 1024 * 1024) return toast("15MB 이하의 이미지를 골라주세요", "error");

  const loading = $("#avatarLoading");
  loading.hidden = false;
  try {
    const blob = await resizeImage(file, 400);
    const path = avatarPath(uid);
    const { error } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(path, blob, { upsert: true, contentType: blob.type, cacheControl: "31536000" });
    if (error) throw error;

    const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
    const url = `${data.publicUrl}?v=${Date.now()}`; // 캐시 무효화용 버전
    const b = writeBatch(db);
    b.update(doc(db, "users", uid), { profileImage: url });
    b.set(doc(db, "profiles", uid), {
      nickname: user.nickname ?? null,
      id: user.id ?? null,
      entry: publicEntry(user.entry),
      profileImage: url,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    await b.commit();

    patchCachedUser(uid, { profileImage: url });
    $("#pAvatar").src = url;
    document.querySelectorAll(".me-card .avatar").forEach((img) => (img.src = url));
    toast("프로필 사진을 바꿨어요");
  } catch (err) {
    console.error(err);
    toast(err?.message ? `업로드 실패: ${err.message}` : errMsg(err), "error");
  } finally {
    loading.hidden = true;
  }
}

/* ───────────────────────── 엔트리 ───────────────────────── */
function renderEntry(entry) {
  const list = entry.slice(0, 6);
  $("#entryCount").textContent = `${list.length} / 6`;
  const grid = $("#entryGrid");
  const slots = [...list, ...Array(6 - list.length).fill(null)];
  grid.innerHTML = slots.map((p, i) => (p ? monHTML(p, i) : emptySlot())).join("");

  list.forEach(async (p, i) => {
    const img = grid.querySelector(`[data-slot="${i}"] .sprite`);
    try {
      const url = await spriteFor(p);
      if (url) { img.src = url; return; }
    } catch (e) { console.warn(e); }
    if (p.portrait) img.src = p.portrait;
    else img.closest(".sprite-box").classList.add("missing");
  });

  grid.addEventListener("error", (e) => {
    if (e.target.classList?.contains("sprite")) e.target.closest(".sprite-box").classList.add("missing");
  }, true);
}

function monHTML(p, i) {
  const types = Array.isArray(p.type) ? p.type : p.type ? [p.type] : [];
  const c1 = TYPE_COLORS[types[0]] || "#4DA3E8";
  const c2 = TYPE_COLORS[types[1]] || c1;
  const label = p.cardName || p.name;
  const form = p.cardName && p.cardName !== p.name ? (p.cardName.match(/\(([^)]*)\)/) || [])[1] : "";
  const moves = (p.moves || []).slice(0, 4);
  return `
  <article class="mon" data-slot="${i}" style="--c1:${c1};--c2:${c2}">
    <div class="sprite-box">
      <img class="sprite" alt="${esc(label)}" decoding="async">
      <span class="sprite-ph">${icon("pokeball")}</span>
    </div>
    <div class="mon-info">
      <h4 class="mon-name">${esc(p.name)}</h4>
      ${form ? `<p class="mon-form">${esc(form)}</p>` : ""}
      <div class="types">${types.map((t) => `<span class="type" style="--tc:${TYPE_COLORS[t] || "#888"}">${esc(t)}</span>`).join("")}</div>
    </div>
    ${p.hp != null || p.atk != null ? `
    <dl class="stats">
      <div><dt>HP</dt><dd>${fmt(p.hp)}</dd></div>
      <div><dt>공격</dt><dd>${fmt(p.atk)}</dd></div>
      <div><dt>방어</dt><dd>${fmt(p.def)}</dd></div>
      <div><dt>스피드</dt><dd>${fmt(p.spd)}</dd></div>
    </dl>` : ""}
    ${moves.length ? `
    <details class="moves">
      <summary>기술 ${moves.length}개 ${icon("chevron")}</summary>
      <ul>${moves.map((m) => `<li><span>${esc(m.name)}</span><small>PP ${esc(m.pp)}</small></li>`).join("")}</ul>
    </details>` : ""}
  </article>`;
}

function emptySlot() {
  return `<div class="mon empty-slot">${icon("pokeball")}<span>빈 슬롯</span></div>`;
}
