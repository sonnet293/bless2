// js/battlemain.js — 배틀룸 목록 (rooms 컬렉션을 구독해서 방마다 상태를 실시간 표시)
import { db } from "./firebase.js";
import { collection, onSnapshot }
from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { $, icon, hydrateIcons, requireAuth, ready, getUser, getUsers, renderShell } from "./common.js";
import { ROOMS, roomStatus, PLAYER_SLOTS } from "./rooms.js";
import { fillAvatar } from "./avatar.js";

const grid = $("#room-grid");
const summary = $("#room-summary");
const cards = new Map(); // roomId -> 카드 요소
let myUid = null;
let lastRooms = new Map();
// 방 문서에 이름이 비어 있을 때 공개 프로필(profiles)에서 가져온 닉네임 (uid -> 닉네임 | null)
const profileNames = new Map();
const nameLookups = new Set();

const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
};

hydrateIcons();

const page = el("div", "room-page");
page.setAttribute("aria-label", "방 목록");
grid.append(page);

// 카드 뼈대는 로그인 확인 전에 먼저 그려둔다
for (const info of ROOMS) {
    const card = el("a", "room-card");
    card.href = `pages/battleroom${info.no}.html`;
    card.dataset.roomId = info.id;
    card.dataset.status = "loading";

    const visual = el("div", "room-visual");
    visual.append(el("span", "room-no", String(info.no).padStart(2, "0")));
    const pill = el("span", "status-pill");
    pill.append(el("span", "status-dot"), el("span", "status-label", "불러오는 중"));
    visual.append(pill);
    const mine = el("span", "room-mine", "내 방");
    mine.hidden = true;
    visual.append(mine);

    const body = el("div", "room-body");
    body.append(el("h2", "room-name", info.name));
    const seats = el("div", "room-seats");
    seats.append(makeSeat("P1"), el("span", "room-vs", "VS"), makeSeat("P2"));
    body.append(seats);
    const foot = el("div", "room-foot");
    const watchers = el("span", "room-watchers");
    watchers.innerHTML = `${icon("eye")}<span>관전 0</span>`;
    const cta = el("span", "room-cta");
    cta.innerHTML = `<span>입장</span>${icon("chevron")}`;
    foot.append(watchers, cta);
    body.append(foot);

    card.append(visual, body);
    page.append(card);
    cards.set(info.id, card);
}

function makeSeat(label) {
    const seat = el("div", "seat");
    seat.dataset.empty = "true";
    const avatar = el("span", "seat-avatar");
    fillAvatar(avatar);
    const meta = el("span", "seat-meta");
    const head = el("span", "seat-head");
    head.append(el("span", "seat-label", label), el("span", "seat-ready"));
    meta.append(head, el("span", "seat-name", "빈 자리"));
    seat.append(avatar, meta);
    return seat;
}

init();

async function init() {
    const user = await requireAuth();
    myUid = user.uid;
    const me = await getUser(myUid).catch(() => null);
    renderShell("battle", me);
    ready();

    onSnapshot(collection(db, "rooms"), (snap) => {
        lastRooms = new Map(snap.docs.map((d) => [d.id, d.data()]));
        renderRooms(lastRooms);
        fetchMissingNames(lastRooms);
    }, (err) => console.error("방 목록 구독 실패", err));
}

// 자리에 uid는 있는데 이름이 없는 플레이어는 profiles 에서 닉네임을 찾아 다시 그린다
async function fetchMissingNames(rooms) {
    const uids = [];
    for (const room of rooms.values()) {
        for (const slot of PLAYER_SLOTS) {
            const uid = room?.[`${slot}_uid`];
            if (uid && !room[`${slot}_name`] && !profileNames.has(uid) && !nameLookups.has(uid)) uids.push(uid);
        }
    }
    if (!uids.length) return;
    uids.forEach((uid) => nameLookups.add(uid));
    try {
        const users = await getUsers(uids);
        uids.forEach((uid) => profileNames.set(uid, users[uid]?.nickname || null));
        renderRooms(lastRooms);
    } catch (err) {
        console.error("플레이어 이름 불러오기 실패", err);
    } finally {
        uids.forEach((uid) => nameLookups.delete(uid));
    }
}

function renderRooms(rooms) {
    const counts = { waiting: 0, playing: 0, ended: 0 };

    for (const info of ROOMS) {
        const room = rooms.get(info.id);
        const status = roomStatus(room);
        if (status.key in counts) counts[status.key]++;
        renderCard(cards.get(info.id), room, status);
    }

    summary.replaceChildren();
    const labels = { waiting: "대기 중", playing: "배틀 중", ended: "종료" };
    for (const [key, n] of Object.entries(counts)) {
        if (!n) continue;
        const pill = el("span", "status-pill");
        pill.dataset.status = key;
        pill.append(el("span", "status-dot"), `${labels[key]} ${n}`);
        summary.append(pill);
    }
}

function renderCard(card, room, status) {
    card.dataset.status = status.key;
    card.querySelector(".status-label").textContent = status.label;

    const closed = status.key === "closed";
    card.setAttribute("aria-disabled", String(closed));
    card.tabIndex = closed ? -1 : 0;

    const seats = card.querySelectorAll(".seat");
    PLAYER_SLOTS.forEach((slot, i) => {
        const seat = seats[i];
        const uid = room?.[`${slot}_uid`] ?? null;
        // 이름 필드가 비어 있어도 자리에 사람이 있으면 프로필 닉네임 → 기본 이름 순으로 표시
        const name = room?.[`${slot}_name`] || (uid ? profileNames.get(uid) || `Player${i + 1}` : null);
        const occupied = !!uid || !!name;
        const won = room?.battle_winner === `p${i + 1}`;
        seat.dataset.empty = String(!occupied);
        seat.dataset.winner = String(occupied && won);
        seat.querySelector(".seat-name").textContent = name ?? "빈 자리";

        // 같은 사람이면 아바타를 다시 그리지 않음 (스냅샷마다 깜빡이지 않도록)
        const avatar = seat.querySelector(".seat-avatar");
        if (avatar.dataset.uid !== (uid ?? "")) {
            avatar.dataset.uid = uid ?? "";
            fillAvatar(avatar, { uid });
        }

        let tag = "";
        if (status.key === "ended" && won) tag = "WIN";
        else if (status.key === "waiting" && room?.[`${slot}_ready`]) tag = "READY";
        const ready = seat.querySelector(".seat-ready");
        ready.textContent = tag;
        ready.dataset.tag = tag.toLowerCase();
    });

    const spectatorCount = room?.spectators?.length ?? 0;
    card.querySelector(".room-watchers span").textContent =
        closed ? "GM이 방을 열면 입장할 수 있어요" : `관전 ${spectatorCount}`;

    const isMine = !!room && !!myUid && (
        PLAYER_SLOTS.some((slot) => room[`${slot}_uid`] === myUid) ||
        (room.spectators ?? []).includes(myUid)
    );
    card.querySelector(".room-mine").hidden = !isMine;

    const seatsFull = PLAYER_SLOTS.every((slot) => !!room?.[`${slot}_uid`]);
    let cta = "입장";
    if (closed) cta = "닫힘";
    else if (isMine) cta = "돌아가기";
    else if (status.key !== "waiting" || seatsFull) cta = "관전";
    card.querySelector(".room-cta span").textContent = cta;
}
