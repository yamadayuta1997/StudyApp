import { isCloseEnough, jaccardSim } from '../jaccardSim';

// ─── jaccardSim 基本挙動 ──────────────────────────────────────────────────────

describe('jaccardSim', () => {
  test('両方空文字 → 1', () => {
    expect(jaccardSim('', '')).toBe(1);
  });

  test('片方が空文字 → 0', () => {
    expect(jaccardSim('利益', '')).toBe(0);
    expect(jaccardSim('', '損益')).toBe(0);
  });

  test('完全一致 → 1', () => {
    expect(jaccardSim('当期純利益', '当期純利益')).toBe(1);
  });

  test('共通文字なし → 0', () => {
    // setA={利,益} setB={損,失} → intersection=0, union=4 → sim=0
    expect(jaccardSim('利益', '損失')).toBe(0);
  });

  test('空白は無視される', () => {
    expect(jaccardSim('当期 純利益', '当期純利益')).toBe(1);
  });
});

// ─── isCloseEnough ────────────────────────────────────────────────────────────

describe('isCloseEnough — 短文（10文字以下）閾値 0.15', () => {
  // 「利益」(2文字) vs 「利益」 → sim=1.0 ≥ 0.15
  test('完全一致 → true', () => {
    const a = '利益';
    expect(isCloseEnough(a, jaccardSim(a, '利益'))).toBe(true);
  });

  // 「利益」vs「損益」: {利,益}∩{損,益}={益} → 1/(2+2-1)=1/3≈0.33 ≥ 0.15
  test('部分一致（利益 ↔ 損益）→ true', () => {
    const a = '利益';
    expect(isCloseEnough(a, jaccardSim(a, '損益'))).toBe(true);
  });

  // 「利益」vs「損失」: {利,益}∩{損,失}=∅ → sim=0 < 0.15
  test('共通文字なし（利益 ↔ 損失）→ false', () => {
    const a = '利益';
    expect(isCloseEnough(a, jaccardSim(a, '損失'))).toBe(false);
  });

  // 両方空文字：長さ0≤10 → threshold=0.15、sim=1.0 ≥ 0.15
  test('両方空文字 → true', () => {
    expect(isCloseEnough('', jaccardSim('', ''))).toBe(true);
  });
});

describe('isCloseEnough — 長文（11文字以上）閾値 0.25', () => {
  // 「当期純利益が増加しました」(11文字) vs 「当期純利益が減少しました」
  // 共通={当,期,純,利,益,が,し,ま,た}=9, union=11+11-9=13 → 9/13≈0.69 ≥ 0.25
  test('高類似（ほぼ同じ文：増加→減少の1語違い）→ true', () => {
    const a = '当期純利益が増加しました';
    const b = '当期純利益が減少しました';
    expect(isCloseEnough(a, jaccardSim(a, b))).toBe(true);
  });

  // CPA試験らしい高類似：売上原価の定義（表現ゆれ）
  test('高類似（売上原価の定義・表現ゆれ）→ true', () => {
    const a = '売上原価は期首棚卸高に当期製造原価を加えて期末棚卸高を差し引いた金額である';
    const b = '売上原価は期首棚卸に当期製造原価を加算し期末棚卸高を減算した金額となる';
    expect(isCloseEnough(a, jaccardSim(a, b))).toBe(true);
  });

  // CPA試験らしい低類似：全く別の論点
  // 「減価償却費は固定資産の費用配分方法である」vs「引当金繰入は将来損失への備えとして計上する」
  // 共通文字は少ない → sim < 0.25
  test('低類似（減価償却 ↔ 引当金：別論点）→ false', () => {
    const a = '減価償却費は固定資産の費用配分方法である';
    const b = '引当金繰入は将来損失への備えとして計上する';
    expect(isCloseEnough(a, jaccardSim(a, b))).toBe(false);
  });

  // 「当期純利益が増加しました」(11文字) vs 全く別の文字列
  // 共通={が}=1, union=11+12-1=22 → 1/22≈0.05 < 0.25
  test('低類似（長文同士で共通文字が極少）→ false', () => {
    const a = '当期純利益が増加しました';
    const b = '繰延税金負債を計上する必要がある';
    expect(isCloseEnough(a, jaccardSim(a, b))).toBe(false);
  });
});
