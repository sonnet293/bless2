// js/battleroom.js
import { auth, db } from "./firebase.js";
import { onAuthStateChanged }
from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, updateDoc, onSnapshot, runTransaction, deleteField }
from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { $, icon, hydrateIcons, ready, toast, errMsg, confirmDialog } from "./common.js";
import { roomStatus, PLAYER_SLOTS } from "./rooms.js";
import { vacateSeat } from "./roomLeave.js";
import { fillAvatar } from "./avatar.js";

const roomRef = doc(db, "rooms", ROOM_ID);
const GAME_URL = `../games/${ROOM_ID}.html`;

const ui = {
    status: $("#room-status"),
    swap: $("#swap-status"),
    hint: $("#lobby-hint"),
    specCount: $("#spectator-count"),
    specList: $("#spectator-list"),
    leave: $("#leaveBtn"),
    ready: $("#readyBtn"),
};

let myUid = null;
let myName = "Trainer";
let hasEntry = true;
let room = null;
let joined = false;
let busy = false;
let leaving = false;

const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
};

const slotOf = (r, uid) => PLAYER_SLOTS.find((s) => r?.[`${s}_uid`] === uid) ?? null;
const isSpectator = (r, uid) => (r?.spectators ?? []).includes(uid);

hydrateIcons();

// 카드 뼈대
const cards = PLAYER_SLOTS.map((slot, i) => {
    const card = $(`#${slot}`);
    const badge = el("span", "pc-badge", `P${i + 1}`);
    const avatar = el("span", "pc-avatar");
    fillAvatar(avatar);
    const name = el("strong", "pc-name", "빈 자리");
    const state = el("span", "pc-state", "대기 중");
    const action = el("button", "btn sm pc-action");
    action.type = "button";
    action.hidden = true;
    action.addEventListener("click", () => onSeatAction(slot, action.dataset.act));
    card.append(badge, avatar, name, state, action);
    return { slot, card, avatar, name, state, action };
});

// 시작
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        location.replace("../index.html");
        return;
    }
    if (myUid) return;
    myUid = user.uid;

    try {
        const me = (await getDoc(doc(db, "users", myUid))).data();
        myName = me?.nickname ?? "Trainer";
        hasEntry = (me?.entry?.length ?? 0) > 0;
    } catch (e) {
        console.error(e);
    }

    onSnapshot(roomRef, onRoom, (err) => {
        console.error(err);
        toast(errMsg(err), "error");
        ready();
    });
});

async function onRoom(snap) {
    room = snap.exists() ? snap.data() : null;

    if (room?.game_started && (slotOf(room, myUid) || isSpectator(room, myUid))) {
        location.replace(slotOf(room, myUid) ? GAME_URL : `${GAME_URL}?spectator=true`);
        return;
    }

    if (room && !joined && !leaving) {
        joined = true;
        try {
            await joinRoom();
        } catch (e) {
            console.error("입장 실패", e);
            toast(errMsg(e), "error");
        }
    }

    render();
    ready();
}

function joinRoom() {
    return runTransaction(db, async (tx) => {
        const r = (await tx.get(roomRef)).data();
        if (!r || slotOf(r, myUid) || isSpectator(r, myUid)) return;
        const empty = !r.game_started && PLAYER_SLOTS.find((s) => !r[`${s}_uid`]);
        if (empty) {
            tx.update(roomRef, {
                [`${empty}_uid`]: myUid,
                [`${empty}_name`]: myName,
                [`${empty}_ready`]: false,
            });
        } else {
            tx.update(roomRef, {
                spectators: [...(r.spectators ?? []), myUid],
                spectator_names: [...(r.spectator_names ?? []), myName],
            });
        }
    });
}

// 그리기
function render() {
    const status = roomStatus(room);
    ui.status.dataset.status = status.key;
    ui.status.querySelector(".status-label").textContent = status.label;

    const mySlot = slotOf(room, myUid);
    const amSpectator = isSpectator(room, myUid);
    const req = room?.swap_request ?? null;
    const lobbyOpen = !!room && !room.game_started;

    // 플레이어 카드
    for (const c of cards) {
        const uid = room?.[`${c.slot}_uid`] ?? null;
        const name = room?.[`${c.slot}_name`] ?? null;
        const isReady = !!room?.[`${c.slot}_ready`];

        c.card.dataset.state = !uid ? "empty" : isReady ? "ready" : "waiting";
        c.card.dataset.me = String(!!uid && uid === myUid);
        c.name.textContent = name ?? "빈 자리";
        c.state.textContent = !uid ? "참가자를 기다리는 중" : isReady ? "READY" : "대기 중";

        if (c.avatar.dataset.uid !== (uid ?? "")) {
            c.avatar.dataset.uid = uid ?? "";
            fillAvatar(c.avatar, { uid, label: name ?? "" });
        }

        // 관전자 액션
        let act = null;
        if (lobbyOpen && amSpectator) {
            if (!uid) act = "sit";
            else if (!req) act = "swap";
        }
        c.action.hidden = !act;
        if (act) {
            c.action.dataset.act = act;
            c.action.innerHTML = act === "sit"
                ? `${icon("plus")}<span>이 자리로 교체</span>`
                : `${icon("refresh")}<span>교체 요청</span>`;
            c.action.disabled = busy;
        }
    }

    renderSwap(req, mySlot);
    renderSpectators();

    // READY 버튼
    const iAmReady = !!(mySlot && room?.[`${mySlot}_ready`]);
    ui.ready.hidden = !mySlot || !lobbyOpen;
    ui.ready.disabled = busy || !hasEntry;
    ui.ready.setAttribute("aria-pressed", String(iAmReady));
    ui.ready.classList.toggle("is-on", iAmReady);
    ui.ready.innerHTML = iAmReady ? `${icon("check")}<span>READY</span>` : "<span>READY</span>";
    ui.leave.disabled = busy;

    // 안내 문구
    let hint = "";
    if (!room) hint = "방이 열리지 않았습니다.";
    else if (mySlot && !hasEntry) hint = "엔트리가 비어있습니다. 블래키 괄진에게 문의해주세요.";
    else if (mySlot) {
        const both = PLAYER_SLOTS.every((s) => room[`${s}_uid`]);
        const allReady = PLAYER_SLOTS.every((s) => room[`${s}_ready`]);
        if (!both) hint = "상대를 기다리는 중...";
        else if (allReady) hint = "모두 준비 완료.";
        else if (iAmReady) hint = "모두 READY를 눌러주세요.";
        else hint = "준비가 되면 READY를 눌러주세요.";
    } else if (amSpectator) hint = "관전 중";
    ui.hint.textContent = hint;
    ui.hint.dataset.tone = !room || (mySlot && !hasEntry) ? "warn" : "";
}

function renderSwap(req, mySlot) {
    const box = ui.swap;
    if (!req || !room || room.game_started) {
        box.hidden = true;
        box.replaceChildren();
        return;
    }
    box.hidden = false;
    box.replaceChildren();

    const toName = room[`${req.slot}_name`] ?? "플레이어";
    const text = el("p", "swap-text");
    const actions = el("div", "swap-actions");

    if (req.toUid === myUid && mySlot === req.slot) {
        box.dataset.tone = "incoming";
        text.innerHTML = `${icon("refresh")}<span><b></b> 님이 교체를 요청했습니다</span>`;
        text.querySelector("b").textContent = req.fromName ?? "관전자";
        actions.append(
            actionBtn("거절", "ghost", () => clearSwap()),
            actionBtn("수락", "primary", () => acceptSwap()),
        );
    } else if (req.fromUid === myUid) {
        box.dataset.tone = "outgoing";
        text.innerHTML = `${icon("refresh")}<span><b></b> 님에게 교체를 요청했습니다</span>`;
        text.querySelector("b").textContent = toName;
        actions.append(actionBtn("요청 취소", "ghost", () => clearSwap()));
    } else {
        box.dataset.tone = "info";
        text.innerHTML = `${icon("refresh")}<span><b class="from"></b> → <b class="to"></b> 자리 교체 요청 중</span>`;
        text.querySelector(".from").textContent = req.fromName ?? "관전자";
        text.querySelector(".to").textContent = toName;
    }
    box.append(text);
    if (actions.childElementCount) box.append(actions);
}

function actionBtn(label, kind, onClick) {
    const b = el("button", `btn sm ${kind}`, label);
    b.type = "button";
    b.disabled = busy;
    b.addEventListener("click", () => run(onClick));
    return b;
}

function renderSpectators() {
    const ids = room?.spectators ?? [];
    const names = room?.spectator_names ?? [];
    ui.specCount.textContent = String(ids.length);
    ui.specList.replaceChildren();

    if (!ids.length) {
        ui.specList.append(el("li", "spectator-empty", "관전자 없음"));
        return;
    }
    ids.forEach((uid, i) => {
        const li = el("li", "spectator");
        if (uid === myUid) li.dataset.me = "true";
        const avatar = el("span", "sp-avatar");
        fillAvatar(avatar, { uid });
        li.append(avatar, el("span", "sp-name", names[i] ?? "관전자"));
        if (uid === myUid) li.append(el("span", "sp-me", "나"));
        ui.specList.append(li);
    });
}

// 동작
async function run(fn) {
    if (busy) return;
    busy = true;
    render();
    try {
        await fn();
    } catch (e) {
        console.error(e);
        toast(errMsg(e), "error");
    } finally {
        busy = false;
        render();
    }
}

ui.ready.addEventListener("click", () => run(async () => {
    const slot = slotOf(room, myUid);
    if (!slot || room.game_started) return;
    await updateDoc(roomRef, { [`${slot}_ready`]: !room[`${slot}_ready`] });
}));

ui.leave.addEventListener("click", () => run(async () => {
    if (slotOf(room, myUid) && !(await confirmDialog("방에서 나가시겠습니까?", { ok: "나가기" }))) return;
    leaving = true;
    if (room) await vacateSeat(roomRef, room, myUid);
    location.href = "../battle.html";
}));

function onSeatAction(slot, act) {
    if (act === "sit") run(() => sitDown(slot));
    if (act === "swap") run(() => requestSwap(slot));
}

function sitDown(slot) {
    return runTransaction(db, async (tx) => {
        const r = (await tx.get(roomRef)).data();
        const idx = (r?.spectators ?? []).indexOf(myUid);
        if (!r || r.game_started || r[`${slot}_uid`] || idx === -1) throw new Error("이미 다른 사람이 앉았습니다.");
        tx.update(roomRef, {
            [`${slot}_uid`]: myUid,
            [`${slot}_name`]: myName,
            [`${slot}_ready`]: false,
            spectators: r.spectators.filter((_, i) => i !== idx),
            spectator_names: (r.spectator_names ?? []).filter((_, i) => i !== idx),
        });
    });
}

async function requestSwap(slot) {
    const toUid = room?.[`${slot}_uid`];
    if (!toUid || room.swap_request) return;
    await updateDoc(roomRef, {
        swap_request: { fromUid: myUid, fromName: myName, toUid, slot, createdAt: Date.now() },
    });
}

function clearSwap() {
    return updateDoc(roomRef, { swap_request: deleteField() });
}

function acceptSwap() {
    return runTransaction(db, async (tx) => {
        const r = (await tx.get(roomRef)).data();
        const req = r?.swap_request;
        const spectators = r?.spectators ?? [];
        const names = r?.spectator_names ?? [];
        const idx = req ? spectators.indexOf(req.fromUid) : -1;
        if (!r || r.game_started || !req || r[`${req.slot}_uid`] !== myUid || idx === -1) {
            tx.update(roomRef, { swap_request: deleteField() });
            return;
        }
        const nextIds = [...spectators];
        const nextNames = [...names];
        nextIds[idx] = myUid;
        nextNames[idx] = r[`${req.slot}_name`] ?? myName;
        tx.update(roomRef, {
            [`${req.slot}_uid`]: req.fromUid,
            [`${req.slot}_name`]: names[idx] ?? req.fromName ?? "Trainer",
            [`${req.slot}_ready`]: false,
            spectators: nextIds,
            spectator_names: nextNames,
            swap_request: deleteField(),
        });
    });
}