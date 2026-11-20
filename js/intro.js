// intro.js
// 배틀 시작 전 인트로: 시스템이 고장난 듯한 글리치 화면 + 뒤로 올라가는 가짜 로그
// → 양쪽 플레이어가 터치하면 크게 깨지는 연출 후 "Player1 VS Player2" → 배틀 시작

import { auth, db } from "./firebase.js"
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js"
import { doc, getDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
import { runSelection } from "./select.js"

// 시작 터치/포켓몬 선택에 참여하는 자리 (p1 -> player1_uid, intro_ready_p1)
const SIDES = ["p1", "p2"]

const BGM_LIST = [
  "../bgm/bgm1.mp3",
  "../bgm/bgm2.mp3",
  "../bgm/bgm3.mp3"
]

export let bgmAudio = null

// 저장된 BGM 음량 (새로고침해도 유지)
const VOLUME_KEY = "bgmVolume"
let bgmVolume = 0.7
try {
  const saved = parseFloat(localStorage.getItem(VOLUME_KEY))
  if (!isNaN(saved)) bgmVolume = Math.min(1, Math.max(0, saved))
} catch {}

export function fadeBgmOut(duration = 2000) {
  if (!bgmAudio) return
  const step = bgmAudio.volume / (duration / 50)
  const timer = setInterval(() => {
    if (bgmAudio.volume > step) {
      bgmAudio.volume = Math.max(0, bgmAudio.volume - step)
    } else {
      bgmAudio.volume = 0
      bgmAudio.pause()
      clearInterval(timer)
    }
  }, 50)
}

function playBgm() {
  if (bgmAudio) return
  const chosen = BGM_LIST[Math.floor(Math.random() * BGM_LIST.length)]
  bgmAudio = new Audio(chosen)
  bgmAudio.loop   = true
  bgmAudio.volume = bgmVolume
  bgmAudio.play().catch(() => {
    // 터치 없이 자동 시작된 경우(관전자) 브라우저가 자동재생을 막음 → 첫 터치 때 재생
    document.addEventListener("pointerdown", () => bgmAudio.play().catch(() => {}), { once: true })
  })
}

const overlay     = document.getElementById("intro-overlay")
const touchPrompt = document.getElementById("touch-prompt")
const readyStatus = document.getElementById("touch-ready-status")
const roomRef     = doc(db, "rooms", ROOM_ID)

const isSpectatorParam = new URLSearchParams(location.search).get("spectator") === "true"

let myUid          = null
let mySlot         = null
let touched        = false
let battleStarting = false
let latestRoom     = null

/* ═══════════════════════════ 연출 (글리치 · 가짜 로그 · VS) ═══════════════════════════ */

const fx = buildFx()

function buildFx() {
  const make = (tag, cls, text) => {
    const n = document.createElement(tag)
    if (cls) n.className = cls
    if (text != null) n.textContent = text
    return n
  }

  const log    = make("div", "intro-log")
  const noise  = make("div", "intro-noise")
  const scan   = make("div", "intro-scan")
  const tears  = make("div", "intro-tears")
  const center = make("div", "intro-center")
  const code   = make("p", "intro-code", "ERR_0x7F3A · KERNEL PANIC")
  const title  = make("p", "intro-title glitch", "SYSTEM ERROR")
  title.dataset.text = "SYSTEM ERROR"

  const vs     = make("div", "intro-vs")
  const p1     = make("div", "vs-name vs-p1 glitch")
  const mark   = make("div", "vs-mark glitch", "VS")
  const p2     = make("div", "vs-name vs-p2 glitch")
  mark.dataset.text = "VS"
  vs.append(p1, mark, p2)
  vs.setAttribute("aria-live", "polite")

  log.setAttribute("aria-hidden", "true")
  for (const n of [noise, scan, tears]) n.setAttribute("aria-hidden", "true")

  // 기존 안내 요소는 가운데로 옮긴다 (id는 그대로)
  touchPrompt.classList.add("glitch")
  touchPrompt.dataset.text = touchPrompt.textContent
  touchPrompt.hidden = true          // 포켓몬 선택이 끝나야 터치 가능
  readyStatus.textContent = "SYNCHRONIZING..."
  center.append(code, title, touchPrompt, readyStatus)

  overlay.replaceChildren(log, noise, center, vs, tears, scan)
  overlay.classList.add("intro-on")

  return { log, tears, center, vs, p1, p2, title, timers: new Set(), running: true, speed: 1 }
}

const rand = (a, b) => a + Math.random() * (b - a)
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
const hex  = (len = 4) => Array.from({ length: len }, () => "0123456789ABCDEF"[Math.floor(Math.random() * 16)]).join("")

function later(fn, ms) {
  const id = setTimeout(() => { fx.timers.delete(id); fn() }, ms)
  fx.timers.add(id)
  return id
}

function nameOf(key) {
  const n = latestRoom?.[`player${key.slice(1)}_name`]
  return n || (key === "p1" ? "Player1" : "Player2")
}

// ── 가짜 로그 ──
const LOG_LINES = [
  () => ["ok",   `[  OK  ] mounted /dev/pokedex${Math.floor(rand(0, 9))} (rw,sync)`],
  () => ["ok",   `[  OK  ] loaded module battle_engine.ko @0x${hex(8)}`],
  () => ["",     `sync room=${ROOM_ID} seq=${Math.floor(rand(1000, 9999))} ack=${hex(6)}`],
  () => ["",     `> handshake p1:${nameOf("p1")} <-> p2:${nameOf("p2")} ... ${pick(["ok", "ok", "retry", "timeout"])}`],
  () => ["",     `typeChart.bin checksum ${hex(8)} == ${hex(8)}`],
  () => ["warn", `[ WARN ] rng seed drift detected (Δ=${rand(0, 3).toFixed(3)})`],
  () => ["warn", `[ WARN ] dice.entropy pool low: ${Math.floor(rand(2, 30))} bits`],
  () => ["err",  `[ FAIL ] segfault at 0x${hex(8)} in render_frame()`],
  () => ["err",  `[ FAIL ] memory corruption: sector 0x${hex(4)}-0x${hex(4)}`],
  () => ["err",  `!! UNHANDLED EXCEPTION ${pick(["NullMonster", "StackOverflow", "IllegalMove", "TypeMismatch"])}Error`],
  () => ["",     `  at engine.resolveRound (engine.js:${Math.floor(rand(100, 1600))}:${Math.floor(rand(2, 60))})`],
  () => ["",     `  at gm.process (gm.js:${Math.floor(rand(100, 400))}:${Math.floor(rand(2, 40))})`],
  () => ["",     `${hex(8)}  ${hex(2)} ${hex(2)} ${hex(2)} ${hex(2)} ${hex(2)} ${hex(2)} ${hex(2)} ${hex(2)}  |${hex(4).toLowerCase()}..${hex(2).toLowerCase()}|`],
  () => ["ok",   `[  OK  ] restored ${Math.floor(rand(1, 6))}/6 entry slots`],
  () => ["warn", `[ WARN ] spectator stream desync (${Math.floor(rand(20, 900))}ms)`],
  () => ["",     `fetch bgm/bgm${Math.floor(rand(1, 4))}.mp3 ... ${Math.floor(rand(40, 100))}%`],
  () => ["err",  "▓▓▒▒░░ SIGNAL LOST ░░▒▒▓▓"],
]

function pushLog(entry) {
  const [kind, text] = entry ?? pick(LOG_LINES)()
  const line = document.createElement("div")
  line.className = `log-line ${kind}`
  const t = (performance.now() / 1000).toFixed(4).padStart(10, "0")
  line.textContent = `[${t}] ${text}`
  fx.log.append(line)
  while (fx.log.childElementCount > 90) fx.log.firstElementChild.remove()
}

function logLoop() {
  if (!fx.running) return
  const n = fx.speed > 1 ? 3 : Math.random() < .15 ? 3 : 1
  for (let i = 0; i < n; i++) pushLog()
  later(logLoop, rand(50, 170) / fx.speed)
}

// ── 지지직 (랜덤 글리치 폭발) ──
function glitchBurst(strength = 1) {
  overlay.classList.add("is-glitch")
  if (Math.random() < .25 * strength) overlay.classList.add("is-invert")

  const count = Math.floor(rand(2, 6) * strength)
  for (let i = 0; i < count; i++) {
    const bar = document.createElement("i")
    bar.style.top = `${rand(0, 100)}%`
    bar.style.height = `${rand(2, 14 * strength)}%`
    bar.style.setProperty("--dx", `${rand(-12, 12) * strength}%`)
    bar.style.setProperty("--hue", `${Math.floor(rand(0, 360))}deg`)
    fx.tears.append(bar)
  }

  later(() => {
    overlay.classList.remove("is-glitch", "is-invert")
    fx.tears.replaceChildren()
  }, rand(70, 240))
}

function glitchLoop() {
  if (!fx.running) return
  glitchBurst(fx.speed > 1 ? 2 : 1)
  // 가끔 연달아 터지게
  if (Math.random() < .35) later(() => glitchBurst(1), rand(90, 180))
  later(glitchLoop, rand(400, 1800) / fx.speed)
}

function stopFx() {
  fx.running = false
  for (const id of fx.timers) clearTimeout(id)
  fx.timers.clear()
}

logLoop()
glitchLoop()

// ── VS 연출 → 끝나면 배틀 시작 ──
function playVs(done) {
  fx.speed = 3
  overlay.classList.add("is-crash")
  for (let i = 0; i < 6; i++) pushLog(["err", `!! FATAL ${hex(8)} :: BATTLE PROTOCOL OVERRIDE`])

  later(() => {
    fx.p1.textContent = nameOf("p1")
    fx.p2.textContent = nameOf("p2")
    fx.p1.dataset.text = fx.p1.textContent
    fx.p2.dataset.text = fx.p2.textContent
    overlay.classList.remove("is-crash")
    overlay.classList.add("is-vs")
    fx.speed = 1.4
    glitchBurst(2.4)
  }, 750)

  later(() => glitchBurst(1.6), 1500)
  later(() => glitchBurst(1.2), 2300)
  later(() => overlay.classList.add("is-out"), 3300)
  later(() => {
    stopFx()
    overlay.classList.add("hidden")
    done()
  }, 3800)
}

/* ═══════════════════════════ 진행 (터치 · 동기화) ═══════════════════════════ */

onAuthStateChanged(auth, async (user) => {
  if (!user) return
  myUid = user.uid

  // 게임 시작 직후엔 먼저 포켓몬 선택 화면 (이미 끝났으면 바로 넘어감)
  await runSelection({ roomRef, myUid, spectator: isSpectatorParam })

  const snap = await getDoc(roomRef)
  const room = snap.data()
  latestRoom = room ?? null
  if (isSpectatorParam) mySlot = "spectator"
  else mySlot = SIDES.find((k) => room?.[`player${k.slice(1)}_uid`] === myUid) ?? "spectator"

  // 이미 배틀이 시작된 상태 = 게임 도중 새로고침(관전자는 배틀 도중 입장) → 대기 화면 스킵
  if (room?.intro_done) {
    skipIntro()
    return
  }

  // 관전자는 터치 없이, 플레이어가 모두 터치하면 자동으로 시작
  if (mySlot === "spectator") {
    touchPrompt.hidden = true
    readyStatus.innerText = "플레이어를 기다리는 중..."
  } else {
    touchPrompt.hidden = false
    readyStatus.innerText = ""
    bindTouch()
  }
  listenReady()
})

function bindTouch() {
  const handler = () => {
    if (touched) return
    touched = true
    document.removeEventListener("click",      handler)
    document.removeEventListener("touchstart", handler)
    onTouched()
  }
  document.addEventListener("click",      handler)
  document.addEventListener("touchstart", handler)
}

async function onTouched() {
  // BGM — 터치 컨텍스트 안에서 바로 재생
  playBgm()
  touchPrompt.hidden = true
  readyStatus.innerText = "상대방을 기다리는 중..."
  glitchBurst(1.5)
  pushLog(["ok", `[  OK  ] ${nameOf(mySlot)} :: INPUT ACCEPTED`])
  await updateDoc(roomRef, { [`intro_ready_${mySlot}`]: true })
}

function listenReady() {
  onSnapshot(roomRef, (snap) => {
    const room = snap.data()
    if (!room) return
    latestRoom = room

    const allReady = SIDES.every((k) => !!room[`intro_ready_${k}`])

    if (mySlot === "spectator") {
      // 양쪽 터치를 보고 있었으면 VS 연출, 처음부터 intro_done만 보였으면 스킵
      if (allReady) startBattle()
      else if (room.intro_done) skipIntro()
      return
    }

    if (touched && allReady) startBattle()
  })
}

function startBattle() {
  if (battleStarting) return
  battleStarting = true
  if (mySlot === "p1") updateDoc(roomRef, { intro_done: true }).catch(() => {})
  if (mySlot === "spectator") playBgm()
  readyStatus.innerText = ""
  playVs(() => document.dispatchEvent(new Event("battle:introDone")))
}

const ICON_SOUND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>'
const ICON_MUTED = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="m16 9 6 6M22 9l-6 6"/></svg>'

function initVolumeSlider() {
  const slider  = document.getElementById("bgm-volume")
  const label   = document.getElementById("bgm-volume-label")
  const muteBtn = document.getElementById("bgm-mute-btn")
  if (!slider) return

  let lastNonZero = bgmVolume > 0 ? bgmVolume : 0.7

  const apply = (v) => {
    bgmVolume = v
    if (v > 0) lastNonZero = v
    if (bgmAudio) bgmAudio.volume = v
    slider.value = v
    label.innerText = Math.round(v * 100) + "%"
    if (muteBtn) {
      const muted = v === 0
      muteBtn.innerHTML = muted ? ICON_MUTED : ICON_SOUND
      muteBtn.setAttribute("aria-label", muted ? "음소거 해제" : "음소거")
      muteBtn.title = muted ? "음소거 해제" : "음소거"
    }
    try { localStorage.setItem(VOLUME_KEY, String(v)) } catch {}
  }

  slider.addEventListener("input", () => apply(parseFloat(slider.value)))
  muteBtn?.addEventListener("click", () => apply(bgmVolume === 0 ? lastNonZero : 0))
  apply(bgmVolume)
}

initVolumeSlider()

function skipIntro() {
  if (battleStarting) return
  battleStarting = true
  stopFx()
  overlay.classList.add("hidden")
  document.dispatchEvent(new Event("battle:introDone"))

  // BGM 복원
  // 모바일은 터치 컨텍스트 안에서 Audio 생성 + play() 해야 함
  // → 토스트 버튼 onclick 안에서 처리
  const chosen = BGM_LIST[Math.floor(Math.random() * BGM_LIST.length)]

  // 데스크탑은 바로 시도
  const testAudio = new Audio(chosen)
  testAudio.loop   = true
  testAudio.volume = bgmVolume
  testAudio.play().then(() => {
    bgmAudio = testAudio  // 성공하면 그대로 사용
  }).catch(() => {
    // 실패하면 토스트 — onclick 안에서 새로 생성
    showBgmToast(chosen)
    setTimeout(() => {
      if (bgmAudio && bgmAudio.paused) showBgmToast(chosen)
    }, 500)
  })

  setTimeout(() => {
    if (!bgmAudio || bgmAudio.paused) showBgmToast(chosen)
  }, 500)
}

function showBgmToast(chosen) {
  if (document.getElementById("bgm-toast")) return

  const btn = document.createElement("button")
  btn.id = "bgm-toast"
  btn.innerText = "BGM 재생"

  btn.onclick = () => {
    // 터치 컨텍스트 안에서 Audio 새로 생성 + play() → 모바일 정책 우회
    bgmAudio = new Audio(chosen)
    bgmAudio.loop   = true
    bgmAudio.volume = bgmVolume
    bgmAudio.play().catch(() => {})
    btn.remove()
  }

  document.body.appendChild(btn)
  setTimeout(() => btn.remove(), 10000)
}
