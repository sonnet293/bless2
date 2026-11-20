// js/pokemon.js — 한국어 이름(name / cardName) → PokeAPI 도트 스프라이트
//
// 로컬 표(js/data/pokemonKo.js)만 사용한다. 네트워크 요청 없이 바로 찾는다.
// - 이름에 ✨ 가 있거나 entry.shiny 가 true 면 이로치 스프라이트
// - 표에 없는 폼은 entry.spriteId(PokeAPI pokemon id)로 직접 지정하거나
//   js/data/pokemonKo.js 의 POKEMON_FORMS_KO 에 추가하면 된다.

import { POKEMON_KO, POKEMON_FORMS_KO } from "./data/pokemonKo.js";

const SPRITE_BASE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/";
const SHINY_MARK = /✨️?/gu;

export const spriteUrl = (id, shiny = false) => `${SPRITE_BASE}${shiny ? "shiny/" : ""}${id}.png`;

const norm = (s) =>
  String(s || "")
    .replace(SHINY_MARK, "")
    .toLowerCase()
    .replace(/[\s()[\]{}\-·.:_'’「」『』]/g, "");

// "이름 → PokeAPI pokemon id" 표: 모듈 로드 시 한 번 만든다
const MAP = (() => {
  const map = {};
  const koByDex = {};
  for (const [dex, name] of POKEMON_KO) {
    koByDex[dex] = name;
    map[norm(name)] = dex;
  }
  // "알로라 라이츄" / "라이츄 알로라" / "루가루암 (한밤중의 모습)" 모두 찾을 수 있게
  for (const [pid, full, dex] of POKEMON_FORMS_KO) {
    const sp = koByDex[dex] || "";
    const rest = sp ? full.replace(sp, "") : "";
    for (const k of [full, sp + rest, rest + sp]) {
      const n = norm(k);
      if (n && !(n in map)) map[n] = pid;
    }
  }
  return map;
})();
const KEYS = Object.keys(MAP);

/** entry 하나 → PokeAPI pokemon id (못 찾으면 null) */
export function resolvePokemonId(entry) {
  if (entry?.spriteId) return +entry.spriteId; // 직접 지정한 번호가 있으면 우선
  const card = norm(entry?.cardName);
  const name = norm(entry?.name);

  if (card && MAP[card]) return MAP[card];

  // "라이츄(알로라)" 처럼 괄호 안에 폼 이름 일부만 적은 경우
  const extra = norm((String(entry?.cardName || "").match(/\(([^)]*)\)/) || [])[1]);
  if (extra && name) {
    const hit =
      KEYS.find((k) => k !== name && k.startsWith(name) && k.includes(extra)) ||
      KEYS.find((k) => k !== name && k.includes(name) && k.includes(extra));
    if (hit) return MAP[hit];
  }
  if (name && MAP[name]) return MAP[name];
  return null;
}

/** 이로치 여부: entry.shiny 또는 name / cardName 에 ✨ */
export const isShiny = (entry) =>
  entry?.shiny === true || /✨/u.test(`${entry?.cardName ?? ""}${entry?.name ?? ""}`);

/** entry 하나 → 스프라이트 URL (못 찾으면 null) */
export function spriteFor(entry) {
  const id = resolvePokemonId(entry);
  return id ? spriteUrl(id, isShiny(entry)) : null;
}
