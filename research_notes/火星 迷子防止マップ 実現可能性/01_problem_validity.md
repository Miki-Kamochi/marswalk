# 課題の妥当性：「火星にはGPSがないので宇宙飛行士が迷子になる」は本当に未解決の問題か（批判的検証）

Research date: 2026-11-14. Status labels used: **[運用中 / operational]**, **[研究段階 / research]**, **[計画・提案 / proposed]**.

---

## Q1. 火星にGPSのような測位システムはあるか？（現状と計画）

### Takeaway
2026年11月時点で、火星にGPSのような衛星測位網（GNSS）は**存在しない**。今ある周回機（MRO、Mars Odyssey、MAVEN、TGOなど）はもともと科学観測機で、地上とのデータ中継が主な役割。ドップラー計測で着陸機の位置を出すことは理論上できるが、精度は粗く、日常的な位置決めの手段ではない。NASAの次の火星通信機（Mars Telecommunications Orbiter / Network）は、要求仕様に「測位・航法・時刻（PNT）サービス」を含んでいる**[計画]**。ただし、火星専用のGPS型コンステレーションは学術提案にとどまる**[提案]**。

### Cited Findings
- 現在の Mars Relay Network は「数十年かけて打ち上げられた、種類の異なる5機の科学周回機」で構成されている。JPLの2026年8月の報告は、単一の次世代中継機を想定した推奨を出している — [JPL IPN Progress Report 42-246 (Aug 15, 2026)](https://ipnpr.jpl.nasa.gov/progress_report/42-246/42-246A.html)
- 同じ報告によると、PNTサービスが要求されなければ高度500–1000 kmの軌道を推奨する。PNTを提供する場合は、より高い軌道が必要になる（取得できた抜粋はここまでで、具体的な高度値は確認できていない）— [IPN 42-246A PDF](https://ipnpr.jpl.nasa.gov/progress_report/42-246/42-246A.pdf)
- NASAの Mars Telecommunications Network 宇宙機の要求案（2026年3月）は、火星の地表・周回機と地球をつなぐ中継に加え、「ドップラー、測距、時刻転送によるPNT支援」と、運用開始から5年以上のPNTサービスを求めている（業界ニュース経由の情報）— [Military & Aerospace Electronics](https://www.militaryaerospace.com/communications/news/55361810/nasa-outlines-requirements-for-high-performance-mars-telecommunications-network-spacecraft)
- Blue Origin が最大7億ドルでこの火星通信機の契約を獲得したと報じられている。納期は2028年12月31日とされるが、これは二次報道 — [Space.com](https://space.com/space-exploration/missions/blue-origin-wins-usd700-million-contract-to-build-nasas-next-mars-orbiter); [Hackaday (2026-09-24)](https://hackaday.com/2026/09/24/after-decades-nasa-may-finally-replace-mars-relays/)
- MITの研究（Journal of Spacecraft and Rockets, 2026）は、地球のGPSに似た火星GNSSコンステレーションと、エアロキャプチャーによる衛星投入を検討している。これは学術提案**[提案]** — [MIT AeroAstro](https://aeroastro.mit.edu/news-impact/design-and-deployment-of-a-martian-global-navigation-satellite-system-using-aerocapture/)
- JPL/Stanfordには、中継とPNTを兼ねる将来の火星コンステレーション向けの軌道決定・時刻同期の研究もある**[研究]** — [JPL Robotics PDF](https://www-robotics.jpl.nasa.gov/media/documents/Orbit_Determination_and_Time_Synchronization_CkKKSdk.pdf)
- 既存の周回機によるドップラー測位は粗い。MER（Spirit/Opportunity）では Mars Relay Doppler 測定を使う計画だったが、位置線の不確かさは「1 km以上の幅」になった。実際には、ローバー画像と周回機画像の照合ですぐに位置が分かったため、この方法は不要だった — [MSSS "Finding MER"](https://www.msss.com/mer_mission/finding_mer/index.html)
- 理論研究では、地上局による着陸機とローバーのドップラー・測距の同時取得を2日以上続ければ、相対位置を20 m以下で決められる。同一ビームVLBIなら着陸機の位置を約10 mで決められるという2017年の予測もあるが、実飛行の結果ではない — [NTRS 19950021365](https://ntrs.nasa.gov/api/citations/19950021365/downloads/19950021365.pdf); [GLEX-2017 abstract](https://iafastro.directory/iac/paper/id/36632/abstract-pdf/GLEX-2017,P,1,91,x36632.brief.pdf)
- 中継機の老朽化：2025年12月にNASAがMAVENとの通信を失ったという報道がある（見出しレベルでしか確認していない）— [SatNews (2025-12-09)](https://satnews.com/2025/12/09/nasa-loses-contact-with-maven-mars-orbiter/)

### Inferences
- 「火星にGPSはない」は**事実として正しい**。ただし「だから位置が分からない」は飛躍がある。ロボットは衛星測位なしで、画像と地図の照合で位置を求めている（Q2参照）。
- 衛星によるPNTは「計画中の中継機に付く機能」として動き出しているが、GPSのような常時・リアルタイム・数m精度の測位網になる見込みは、現時点では見えない。有人着陸（2030年代以降と考えられる）の時点でも、ローカルな手段が主役になる可能性が高い。

### Gaps
- Mars Telecommunications Orbiter のPNT精度目標（何m級か）は、一次資料で確認できなかった。
- ESAの「Moonlight」に相当する火星版（例：MARCONI構想）は、信頼できる一次資料を見つけられなかった。
- MAVENの通信喪失がその後どうなったか（回復したか）は確認していない。

---

## Q1b. 月のアナロジー：LunaNet / LCRNS / Moonlight

### Takeaway
月では、NASA（LCRNS）、ESA（Moonlight）、JAXA（LNSS）が共通規格「LunaNet」のもとで、月周回衛星による通信・測位サービス（LANS / AFS信号）を**準備中**。初期運用は2028年前後と見込まれる**[計画]**。火星より地球に近い月でさえ、まだ「これから作る」段階である。

### Cited Findings
- LunaNetは月の通信・航法を相互運用させる枠組みで、NASAのLCRNS、ESAのMoonlight（LCNS）、JAXAのLNSSが最初の「Augmented Forward Signal（AFS）」提供者になる。航法サービスは Lunar Augmented Navigation Service（LANS、Sバンド）— [Inside GNSS](https://insidegnss.com/the-augmented-forward-signal-afs-defining-the-navigation-signal-standard-for-future-lunar-missions/); [NASA LunaNet/LCRNS presentation 2025](https://ntrs.nasa.gov/api/citations/20250002120/downloads/LunaNet%20%20and%20NASA%20LCRNS%20-MGAconf%205Mar2025.pdf)
- Moonlight：パスファインダー衛星の打ち上げを2026年、月面サービス開始を2028年とする報道がある。ESAの旧ロードマップでは、IOC（初期運用）の後、FOC（完全運用）が2029–2030年頃。日程は何度も遅れている — [Space.com](https://www.space.com/europe-moonlight-program-lunar-navigation-communications); [UNOOSA ICG Lunar PNT 2024](https://www.unoosa.org/documents/pdf/icg/2024/WG-B_Lunar_PNT_Jun24/LunarPNT_Jun24_01_02.pdf)
- NASA JSCの航法サーベイ（2025）は、月面航法はDSN、GPS、LunaNet、事前に置いたビーコン、近くの着陸機などに頼るだろうとしつつ、「通信途絶（月南極では現実的な懸念）時に備えて自律航法が役立つ」と書いている — [McKee, AAS 25-173, NTRS 20250000720](https://ntrs.nasa.gov/api/citations/20250000720/downloads/Lunar_Surface_Nav_Survey_AAS_GNC_011825.pdf)

### Inferences
- 月の取り組みは「衛星測位を作る」と「衛星がなくても自律で位置を出す」を**両方**進めている。火星でも同じ考え方（主系＋バックアップ）がいちばん筋がよい。
- 高校生向けの説明：「月でさえ“宇宙GPS”はまだ建設中。火星はさらに遠く、衛星の数も少ない」。

### Gaps
- LANSの月面での測位精度目標（数十m級か）は、今回の調査では一次資料から確定できなかった。

---

## Q2. 今の火星ローバー・ヘリはどうやって「自分の位置と向き」を知っているか

### Takeaway
「車輪の回転数（オドメトリ）＋慣性計測装置（IMU）＋カメラ画像による移動量推定（ビジュアルオドメトリ, VO）」で相対的な移動を積み上げ、向きは太陽の撮影や加速度計で補正する。絶対位置は、地上のチームがローバーのパノラマ画像を周回機の地図（HiRISE）と照合して求めてきた。2026年2月からは、Perseveranceが**機上でこれを自動化（Mars Global Localization）**し、約2分・約25 cm精度で自分の位置を求めている**[運用中]**。チームが提案する「地平線・地形の写真を既存の地形データと照合して位置推定」は、**ロボットではすでに実用化された技術そのもの**である。

### Cited Findings
- **Perseverance「MGL」[運用中]**（JPLニュース 2026-02-18）
  - ナビカメラのパノラマ画像を機上の周回機地形図と比較し、約2分で位置を約10インチ（25 cm）以内に特定する。2026年2月2日に通常運用で初めて成功し、2月16日にも使用した — [JPL News](https://www.jpl.nasa.gov/news/nasas-perseverance-now-autonomously-pinpoints-its-location-on-mars/)
  - 過去264回の停止地点で試験し、すべて正しく位置を特定した — 同上
  - それまではVOの小さな誤差が積み重なり、長距離走行では位置推定が**最大約35 m（100フィート超）**ずれることがあった。その場合、ローバーは走行を早めに打ち切って地球からの指示を待った — 同上
  - 走行後に360°パノラマを地球へ送り、専門家がMRO画像と照合して位置を返す流れで、**1日以上**かかることがあった。JPLの言葉では「人間が『迷子じゃない、安全だ、進め』と教える必要があった」— 同上
  - 処理は Ingenuity 用だったヘリ基地局のスマホ用プロセッサ（Snapdragon 801）で行う。メインコンピュータ（1997年世代のハードウェア）より100倍以上速い。メモリの不良ビット約25個を避けて動かしている — 同上; [JPL 2026 IEEE Aero paper](https://www-robotics.jpl.nasa.gov/media/documents/2026_Global_Localization_Memory_Workaround_IEEE_Aero__final.pdf)
  - 研究段階（2024）の論文では、ナビカメラの赤チャンネル画像とHiRISEオルソ画像をcensus変換で照合し、サブメートル精度で人手による位置決めと一致した — [JPL 2024 IEEE Aero](https://www-robotics.jpl.nasa.gov/media/documents/2024_Global_Localization_IEEE_Aero.pdf); [JPL 2024 ICRA](https://www-robotics.jpl.nasa.gov/media/documents/2024_Global_Localization_ICRA.pdf)
- **Curiosity / MER の方式**：IMUと車輪エンコーダを積分して相対移動を求め、ナビカメラで太陽を撮影して加速度計・天体暦と組み合わせ、姿勢（向き）を更新する。VOは主力の手段。絶対位置は、走行後のパノラマを地上の人間が周回機画像と照合して求める — [McKee 2025 NASA JSC survey](https://ntrs.nasa.gov/api/citations/20250000720/downloads/Lunar_Surface_Nav_Survey_AAS_GNC_011825.pdf)
- 誤差の目安：車輪オドメトリの誤差は通常で移動距離の約10%（すべりやすい地形ではさらに悪化）。VOは初期試験で2.5%より良い — [JPL Rocky 8 paper](https://robotics.jpl.nasa.gov/media/documents/rob-06-0081.R4.pdf)。MERでは、すべりや方位ドリフトによる航法誤差が最大21%に達したため、VOとバンドル調整で補正した — [search summary of JPL/MER VO literature, e.g. iros_final_submitted](https://robotics.jpl.nasa.gov/media/documents/iros_final_submitted.pdf)（※出典の対応付けは要確認）
- Curiosityは砂丘のリップル（megaripple）で3Dすべり率が70%を超えたことがあり、VOで検出したすべりで走行を止めている — [JPL 2020 mobility trending](https://www-robotics.jpl.nasa.gov/media/documents/2020-mobility-trending.pdf); [Arvidson LPSC 2016](https://www-robotics.jpl.nasa.gov/media/documents/lpsc_2016_arvidson_ripple_crossing.pdf)
- Opportunityは sol 446 に50 m走るよう指示されたが、「Purgatory Ripple」で2 mしか進めず車輪が空転した。これはVOで判明した — [McKee 2025](https://ntrs.nasa.gov/api/citations/20250000720/downloads/Lunar_Surface_Nav_Survey_AAS_GNC_011825.pdf)
- Sojourner（1997）のジャイロによる方位基準は**1 solあたり約13°ドリフト**し、目標の通過点に正しく着かないことがあった — 同上
- **Ingenuity**：IMU、傾斜計、レーザー高度計、下向きカメラによる30 HzのVOを使った。絶対位置は地上が前回飛行の画像から求めた。最後は「特徴の少ない（visually bland）」地形の上でVOがうまく働かず、ハードランディングでローターを損傷した。冗長な航法手段が必要だという教訓 — 同上
- 火星の1 sol ≈ 24時間39分 — 同上

### Inferences
- 「位置推定に写真と地形データの照合を使う」案は理にかなっている。ただし**新しいアイデアではなく、NASAが2026年にローバーで実用化済み**。高校生チームの新しさは、それを人間（宇宙飛行士）向けに、軽く・分かりやすく・故障時にも使える形で提示する点にある。
- Ingenuityの教訓は、模様の少ない地形では画像照合が失敗しうるということ。提案には「照合できない場合の表示（信頼度）」を入れるべき。

### Gaps
- Curiosity単独の太陽撮影による方位精度（何度か）は、一次資料の数値を確認できなかった。
- 中国の祝融号（Zhurong）の測位方式は調査していない。

---

## Q2b. コンパスは使えるか

### Takeaway
使えない、または信頼できない。火星には地球のような全球磁場がなく、古い地殻の一部に局所的な磁気（場所によって強さも向きもばらばら）が残っているだけ。

### Cited Findings
- 火星には全球的な固有磁場がない（MAVEN / Mars Global Surveyor の観測）— [NASA MAVEN nugget PDF](https://science.nasa.gov/wp-content/uploads/2023/05/NuggetFirst3_DMapofMarsMagneticTopology20171013.pdf)
- 地殻の残留磁気は主に南半球の古い地殻に集中しており、最大約1,500 nT、平均約200 nT（地球表面の磁場は約25,000–65,000 nTで、比べるとずっと弱い。地球の値は一般知識）— [Phys.org 2014](https://phys.org/news/2014-02-magnetic-crustal-fields-affect-planets.html); [Universe Today](https://www.universetoday.com/articles/mars-lacks-a-planet-wide-magnetosphere-but-it-does-have-pockets-of-magnetism)
- 「火星には1つの磁場ではなく何十もの磁場があるので、コンパスは働かない」— [Phys.org 2014](https://phys.org/news/2014-02-magnetic-crustal-fields-affect-planets.html)
- 月も同様。月面ではローバーが磁気コンパスにもジャイロコンパスにも頼れないため（磁場が弱く自転が遅い）、向きはIMUと太陽・星による再補正で得る — [McKee 2025](https://ntrs.nasa.gov/api/citations/20250000720/downloads/Lunar_Surface_Nav_Survey_AAS_GNC_011825.pdf)

### Gaps
- 火星表面の磁気異常の大きさを、宇宙飛行士の手持ちコンパスの誤差（何度ずれるか）に換算した資料は見つからなかった。

---

## Q3. 人間が実際に迷った・方向を見失った例はあるか（アポロ、アナログ実験、人間の特性）

### Takeaway
ある。代表例は**アポロ14号（1971年）のコーン・クレーター**。シェパードとミッチェルは縁の約20–30 mまで来ていたのに、そこが分からず引き返した。ただし「命の危険がある迷子」ではない。着陸船は見えていて帰還は問題なかった。失ったのは**科学的な目的地点**と**体力・時間**である。アポロ15–17号では月面車（LRV）に簡単な航法装置（ジャイロ＋車輪オドメータ、帰還方位と距離の表示）が付き、大きな問題は起きなかった。

### Cited Findings
- **アポロ14号**：乗員はコーン・クレーターを探して方向を見失い、移動距離を一貫して過大に見積もり、クレーター縁の斜面登りで疲れ果てた。月面は「目をだます」。似た地形が続き、照明が極端で、大きさの手がかりがない（その岩は近くの小石か、遠くの大岩か）。地上と乗員が話し合って捜索を打ち切ったが、後の解析で目的地まで**30 m以内**にいたことが分かった — [McKee 2025, NASA JSC](https://ntrs.nasa.gov/api/citations/20250000720/downloads/Lunar_Surface_Nav_Survey_AAS_GNC_011825.pdf)
  - 縁までの距離は資料によって違う。約70フィート（21 m）— [Astronomy.com](https://astronomy.com/news/2021/01/50-years-since-apollo-14-mission-to-fra-mauro)。約65フィート — [LitHub](https://lithub.com/no-billionaires-detected-what-it-was-like-to-walk-on-the-moon-in-the-summer-of-1971)。約100フィート — [Space.com](https://www.space.com/17465-apollo-14-facts.html)。約150フィート — [Inverse](https://www.inverse.com/science/video-apollo-14-astronauts-hike-on-the-moon)。LRO（月周回衛星）の画像で足跡が確認され、謎が解けた — [Universe Today](https://universetoday.com/37870/latest-lro-image-solves-apollo-14-mystery)
  - 着陸船 Antares は見えており、帰還そのものは危険ではなかった — [LitHub](https://lithub.com/no-billionaires-detected-what-it-was-like-to-walk-on-the-moon-in-the-summer-of-1971)
- **アポロの方針**：「乗員の目と地図が最優先」。LRVの航法装置は「あくまで便利機能で、必須ではない。出発や継続の条件にしてはならない」とされた（1970年の技術メモ）— [McKee 2025](https://ntrs.nasa.gov/api/citations/20250000720/downloads/Lunar_Surface_Nav_Survey_AAS_GNC_011825.pdf)
- **LRV航法**：方向ジャイロと4輪のオドメータ（すべり対策に3輪以上の一致が必要）を使い、着陸船への方位と距離を表示した。太陽の影を使う装置でジャイロを再調整した（計算は地上が担当）。要求精度は方位±6°、距離±600 m、総走行距離±2%で、アポロ15–17号すべてで仕様内だった。着陸船からの最大計画距離は9.5 km。着陸船は1 kmまでははっきり、おそらく3 kmまでは見えると考えられ、「着陸船が見える範囲まで戻れる情報を渡す」ことが設計目標だった。乗員は「驚くほど正確で、帰るのは簡単だった」と評価した — 同上
  - 実際の精度は「良くても100 m程度」という資料もある。アポロ15号の最初のEVAでは、乗員の推定とシステムの方位が約19°ずれた — [search summary of NASA TN D-7469 and related](https://es.scribd.com/document/46361371/Lunar-Roving-Vehicle-Navigation-System-Performance-Review)（※二次情報なので要注意）
  - LRVの位置は、事後に地上のVLBI追跡で約25 m精度で求められた — [McKee 2025](https://ntrs.nasa.gov/api/citations/20250000720/downloads/Lunar_Surface_Nav_Survey_AAS_GNC_011825.pdf)
  - LRVにはクレーターなどの危険を検知する機能がなく、乗員がクレーターを避けるために急いでよけたことが何度もあった — 同上
- **人間の特性（Souman et al., 2009, Current Biology "Walking Straight into Circles"）**：太陽や月が見えれば人はほぼまっすぐ歩けた。曇天の森では4人全員が円を描き、3人は自分の通った道を何度も横切った。砂漠では直径20 mほどの小さな円になることもあった。原因は感覚のわずかな誤差の積み重ねとされる（被験者はごく少数）— [ScienceDaily](https://www.sciencedaily.com/releases/2009/08/090820123927.htm); [National Geographic](https://www.nationalgeographic.com/science/article/do-lost-people-really-go-round-in-circles)
- **アナログ実験**：
  - BASALT（ハワイ・アイダホの火星アナログEVA）は、計画と実行の支援ソフト Minerva（xGDS、Playbook、SEXTANT＝Surface Exploration Traverse Analysis and Navigation Tool）を使った。「航法・経路計画ツール」はすでに研究用として存在している — [NTRS BASALT / PMC6442236](https://pmc.ncbi.nlm.nih.gov/articles/PMC6442236)
  - D-RATS 2022（NASAアナログ）は、EVAとローバーを組み合わせた照明・航法の試験を行い、月南極の低い太陽高度を新しい課題に挙げた — [D-RATS 2022 Quicklook](https://ntrs.nasa.gov/api/citations/20230007175/downloads/D-RATS%202022%20Quicklook%20Report.pdf)
  - MIT（IAC 2024）は、GPSを使わずに天測と手持ちの角度計測具、紙・デジタル地図で位置を推定する方法を、MDRS（Mars Desert Research Station）の火星模擬で試験した — [IAC-24 abstract](https://iafastro.directory/iac/paper/id/82217/abstract-pdf/IAC-24,B3,8,8,x82217.brief.pdf)
- **地平線までの距離（計算値）**：目の高さ1.7 m、火星半径3,389.5 kmとすると √(2Rh) ≈ 3.4 km（地球では約4.7 km）。遠くの目印が地平線の下に早く隠れる。※標準の幾何公式による計算で、引用元はない。

### Inferences
- 実際の歴史では、迷ったことで命の危機になった例は見つからなかった。問題になったのは**目的地点に着けない**こと（科学的な損失）と、**距離の見誤りによる体力・時間の浪費**。この違いは発表で正直に示すべき。
- 火星には大気とちり（もや）があるので、月より遠近感の手がかりは多い。一方で、ダストストームで視界が落ちる問題がある。月面の「大気のもやがないので距離感が狂う」という話をそのまま火星に当てはめるのは不正確。

### Gaps
- Apollo Lunar Surface Journal（ALSJ）の原文と、TN D-7469 の具体的な数値（各EVAの閉合誤差）は取得できなかった（PDFが404）。
- HMP（Haughton-Mars Project）や南極の野外調査での迷子事例について、一次資料は見つからなかった。
- 火星ではちりによるもやで距離が実際より遠く見えるのか近く見えるのかを、人間の評価として調べた研究は見つからなかった。

---

## Q4. 火星の有人EVAで「迷子」は深刻なリスクか／既存・計画中の技術で解決済みか

### Takeaway
「迷子で死ぬ」型の単純なリスクは、運用設計（2人1組、近くに与圧ローバー、ハビタットとの通信、帰路の記録）でかなり抑えられる見込み。ただし火星では**地球との通信遅延が片道約3–24分**あり、アポロのような「地上が即座に助ける」は不可能。NASAは遅延下でのEVA支援（情報表示・意思決定支援）を研究課題として扱っている。弱点が残るのは「主系（通信・電子機器）が故障したとき」と「画像照合が使えない環境（ダスト、特徴の少ない地形）」で、そのためのバックアップと状況把握は、正当な未解決のテーマである。

### Cited Findings
- 地球と火星の片道通信遅延は、最接近で約3–4分、最遠で約22–24分。有人火星ミッションの検討では21–23分が使われている — [NASA Goddard "Space Communications: 7 Things"](https://www.nasa.gov/centers-and-facilities/goddard/space-communications-7-things-you-need-to-know/); [NASA TM-20250003885](https://ntrs.nasa.gov/api/citations/20250003885/downloads/NASA%20TM20250003885.pdf); [NASA Mars Communications Disruption and Delay (Moon to Mars architecture white paper)](https://www.nasa.gov/wp-content/uploads/2024/01/mars-communications-disruption-and-delay.pdf?emrc=1adf04)
- 月の遅延は約1.3秒 — 同上（NASA search summary）
- NASAのEVA情報表示のレビュー（2025, JSC/Ames）は、通信遅延があると地上の支援力が下がるため、乗員の協調を明示的に支える機能が必要だとしている — [NTRS 20250011652](https://ntrs.nasa.gov/api/citations/20250011652/downloads/IEEE-aero-lit-review-EVA-informatics_final.pdf); [NTRS 20260001895 presentation](https://ntrs.nasa.gov/api/citations/20260001895/downloads/IEEEAeroConfPresentation_LeAP%20-%20STRIVES.pdf)
- NEEMO 18–20 では片道5分・10分の遅延を試験し、遅延下で移動計画を実行するには音声より文字・データが好まれた。NEEMO 21 では片道15分の遅延で火星EVAを模擬した — [NTRS search results: NEEMO reports](https://ntrs.nasa.gov/api/citations/20170000367/downloads/20170000367.pdf)
- 2023年のNTRS論文は、火星EVAを遅延下で支える意思決定支援プラットフォーム（PersEIDS）の開発を報告している — [NTRS 20230007488](https://ntrs.nasa.gov/citations/20230007488)
- アポロのEVAは台本が細かく決まっており、時間と回数が限られ、地上との通信遅延はほぼゼロで行われた。将来とは前提が違う — [PMC6442304 (BASALT)](https://pmc.ncbi.nlm.nih.gov/articles/PMC6442304)
- NASA JSCのサーベイは、自律的な表面航法が「通信途絶時」「通信資源の負担軽減」「試料採取地点の記録」に役立つとし、使える手法として星追跡＋IMUによる位置推定（地上実証で約421 m誤差、月では約125 mが見込み）、クレーター照合（LunarNav、成熟度低）、**地平線（スカイライン）照合**を挙げている。スカイライン照合は「迷子状態でも粗い位置を出せる」が、「理論・学術段階」で、誤一致の可能性も無視できない — [McKee 2025](https://ntrs.nasa.gov/api/citations/20250000720/downloads/Lunar_Surface_Nav_Survey_AAS_GNC_011825.pdf)
- 同サーベイは、アポロの教訓として3点を挙げる。(1) 地表は人の目をだます。(2) 常に着陸船が見える範囲まで戻れる情報を与える。(3) 余計な情報は与えず、航法装置が乗員の時間や注意の負担になってはならない — 同上

### Inferences
- **すでに解決済みの部分**：ロボットの画像による自己位置推定（MGL）**[運用中]**。中継機によるPNT **[計画]**。月の測位網 **[計画, 2028年頃〜]**。研究用のEVA経路計画ツール（SEXTANT/Minerva）**[研究]**。
- **未解決・弱い部分**：人間（宇宙服を着た飛行士）が、**通信や主系が使えないとき**に、**一目で分かる形**で「今どこか、どの道が安全か、あと何分で戻れるか」を把握する手段。遅延のため地球の支援に頼れない点が火星特有の動機になる。
- 地平線照合はロボットでは近い技術が実用化済みだが、人間の携帯端末で、誤一致の可能性まで示す形では成熟していない。高校生の提案はここに位置づけられる。

### Gaps
- NASAの有人火星EVAの航法要求（例：○ m精度、ハビタットから最大○ kmの「歩いて帰れる距離」制約）を明記した一次資料は見つからなかった。
- NASA SUITS チャレンジ（学生向けの宇宙服UI開発）の最新要求にある航法機能の詳細は確認していない。
- 有人火星の基地周辺でのUWBやビーコンによる局所測位について、具体的な計画文書は見つからなかった。

---

## Q5. 総合判定：解く価値はあるか、どう言い換えるべきか

### Takeaway
「火星にはGPSがないので宇宙飛行士は迷子になる」という言い方は**弱い（半分正しく、半分誤解を招く）**。GPSがないのは事実だが、NASAは衛星なしで、画像と地形図の照合によって**25 cm精度の自己位置推定をローバーで実用化済み**であり（2026年2月）、有人EVAも単独で無計画に歩き回る運用は想定されていない。より強く正直な言い方は次のようになる。「**通信遅延が数分〜20分超ある火星で、通信や電子機器が使えなくなっても、宇宙飛行士が自分で『今どこか・安全な帰り道はどれか・あと何分で戻れるか』を判断できる状況把握とバックアップ航法**」、および「**事前に、迷いにくく安全な経路（目印が見え、傾斜が緩く、照合しやすい地形）を計画する地図**」。

### Cited Findings（判定を支える根拠のまとめ）
- GNSSは存在せず、計画は中継機付きのPNTにとどまる — [Military & Aerospace Electronics](https://www.militaryaerospace.com/communications/news/55361810/nasa-outlines-requirements-for-high-performance-mars-telecommunications-network-spacecraft); [MIT](https://aeroastro.mit.edu/news-impact/design-and-deployment-of-a-martian-global-navigation-satellite-system-using-aerocapture/)
- 画像と地図の照合による自己位置推定はロボットで運用中（25 cm、2分）— [JPL News 2026-02-18](https://www.jpl.nasa.gov/news/nasas-perseverance-now-autonomously-pinpoints-its-location-on-mars/)
- それ以前は誤差が最大35 m蓄積し、人の確認に1日以上かかっていた。自律化には価値がある — 同上
- 人間は月面で実際に方向と距離を見誤った（アポロ14号）。ただし命の危険ではなかった — [McKee 2025](https://ntrs.nasa.gov/api/citations/20250000720/downloads/Lunar_Surface_Nav_Survey_AAS_GNC_011825.pdf); [LitHub](https://lithub.com/no-billionaires-detected-what-it-was-like-to-walk-on-the-moon-in-the-summer-of-1971)
- NASA自身が、通信途絶時の自律航法と、乗員の負担にならない表示が必要だとしている — [McKee 2025](https://ntrs.nasa.gov/api/citations/20250000720/downloads/Lunar_Surface_Nav_Survey_AAS_GNC_011825.pdf); [NTRS 20250011652](https://ntrs.nasa.gov/api/citations/20250011652/downloads/IEEE-aero-lit-review-EVA-informatics_final.pdf)
- 画像航法は特徴の少ない地形で失敗しうる（Ingenuityの最後の飛行）— [McKee 2025](https://ntrs.nasa.gov/api/citations/20250000720/downloads/Lunar_Surface_Nav_Survey_AAS_GNC_011825.pdf)

### Inferences（チームへの提言）
- 弱い言い方：「GPSがない → 迷子になる → 地図で解決」。審査員から「NASAはもう画像で位置推定しているのでは？」と突っ込まれる。
- 強い言い方（候補）：
  1. **バックアップと状況把握**：主系（通信・中継・ローバー航法）が故障したとき、宇宙飛行士が手元で位置の推定と帰還ルートを確認できる。
  2. **地球に頼れない判断支援**：遅延が片道3–24分あるので、地上が即座に「戻れ」とは言えない。現場で安全な経路と残り時間を判断できる。
  3. **「迷いにくい経路」を事前に計画**：傾斜・障害物だけでなく、「目印が見えるか」「画像照合が効く特徴が多いか」「ハビタットが見える範囲か」を経路評価に加える。これはアポロの教訓（着陸船が見える範囲まで戻れること）とも一致する。
  4. **信頼度の表示**：照合の自信度や誤一致の可能性を示し、「分からないときは分からないと表示する」。
- 正直に書くべき限界：衛星PNTや機上の画像測位はNASAがすでに進めている。提案の新しさは人間向けの統合・表示・バックアップの部分にある。実際の迷子による事故例はなく、主な損失は科学的な目的地の見逃しと時間・体力の浪費である。

### Gaps
- 有人火星EVAの具体的な運用ルール（最大行動半径、2人1組の規則、ローバーの随伴）は、NASA Moon to Mars architecture の文書から直接確認できなかった。
- 火星の地形データの解像度（HiRISE約25–30 cm/px、DEMは約1 m/pxで、カバー範囲は限られる）は、別の担当者のテーマと考えられ、この調査では出典を確認していない。
