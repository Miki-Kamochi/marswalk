/** All text the simulator builds in code, in English and Japanese. */
import type { Profile } from "../plan/planner";
import { tr } from "../site/lang";

type Pair = [en: string, ja: string];
const T = {
  hint: ["Click the map to choose where to go.", "地図をクリックして、行き先を選んでください。"],
  hintStart: ["Click the map to set where the walk starts and ends.", "地図をクリックして、出発・帰還地点を選んでください。"],
  baseCamp: ["Base Camp", "ベースキャンプ"],
  change: ["Change", "変更"],
  cancel: ["Cancel", "やめる"],
  notChosen: ["Not chosen yet", "未選択"],
  calculating: ["Calculating…", "計算中…"],
  recommended: ["Recommended", "おすすめ"],
  oneWay: ["one way", "片道"],
  fixes: ["photo fixes", "回撮影"],
  noFix: ["without fix", "撮影できない区間"],
  rule1: ["Never crosses no-go ground", "通行不可の場所を通らない"],
  rule2: ["Position error stays under {y} m (largest: {u} m)", "位置の誤差が {y} m を超えない（最大 {u} m）"],
  rule3: ["Enough oxygen to walk home from any point, with {r} in reserve", "どの地点からでも、酸素を{r}残して歩いて帰れる"],
  climb: ["Climb", "登り"],
  sand: ["On sand", "砂地"],
  caution: ["On caution ground", "注意の地面"],
  longest: ["Longest stretch without a photo fix", "撮影できない区間の最長"],
  o2Title: ["Oxygen for the whole trip", "往復の酸素"],
  o2Out: ["out", "行き"],
  o2Work: ["work at the site", "現地作業"],
  o2Back: ["way home", "帰り"],
  o2Left: ["left at home", "帰還時の残り"],
  chartElev: ["Elevation", "標高"],
  chartErr: ["Position error (m)", "位置の誤差 (m)"],
  chartLimit: ["limit", "上限"],
  chartNoFix: ["no photo fix possible", "撮影できない区間"],
  chartFix: ["photo fix", "撮影"],
  outside: ["That point is outside the map.", "その地点は地図の外です。"],
  noGo: ["There is no walkable ground near that point.", "その近くに歩ける場所がありません。"],
  cutOff: ["That place cannot be reached on foot: no-go ground lies all around it.", "そこへは歩いて行けません。通行不可の場所に囲まれています。"],
  moved: ["That spot is no-go. The destination was moved to the nearest walkable ground.", "その地点は通行不可のため、目的地を一番近い歩ける場所に移しました。"],
  errorFlag: [
    "No route keeps the position error under the limit. The best one is shown, marked in red.",
    "位置の誤差を上限内に保てるルートがありません。一番ましなルートを赤い印つきで表示しています。",
  ],
  o2Flag: ["Not enough oxygen to get home with the reserve.", "酸素の余裕を残して帰れません。"],
  homeBad: ["The walk cannot start on no-go ground.", "通行不可の場所からは出発できません。"],
  slope: ["slope", "傾斜"],
  safety: ["safety", "安全"],
  ok: ["OK", "OK"],
  cautionWord: ["caution", "注意"],
  noGoWord: ["no-go", "通行不可"],
  photoFix: ["photo fix", "撮影での位置確認"],
  works: ["works", "できる"],
  fails: ["fails", "できない"],
  hematite: ["hematite", "ヘマタイト"],
  notSeen: ["not observed", "観測なし"],
  load3d: ["Loading 3D terrain…", "3D地形を読み込み中…"],
  legSafe: ["Safe", "安全"],
  legCaution: ["Caution", "注意"],
  legNoGo: ["No-go", "通行不可"],
  legFails: ["Photo fix fails", "撮影で確認できない"],
  legWorks: ["works", "できる"],
  legLess: ["Less hematite", "ヘマタイト少"],
  legMore: ["more", "多"],
  legLimit: ["Dark: beyond the walk-back limit", "暗い部分：ウォークバック限界の外"],
  legFix: ["Photo fix", "撮影地点"],
  legBack: ["Least-oxygen way home", "酸素が最少の帰り道"],
  more: ["How it works →", "仕組みを詳しく →"],
  close: ["Close", "閉じる"],
} satisfies Record<string, Pair>;

export const t = (key: keyof typeof T, vars: Record<string, string | number> = {}): string => {
  let s = tr(...(T[key] as Pair));
  for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
};

const LIMITER: Record<string, Pair> = {
  tilt: ["slope", "傾斜"],
  rough: ["rough ground", "でこぼこ"],
  step: ["a step", "段差"],
  sand: ["sand", "砂地"],
};
export const limiterName = (k: string) => tr(...LIMITER[k]);

const PROFILE: Record<Profile, { name: Pair; what: Pair }> = {
  short: {
    name: ["Shortest", "最短"],
    what: ["Keeps the distance as small as the three rules allow.", "3つの条件を守ったうえで、距離を最小にします。"],
  },
  o2: {
    name: ["Least oxygen", "省エネ"],
    what: [
      "Keeps the energy, and so the oxygen, as small as possible. It goes around climbs and soft sand.",
      "エネルギー（＝酸素）を最小にします。登りや砂地を避けて回り込みます。",
    ],
  },
  found: {
    name: ["Easiest to locate", "迷いにくさ"],
    what: [
      "Stays on ground where a photo fix is expected to work, so the position can be checked at any time.",
      "写真で位置を確かめられる地面を選んで通ります。いつでも位置を確認できます。",
    ],
  },
  mix: {
    name: ["Balanced", "統合"],
    what: [
      "Weighs energy and position error together, with fixed weights. Our recommended route.",
      "エネルギーと位置の誤差を、決まった重みで両方考えます。おすすめのルートです。",
    ],
  },
};
export const profileName = (p: Profile) => tr(...PROFILE[p].name);
export const profileWhat = (p: Profile) => tr(...PROFILE[p].what);

const PLACE: Record<string, string> = {
  base: "ベースキャンプ",
  stop_murray_buttes: "マレー・ビュート",
  stop_bagnold_dunes: "バグノルド砂丘の縁",
  stop_vera_rubin_ridge: "ヴェラ・ルービン・リッジ（ヘマタイト）",
  forward_camp: "前進キャンプ（候補）",
};
export const placeName = (id: string, english: string) => tr(english, PLACE[id] ?? english);

export interface Info {
  title: Pair;
  body: Pair[];
  anchor: string;
}
export const INFO: Record<string, Info> = {
  hematite: {
    title: ["Destination: hematite (spectral data)", "目的地：ヘマタイト（スペクトルデータ）"],
    body: [
      [
        "The CRISM instrument on NASA's Mars Reconnaissance Orbiter splits the sunlight reflected by the ground into hundreds of colours. Every mineral absorbs its own colours, like a fingerprint.",
        "NASAの探査機MROに積まれた観測装置CRISMは、地面が反射した太陽の光を数百の色に分けて測ります。鉱物ごとに吸収する色が決まっていて、指紋のように見分けられます。",
      ],
      [
        "Hematite, an iron mineral that often forms in water, absorbs light near 0.86 µm. Stronger pink means a deeper absorption. That is why Vera Rubin Ridge is worth the walk.",
        "ヘマタイトは水のある環境でできやすい鉄の鉱物で、0.86 µm付近の光を吸収します。ピンクが濃いほど吸収が強い場所です。ヴェラ・ルービン・リッジまで歩く理由がここにあります。",
      ],
      [
        "One CRISM pixel is 18 m wide: it shows the area to search, not the single rock. Places without colour were not observed.",
        "CRISMの1ピクセルは18 mです。分かるのは「この辺り」までで、「この岩」までは分かりません。色のない場所は観測されていません。",
      ],
    ],
    anchor: "layers",
  },
  safety: {
    title: ["Safety layer", "安全レイヤー"],
    body: [
      [
        "Built like the hazard check of NASA's Mars rovers (GESTALT). A flat plane is fitted to each 6 m patch of the HiRISE elevation data. Three things are measured: the tilt of the plane, how rough the ground is around it, and the biggest step.",
        "NASAの火星探査車の危険判定（GESTALT）と同じ作りです。HiRISEの標高データを6 mのマスに区切り、それぞれに平面を当てはめて、平面の傾き、地面のでこぼこ、最大の段差の3つを測ります。",
      ],
      [
        "The worst of the three decides the colour. Dark sand lowers the score, and sand on a slope is no-go sooner than firm ground.",
        "3つのうち一番悪いもので色が決まります。暗い砂地は点数を下げ、砂の斜面は固い地面より早く通行不可になります。",
      ],
      [
        "The limits (for example no-go above 25°) are our assumptions for a walker in a suit. They are not NASA values.",
        "閾値（たとえば25°以上は通行不可）は、宇宙服で歩く人を想定した私たちの仮の値です。NASAの公式値ではありません。",
      ],
    ],
    anchor: "layers",
  },
  loc: {
    title: ["Localizability layer", "迷いにくさレイヤー"],
    body: [
      [
        "Shows where a photo fix is expected to work. NASA's Perseverance rover finds its position by matching photos of the ground around it to the orbital image. We assume a suit camera does the same.",
        "写真で位置を確かめられそうな場所を示します。NASAの探査車パーサヴィアランスは、周りの地面の写真を周回機の画像と照合して自分の位置を出しています。宇宙服のカメラで同じことをする想定です。",
      ],
      [
        "For every cell we cut a 32 m patch out of the HiRISE image and slide it over its own surroundings. If the patch has texture and no other spot within 24 m looks like it, a match should work (green).",
        "各マスについて、HiRISE画像から32 m四方を切り出し、その周りにずらしながら重ねます。模様がはっきりしていて、24 m以内に似た場所がなければ、照合はうまくいくはずです（緑）。",
      ],
      [
        "Smooth ground or repeating patterns, such as dunes, look the same everywhere, so a match fails (red). This is a prediction from the orbital image only. It has not been tested with real ground photos.",
        "なめらかな地面や、砂丘のような繰り返し模様はどこも同じに見えるので、照合は失敗します（赤）。これは周回機の画像だけから出した予測で、実際の地上写真では検証していません。",
      ],
    ],
    anchor: "layers",
  },
  limit: {
    title: ["Walk-back limit", "ウォークバック限界"],
    body: [
      [
        "From the darkened area you could not walk there, work for 30 minutes and walk home with 20 % of the oxygen left.",
        "暗くなっている場所は、そこまで歩き、30分作業して歩いて帰ると、酸素が20%残らない場所です。",
      ],
      [
        "Apollo's Moon-rover drives were planned with the same idea: never go further than you can walk back.",
        "アポロ計画の月面車の走行も、同じ考え方で計画されました。「歩いて帰れる距離より遠くへ行かない」です。",
      ],
      [
        "With a full tank this whole map is inside the limit. Lower the oxygen slider to see the limit close in.",
        "酸素が満タンなら、この地図の全体が限界の内側です。酸素残量のスライダーを下げると、限界が近づいてくるのが分かります。",
      ],
    ],
    anchor: "routes",
  },
  routes: {
    title: ["How the routes are chosen", "ルートの決め方"],
    body: [
      [
        "Every route obeys three rules: no no-go ground, the position error never above the limit, and always enough oxygen to walk home with a reserve.",
        "どのルートも3つの条件を守ります。通行不可の場所を通らない、位置の誤差が上限を超えない、どこからでも余裕を残して歩いて帰れる酸素がある、の3つです。",
      ],
      [
        "The four routes differ only in what they keep small: distance, oxygen, position error, or oxygen and error together.",
        "4つのルートの違いは、何を小さくするかだけです。距離、酸素、位置の誤差、そして酸素と誤差の両方です。",
      ],
      [
        "While walking, step counting tracks the position but drifts by about 3 % of the distance. White dots are the places where a photo fix resets that error.",
        "歩いている間は歩数で位置を追いますが、歩いた距離の約3%ずつずれていきます。白い点は、写真を撮ってそのずれをリセットする場所です。",
      ],
    ],
    anchor: "routes",
  },
};
