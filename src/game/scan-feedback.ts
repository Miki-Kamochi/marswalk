export interface ScanFeedback {
  sampleCount: number;
  repeated: boolean;
  accepted: boolean;
  improved: boolean;
  coverage: number;
  contrast: number;
  clarity: number;
  orientation: number;
  uniqueness: number;
  quality: number;
}

/** Convert MGL rejection metrics into a concrete, actionable message. */
export function scanFeedback(s: ScanFeedback): string {
  if (s.repeated) return '同じ場所を再スキャンしています。8 m以上移動して別の地形を撮影してください。';
  if (s.sampleCount < 16 || s.coverage < 0.18) return '視界が狭すぎます。周囲の地面を広く見渡せる場所へ移動してください。';
  if (s.clarity < 0.75) return '砂塵で周辺が暗すぎます。視界が回復してから再スキャンしてください。';
  if (s.contrast <= 0.035) return '地面のコントラストが低すぎます。模様や起伏の多い場所へ移動してください。';
  if (s.orientation <= 0.2) return '姿勢推定の誤差が大きすぎます。平坦な場所で静止してください。';
  if (s.uniqueness <= 0.03) return '周囲に似た地形が多すぎます。特徴的な起伏の近くへ移動してください。';
  if (s.quality <= 0.26) return '撮影条件が不足しています。視界と地表の模様を確保してください。';
  if (!s.accepted) return '衛星写真と周辺地形が一致しません。少し移動して別の角度から再スキャンしてください。';
  if (!s.improved) return '現在の存在可能性円より高い測位精度を得られませんでした。';
  return '';
}
