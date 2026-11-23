// js/login.js
import { auth } from "./firebase.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { $, hydrateIcons, icon, ready, withBusy, clearUserCache } from "./common.js";

hydrateIcons();

let signingIn = false;
const off = onAuthStateChanged(auth, (user) => {
  if (user) location.replace("main.html");
  else { off(); ready(); $("#email").focus(); }
});

const form = $("#loginForm");
const errEl = $("#loginError");
const pw = $("#password");

$("#pwToggle").addEventListener("click", (e) => {
  const show = pw.type === "password";
  pw.type = show ? "text" : "password";
  e.currentTarget.innerHTML = icon(show ? "eyeOff" : "eye");
  e.currentTarget.setAttribute("aria-label", show ? "비밀번호 숨기기" : "비밀번호 보기");
});

const MESSAGES = {
  "auth/invalid-email": "이메일 형식이 올바르지 않습니다",
  "auth/invalid-credential": "이메일 또는 비밀번호가 일치하지 않습니다",
  "auth/wrong-password": "이메일 또는 비밀번호가 일치하지 않습니다",
  "auth/user-not-found": "이메일 또는 비밀번호가 일치하지 않습니다",
};

function showError(msg) {
  errEl.textContent = msg;
  errEl.hidden = !msg;
  form.classList.toggle("shake", !!msg);
  setTimeout(() => form.classList.remove("shake"), 450);
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  if (signingIn) return;
  const email = $("#email").value.trim();
  const password = pw.value;
  if (!email || !password) return showError("이메일과 비밀번호를 입력해주세요");
  showError("");

  withBusy($("#loginBtn"), async () => {
    signingIn = true;
    try {
      await signInWithEmailAndPassword(auth, email, password);
      clearUserCache();
      location.replace("main.html");
    } catch (err) {
      signingIn = false;
      showError(MESSAGES[err.code] || "다시 시도해주세요");
    }
  });
});