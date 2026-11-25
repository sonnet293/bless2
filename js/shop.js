// js/shop.js — 아이템 구매 / 사용 (익명 쪽지 · 공명 파편 · 꽃)
//
// 모든 거래는 writeBatch 한 번으로 처리되고, 금액·수량 검증은 firestore.rules 가 한다.
//   users/{uid}                     : peace (공개)
//   users/{uid}/private/inventory   : { anon, shard, flower, lastTxn } (본인만 읽기)
//   messages/{id}                   : 받는 사람의 쪽지함 (익명 쪽지에는 보낸 사람 정보가 없음)
//   anonLogs/{id}                   : 익명 쪽지의 실제 발신자 (클라이언트 읽기 불가, 콘솔에서만 확인)
import { db } from "./firebase.js";
import {
  doc, getDoc, collection, writeBatch, increment, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  $, esc, icon, hydrateIcons, requireAuth, ready, getUser, renderShell, patchCachedUser, invalidateUser,
  toast, errMsg, fmt, openDialog, wireDialog, confirmDialog, recipientPicker, withBusy,
} from "./common.js";

const ITEMS = {
  anon: {
    name: "익명 쪽지", price: 5, icon: "ghost",
    desc: "받는 사람을 지정해 이름을 숨긴 쪽지를 보내요. 누가 보냈는지는 사이트 어디에도 표시되지 않아요.",
    use: "쪽지 쓰기",
  },
  shard: {
    name: "공명 파편", price: 20, icon: "gem",
    desc: "사용하면 원하는 사람에게 내 PEACE를 송금할 수 있어요. 송금액의 10% 수수료가 별도로 차감돼요.",
    use: "송금하기",
  },
  flower: {
    name: "꽃", price: 30, icon: "flower",
    desc: "그냥 꽃. 아무 기능은 없지만, 마음을 담아 누군가에게 보낼 수 있어요.",
    use: "꽃 보내기",
  },
};

const fee = (amount) => Math.ceil(amount / 10);

const state = { uid: null, me: null, inv: {} };
const useDlg = $("#useDlg");
let current = null; // { key, picker, ... }

init();

async function init() {
  hydrateIcons();
  const u = await requireAuth();
  state.uid = u.uid;
  try {
    const [me, invSnap] = await Promise.all([
      getUser(u.uid, { fresh: true }),
      getDoc(invRef()),
    ]);
    state.me = me;
    state.inv = invSnap.exists() ? invSnap.data() : {};
  } catch (e) {
    console.error(e);
    toast(errMsg(e), "error");
  }
  renderShell(null, state.me);
  ready();
  wireDialog(useDlg);
  render();

  $("#shopList").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    const key = b.closest(".item").dataset.key;
    if (b.dataset.act === "buy") buy(key, b);
    if (b.dataset.act === "use") openUse(key);
  });
  $("#useForm").addEventListener("submit", onUseSubmit);
}

const invRef = () => doc(db, "users", state.uid, "private", "inventory");

function render() {
  $("#peace").textContent = fmt(state.me?.peace);
  $("#shopList").innerHTML = Object.entries(ITEMS)
    .map(([key, it]) => {
      const owned = state.inv[key] || 0;
      const afford = (state.me?.peace || 0) >= it.price;
      return `
      <article class="item item-${key}" data-key="${key}">
        <div class="item-ic">${icon(it.icon)}</div>
        <div class="item-main">
          <div class="item-head">
            <h3>${esc(it.name)}</h3>
            <span class="price">${icon("peace")}${fmt(it.price)}<small>PEACE</small></span>
          </div>
          <p class="item-desc">${esc(it.desc)}</p>
          <div class="item-foot">
            <span class="owned">보유 <b>${fmt(owned)}</b>개</span>
            <div class="item-btns">
              <button class="btn ghost sm" type="button" data-act="use" ${owned ? "" : "disabled"}>${esc(it.use)}</button>
              <button class="btn primary sm" type="button" data-act="buy" ${afford ? "" : "disabled"}>${icon("plus")}구매</button>
            </div>
          </div>
        </div>
      </article>`;
    })
    .join("");
}

/* ───────────────────────── 구매 ───────────────────────── */
async function buy(key, btn) {
  const it = ITEMS[key];
  if ((state.me?.peace || 0) < it.price) return toast("PEACE가 부족해요", "error");
  if (!(await confirmDialog(`${it.name}을(를) ${it.price} PEACE에 구매할까요?`, { ok: "구매" }))) return;

  await withBusy(btn, async () => {
    try {
      const b = writeBatch(db);
      b.update(doc(db, "users", state.uid), { peace: increment(-it.price) });
      b.set(invRef(), { [key]: increment(1) }, { merge: true });
      await b.commit();
      state.me.peace -= it.price;
      state.inv[key] = (state.inv[key] || 0) + 1;
      patchCachedUser(state.uid, { peace: state.me.peace });
      render();
      toast(`${it.name}을(를) 구매했어요`);
    } catch (e) {
      console.error(e);
      toast(errMsg(e), "error");
      refresh();
    }
  });
}

async function refresh() {
  try {
    const [me, inv] = await Promise.all([getUser(state.uid, { fresh: true }), getDoc(invRef())]);
    state.me = me;
    state.inv = inv.exists() ? inv.data() : {};
    render();
  } catch {}
}

/* ───────────────────────── 사용 ───────────────────────── */
function openUse(key) {
  const it = ITEMS[key];
  $("#useTitle").innerHTML = `${icon(it.icon)} ${esc(it.name)}`;
  const body = $("#useBody");

  let extra = "";
  if (key === "anon") {
    extra = `
      <label class="field">
        <span class="field-label">쪽지 내용</span>
        <textarea id="useText" rows="5" maxlength="500" placeholder="익명으로 전할 말을 적어주세요"></textarea>
        <span class="field-hint"><span id="useCount">0</span> / 500 · 받는 사람에게는 '익명의 쪽지'로만 보여요</span>
      </label>`;
  } else if (key === "shard") {
    extra = `
      <label class="field">
        <span class="field-label">보낼 PEACE</span>
        <span class="input-wrap">${icon("peace")}<input id="useAmount" type="number" inputmode="numeric" min="1" step="1" placeholder="0"></span>
      </label>
      <div class="fee-box" id="feeBox">
        <div><span>송금액</span><b id="fAmount">0</b></div>
        <div><span>수수료 (10%)</span><b id="fFee">0</b></div>
        <div class="total"><span>총 차감</span><b id="fTotal">0</b></div>
        <div class="after"><span>송금 후 내 PEACE</span><b id="fAfter">${fmt(state.me.peace)}</b></div>
      </div>`;
  } else if (key === "flower") {
    extra = `
      <label class="field">
        <span class="field-label">함께 보낼 말 <small>(선택)</small></span>
        <input id="useText" type="text" maxlength="100" placeholder="짧은 메시지 (최대 100자)">
      </label>`;
  }

  body.innerHTML = `
    <div class="field">
      <span class="field-label">받는 사람</span>
      <div id="pickerRoot"></div>
    </div>
    ${extra}
    <p class="use-owned">${icon(it.icon)} 보유 ${fmt(state.inv[key] || 0)}개 · 사용 시 1개 소모</p>`;

  const picker = recipientPicker($("#pickerRoot"), { excludeUid: state.uid, onChange: validate });
  current = { key, picker };

  body.oninput = validate;
  validate();
  openDialog(useDlg);
  setTimeout(() => $("#pickerRoot input")?.focus(), 30);
}

function validate() {
  if (!current) return;
  const { key, picker } = current;
  const btn = $("#useSubmit");
  const sum = $("#useSummary");
  let ok = !!picker.value && (state.inv[key] || 0) > 0;
  sum.textContent = "";
  sum.classList.remove("warn");

  if (key === "anon") {
    const t = $("#useText").value;
    $("#useCount").textContent = t.length;
    ok = ok && !!t.trim();
  }
  if (key === "shard") {
    const a = Math.floor(Number($("#useAmount").value) || 0);
    const f = a > 0 ? fee(a) : 0;
    const total = a + f;
    const after = (state.me.peace || 0) - total;
    $("#fAmount").textContent = fmt(a);
    $("#fFee").textContent = fmt(f);
    $("#fTotal").textContent = fmt(total);
    $("#fAfter").textContent = fmt(after);
    $("#feeBox").classList.toggle("over", after < 0);
    if (after < 0) { sum.textContent = "PEACE가 부족해요"; sum.classList.add("warn"); }
    ok = ok && a >= 1 && after >= 0;
  }
  btn.disabled = !ok;
}

function onUseSubmit(e) {
  e.preventDefault();
  if (!current) return;
  const { key, picker } = current;
  const to = picker.value;
  if (!to) return;
  withBusy($("#useSubmit"), async () => {
    try {
      if (key === "anon") await sendAnon(to, $("#useText").value.trim());
      if (key === "flower") await sendFlower(to, $("#useText").value.trim());
      if (key === "shard") await sendPeace(to, Math.floor(Number($("#useAmount").value)));
      state.inv[key] -= 1;
      render();
      useDlg.close();
    } catch (err) {
      if (err.cancelled) return;
      console.error(err);
      toast(errMsg(err), "error");
      refresh();
    }
  });
}

/** 익명 쪽지: messages 에는 보낸 사람 정보 없이, anonLogs 에만 기록 */
async function sendAnon(to, text) {
  if (!text) throw new Error("내용을 입력해 주세요.");
  const msg = doc(collection(db, "messages"));
  const b = writeBatch(db);
  b.update(invRef(), { anon: increment(-1), lastTxn: msg.id });
  b.set(msg, { type: "anon", to: to.uid, text, createdAt: serverTimestamp(), read: false });
  b.set(doc(db, "anonLogs", msg.id), {
    from: state.uid, fromNickname: state.me?.nickname ?? null,
    to: to.uid, toNickname: to.nickname ?? null,
    text, createdAt: serverTimestamp(),
  });
  await b.commit();
  toast(`${to.nickname}님에게 익명 쪽지를 보냈어요`);
}

async function sendFlower(to, text) {
  const msg = doc(collection(db, "messages"));
  const data = { type: "flower", from: state.uid, to: to.uid, createdAt: serverTimestamp(), read: false };
  if (text) data.text = text;
  const b = writeBatch(db);
  b.update(invRef(), { flower: increment(-1), lastTxn: msg.id });
  b.set(msg, data);
  await b.commit();
  toast(`${to.nickname}님에게 꽃을 보냈어요`);
}

async function sendPeace(to, amount) {
  if (!(amount >= 1)) throw new Error("보낼 금액을 입력해 주세요.");
  const f = fee(amount);
  const total = amount + f;
  if (total > (state.me.peace || 0)) throw new Error("PEACE가 부족해요.");
  const ok = await confirmDialog(
    `${to.nickname}님에게 ${fmt(amount)} PEACE를 보낼까요?\n(수수료 ${fmt(f)} 포함 총 ${fmt(total)} PEACE 차감)`,
    { ok: "송금" }
  );
  if (!ok) throw Object.assign(new Error("송금을 취소했어요."), { cancelled: true });

  const msg = doc(collection(db, "messages"));
  const b = writeBatch(db);
  b.update(doc(db, "users", state.uid), { peace: increment(-total) });
  b.update(doc(db, "users", to.uid), { peace: increment(amount), lastRecv: msg.id });
  b.update(invRef(), { shard: increment(-1), lastTxn: msg.id });
  b.set(msg, { type: "peace", from: state.uid, to: to.uid, amount, fee: f, createdAt: serverTimestamp(), read: false });
  await b.commit();

  state.me.peace -= total;
  patchCachedUser(state.uid, { peace: state.me.peace });
  invalidateUser(to.uid);
  toast(`${to.nickname}님에게 ${fmt(amount)} PEACE를 보냈어요`);
}
