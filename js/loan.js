// 自動車ローンの返済計算（元利均等・元金均等、残価据置、ボーナス併用、端数処理、繰上げ返済、金利変動）。Node でも読み込み可
// 金額は円、金利は年利の小数（3% → 0.03）。月利は 年利 ÷ 12（実質年率の月割り）。利息は 1 円未満切捨て
(function (root) {
  'use strict';

  // 単位 u 未満を切り捨てる（1・10・100・1000 円）
  const floorU = (v, u) => Math.floor(v / u + 1e-9) * u;
  const yen = v => Math.floor(v + 1e-9);

  // 支払回 k（1 始まり）の暦の月。first は初回の月（1〜12）
  const monthOf = (first, k) => ((first - 1 + k - 1) % 12) + 1;

  // 回 k の利息に使う年利。rateChanges = [{ k: この回の利息から適用, apr }]
  function rateAt(o, k) {
    let a = o.apr;
    for (const c of o.rateChanges || []) if (c.k <= k) a = c.apr;
    return a;
  }

  // ---------------- 入力の確認 ----------------
  function check(o) {
    const e = [];
    const B = o.balloon || 0, b = o.bonus || { mode: 'none' };
    if (!(o.P > 0)) e.push('借入額は 0 より大きい値を入れてください。');
    if (!(o.apr >= 0 && o.apr < 0.3)) e.push('金利は 0% 以上 30% 未満で入れてください。');
    if (!(Number.isInteger(o.n) && o.n >= 2 && o.n <= 600)) e.push('支払回数は 2〜600 回の整数で入れてください。');
    if (!(o.first >= 1 && o.first <= 12)) e.push('初回の支払月を選んでください。');
    if (B < 0 || (o.P > 0 && B >= o.P)) e.push('据置額（残価）は 0 以上で、借入額より小さい値にしてください。');
    if (b.mode !== 'none' && (!b.months || b.months.length !== 2 || b.months[0] === b.months[1])) e.push('ボーナス月を 2 つ選んでください。');
    if (b.mode === 'amount' && !(b.amount > 0)) e.push('ボーナス月の額を入れてください。');
    if (b.mode === 'share' && !(b.share > 0 && b.share < o.P - B)) e.push('ボーナス返済分は 0 より大きく、借入額から据置額を引いた額より小さくしてください。');
    if (o.method === 'principal' && (B > 0 || b.mode !== 'none')) e.push('元金均等では据置（残価）とボーナス併用は使えません。');
    for (const c of o.rateChanges || []) if (!(c.k >= 2 && c.k <= o.n && c.apr >= 0 && c.apr < 0.3)) { e.push('金利の変化は 2 回目以降・30% 未満で入れてください。'); break; }
    const p = o.prepay;
    if (p && p.amount > 0 && !(p.k >= 1 && p.k < o.n)) e.push('繰上げ返済の回は 1〜最終回の前で入れてください。');
    return e;
  }

  // ボーナス月にあたる回（据置があるときは最終回を除く）
  function bonusPeriods(o) {
    const b = o.bonus || { mode: 'none' };
    if (b.mode === 'none') return [];
    const last = (o.balloon || 0) > 0 ? o.n - 1 : o.n;
    const out = [];
    for (let k = 1; k <= last; k++) if (b.months.includes(monthOf(o.first, k))) out.push(k);
    return out;
  }

  // ---------------- 均等額 ----------------
  // 残高 bal（＋未収の利息 accrued）を、回 from〜end の支払で返し切る均等額。
  //   pays：均等額を払う回、extras：回ごとの固定額、balloon：最終回 end の固定額、aprAt(k)：回 k の年利
  //   利息は前の支払からの月数で単利（毎月払うところは月複利と同じ）
  function levelPayment(bal, from, end, pays, extras, balloon, aprAt, accrued = 0) {
    let d = 1, sumA = 0, pvFix = 0, prev = from - 1;
    const set = new Set(pays);
    for (let k = from; k <= end; k++) {
      const fix = (extras[k] || 0) + (k === end ? balloon : 0);
      if (!set.has(k) && !fix) continue;
      let f = 1;
      for (let j = prev + 1; j <= k; j++) f += aprAt(j) / 12;
      d /= f; prev = k;
      if (set.has(k)) sumA += d;
      pvFix += fix * d;
    }
    return sumA > 0 ? (bal + accrued - pvFix) / sumA : NaN;
  }

  // ---------------- 1 本のローンを 1 回進める ----------------
  // s：{ bal, accrued, unpaid, pays:Set, extras, balloon, end, A, adj, adjX }
  function step(s, k, apr) {
    const out = { pay: 0, interest: 0, principal: 0, adj: false };
    if (!(s.bal > 0) && !(s.accrued > 0) && !(s.unpaid > 0)) return out;
    s.accrued += s.bal * apr / 12;
    const isA = s.pays.has(k), ext = s.extras[k] || 0;
    if (!isA && !ext && k !== s.end) return out;
    const intDue = yen(s.accrued) + s.unpaid, due = s.bal + intDue;
    let pay;
    if (k === s.end) pay = due;                                   // 最終回：残りをすべて払う
    else if (isA && k === s.adj && s.adjX != null) { pay = s.adjX + ext; out.adj = true; }
    else pay = (isA ? s.A : 0) + ext;
    if (k === s.end && k === s.adj) out.adj = true;
    if (pay > due) pay = due;                                     // 繰上げのあとは残りより多く払わない
    const intPaid = Math.min(intDue, pay);
    s.unpaid = intDue - intPaid;                                  // 払いきれない利息（5 年ルール）は次回へ
    s.accrued = 0;
    s.bal -= pay - intPaid;
    if (s.bal < 0.5 && s.unpaid < 0.5) { s.bal = 0; s.unpaid = 0; }
    out.pay = pay; out.interest = intPaid; out.principal = pay - intPaid;
    return out;
  }
  const clone = s => ({ ...s, pays: new Set(s.pays), extras: { ...s.extras } });

  // 調整回の額 x を求める：最終回がちょうど目標（据置額、または均等額）になる x。
  // 契約時と同じく、調整回の金利がこの先も続くとして逆算する
  function solveAdjust(s, k, apr) {
    const target = s.balloon > 0 ? s.balloon : s.A + (s.extras[s.end] || 0);
    const finalPay = x => {
      const c = clone(s); c.adjX = x;
      let last = 0;
      for (let j = k; j <= c.end; j++) { const r = step(c, j, apr); if (r.pay) last = r.pay; if (j === c.end) return r.pay; }
      return last;
    };
    // 最終回の額は x にほぼ比例して減る。割線法を数回くり返し（利息の切捨てで少し曲がるため）、最後に ±2 円で詰める
    let xa = s.A, fa = finalPay(xa) - target, xb = s.A + 1000, fb = finalPay(xb) - target;
    for (let i = 0; i < 8 && fb !== fa && Math.abs(fb) >= 1; i++) {
      const xc = Math.round(xb - fb * (xb - xa) / (fb - fa));
      if (xc === xb) break;
      xa = xb; fa = fb; xb = xc; fb = finalPay(xb) - target;
    }
    const x = xb;
    let best = x, bf = Math.abs(fb);
    for (const t of [x - 2, x - 1, x + 1, x + 2]) { const f = Math.abs(finalPay(t) - target); if (f < bf) { bf = f; best = t; } }
    return best;
  }

  // ---------------- 返済表 ----------------
  function simulate(o) {
    const errors = check(o);
    if (errors.length) return { errors };
    const u = (o.round && o.round.unit) || 1;
    const adjust = (o.round && o.round.adjust) || 'last';
    const rule = o.rule || 'recalc';
    if (o.method === 'principal') return simulatePrincipal(o, u);

    const n = o.n, B = o.balloon || 0, b = o.bonus || { mode: 'none' };
    const bp = bonusPeriods(o);
    const aprAt = k => rateAt(o, k);
    const prepay = o.prepay && o.prepay.amount > 0 ? o.prepay : null;
    if (prepay && B > 0) return { errors: ['据置（残価）があるローンの一部繰上げ返済は、会社ごとに扱いが違うため計算しません。'] };

    // 毎月分：据置があるときは 1〜n−1 回に均等額、n 回に据置額。
    // ボーナス月の額の入れ方：add＝均等額に加算、total＝その月は均等額の代わりにボーナス月の額だけ払う
    const lastA = B > 0 ? n - 1 : n;
    const pays = new Set(), extras = {};
    for (let k = 1; k <= lastA; k++) pays.add(k);
    if (b.mode === 'amount') bp.forEach(k => { extras[k] = b.amount; if (b.include === 'total') pays.delete(k); });
    const Pb = b.mode === 'share' ? b.share : 0;
    const mk = (P, ps, ex, bal, end) => ({ bal: P, accrued: 0, unpaid: 0, pays: new Set(ps), extras: ex, balloon: bal, end, A: 0, adj: null, adjX: null });
    const subs = [mk(o.P - Pb, pays, extras, B, n)];
    if (b.mode === 'share') subs.push(mk(Pb, bp, {}, 0, bp[bp.length - 1]));

    // 均等額を決める（単位未満は切捨て）。調整回は初回（契約時だけ）か、均等額を払う最後の回
    function setLevel(s, from, atStart) {
      const ps = [...s.pays].filter(k => k >= from).sort((a, c) => a - c);
      // その時点の金利がこの先も続くとして決める（先の金利の変化は契約時には分からない）
      const r0 = aprAt(from);
      s.rawA = levelPayment(s.bal, from, s.end, ps, s.extras, s.balloon, () => r0, s.accrued);
      s.A = floorU(s.rawA, u);
      s.adjX = null;
      s.adj = atStart && adjust === 'first' ? ps[0] : ps[ps.length - 1];
    }
    subs.forEach(s => setLevel(s, 1, true));
    const firstA = subs.map(s => s.A), firstRaw = subs.map(s => s.rawA);

    const rows = [];
    for (let k = 1; k <= n; k++) {
      const apr = aprAt(k);
      // 金利が変わった回：毎回再計算なら、この回から均等額を出し直す
      if (rule === 'recalc' && k > 1 && apr !== aprAt(k - 1)) subs.forEach(s => { if (s.bal > 0 && [...s.pays].some(j => j >= k)) setLevel(s, k, false); });
      // 5 年ルール：60 回ごとに出し直し、増えるときは前の 1.25 倍まで（それまでは金利が変わっても額は同じ）
      if (rule === '5y125' && k > 1 && (k - 1) % 60 === 0) subs.forEach(s => {
        if (!(s.bal > 0) || ![...s.pays].some(j => j >= k)) return;
        const old = s.A; setLevel(s, k, false);
        if (s.A > old * 1.25) { s.A = floorU(old * 1.25, u); s.capped = true; }
      });
      const row = { k, month: monthOf(o.first, k), apr, pay: 0, interest: 0, principal: 0, balance: 0, unpaid: 0, bonus: bp.includes(k), adj: false, prepay: 0 };
      for (const s of subs) {
        if (k === s.adj && s.adjX == null && k !== s.end && s.bal > 0) s.adjX = solveAdjust(s, k, apr);
        const r = step(s, k, apr);
        row.pay += r.pay; row.interest += r.interest; row.principal += r.principal; row.adj = row.adj || r.adj;
      }
      // 繰上げ返済：この回の支払のあと、毎月分の元金に充てる
      if (prepay && k === prepay.k) {
        const s = subs[0], x = Math.min(prepay.amount, s.bal);
        s.bal -= x; row.prepay = x; row.pay += x; row.principal += x;
        if (s.bal > 0 && prepay.mode === 'reduce') setLevel(s, k + 1, false);
        if (s.bal > 0 && prepay.mode === 'shorten') {
          // 均等額のまま進めたときに終わる回を新しい最終回にする（あとで金利が変わって出し直すときも、この最終回までで返す）
          s.adj = null; s.adjX = null;
          const c = clone(s), r0 = aprAt(k + 1);
          let end = s.end;
          for (let j = k + 1; j <= s.end; j++) { step(c, j, r0); if (!(c.bal > 0) && !(c.unpaid > 0)) { end = j; break; } }
          s.end = end;
          s.pays = new Set([...s.pays].filter(j => j <= end));
          Object.keys(s.extras).forEach(j => { if (+j > end) delete s.extras[j]; });
        }
      }
      row.balance = subs.reduce((a, s) => a + s.bal, 0);
      row.unpaid = subs.reduce((a, s) => a + s.unpaid, 0);
      rows.push(row);
      if (subs.every(s => !(s.bal > 0) && !(s.unpaid > 0))) break;
    }
    return summarize(o, rows, {
      A: firstA[0], rawA: firstRaw[0],
      bonusA: b.mode === 'share' ? firstA[1] : b.mode === 'amount' ? b.amount : 0,
      capped: subs.some(s => s.capped)
    });
  }

  // 元金均等：毎回の元金を同じにし、利息は残高に応じて減る（単位未満は切捨て、差は最終回で調整）
  function simulatePrincipal(o, u) {
    const n = o.n, prepay = o.prepay && o.prepay.amount > 0 ? o.prepay : null;
    let c = floorU(o.P / n, u), bal = o.P;
    const rows = [];
    for (let k = 1; k <= n && bal > 0; k++) {
      const apr = rateAt(o, k), interest = yen(bal * apr / 12);
      const prin = (k === n || c >= bal) ? bal : c;
      const row = { k, month: monthOf(o.first, k), apr, pay: prin + interest, interest, principal: prin, balance: 0, unpaid: 0, bonus: false, adj: prin !== c, prepay: 0 };
      bal -= prin;
      if (prepay && k === prepay.k && bal > 0) {
        const x = Math.min(prepay.amount, bal); bal -= x; row.prepay = x; row.pay += x; row.principal += x;
        if (prepay.mode === 'reduce' && bal > 0) c = floorU(bal / (n - k), u);
      }
      row.balance = bal; rows.push(row);
    }
    return summarize(o, rows, { A: floorU(o.P / n, u), rawA: o.P / n, bonusA: 0, capped: false });
  }

  function summarize(o, rows, extra) {
    const sum = f => rows.reduce((a, r) => a + r[f], 0);
    const adj = rows.find(r => r.adj);
    return Object.assign({
      errors: [], rows, P: o.P, n: o.n, count: rows.length, balloon: o.balloon || 0,
      firstPay: rows[0].pay, finalPay: rows[rows.length - 1].pay,
      totalPay: sum('pay'), totalInterest: sum('interest'), prepaid: sum('prepay'),
      maxPay: Math.max(...rows.map(r => r.pay - r.prepay)),
      adjK: adj ? adj.k : null, adjPay: adj ? adj.pay : null,
      unpaidEnd: rows.reduce((a, r) => Math.max(a, r.unpaid), 0)
    }, extra);
  }

  // ---------------- 金利のプリセット（app.js から使う） ----------------
  // 値は各社の公表値の転記。審査・時期・申込方法で変わるので、出典と確認日を必ず画面に出す
  //   group：bank（銀行）・dealer（ディーラー・信販の公表例）・range（相場の目安）
  //   type：変動・固定、lo / hi：年利の下限・上限、rule：金利が変わったときの返済額（分かっているときだけ）
  //   official：true は会社の公式ページ、false は比較記事などの二次情報
  const RATES_CHECKED = '2026-10-30';
  const PRESETS = [
    { id: 'mufg', group: 'bank', name: '三菱UFJ銀行 ネットDEマイカーローン', type: '変動', lo: 0.02375, hi: 0.035, rule: '5y125', official: true,
      url: 'https://www.bk.mufg.jp/kariru/mycar/', src: '三菱UFJ銀行（2026-10-01現在の表示）', note: '借入額で金利が決まります。金利が変わっても5年間は返済額が変わりません（5年ルール・125%ルール）' },
    { id: 'mufg-sue', group: 'bank', name: '三菱UFJ銀行 ネットDEマイカーローン（据置タイプ）', type: '変動', lo: 0.04975, hi: 0.04975, rule: '5y125', official: true,
      url: 'https://www.bk.mufg.jp/kariru/mycar/', src: '三菱UFJ銀行（2026-10-01現在の表示）', note: '最終回に据え置く残価型の銀行ローンです' },
    { id: 'smbc', group: 'bank', name: '三井住友銀行 マイカーローン', type: '変動', lo: 0.0345, hi: 0.0345, official: true,
      url: 'https://www.smbc.co.jp/kojin/mokuteki_loan/car/', src: '三井住友銀行', note: '見直し時の返済額の決め方は公式ページに書かれていません' },
    { id: 'docomo', group: 'bank', name: 'ドコモSMTBネット銀行 自動車ローン', type: '変動', lo: 0.03275, hi: 0.04475, official: true,
      url: 'https://www.netbk.co.jp/contents/gen/lineup/loan/car/kinri/', src: 'ドコモSMTBネット銀行', note: '基準金利です。住宅ローンの残高があると年1.0%、カードローンの契約があると年0.5%下がります' },
    { id: 'resona', group: 'bank', name: 'りそな銀行 マイカーローン', type: '変動', lo: 0.021, hi: 0.047, official: false,
      url: 'https://carmo-kun.jp/column/carloan/bank/', src: '比較記事（2026-10-21時点）', note: '公式ページから数値を読み取れなかったため、比較記事の値です' },
    { id: 'mizuho', group: 'bank', name: 'みずほ銀行 多目的ローン', type: '変動', lo: 0.06775, hi: 0.06775, official: false,
      url: 'https://carmo-kun.jp/column/carloan/bank/', src: '比較記事（2026-10-21時点）', note: '固定金利は年8.85%。公式ページから数値を読み取れなかったため、比較記事の値です' },
    { id: 'mazda', group: 'dealer', name: 'マツダ マツダスカイプラン（残価設定）', type: '固定', lo: 0.054, hi: 0.054, official: true,
      url: 'https://www.mazda.co.jp/purchase/skyplan/', src: 'マツダ（2026年10月時点の支払例）', note: '支払例の実質年率です。販売店で違います' },
    { id: 'honda', group: 'dealer', name: 'ホンダ 残価設定型クレジット', type: '固定', lo: 0.056, hi: 0.056, official: true,
      url: 'https://www.honda.co.jp/HFC/auto/zankure/', src: 'ホンダファイナンス（2026年10月時点の支払例）', note: '支払例の実質年率です。販売店で違います' },
    { id: 'nissan', group: 'dealer', name: '日産 残価設定型クレジット', type: '固定', lo: 0.059, hi: 0.059, official: true,
      url: 'https://www.nissan.co.jp/CREDIT/BVC/NOTE/index.html', src: '日産（2026年10月〜の支払例）', note: '支払例の実質年率です。販売店で違います' },
    { id: 'jaccs-ex', group: 'dealer', name: 'ジャックス 残価設定型（販売店のキャンペーン例）', type: '固定', lo: 0.034, hi: 0.034, official: false,
      url: 'https://www.sankoh-jp.com/loan-2/', src: '三菱系販売店の掲載（2026年10月のキャンペーン）', note: 'ジャックス・オリコは金利を公表していません。販売店との契約とキャンペーンで決まります' },
    { id: 'smcc-ex', group: 'dealer', name: '三井住友カード オートローン（販売店のキャンペーン例）', type: '固定', lo: 0.022, hi: 0.025, official: false,
      url: 'https://www.sankoh-jp.com/loan-2/', src: '三菱系販売店の掲載（2026年10月のキャンペーン）', note: '新車・対象車種のキャンペーン金利です' },
    { id: 'shinpan', group: 'range', name: '信販系ディーラーローンの目安（ジャックス・オリコなど）', type: '固定', lo: 0.03, hi: 0.10, official: false,
      url: 'https://221616.com/guide/loan/car-loan/', src: 'ガリバーの解説記事（2025-07-11更新）', note: '相場の目安です。見積書の金利を入れてください' },
    { id: 'zanka', group: 'range', name: '残価設定ローンの目安', type: '固定', lo: 0.03, hi: 0.06, official: false,
      url: 'https://tscubic.com/column/article9/', src: 'TS CUBICの記事（2025-05-21）', note: '相場の目安です' },
    { id: 'bank', group: 'range', name: '銀行マイカーローンの目安', type: '変動が多い', lo: 0.01, hi: 0.05, official: false,
      url: 'https://221616.com/guide/loan/car-loan/', src: 'ガリバーの解説記事（2025-07-11更新）', note: '相場の目安です' }
  ];

  const api = { simulate, levelPayment, bonusPeriods, monthOf, rateAt, check, floorU, PRESETS, RATES_CHECKED };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LoanCalc = api;
})(typeof self !== 'undefined' ? self : this);
