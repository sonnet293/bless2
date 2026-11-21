// js/cropper.js — 프로필 사진 크롭 다이얼로그
// 드래그로 위치 이동, 휠 · 슬라이더 · 두 손가락으로 확대/축소, 원형 미리보기
import { icon, $ } from "./common.js";

const MAX_ZOOM = 4;

/**
 * 이미지 파일을 받아 크롭 다이얼로그를 띄운다.
 * 완료하면 정사각형(size px) Blob, 취소하면 null 을 돌려준다.
 */
export async function cropImage(file, size = 400) {
  const img = await loadImage(file);
  const W = img.naturalWidth, H = img.naturalHeight;

  return new Promise((resolve, reject) => {
    const dlg = document.createElement("dialog");
    dlg.className = "dlg-crop";
    dlg.innerHTML = `
      <div class="dlg-inner">
        <div class="dlg-head">
          <button class="icon-btn" type="button" data-act="cancel" aria-label="취소">${icon("x")}</button>
          <h2>사진 자르기</h2>
          <span></span>
        </div>
        <div class="crop-body">
          <div class="crop-stage" tabindex="0" aria-label="드래그해서 위치를 맞추세요">
            <img alt="" draggable="false">
            <div class="crop-mask" aria-hidden="true"></div>
          </div>
          <div class="crop-zoom">
            <button class="icon-btn sm" type="button" data-act="out" aria-label="축소">${icon("minus")}</button>
            <input type="range" min="1" max="${MAX_ZOOM}" step="0.01" value="1" aria-label="확대">
            <button class="icon-btn sm" type="button" data-act="in" aria-label="확대">${icon("plus")}</button>
          </div>
          <p class="crop-hint">드래그해서 위치를 옮기고, 확대해서 크기를 맞추세요</p>
        </div>
        <div class="dlg-foot">
          <button class="btn ghost" type="button" data-act="cancel">취소</button>
          <button class="btn primary" type="button" data-act="ok">${icon("check")} 적용</button>
        </div>
      </div>`;
    document.body.appendChild(dlg);

    const stage = $(".crop-stage", dlg);
    const view = $("img", stage);
    const range = $("input[type=range]", dlg);
    view.src = img.src;

    // 상태: 원본 이미지 좌표계의 중심점(cx, cy) + 배율(z). 화면 크기가 바뀌어도 그대로 유지된다.
    let cx = W / 2, cy = H / 2, z = 1;
    const stageSize = () => stage.clientWidth || 1;
    const scaleOf = (zz) => (stageSize() / Math.min(W, H)) * zz;

    function clamp() {
      z = Math.min(MAX_ZOOM, Math.max(1, z));
      const half = stageSize() / 2 / scaleOf(z); // 화면 절반이 원본에서 차지하는 길이
      cx = Math.min(W - half, Math.max(half, cx));
      cy = Math.min(H - half, Math.max(half, cy));
    }
    function render() {
      clamp();
      const S = stageSize(), s = scaleOf(z);
      view.style.width = `${W * s}px`;
      view.style.height = `${H * s}px`;
      view.style.transform = `translate(${S / 2 - cx * s}px, ${S / 2 - cy * s}px)`;
      range.value = z;
    }
    /** 화면상의 점(px, py)을 고정한 채로 배율 변경 */
    function zoomAt(nz, px = stageSize() / 2, py = stageSize() / 2) {
      nz = Math.min(MAX_ZOOM, Math.max(1, nz));
      const S = stageSize(), s0 = scaleOf(z), s1 = scaleOf(nz);
      // 그 점이 가리키는 원본 좌표
      const ix = cx + (px - S / 2) / s0, iy = cy + (py - S / 2) / s0;
      cx = ix - (px - S / 2) / s1;
      cy = iy - (py - S / 2) / s1;
      z = nz;
      render();
    }

    /* ── 드래그 / 핀치 ── */
    const pts = new Map();
    let pinch = null;
    const local = (e) => {
      const r = stage.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    stage.addEventListener("pointerdown", (e) => {
      stage.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, local(e));
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z };
      }
    });
    stage.addEventListener("pointermove", (e) => {
      if (!pts.has(e.pointerId)) return;
      const prev = pts.get(e.pointerId), cur = local(e);
      pts.set(e.pointerId, cur);
      if (pts.size === 1) {
        const s = scaleOf(z);
        cx -= (cur.x - prev.x) / s;
        cy -= (cur.y - prev.y) / s;
        render();
      } else if (pts.size === 2 && pinch) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        zoomAt(pinch.z * (d / pinch.d), (a.x + b.x) / 2, (a.y + b.y) / 2);
      }
    });
    const up = (e) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
    };
    stage.addEventListener("pointerup", up);
    stage.addEventListener("pointercancel", up);
    stage.addEventListener("wheel", (e) => {
      e.preventDefault();
      const p = local(e);
      zoomAt(z * Math.exp(-e.deltaY * 0.0015), p.x, p.y);
    }, { passive: false });
    stage.addEventListener("keydown", (e) => {
      const step = 10 / scaleOf(z);
      const k = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (k) { e.preventDefault(); cx += k[0]; cy += k[1]; render(); }
      else if (e.key === "+" || e.key === "=") zoomAt(z * 1.1);
      else if (e.key === "-") zoomAt(z / 1.1);
    });
    range.addEventListener("input", () => zoomAt(+range.value));

    /* ── 버튼 ── */
    let result = null, failure = null;
    dlg.addEventListener("click", async (e) => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (act === "in") zoomAt(z * 1.25);
      else if (act === "out") zoomAt(z / 1.25);
      else if (act === "cancel") dlg.close();
      else if (act === "ok") {
        try {
          result = await exportCrop(img, cx, cy, Math.min(W, H) / z, size);
        } catch (err) {
          failure = err;
        }
        dlg.close();
      }
    });
    const onResize = () => render();
    window.addEventListener("resize", onResize);
    dlg.addEventListener("close", () => {
      window.removeEventListener("resize", onResize);
      URL.revokeObjectURL(img.src);
      dlg.remove();
      failure ? reject(failure) : resolve(result);
    });

    dlg.showModal();
    render();
    stage.focus();
  });
}

/** 원본에서 중심 (cx, cy), 한 변 side 인 정사각형을 잘라 out px 로 저장 */
async function exportCrop(img, cx, cy, side, size) {
  const out = Math.round(Math.min(size, side));
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = out;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, cx - side / 2, cy - side / 2, side, side, 0, 0, out, out);
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
    img.onload = () => resolve(img); // url 은 다이얼로그를 닫을 때 해제
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("이미지를 읽을 수 없어요.")); };
    img.src = url;
  });
}

function toBlob(canvas, type, q) {
  return new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b && b.type === type ? b : null), type, q)
  );
}
