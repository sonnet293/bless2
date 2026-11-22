// js/main.js — 타임라인 / 글쓰기 / 댓글·답글 / 좋아요 / 쪽지함
import { db } from "./firebase.js";
import {
  collection, query, where, orderBy, limit, startAfter, getDocs, getDoc, addDoc, doc,
  deleteDoc, updateDoc, arrayUnion, arrayRemove, serverTimestamp, writeBatch, increment, onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  $, esc, icon, hydrateIcons, requireAuth, ready, getUser, getUsers, renderShell, avatarHTML, avatarSrc,
  timeAgo, fullTime, toDate, formatText, toast, openDialog, wireDialog, confirmDialog, withBusy, errMsg, fmt,
  sendNotifications,
} from "./common.js";

const PAGE = 15;
const COMMENT_TTL = 2 * 60 * 1000;

const state = {
  uid: null,
  me: null,
  posts: new Map(),     // id → post
  order: [],            // 타임라인 순서
  lastDoc: null,
  loading: false,
  detailId: null,
  replyTo: null,        // { parentId, uid, handle }
  comments: new Map(),  // postId → { t, list }
};

const feed = $("#feed");
const composeDlg = $("#composeDlg");
const inboxDlg = $("#inboxDlg");
const detailDlg = $("#detailDlg");

init();

async function init() {
  hydrateIcons();
  const user = await requireAuth();
  state.uid = user.uid;
  try {
    state.me = await getUser(user.uid);
  } catch (e) { console.error(e); }
  renderShell("home", state.me);
  $("#composeAvatar").src = avatarSrc(state.me);
  $("#replyAvatar").src = avatarSrc(state.me);
  ready();

  if (!state.me) toast("사용자 정보(users 문서)를 찾을 수 없어요.", "error");

  bindUI();
  await loadFeed(true);
  watchUnread();
  openFromHash();
}

/* ───────────────────────── 타임라인 ───────────────────────── */
async function loadFeed(reset = false) {
  if (state.loading) return;
  state.loading = true;
  const more = $("#moreBtn");
  if (reset) {
    state.lastDoc = null;
    state.order = [];
    feed.innerHTML = skeleton(4);
  } else {
    more.classList.add("busy");
  }

  try {
    const base = [orderBy("createdAt", "desc"), limit(PAGE)];
    const q = state.lastDoc
      ? query(collection(db, "posts"), orderBy("createdAt", "desc"), startAfter(state.lastDoc), limit(PAGE))
      : query(collection(db, "posts"), ...base);
    const snap = await getDocs(q);
    const posts = snap.docs.map((d) => normalizePost({ id: d.id, ...d.data() }));
    state.lastDoc = snap.docs[snap.docs.length - 1] || state.lastDoc;

    const authors = await getUsers(posts.map((p) => p.uid));
    posts.forEach((p) => { p.author = authors[p.uid]; state.posts.set(p.id, p); state.order.push(p.id); });

    if (reset) feed.innerHTML = "";
    feed.insertAdjacentHTML("beforeend", posts.map(postHTML).join(""));
    if (reset && !posts.length) feed.innerHTML = emptyHTML("feather", "아직 글이 없어요", "오른쪽 아래 버튼으로 첫 글을 남겨보세요.");

    const done = snap.size < PAGE;
    more.hidden = done;
    $("#feedEnd").hidden = !done || !state.order.length;
  } catch (e) {
    console.error(e);
    if (reset) feed.innerHTML = emptyHTML("alert", "글을 불러오지 못했어요", errMsg(e));
    else toast(errMsg(e), "error");
  } finally {
    state.loading = false;
    more.classList.remove("busy");
  }
}

function normalizePost(p) {
  p.likes = Array.isArray(p.likes) ? p.likes : [];
  p.commentCount = p.commentCount || 0;
  return p;
}

function postHTML(p, { full = false } = {}) {
  const a = p.author;
  const liked = p.likes.includes(state.uid);
  const mine = p.uid === state.uid;
  const prof = `profile.html?uid=${encodeURIComponent(p.uid)}`;
  return `
  <article class="post ${full ? "full" : ""}" data-id="${esc(p.id)}" ${full ? "" : 'tabindex="0"'}>
    <a class="post-avatar" href="${prof}" data-link>${avatarHTML(a)}</a>
    <div class="post-main">
      <header class="post-head">
        <a class="post-name" href="${prof}" data-link>${esc(a?.nickname || p.nickname)}</a>
        <span class="post-handle">@${esc(p.handle)}</span>
        <span class="post-dot">·</span>
        <time datetime="${toDate(p.createdAt).toISOString()}" title="${esc(fullTime(p.createdAt))}">${timeAgo(p.createdAt)}</time>
        ${mine ? `<button class="icon-btn sm post-del" type="button" data-act="delete" aria-label="글 삭제">${icon("trash")}</button>` : ""}
      </header>
      <div class="post-text">${formatText(p.text)}</div>
      ${full ? `<div class="post-fulltime">${esc(fullTime(p.createdAt))}</div>` : ""}
      <footer class="post-actions">
        <button class="act act-comment" type="button" data-act="open" aria-label="댓글 ${p.commentCount}개">
          ${icon("comment")}<span>${p.commentCount ? fmt(p.commentCount) : ""}</span>
        </button>
        <button class="act act-like ${liked ? "on" : ""}" type="button" data-act="like" aria-pressed="${liked}" aria-label="좋아요 ${p.likes.length}개">
          ${icon(liked ? "heartFill" : "heart")}<span>${p.likes.length ? fmt(p.likes.length) : ""}</span>
        </button>
      </footer>
    </div>
  </article>`;
}

/** 피드 카드와 상세 화면을 함께 갱신 */
function rerenderPost(id) {
  const p = state.posts.get(id);
  const card = feed.querySelector(`.post[data-id="${CSS.escape(id)}"]`);
  if (p && card) card.outerHTML = postHTML(p);
  if (state.detailId === id && p) $("#detailPost").innerHTML = postHTML(p, { full: true });
}

function onPostClick(e) {
  if (e.target.closest("[data-link]")) return; // 프로필 링크는 그대로 이동
  const post = e.target.closest(".post");
  if (!post) return;
  const id = post.dataset.id;
  const act = e.target.closest("[data-act]")?.dataset.act;
  if (act === "like") return toggleLike(id);
  if (act === "delete") return deletePost(id);
  if (!post.classList.contains("full")) openDetail(id);
}

async function toggleLike(id) {
  const p = state.posts.get(id);
  if (!p || p._busy) return;
  const liked = p.likes.includes(state.uid);
  const prev = p.likes;
  p.likes = liked ? prev.filter((x) => x !== state.uid) : [...prev, state.uid];
  p._busy = true;
  rerenderPost(id);
  try {
    await updateDoc(doc(db, "posts", id), {
      likes: liked ? arrayRemove(state.uid) : arrayUnion(state.uid),
    });
  } catch (e) {
    p.likes = prev;
    rerenderPost(id);
    toast(errMsg(e), "error");
  } finally {
    p._busy = false;
  }
}

async function deletePost(id) {
  if (!(await confirmDialog("이 글을 삭제할까요?", { ok: "삭제", danger: true }))) return;
  try {
    await deleteDoc(doc(db, "posts", id));
    state.posts.delete(id);
    state.order = state.order.filter((x) => x !== id);
    feed.querySelector(`.post[data-id="${CSS.escape(id)}"]`)?.remove();
    if (state.detailId === id) detailDlg.close();
    toast("글을 삭제했어요");
  } catch (e) { toast(errMsg(e), "error"); }
}

/** 글·답글을 쓰려면 users 문서에 nickname 과 id 가 있어야 함 (규칙에서도 검사) */
async function ensureProfile() {
  const ok = (u) => u && typeof u.nickname === "string" && u.nickname && typeof u.id === "string" && u.id;
  if (ok(state.me)) return true;
  try { state.me = await getUser(state.uid, { fresh: true }); } catch {} // 캐시가 오래됐을 수 있으니 한 번 새로 읽음
  if (ok(state.me)) return true;
  const missing = ["nickname", "id"].filter((k) => !state.me?.[k]).join(", ");
  toast(`내 users 문서에 ${missing || "nickname, id"} 필드가 없어서 글을 쓸 수 없어요.`, "error");
  return false;
}

/* ───────────────────────── 글쓰기 ───────────────────────── */
function bindCompose() {
  const text = $("#composeText");
  const btn = $("#composeSubmit");
  const count = $("#composeCount");
  const sync = () => {
    const n = text.value.length;
    count.textContent = `${n} / 500`;
    count.classList.toggle("warn", n > 450);
    btn.disabled = !text.value.trim();
  };
  text.addEventListener("input", sync);
  text.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !e.isComposing) $("#composeForm").requestSubmit();
  });

  $("#composeBtn").addEventListener("click", () => {
    openDialog(composeDlg);
    setTimeout(() => text.focus(), 30);
  });

  $("#composeForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const body = text.value.trim();
    if (!body) return;
    withBusy(btn, async () => {
      if (!(await ensureProfile())) return;
      try {
        const data = {
          uid: state.uid,
          nickname: state.me.nickname,
          handle: state.me.id,
          text: body,
          createdAt: serverTimestamp(),
          likes: [],
          commentCount: 0,
        };
        const ref = await addDoc(collection(db, "posts"), data);
        const p = normalizePost({ ...data, id: ref.id, createdAt: new Date(), author: state.me });
        state.posts.set(p.id, p);
        state.order.unshift(p.id);
        $(".empty", feed)?.remove();
        feed.insertAdjacentHTML("afterbegin", postHTML(p));
        text.value = "";
        sync();
        composeDlg.close();
        toast("게시했어요");
      } catch (err) { toast(errMsg(err), "error"); }
    });
  });
}

/* ───────────────────────── 상세 / 댓글 / 답글 ───────────────────────── */
async function openDetail(id, { push = true, focus = null } = {}) {
  const p = state.posts.get(id);
  if (!p) return;
  state.detailId = id;
  $("#detailPost").innerHTML = postHTML(p, { full: true });
  setReplyTo(null);
  openDialog(detailDlg);
  $(".detail-body", detailDlg).scrollTop = 0;
  if (push) history.pushState({ detail: id }, "", `#post-${id}`);
  // 캐시에 알림의 댓글이 없으면(새 댓글) 그때만 다시 읽음
  const cached = state.comments.get(id);
  const force = !!focus && !cached?.list.some((c) => c.id === focus);
  await loadComments(id, { force });
  if (focus && state.detailId === id) focusComment(focus);
}

async function loadComments(id, { force = false } = {}) {
  const list = $("#commentList");
  const cached = state.comments.get(id);
  if (!force && cached && Date.now() - cached.t < COMMENT_TTL) return renderComments();

  list.innerHTML = skeleton(2, true);
  try {
    const snap = await getDocs(
      query(collection(db, "posts", id, "comments"), orderBy("createdAt", "asc"), limit(300))
    );
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const authors = await getUsers(items.map((c) => c.uid));
    items.forEach((c) => (c.author = authors[c.uid]));
    state.comments.set(id, { t: Date.now(), list: items });

    // 댓글 수 보정 (다른 사람이 단 댓글 반영)
    const p = state.posts.get(id);
    if (p && p.commentCount !== items.length && items.length < 300) {
      p.commentCount = items.length;
      rerenderPost(id);
    }
    if (state.detailId === id) renderComments();
  } catch (e) {
    console.error(e);
    list.innerHTML = emptyHTML("alert", "댓글을 불러오지 못했어요", errMsg(e));
  }
}

function renderComments() {
  const id = state.detailId;
  const list = $("#commentList");
  const items = state.comments.get(id)?.list || [];
  if (!items.length) {
    list.innerHTML = emptyHTML("comment", "아직 댓글이 없어요", "첫 번째 답글을 남겨보세요.");
    return;
  }
  const ids = new Set(items.map((c) => c.id));
  const tops = items.filter((c) => !c.parentId || !ids.has(c.parentId));
  const replies = {};
  items.forEach((c) => {
    if (c.parentId && ids.has(c.parentId)) (replies[c.parentId] ||= []).push(c);
  });
  list.innerHTML = tops
    .map((t) => {
      const rs = replies[t.id] || [];
      return `<div class="thread ${rs.length ? "has-replies" : ""}">
        ${commentHTML(t)}
        ${rs.length ? `<div class="replies">${rs.map((r) => commentHTML(r, true)).join("")}</div>` : ""}
      </div>`;
    })
    .join("");
}

function commentHTML(c, isReply = false) {
  const a = c.author;
  const mine = c.uid === state.uid;
  const prof = `profile.html?uid=${encodeURIComponent(c.uid)}`;
  return `
  <div class="comment ${isReply ? "is-reply" : ""}" data-cid="${esc(c.id)}">
    <a href="${prof}" class="comment-avatar">${avatarHTML(a, isReply ? "xs" : "sm")}</a>
    <div class="comment-main">
      <div class="comment-head">
        <a class="post-name" href="${prof}">${esc(a?.nickname || c.nickname)}</a>
        <span class="post-handle">@${esc(c.handle)}</span>
        <span class="post-dot">·</span>
        <time title="${esc(fullTime(c.createdAt))}">${timeAgo(c.createdAt)}</time>
      </div>
      <div class="comment-text">${c.replyToHandle ? `<span class="mention">@${esc(c.replyToHandle)}</span> ` : ""}${formatText(c.text)}</div>
      <div class="comment-actions">
        <button type="button" class="act sm" data-cact="reply">${icon("reply")}<span>답글</span></button>
        ${mine ? `<button type="button" class="act sm danger" data-cact="delete">${icon("trash")}<span>삭제</span></button>` : ""}
      </div>
    </div>
  </div>`;
}

function setReplyTo(c) {
  const p = state.posts.get(state.detailId);
  if (!p) return;
  state.replyTo = c
    ? { parentId: c.parentId || c.id, uid: c.uid, handle: c.handle }
    : { parentId: null, uid: p.uid, handle: p.handle };
  $("#replyTo").innerHTML = `
    <span>${icon("reply")} <span class="mention">@${esc(state.replyTo.handle)}</span> 님에게 답글</span>
    ${c ? `<button type="button" class="icon-btn xs" data-cancel aria-label="답글 대상 취소">${icon("x")}</button>` : ""}`;
  const t = $("#replyText");
  t.placeholder = c ? `@${c.handle} 님에게 답글` : "행복한 말을 남겨주세요";
  if (c) t.focus();
}

async function onCommentClick(e) {
  const btn = e.target.closest("[data-cact]");
  if (!btn) return;
  const cid = btn.closest(".comment").dataset.cid;
  const items = state.comments.get(state.detailId)?.list || [];
  const c = items.find((x) => x.id === cid);
  if (!c) return;
  if (btn.dataset.cact === "reply") setReplyTo(c);
  if (btn.dataset.cact === "delete") deleteComment(c);
}

async function deleteComment(c) {
  if (!(await confirmDialog("이 댓글을 삭제할까요?", { ok: "삭제", danger: true }))) return;
  const pid = state.detailId;
  try {
    const b = writeBatch(db);
    b.delete(doc(db, "posts", pid, "comments", c.id));
    b.update(doc(db, "posts", pid), { commentCount: increment(-1) });
    await b.commit();
    const entry = state.comments.get(pid);
    entry.list = entry.list.filter((x) => x.id !== c.id);
    const p = state.posts.get(pid);
    p.commentCount = Math.max(0, p.commentCount - 1);
    rerenderPost(pid);
    renderComments();
  } catch (err) { toast(errMsg(err), "error"); }
}

function bindReply() {
  const text = $("#replyText");
  const btn = $("#replySubmit");
  const grow = () => {
    text.style.height = "auto";
    text.style.height = Math.min(text.scrollHeight, 140) + "px";
    btn.disabled = !text.value.trim();
  };
  text.addEventListener("input", grow);
  text.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !e.isComposing) $("#replyForm").requestSubmit();
  });
  $("#replyTo").addEventListener("click", (e) => { if (e.target.closest("[data-cancel]")) setReplyTo(null); });
  $("#commentList").addEventListener("click", onCommentClick);

  $("#replyForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const body = text.value.trim();
    const pid = state.detailId;
    if (!body || !pid) return;
    withBusy(btn, async () => {
      if (!(await ensureProfile())) return;
      try {
        const t = state.replyTo;
        const ref = doc(collection(db, "posts", pid, "comments"));
        const data = {
          uid: state.uid,
          nickname: state.me.nickname,
          handle: state.me.id,
          text: body,
          createdAt: serverTimestamp(),
          parentId: t.parentId,
          replyToUid: t.uid || "",
          replyToHandle: t.handle || "",
        };
        const b = writeBatch(db);
        b.set(ref, data);
        b.update(doc(db, "posts", pid), { commentCount: increment(1) });
        await b.commit();

        // 알림: 답글이면 대상 댓글 작성자 · 스레드 첫 댓글 작성자에게 "reply", 글쓴이에게 "comment"
        // (댓글 저장과 따로 보내서, 알림이 실패해도 댓글은 남는다)
        const post = state.posts.get(pid);
        const parent = t.parentId ? state.comments.get(pid)?.list.find((c) => c.id === t.parentId) : null;
        const targets = new Map();
        if (t.parentId) [t.uid, parent?.uid].forEach((u) => u && targets.set(u, "reply"));
        if (post?.uid && !targets.has(post.uid)) targets.set(post.uid, "comment");
        sendNotifications(targets, { postId: pid, commentId: ref.id, me: state.me, text: body })
          .catch((err) => console.warn("notification", err));

        const entry = state.comments.get(pid) || { t: Date.now(), list: [] };
        entry.list.push({ ...data, id: ref.id, createdAt: new Date(), author: state.me });
        state.comments.set(pid, entry);
        const p = state.posts.get(pid);
        p.commentCount += 1;
        rerenderPost(pid);
        renderComments();
        text.value = "";
        grow();
        setReplyTo(null);
        $(`.comment[data-cid="${CSS.escape(ref.id)}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      } catch (err) { toast(errMsg(err), "error"); }
    });
  });
}

/* 주소창 #post-ID 또는 #post-ID/댓글ID (알림에서 이동) 로 바로 열기 */
async function openFromHash() {
  const m = location.hash.match(/^#post-([^/]+)(?:\/(.+))?$/);
  if (!m) return;
  const id = decodeURIComponent(m[1]);
  const cid = m[2] ? decodeURIComponent(m[2]) : null;
  history.replaceState(null, "", location.pathname + location.search);
  if (!state.posts.has(id)) {
    try {
      const s = await getDoc(doc(db, "posts", id));
      if (!s.exists()) return toast("삭제되었거나 없는 글이에요", "error");
      const p = normalizePost({ id: s.id, ...s.data() });
      p.author = await getUser(p.uid);
      state.posts.set(id, p);
    } catch (e) { return toast(errMsg(e), "error"); }
  }
  await openDetail(id, { focus: cid });
}

/** 알림에서 온 댓글로 스크롤하고 잠깐 강조 */
function focusComment(cid) {
  const el = $(`.comment[data-cid="${CSS.escape(cid)}"]`);
  if (!el) return toast("삭제되었거나 없는 댓글이에요", "error");
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  el.classList.add("flash");
  setTimeout(() => el.classList.remove("flash"), 1800);
}

/* ───────────────────────── 쪽지함 ───────────────────────── */
function watchUnread() {
  const badge = $("#mailBadge");
  const q = query(
    collection(db, "messages"),
    where("to", "==", state.uid),
    where("read", "==", false),
    limit(100)
  );
  onSnapshot(
    q,
    (snap) => {
      const n = snap.size;
      badge.hidden = n === 0;
      badge.textContent = n > 99 ? "99+" : String(n);
      $("#mailBtn").setAttribute("aria-label", n ? `쪽지함 (읽지 않은 쪽지 ${n}개)` : "쪽지함");
    },
    (err) => console.error("unread listener", err)
  );
}

async function openInbox() {
  const list = $("#inboxList");
  openDialog(inboxDlg);
  list.innerHTML = skeleton(3, true);
  try {
    const snap = await getDocs(
      query(collection(db, "messages"), where("to", "==", state.uid), orderBy("createdAt", "desc"), limit(30))
    );
    const msgs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const senders = await getUsers(msgs.map((m) => m.from).filter(Boolean));
    list.innerHTML = msgs.length
      ? msgs.map((m) => messageHTML(m, senders[m.from])).join("")
      : emptyHTML("inbox", "받은 쪽지가 없어요", "쪽지가 도착하면 여기에 표시돼요.");

    const unread = msgs.filter((m) => !m.read);
    if (unread.length) {
      const b = writeBatch(db);
      unread.forEach((m) => b.update(doc(db, "messages", m.id), { read: true }));
      await b.commit();
    }
  } catch (e) {
    console.error(e);
    list.innerHTML = emptyHTML("alert", "쪽지를 불러오지 못했어요", errMsg(e));
  }
}

function messageHTML(m, sender) {
  const name = esc(sender?.nickname || "알 수 없음");
  let ic, title, body = "", cls;
  if (m.type === "anon") {
    ic = "ghost"; cls = "anon"; title = "익명의 쪽지";
    body = m.text;
  } else if (m.type === "flower") {
    ic = "flower"; cls = "flower"; title = `<b>${name}</b>님이 꽃을 보냈어요`;
    body = m.text || "";
  } else if (m.type === "peace") {
    ic = "peace"; cls = "peace"; title = `<b>${name}</b>님이 <b>${fmt(m.amount)} PEACE</b>를 보냈어요`;
  } else {
    ic = "mail"; cls = ""; title = "쪽지";
    body = m.text || "";
  }
  return `
  <article class="msg ${cls} ${m.read ? "" : "unread"}">
    <div class="msg-ic">${icon(ic)}</div>
    <div class="msg-main">
      <div class="msg-head"><span class="msg-title">${title}</span><time title="${esc(fullTime(m.createdAt))}">${timeAgo(m.createdAt)}</time></div>
      ${body ? `<p class="msg-text">${formatText(body)}</p>` : ""}
    </div>
  </article>`;
}

/* ───────────────────────── 공통 ───────────────────────── */
function bindUI() {
  [composeDlg, inboxDlg, detailDlg].forEach(wireDialog);
  feed.addEventListener("click", onPostClick);
  feed.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.classList?.contains("post")) openDetail(e.target.dataset.id);
  });
  $("#detailPost").addEventListener("click", onPostClick);
  $("#moreBtn").addEventListener("click", () => loadFeed(false));
  $("#refreshBtn").addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    loadFeed(true);
  });
  $("#mailBtn").addEventListener("click", openInbox);

  detailDlg.addEventListener("close", () => {
    state.detailId = null;
    if (history.state?.detail) history.back();
  });
  window.addEventListener("popstate", () => { if (detailDlg.open) detailDlg.close(); });
  window.addEventListener("hashchange", openFromHash); // 홈에서 알림을 눌렀을 때

  bindCompose();
  bindReply();
}

function skeleton(n, small = false) {
  return Array.from({ length: n }, () => `
    <div class="skel ${small ? "small" : ""}">
      <span class="skel-avatar"></span>
      <span class="skel-lines"><i></i><i></i><i></i></span>
    </div>`).join("");
}

function emptyHTML(ic, title, sub = "") {
  return `<div class="empty">${icon(ic)}<b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ""}</div>`;
}
