/** "How it works": the assumptions table is filled from the settings the planner really uses. */
import { DEFAULTS as c } from "../plan/config";
import { energyPerMetre, walkingPower, walkingSpeed } from "../plan/energy";
import { initLang, tr } from "./lang";
import { drawStars } from "./stars";

type Row = [en: string, ja: string, value: string];

function rows(): (Row | string)[] {
  const flat = walkingSpeed(0, c);
  const hours = c.tankJoules / 250 / 3600;
  return [
    tr("Safety layer", "安全レイヤー"),
    ["Slope: normal up to / no-go from", "傾斜：ここまでは通常／ここから通行不可", `${c.tiltSafe}° / ${c.tiltMax}°`],
    ["The same on loose sand", "砂地での同じ値", `${c.sandTiltSafe}° / ${c.sandTiltMax}°`],
    ["Roughness: normal up to / no-go from", "でこぼこ：ここまでは通常／ここから通行不可", `${c.roughSafe} m / ${c.roughMax} m`],
    ["Step: normal up to / no-go from", "段差：ここまでは通常／ここから通行不可", `${c.stepSafe} m / ${c.stepMax} m`],
    ["Score of a cell fully covered by sand", "砂地だけのマスの点数", `${1 - c.sandPenalty}`],
    tr("Localizability layer", "迷いにくさレイヤー"),
    ["Ground patch that is matched", "照合する地面の広さ", "32 × 32 m"],
    ["A false match is looked for within", "取り違えを探す範囲", "24 m"],
    ["A match this close to the true spot counts as correct", "正解と見なす距離", "5 m"],
    ["Assumed difference between a ground photo and the orbital image", "地上の写真と軌道からの画像の違い（仮定）", tr("6 of 255 grey levels", "255階調のうち6")],
    ["A photo fix is expected to work from a score of", "撮影がうまくいくと見なす点数", `${c.locFix}`],
    tr("Position error", "位置の誤差"),
    ["Growth of the error from step counting", "歩数による誤差の増え方", tr(`${c.drift * 100} m per 100 m walked`, `100 m歩くごとに ${c.drift * 100} m`)],
    ["Error right after a photo fix", "撮影直後の誤差", `${c.fixError} m`],
    ["Largest error allowed (slider in the simulator)", "許容する誤差の上限（シミュレーターのスライダー）", `${c.errorLimit} m`],
    ["A photo fix is taken when the error reaches", "この誤差に達したら撮影する", `${c.photoTrigger} m`],
    ["Standing time for one photo fix", "1回の撮影で立ち止まる時間", tr(`${c.photoSeconds / 60} min`, `${c.photoSeconds / 60} 分`)],
    tr("Energy and oxygen", "エネルギーと酸素"),
    ["Astronaut / suit with life support", "宇宙飛行士／生命維持装置つきの宇宙服", `${c.bodyKg} kg / ${c.suitKg} kg`],
    ["Mars gravity compared with Earth", "地球と比べた火星の重力", `${c.gravity}`],
    ["Terrain factor: firm ground / loose sand", "地面の係数：固い地面／砂地", `${c.etaFirm} / ${c.etaSand}`],
    ["Walking speed on level ground (from the formula)", "平地を歩く速さ（式から）", `${flat.toFixed(2)} m/s`],
    ["Effort on level firm ground (from the formula)", "固い平地での運動の強さ（式から）", `${Math.round(walkingPower(flat, 0, c.etaFirm, c))} W`],
    ["Energy per metre: level / 10° climb (from the formula)", "1 mあたりのエネルギー：平地／10°の登り（式から）", `${Math.round(energyPerMetre(0, c))} J / ${Math.round(energyPerMetre(Math.tan((10 * Math.PI) / 180), c))} J`],
    ["Effort while standing / working at the site", "立っているとき／現地作業中の運動の強さ", `${c.restWatts} W / ${c.workWatts} W`],
    ["Work at the destination", "目的地での作業時間", tr(`${c.workSeconds / 60} min`, `${c.workSeconds / 60} 分`)],
    [
      "Full tank",
      "満タンの酸素",
      tr(
        `${hours} h at 250 W = ${(c.tankJoules / 1e6).toFixed(1)} MJ ≈ ${Math.round(c.tankJoules / c.joulesPerGramO2)} g of oxygen`,
        `250 Wで${hours}時間 = ${(c.tankJoules / 1e6).toFixed(1)} MJ ≈ 酸素 ${Math.round(c.tankJoules / c.joulesPerGramO2)} g`,
      ),
    ],
    ["Reserve that must be left on arrival at home", "帰還時に残す余裕", `${c.reserve * 100}%`],
  ];
}

function render() {
  const esc = (s: string) => s.replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[ch]!);
  document.getElementById("assumptionTable")!.innerHTML = rows()
    .map((r) => (typeof r === "string" ? `<tr><th colspan="2">${esc(r)}</th></tr>` : `<tr><td>${esc(tr(r[0], r[1]))}</td><td>${esc(r[2])}</td></tr>`))
    .join("");
}

initLang();
drawStars();
render();
document.addEventListener("langchange", render);
// links like how.html#assumptions open the dropdown in that section
const openFromHash = () => {
  const d = document.querySelector<HTMLDetailsElement>(`${location.hash || "#none"} details.more`);
  if (d && location.hash === "#assumptions") d.open = true;
};
openFromHash();
addEventListener("hashchange", openFromHash);
