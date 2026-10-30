// 画面処理：入力の読み取り、返済額・残高の図・支払の内訳、比較、金利の比較表、返済表、テーマ、オフライン対応
(function () {
  'use strict';
  const LC = window.LoanCalc;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  // 3 桁区切りで d 桁に丸める
  const fmt = (v, d = 0) => !Number.isFinite(v) ? '―' : (Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toLocaleString('ja-JP', { minimumFractionDigits: d, maximumFractionDigits: d });
  const yen = v => fmt(Math.round(v), 0);
  const pct = (v, d = 3) => fmt(v * 100, d).replace(/0+$/, '').replace(/\.$/, '.0');
  function toast(m) { const t = $('toast'); t.textContent = m; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => { t.hidden = true; }, 2200); }
  const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 保存できない環境 */ } } };
  const KEY = 'car-loan-calc-inputs';
  const num = s => { const t = String(s ?? '').trim().replace(/[０-９．－，]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/[,\s円]/g, ''); return t === '' ? NaN : Number(t); };
  const nextMonth = () => (new Date().getMonth() + 1) % 12 + 1;

  // ---- 状態 ----
  const DEF = () => ({ price: '3,000,000', down: '500,000', preset: '', apr: '3.0', n: '60', first: String(nextMonth()), method: 'level',
    balloon: '', bmode: 'none', bamt: '', binc: 'add', bshare: '', bm1: '7', bm2: '12', unit: '1', adj: 'last',
    ppk: '', ppx: '', target: '', rc: [{ k: '', apr: '' }, { k: '', apr: '' }, { k: '', apr: '' }], rule: 'recalc' });
  let st = store.get(KEY);
  if (!st || !st.c) st = { mode: 'calc', view: 'base', c: DEF() };
  st.c = Object.assign(DEF(), st.c);
  if (!Array.isArray(st.c.rc) || st.c.rc.length !== 3) st.c.rc = DEF().rc;
  const save = () => store.set(KEY, st);

  // ---- 選択肢 ----
  const opt = (v, t) => `<option value="${esc(v)}">${esc(t)}</option>`;
  const GROUPS = { bank: '銀行（公表値）', dealer: 'ディーラー・信販（支払例・キャンペーン）', range: '相場の目安' };
  const presetLabel = p => `${p.name}　${pct(p.lo)}${p.hi > p.lo ? '〜' + pct(p.hi) : ''}%（${p.type}）`;
  $('cPreset').innerHTML = opt('', '直接入れる（見積書の金利など）') +
    Object.entries(GROUPS).map(([g, t]) => `<optgroup label="${esc(t)}">${LC.PRESETS.filter(p => p.group === g).map(p => opt(p.id, presetLabel(p))).join('')}</optgroup>`).join('');
  const MONTHS = Array.from({ length: 12 }, (_, i) => opt(i + 1, `${i + 1}月`)).join('');
  ['cFirst', 'cBm1', 'cBm2'].forEach(id => { $(id).innerHTML = MONTHS; });
  $('cRc').innerHTML = '<span class="lab">変わる回（その回の利息から）</span><span class="lab">変わったあとの金利 [%]</span>' +
    [0, 1, 2].map(i => `<input type="text" id="cRcK${i}" inputmode="numeric" aria-label="金利が変わる回 ${i + 1}"><input type="text" id="cRcA${i}" inputmode="decimal" aria-label="変わったあとの金利 ${i + 1}">`).join('');

  // ---- 入力と状態の対応 ----
  const IN = { cPrice: 'price', cDown: 'down', cPreset: 'preset', cApr: 'apr', cN: 'n', cFirst: 'first', cBalloon: 'balloon', cBamt: 'bamt', cBshare: 'bshare', cBm1: 'bm1', cBm2: 'bm2', cUnit: 'unit', cPpk: 'ppk', cPpx: 'ppx', cTarget: 'target' };
  const findPreset = id => LC.PRESETS.find(p => p.id === id) || null;
  function fillInputs() {
    Object.entries(IN).forEach(([id, k]) => { $(id).value = st.c[k] ?? ''; });
    st.c.rc.forEach((r, i) => { $(`cRcK${i}`).value = r.k; $(`cRcA${i}`).value = r.apr; });
    document.querySelectorAll('[data-b]').forEach(el => { const b = el.dataset.b; el.hidden = b === 'any' ? st.c.bmode === 'none' : st.c.bmode !== b; });
    if (st.c.ppx || st.c.ppk) $('cPpBox').open = true;
    if (st.c.rc.some(r => r.k || r.apr)) $('cRcBox').open = true;
  }
  Object.entries(IN).forEach(([id, k]) => $(id).addEventListener($(id).tagName === 'SELECT' ? 'change' : 'input', () => {
    st.c[k] = $(id).value;
    if (k === 'preset') {
      const p = findPreset(st.c.preset);
      if (p) { st.c.apr = String(+(p.lo * 100).toFixed(4)); if (p.rule) st.c.rule = p.rule; }
      fillInputs();
    }
    if (k === 'apr') { const p = findPreset(st.c.preset); if (p && !(num(st.c.apr) / 100 >= p.lo - 1e-9 && num(st.c.apr) / 100 <= p.hi + 1e-9)) { st.c.preset = ''; $('cPreset').value = ''; } }
    save(); render();
  }));
  ['cPrice', 'cDown', 'cBalloon', 'cBamt', 'cBshare', 'cPpx', 'cTarget'].forEach(id => $(id).addEventListener('blur', () => {
    const v = num($(id).value);
    if (Number.isFinite(v) && v >= 0) { const t = Math.round(v).toLocaleString('ja-JP'); $(id).value = t; st.c[IN[id]] = t; save(); }
  }));
  [0, 1, 2].forEach(i => {
    $(`cRcK${i}`).addEventListener('input', e => { st.c.rc[i].k = e.target.value; save(); render(); });
    $(`cRcA${i}`).addEventListener('input', e => { st.c.rc[i].apr = e.target.value; save(); render(); });
  });
  $('cReset').addEventListener('click', () => { st.c = DEF(); fillInputs(); save(); render(); });
  // 例：マツダスカイプランの公表の支払例（CX-30・3 年。令和 8 年 10 月時点）と同じ条件
  $('cEx').addEventListener('click', () => {
    st.c = Object.assign(DEF(), { price: '3,190,000', down: '617,519', preset: 'mazda', apr: '5.4', n: '37', first: '2', balloon: '1,740,000', bmode: 'amount', bamt: '100,000', binc: 'total', bm1: '7', bm2: '12', unit: '100', adj: 'last' });
    fillInputs(); save(); render(); toast('マツダの公表の支払例（CX-30・3年）と同じ条件を入れました');
  });

  function segs(id, get, set) {
    document.querySelectorAll(`#${id} button`).forEach(b => b.addEventListener('click', () => { set(b.dataset.v); fillInputs(); save(); render(); }));
    return () => document.querySelectorAll(`#${id} button`).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === get())));
  }
  const tabBtns = document.querySelectorAll('nav.tabs button');
  tabBtns.forEach(b => b.addEventListener('click', () => { st.mode = b.dataset.tab; save(); render(); window.scrollTo(0, 0); }));
  const segUpd = [
    () => tabBtns.forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === st.mode))),
    segs('cMethod', () => st.c.method, v => { st.c.method = v; }),
    segs('cBmode', () => st.c.bmode, v => { st.c.bmode = v; }),
    segs('cBinc', () => st.c.binc, v => { st.c.binc = v; }),
    segs('cAdj', () => st.c.adj, v => { st.c.adj = v; }),
    segs('cRule', () => st.c.rule, v => { st.c.rule = v; })
  ];

  // ---- 入力の読み取り ----
  function read() {
    const c = st.c, bad = new Set(), o = {};
    const price = num(c.price), down = String(c.down).trim() === '' ? 0 : num(c.down);
    if (!(price > 0)) bad.add('cPrice');
    if (!(down >= 0) || down >= price) bad.add('cDown');
    o.P = Math.round(price - down);
    o.apr = num(c.apr) / 100; if (!(o.apr >= 0 && o.apr < 0.3)) bad.add('cApr');
    o.n = num(c.n); if (!(Number.isInteger(o.n) && o.n >= 2 && o.n <= 180)) bad.add('cN');
    o.first = +c.first; o.method = c.method;
    o.balloon = String(c.balloon).trim() === '' ? 0 : num(c.balloon);
    if (!(o.balloon >= 0) || (o.P > 0 && o.balloon >= o.P) || (o.method === 'principal' && o.balloon > 0)) bad.add('cBalloon');
    o.bonus = { mode: c.method === 'principal' ? 'none' : c.bmode, months: [+c.bm1, +c.bm2], include: c.binc };
    if (c.bmode === 'amount') { o.bonus.amount = num(c.bamt); if (!(o.bonus.amount > 0)) bad.add('cBamt'); }
    if (c.bmode === 'share') { o.bonus.share = num(c.bshare); if (!(o.bonus.share > 0 && o.bonus.share < o.P - o.balloon)) bad.add('cBshare'); }
    if (c.bmode !== 'none' && c.bm1 === c.bm2) { bad.add('cBm1'); bad.add('cBm2'); }
    o.round = { unit: +c.unit, adjust: c.adj };
    // 繰上げ返済
    const pk = num(c.ppk), px = num(c.ppx);
    o.pp = null;
    if (String(c.ppk).trim() !== '' || String(c.ppx).trim() !== '') {
      if (!(Number.isInteger(pk) && pk >= 1 && pk < o.n)) bad.add('cPpk');
      if (!(px > 0)) bad.add('cPpx');
      if (!bad.has('cPpk') && !bad.has('cPpx')) o.pp = { k: pk, amount: px };
    }
    // 金利の変化
    o.rc = [];
    c.rc.forEach((r, i) => {
      if (String(r.k).trim() === '' && String(r.apr).trim() === '') return;
      const k = num(r.k), a = num(r.apr) / 100;
      if (!(Number.isInteger(k) && k >= 2 && k <= o.n)) bad.add(`cRcK${i}`);
      if (!(a >= 0 && a < 0.3)) bad.add(`cRcA${i}`);
      if (!bad.has(`cRcK${i}`) && !bad.has(`cRcA${i}`)) o.rc.push({ k, apr: a });
    });
    o.rc.sort((a, b) => a.k - b.k);
    o.rule = c.rule;
    [...Object.keys(IN), 'cRcK0', 'cRcK1', 'cRcK2', 'cRcA0', 'cRcA1', 'cRcA2'].forEach(id => $(id).classList.toggle('bad', bad.has(id)));
    return { o, bad, down };
  }
  const baseOf = o => ({ P: o.P, apr: o.apr, n: o.n, first: o.first, method: o.method, balloon: o.balloon, bonus: o.bonus, round: o.round });

  // ---- SVG の共通部品 ----
  const svgOpen = (W, H, label) => `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(label)}" font-family="${esc(css('--f-ui'))}">`;
  function niceTicks(lo, hi, nt = 5) {
    const span = hi - lo || 1, raw = span / nt, p = 10 ** Math.floor(Math.log10(raw));
    const m = [1, 2, 2.5, 5, 10].find(v => v * p >= raw) * p;
    const t = []; for (let v = Math.ceil(lo / m) * m; v <= hi + m * 1e-9; v += m) t.push(+v.toFixed(10));
    return { t, step: m };
  }
  const NUMF = () => esc(css('--f-num'));

  // ================= 計算 =================
  let R = null; const cCopy = [];
  // 逆算：払える月額から、借りられる額と車両・諸費用の上限を出す（回数ごとの表も）
  function renderReverse(o, bad, downIn) {
    const el = $('cRev'), t = num(st.c.target), down = downIn >= 0 ? downIn : 0;
    $('cTarget').classList.toggle('bad', String(st.c.target).trim() !== '' && !(t > 0));
    if (String(st.c.target).trim() === '') { el.innerHTML = ''; return; }
    if (!(t > 0)) { el.innerHTML = '<div class="msg err">× 月々の支払額は 0 より大きい値を入れてください。</div>'; return; }
    // 借入額に関係しない欄（金利・回数・残価・ボーナス・端数）に誤りがあるときは計算しない
    const need = ['cApr', 'cN', 'cBamt', 'cBm1', 'cBm2'].filter(id => bad.has(id));
    if (need.length) { el.innerHTML = '<div class="msg err">× 金利・回数・ボーナスの赤い欄の値を確かめてください。</div>'; return; }
    const base = Object.assign(baseOf(o), { P: 1 });
    const m = LC.maxPrincipal(base, t);
    if (m.errors.length) { el.innerHTML = `<div class="msg err">× ${esc(m.errors[0])}</div>`; return; }
    const r = LC.simulate(Object.assign({}, base, { P: m.P }));
    const princ = o.method === 'principal';
    el.innerHTML = `<div class="rev">` +
      `<div class="main"><span>借りられる額の上限</span><b>${yen(m.P)}<small> 円</small></b><small class="s">${princ ? '初回' : '月額'} ${yen(m.monthly)} 円・${pct(o.apr)}%・${o.n} 回${!princ && m.adjK && m.adjPay !== m.monthly ? `。端数をまとめる${m.adjK === 1 ? '初回' : ` ${m.adjK} 回目`}は ${yen(m.adjPay)} 円` : ''}</small></div>` +
      `<div><span>頭金を足した支払う額の上限</span><b>${yen(m.P + down)}<small> 円</small></b><small class="s">頭金 ${yen(down)} 円</small></div>` +
      `<div><span>利息の合計</span><b>${yen(r.totalInterest)}<small> 円</small></b></div>` +
      `<div><span>ローンの支払総額</span><b>${yen(r.totalPay)}<small> 円</small></b>${o.balloon > 0 ? `<small class="s">最終回（残価）${yen(r.finalPay)} 円を含む</small>` : ''}</div>` +
      `</div>` +
      // 回数ごとの上限（今の回数の行に色）
      `<div class="scroll"><table class="revn"><thead><tr><th>回数</th><th style="text-align:right">借りられる額</th><th style="text-align:right">頭金込み</th><th style="text-align:right">利息</th></tr></thead><tbody>` +
      [...new Set([24, 36, 48, 60, 72, 84, 96, 120, o.n])].sort((a, b) => a - b).map(n => {
        const mm = LC.maxPrincipal(Object.assign({}, base, { n }), t);
        if (mm.errors.length) return `<tr${n === o.n ? ' class="cur"' : ''}><th>${n} 回</th><td colspan="3" style="text-align:left;font-family:var(--f-ui)">―</td></tr>`;
        const rr = LC.simulate(Object.assign({}, base, { n, P: mm.P }));
        return `<tr${n === o.n ? ' class="cur"' : ''}><th>${n} 回</th><td>${yen(mm.P)}</td><td>${yen(mm.P + down)}</td><td>${yen(rr.totalInterest)}</td></tr>`;
      }).join('') + `</tbody></table></div>` +
      `<div class="row" style="margin-top:8px"><button class="btn" type="button" id="cRevUse">この上限で計算する</button></div>`;
    $('cRevUse').addEventListener('click', () => {
      st.c.price = (m.P + down).toLocaleString('ja-JP'); fillInputs(); save(); render(); toast('支払う額を、借りられる上限に頭金を足した額にしました');
    });
  }

  function renderCalc() {
    const { o, bad, down } = read();
    renderReverse(o, bad, down);
    const p = findPreset(st.c.preset);
    $('cLoanNote').textContent = o.P > 0 ? `借入額：${yen(o.P)} 円` : '';
    $('cPresetNote').innerHTML = p ? `${esc(p.note)}。出典：<a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.src)}</a>（${esc(LC.RATES_CHECKED)} 確認）` + (p.hi > p.lo ? `。範囲 ${pct(p.lo)}〜${pct(p.hi)}% のうち、下限を入れています。` : '') : '販売店の見積書や銀行の審査結果の金利（実質年率）を入れてください。「金利の比較」タブで各社の例を比べられます。';
    $('cBnote').textContent = st.c.bmode === 'amount' ? (st.c.binc === 'add' ? 'ディーラーのローンの形です。ボーナス月は「月額＋この額」を払い、残りを月額で割ります。' : 'ボーナス月は月額の代わりにこの額だけ払います（マツダの支払例の形）。') :
      st.c.bmode === 'share' ? '銀行の形です。借入額のうちこの額を、年 2 回のボーナス月だけで返します（ふつう借入額の 50% まで）。' : '';
    $('cRuleNote').textContent = st.c.rule === '5y125' ? '金利が変わっても 60 回（5 年）は返済額が変わらず、利息と元金の内訳だけが変わります。61 回目に出し直し、その後は金利が変わるたびに出し直します。増えるときは前の 1.25 倍までです。払いきれない利息は最終回にまとめて払います（三菱UFJ銀行の目的別ローンなど）。' : '金利が変わった回から、残りの元金を残りの回数で返す額に出し直します。';
    cCopy.length = 0; R = null;
    const msgs = [];
    const clear = () => { ['cSum', 'cKpi', 'cFig', 'cBars', 'cCmp', 'cLegend', 'cFigNote'].forEach(id => { $(id).innerHTML = ''; }); };
    if (bad.size) {
      msgs.push(['err', '赤い欄の値を確かめてください。']);
      if (bad.has('cDown')) msgs.push(['err', '頭金は支払う額より小さくしてください。']);
      if (bad.has('cN')) msgs.push(['err', '支払回数は 2〜180 回の整数で入れてください。']);
      if (bad.has('cBalloon')) msgs.push(['err', o.method === 'principal' ? '元金均等では残価（据置）は使えません。' : '残価は借入額より小さくしてください。']);
      if (bad.has('cBshare')) msgs.push(['err', 'ボーナスで返す分は、借入額から残価を引いた額より小さくしてください。']);
      if (bad.has('cPpk')) msgs.push(['err', '繰上げ返済の回は 1〜最終回の前で入れてください。']);
      if ([0, 1, 2].some(i => bad.has(`cRcK${i}`))) msgs.push(['err', '金利が変わる回は 2〜最終回で入れてください。']);
      showMsgs(msgs); clear(); return;
    }
    const base = LC.simulate(baseOf(o));
    if (base.errors.length) { base.errors.forEach(e => msgs.push(['err', e])); showMsgs(msgs); clear(); return; }
    // 比べるための計算
    const V = { base };
    if (o.rc.length) V.rate = LC.simulate(Object.assign(baseOf(o), { rateChanges: o.rc, rule: o.rule }));
    let ppErr = '';
    if (o.pp) {
      const rcx = o.rc.length ? { rateChanges: o.rc, rule: o.rule } : {};
      const sh = LC.simulate(Object.assign(baseOf(o), rcx, { prepay: Object.assign({ mode: 'shorten' }, o.pp) }));
      const rd = LC.simulate(Object.assign(baseOf(o), rcx, { prepay: Object.assign({ mode: 'reduce' }, o.pp) }));
      if (sh.errors.length) ppErr = sh.errors[0]; else { V.short = sh; V.reduce = rd; }
    }
    R = { o, V, down };

    // 注意と案内
    if (o.balloon > 0) msgs.push(['info', '残価は最終回に払うか、車を返す・乗り換えるときに精算します。返すときは走行距離や傷の条件があり、満たさないと追加の支払が出ます。残価にも最後まで利息がかかります。']);
    if (p && !p.official) msgs.push(['warn', `選んだ金利の例は${p.group === 'range' ? '相場の目安' : '販売店の掲載や比較記事'}の値で、会社の公式の値ではありません。見積書の金利で計算し直してください。`]);
    if (p && /変動/.test(p.type) && !o.rc.length) msgs.push(['info', '変動金利の例です。「金利の変化」で、途中で金利が上がったときの返済額を試せます。']);
    if (o.n > 120) msgs.push(['info', '自動車ローンの期間は多くが 10 年（120 回）以内です。']);
    if (ppErr) msgs.push(['warn', ppErr]);
    if (V.rate && V.rate.unpaidEnd > 0) msgs.push(['warn', `金利が上がって利息が返済額を超え、払いきれない利息（未払利息）が最大 ${yen(V.rate.unpaidEnd)} 円たまります。最終回にまとめて払うことになります。`]);
    if (V.rate && V.rate.capped) msgs.push(['warn', '61 回目以降の返済額が 125% ルールの上限で止まっています。残りの元金と利息は最終回にまとめて払います。']);
    if (o.bonus.mode === 'share' && o.bonus.share > (o.P - o.balloon) * 0.5) msgs.push(['info', 'ボーナスで返す分が借入額の 50% を超えています。多くの銀行は 50% までです。']);
    showMsgs(msgs);

    drawKpi(base, o, down);
    drawSummary(base, o);
    drawBalance(V, o);
    drawBars(base);
    drawCompare(V, o, ppErr);
  }

  function showMsgs(list) {
    $('cMsgs').innerHTML = list.map(([k, t]) => `<div class="msg ${k}">${k === 'err' ? '× ' : k === 'warn' ? '! ' : ''}${esc(t)}</div>`).join('');
  }

  // 返済額の要点
  function kpiItems(r, o, down) {
    const princ = o.method === 'principal';
    const bonusPay = r.rows.find(x => x.bonus);
    const items = [];
    if (princ) items.push(['main', '初回の支払額', `${yen(r.firstPay)}<small> 円</small>`, `元金 ${yen(r.A)} 円＋利息。回を追うごとに減ります`]);
    else items.push(['main', '月々の支払額', `${yen(r.A)}<small> 円</small>`, `丸める前 ${fmt(r.rawA, 1)} 円`]);
    if (!princ && r.adjK != null && r.adjK !== r.count) items.push(['', `${r.adjK === 1 ? '初回' : `${r.adjK} 回目`}（端数の調整）`, `${yen(r.adjPay)}<small> 円</small>`, (d => `月額との差 ${d >= 0 ? '+' : '−'}${yen(Math.abs(d))} 円`)(r.adjPay - r.A - (bonusPay && bonusPay.k === r.adjK ? bonusPay.pay - r.A : 0))]);
    if (bonusPay) items.push(['', 'ボーナス月の支払額', `${yen(bonusPay.pay)}<small> 円</small>`, `${o.bonus.months.map(m => m + '月').join('・')}、${r.rows.filter(x => x.bonus).length} 回`]);
    items.push(['', o.balloon > 0 ? '最終回（残価）' : '最終回', `${yen(r.finalPay)}<small> 円</small>`, `${r.count} 回目・${r.rows[r.count - 1].month}月`]);
    items.push(['', '利息の合計', `${yen(r.totalInterest)}<small> 円</small>`, `借入額の ${fmt(r.totalInterest / o.P * 100, 1)}%`]);
    items.push(['', 'ローンの支払総額', `${yen(r.totalPay)}<small> 円</small>`, down > 0 ? `頭金を足すと ${yen(r.totalPay + down)} 円` : '借入額＋利息']);
    return items;
  }
  function drawKpi(r, o, down) {
    $('cTitle').textContent = `返済額（借入 ${yen(o.P)} 円・${pct(o.apr)}%・${o.n} 回）`;
    $('cKpi').innerHTML = kpiItems(r, o, down).map(([cls, lab, val, sub]) => `<div class="${cls}"><span>${esc(lab)}</span><b>${val}</b><small>${esc(sub)}</small></div>`).join('');
  }
  // スマホ用の要約
  function drawSummary(r, o) {
    const princ = o.method === 'principal';
    $('cSum').innerHTML = `<span class="lab">${princ ? '初回の支払額' : '月々の支払額'}</span><b>${esc(yen(princ ? r.firstPay : r.A))}<small> 円</small></b>` +
      `<span class="sub">利息の合計 ${esc(yen(r.totalInterest))} 円・支払総額 ${esc(yen(r.totalPay))} 円${o.balloon > 0 ? `・最終回 ${esc(yen(r.finalPay))} 円` : ''}</span><a href="#cKpi" class="more">詳しい結果へ</a>`;
    $('cSum').querySelector('.more').addEventListener('click', e => { e.preventDefault(); const y = $('cKpi').getBoundingClientRect().top + scrollY - document.querySelector('header.top').offsetHeight - 60; window.scrollTo({ top: y, behavior: 'smooth' }); });
  }

  // 借入残高の推移（契約どおり・金利の変化・期間短縮・返済額軽減）
  const SERIES = [['base', '契約どおり', '--s1'], ['rate', '金利の変化あり', '--s2'], ['short', '繰上げ（期間短縮）', '--s3'], ['reduce', '繰上げ（返済額軽減）', '--s4']];
  function drawBalance(V, o) {
    const el = $('cFig'), narrow = el.clientWidth && el.clientWidth < 480;
    const W = narrow ? 420 : 600, H = narrow ? 270 : 290, L = 52, Rm = 14, T = 26, Bm = 34;
    const xt = niceTicks(0, o.n, narrow ? 4 : 6), yt0 = niceTicks(0, o.P / 1e4, 5);
    const ymax = yt0.t[yt0.t.length - 1] < o.P / 1e4 ? yt0.t[yt0.t.length - 1] + yt0.step : yt0.t[yt0.t.length - 1];
    const X = k => L + k / o.n * (W - L - Rm), Y = v => T + (ymax - v / 1e4) / ymax * (H - T - Bm);
    const ink2 = css('--ink2'), gr = css('--grid'), nf = NUMF();
    let s = svgOpen(W, H, '借入残高の推移の図');
    s += `<rect x="${L}" y="${T}" width="${W - L - Rm}" height="${H - T - Bm}" fill="${css('--surface')}" stroke="${css('--line')}"/>`;
    niceTicks(0, ymax, 5).t.forEach(v => { const y = T + (ymax - v) / ymax * (H - T - Bm); s += `<line x1="${L}" x2="${W - Rm}" y1="${y}" y2="${y}" stroke="${gr}"/><text x="${L - 6}" y="${y + 4}" font-size="11" fill="${ink2}" text-anchor="end" font-family="${nf}">${esc(fmt(v, 0))}</text>`; });
    xt.t.forEach(v => { const x = X(v); s += `<line x1="${x}" x2="${x}" y1="${T}" y2="${H - Bm}" stroke="${gr}" stroke-opacity=".7"/><text x="${x}" y="${H - Bm + 15}" font-size="11" fill="${ink2}" text-anchor="middle" font-family="${nf}">${v}</text>`; });
    s += `<text x="${L - 6}" y="11" font-size="10.5" fill="${ink2}" text-anchor="end">万円</text>`;
    s += `<text x="${W - Rm}" y="${H - 4}" font-size="11" fill="${ink2}" text-anchor="end">支払回</text>`;
    const used = [];
    SERIES.forEach(([key, name, c], i) => {
      const r = V[key]; if (!r) return;
      used.push([name, c]);
      const pts = [[0, o.P], ...r.rows.map(x => [x.k, x.balance])];
      s += `<polyline fill="none" stroke="${css(c)}" stroke-width="${i ? 2 : 2.6}" ${i === 1 ? 'stroke-dasharray="6 3"' : ''} points="${pts.map(([k, b]) => `${X(k).toFixed(1)},${Y(b).toFixed(1)}`).join(' ')}"/>`;
    });
    // 残価：最終回の前の残高を示す
    if (o.balloon > 0) { const y = Y(o.balloon); s += `<line x1="${L}" x2="${W - Rm}" y1="${y}" y2="${y}" stroke="${css('--muted')}" stroke-dasharray="3 3"/><text x="${L + 6}" y="${y - 4}" font-size="10.5" fill="${css('--muted')}">残価 ${esc(fmt(o.balloon / 1e4, 1))} 万円</text>`; }
    el.innerHTML = s + '</svg>';
    $('cLegend').innerHTML = used.map(([n, c], i) => `<span class="line" style="--c:var(${c})">${esc(n)}</span>`).join('');
    $('cFigNote').textContent = o.balloon > 0 ? '残価を据え置くと、残高が最後まで残価より下がりません。その残高にも利息がかかります。' : V.short ? '繰上げ返済をした回で残高が下がります。期間短縮は早く 0 になり、返済額軽減は同じ回に 0 になります。' : '元利均等では、返済の初めほど残高の減りがゆっくりです。';
  }

  // 毎回の支払の内訳（契約どおり）
  function drawBars(r) {
    const el = $('cBars'), narrow = el.clientWidth && el.clientWidth < 480;
    const W = narrow ? 420 : 600, H = narrow ? 210 : 230, L = 52, Rm = 14, T = 24, Bm = 30;
    const rows = r.rows, n = rows.length;
    // 最終回に残価があると棒が高くなりすぎるので、目盛りは残価を除いた最大で決める
    const capV = Math.max(...rows.filter((x, i) => !(r.balloon > 0 && i === n - 1)).map(x => x.pay));
    const yt0 = niceTicks(0, capV, 4), ymax = yt0.t[yt0.t.length - 1] < capV ? yt0.t[yt0.t.length - 1] + yt0.step : yt0.t[yt0.t.length - 1];
    const bw = (W - L - Rm) / n, Y = v => T + (ymax - Math.min(v, ymax)) / ymax * (H - T - Bm);
    const ink2 = css('--ink2'), gr = css('--grid'), nf = NUMF();
    let s = svgOpen(W, H, '毎回の支払の内訳の図');
    s += `<rect x="${L}" y="${T}" width="${W - L - Rm}" height="${H - T - Bm}" fill="${css('--surface')}" stroke="${css('--line')}"/>`;
    niceTicks(0, ymax, 4).t.forEach(v => { const y = Y(v); s += `<line x1="${L}" x2="${W - Rm}" y1="${y}" y2="${y}" stroke="${gr}"/><text x="${L - 6}" y="${y + 4}" font-size="11" fill="${ink2}" text-anchor="end" font-family="${nf}">${esc(fmt(v / 1e4, (yt0.step / 1e4) % 1 ? 1 : 0))}</text>`; });
    s += `<text x="${L - 6}" y="10" font-size="10.5" fill="${ink2}" text-anchor="end">万円</text>`;
    const s1 = css('--s1'), s2 = css('--s2'), gap = bw > 4 ? 1 : 0;
    rows.forEach((x, i) => {
      const x0 = L + i * bw, yP = Y(x.principal + x.interest), yI = Y(x.interest);
      s += `<rect x="${x0.toFixed(2)}" y="${yI.toFixed(2)}" width="${Math.max(0.6, bw - gap).toFixed(2)}" height="${(H - Bm - yI).toFixed(2)}" fill="${s2}"/>`;
      s += `<rect x="${x0.toFixed(2)}" y="${yP.toFixed(2)}" width="${Math.max(0.6, bw - gap).toFixed(2)}" height="${Math.max(0, yI - yP).toFixed(2)}" fill="${s1}"/>`;
      if (x.pay > ymax) s += `<text x="${(x0 + bw / 2).toFixed(1)}" y="${T - 6}" font-size="10" fill="${ink2}" text-anchor="end" font-family="${nf}">↑ ${esc(fmt(x.pay / 1e4, 1))} 万円</text>`;
    });
    niceTicks(1, n, narrow ? 4 : 6).t.filter(v => v >= 1).forEach(v => { s += `<text x="${(L + (v - 0.5) * bw).toFixed(1)}" y="${H - Bm + 15}" font-size="11" fill="${ink2}" text-anchor="middle" font-family="${nf}">${v}</text>`; });
    s += `<text x="${W - Rm}" y="${H - 3}" font-size="11" fill="${ink2}" text-anchor="end">支払回</text>`;
    el.innerHTML = s + '</svg>';
  }

  // 比べる：返済方式、残価の有無、繰上げ返済、金利の変化
  function drawCompare(V, o, ppErr) {
    const head = ['', '回数', '月々', '最終回', '利息の合計', '差'];
    const sec = [], copy = [];
    const row = (label, note, r, monthly, ref, cls = '') => {
      const d = ref == null ? '' : `${r.totalInterest - ref >= 0 ? '+' : '−'}${yen(Math.abs(r.totalInterest - ref))}`;
      copy.push([label, r.count, Math.round(monthly), Math.round(r.finalPay), Math.round(r.totalInterest), ref == null ? '' : Math.round(r.totalInterest - ref)]);
      return `<tr class="${cls}"><th>${esc(label)}${note ? `<small>${esc(note)}</small>` : ''}</th><td>${r.count}</td><td>${yen(monthly)}</td><td>${yen(r.finalPay)}</td><td>${yen(r.totalInterest)}</td><td class="${ref != null && r.totalInterest > ref ? 'ng' : ''}">${d}</td></tr>`;
    };
    const grp = t => { copy.push([t]); return `<tr><th colspan="6" style="padding-top:10px;color:var(--ink);font-weight:700">${esc(t)}</th></tr>`; };
    const b = V.base;
    // 返済方式：元利均等と元金均等（残価・ボーナスなしで比べる）
    const plain = { P: o.P, apr: o.apr, n: o.n, first: o.first, round: o.round };
    const lv = LC.simulate(Object.assign({}, plain, { method: 'level' })), pr = LC.simulate(Object.assign({}, plain, { method: 'principal' }));
    sec.push(grp('返済方式' + (o.balloon > 0 || o.bonus.mode !== 'none' ? '（残価・ボーナスなしで比べた値）' : '')));
    sec.push(row('元利均等', '毎回の額が同じ', lv, lv.A, null));
    sec.push(row('元金均等', `月々は初回の額。最後は ${yen(pr.finalPay)} 円まで減る`, pr, pr.firstPay, lv.totalInterest));
    if (o.balloon > 0) {
      const nb = LC.simulate(Object.assign(baseOf(o), { balloon: 0 }));
      sec.push(grp('残価（据置）'));
      sec.push(row('残価なし', '同じ金利・回数で全額を分割', nb, nb.A, null));
      sec.push(row(`残価 ${yen(o.balloon)} 円`, '今の入力', b, b.A, nb.totalInterest));
    }
    if (V.short) {
      const ref = V.rate || b;
      sec.push(grp(`繰上げ返済（${o.pp.k} 回目のあとに ${yen(o.pp.amount)} 円）`));
      sec.push(row('繰上げなし', V.rate ? '金利の変化ありの計算' : '契約どおり', ref, ref.A, null));
      sec.push(row('期間短縮', `月額はそのまま。${ref.count - V.short.count} 回早く終わる`, V.short, V.short.A, ref.totalInterest, 'best'));
      const after = V.reduce.rows.find(x => x.k > o.pp.k && !x.bonus) || V.reduce.rows[V.reduce.count - 1];
      sec.push(row('返済額軽減', '回数はそのまま。月々は繰上げのあとの額', V.reduce, after.pay, ref.totalInterest));
    }
    if (V.rate) {
      sec.push(grp(`金利の変化（${o.rc.map(r => `${r.k} 回目から ${pct(r.apr)}%`).join('、')}・${o.rule === '5y125' ? '5 年ルール' : 'その都度計算'}）`));
      sec.push(row('契約どおり', `${pct(o.apr)}% のまま`, b, b.A, null));
      const mx = Math.max(...V.rate.rows.filter(x => !x.bonus && x.k < V.rate.count).map(x => x.pay));
      sec.push(row('金利の変化あり', `月々は変化のあとの最大の額${V.rate.unpaidEnd > 0 ? '。未払利息あり' : ''}`, V.rate, mx, b.totalInterest));
    }
    if (ppErr) sec.push(`<tr><td colspan="6" style="text-align:left;font-family:var(--f-ui);color:var(--warn)">! ${esc(ppErr)}</td></tr>`);
    $('cCmp').innerHTML = `<table class="sch"><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${sec.join('')}</tbody></table>` +
      '<p class="hint">金額は円。「差」は各まとまりの最初の行と比べた利息の差です。</p>';
    // コピー用：要点と比較
    cCopy.push(['項目', '値']);
    cCopy.push(['借入額', o.P], ['金利（実質年率）%', +(o.apr * 100).toFixed(4)], ['支払回数', o.n], ['初回の支払月', o.first]);
    kpiItems(b, o, R.down).forEach(([, lab, val]) => cCopy.push([lab, val.replace(/<[^>]+>/g, '').replace(/[,\s円]/g, '')]));
    cCopy.push([]); cCopy.push(head.map(h => h || '比べるもの')); copy.forEach(c => cCopy.push(c));
  }

  // ================= 金利の比較 =================
  const rCopy = [];
  function renderRates() {
    const { o, bad } = read();
    rCopy.length = 0;
    $('rNote').innerHTML = `金利は ${esc(LC.RATES_CHECKED)} に出典のページで確かめた値です。実際の金利は審査・借入日・申込方法・車種で変わります。最新の値は出典のページで確かめてください。行を押すと、その金利の下限で「計算」タブを開きます。`;
    if (bad.size) { $('rCond').textContent = ''; $('rTable').innerHTML = '<div class="msg err">× 「計算」タブの赤い欄の値を確かめてください。</div>'; return; }
    const cond = Object.assign(baseOf(o), {});
    $('rTitle').textContent = '金利の比較';
    $('rCond').textContent = `今の条件（借入 ${yen(o.P)} 円・${o.n} 回${o.balloon > 0 ? `・残価 ${yen(o.balloon)} 円` : ''}${o.bonus.mode !== 'none' ? '・ボーナス併用' : ''}・${o.method === 'principal' ? '元金均等' : '元利均等'}）で、各社の金利の下限と上限のときの月々の支払額と利息の合計です。`;
    const sim = apr => LC.simulate(Object.assign({}, cond, { apr }));
    const pick = r => o.method === 'principal' ? r.firstPay : r.A;
    const cur = sim(o.apr);
    const head = ['', '金利 %', '月々（下限）', '利息（下限）', '月々（上限）', '利息（上限）'];
    rCopy.push(['会社・商品', '種類', '金利 下限 %', '金利 上限 %', '月々（下限）', '利息（下限）', '月々（上限）', '利息（上限）', '出典', 'URL']);
    let body = `<tr class="cur"><th>今の入力<small>${esc(st.c.preset ? (findPreset(st.c.preset) || {}).name || '' : '直接入れた金利')}</small></th><td>${pct(o.apr)}</td><td>${yen(pick(cur))}</td><td>${yen(cur.totalInterest)}</td><td>―</td><td>―</td></tr>`;
    Object.entries(GROUPS).forEach(([g, t]) => {
      body += `<tr class="grp"><th colspan="6">${esc(t)}</th></tr>`;
      LC.PRESETS.filter(p => p.group === g).forEach(p => {
        const lo = sim(p.lo), hi = p.hi > p.lo ? sim(p.hi) : null;
        body += `<tr data-id="${esc(p.id)}"${st.c.preset === p.id ? ' class="cur"' : ''}><th>${esc(p.name)}<span class="tag">${esc(p.type)}</span>${p.official ? '' : '<span class="tag sec">二次情報</span>'}<small>${esc(p.note)}。<a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.src)}</a></small></th>` +
          `<td>${pct(p.lo)}${hi ? `〜${pct(p.hi)}` : ''}</td><td>${yen(pick(lo))}</td><td>${yen(lo.totalInterest)}</td><td>${hi ? yen(pick(hi)) : '―'}</td><td>${hi ? yen(hi.totalInterest) : '―'}</td></tr>`;
        rCopy.push([p.name, p.type, +(p.lo * 100).toFixed(4), +(p.hi * 100).toFixed(4), Math.round(pick(lo)), Math.round(lo.totalInterest), hi ? Math.round(pick(hi)) : '', hi ? Math.round(hi.totalInterest) : '', p.src, p.url]);
      });
    });
    $('rTable').innerHTML = `<table class="pr"><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`;
    $('rTable').querySelectorAll('tr[data-id]').forEach(tr => tr.addEventListener('click', e => {
      if (e.target.closest('a')) return;
      const p = findPreset(tr.dataset.id);
      st.c.preset = p.id; st.c.apr = String(+(p.lo * 100).toFixed(4)); if (p.rule) st.c.rule = p.rule;
      st.mode = 'calc'; fillInputs(); save(); render(); window.scrollTo(0, 0);
    }));
  }

  // ================= 返済表 =================
  const tCopy = [];
  function renderTable() {
    tCopy.length = 0;
    // 計算タブと同じ入力で計算する
    renderCalc();
    if (!R) { $('tKpi').innerHTML = ''; $('tTable').innerHTML = '<div class="msg err">× 「計算」タブの赤い欄の値を確かめてください。</div>'; return; }
    const avail = SERIES.filter(([k]) => R.V[k]);
    if (!R.V[st.view]) st.view = 'base';
    const r = R.V[st.view], name = SERIES.find(s => s[0] === st.view)[1];
    $('tTitle').innerHTML = `返済表　${avail.length > 1 ? `<span class="seg" id="tView" role="group" aria-label="表示する計算" style="vertical-align:middle">${avail.map(([k, n]) => `<button type="button" data-v="${k}" aria-pressed="${k === st.view}">${esc(n)}</button>`).join('')}</span>` : esc(name)}`;
    $('tTitle').querySelectorAll('#tView button').forEach(b => b.addEventListener('click', () => { st.view = b.dataset.v; save(); render(); }));
    $('tKpi').innerHTML = [['回数', `${r.count}<small> 回</small>`], ['支払総額', `${yen(r.totalPay)}<small> 円</small>`], ['利息の合計', `${yen(r.totalInterest)}<small> 円</small>`]].map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
    const hasUnpaid = r.rows.some(x => x.unpaid > 0), hasPre = r.prepaid > 0, rateVar = r.rows.some(x => x.apr !== r.rows[0].apr);
    const head = ['回', '月', ...(rateVar ? ['金利 %'] : []), '支払額', '元金', '利息', ...(hasPre ? ['繰上げ'] : []), ...(hasUnpaid ? ['未払利息'] : []), '残高'];
    tCopy.push(head);
    const body = r.rows.map(x => {
      const cells = [x.k, `${x.month}月`, ...(rateVar ? [pct(x.apr)] : []), yen(x.pay), yen(x.principal), yen(x.interest), ...(hasPre ? [x.prepay ? yen(x.prepay) : ''] : []), ...(hasUnpaid ? [x.unpaid ? yen(x.unpaid) : ''] : []), yen(x.balance)];
      tCopy.push([x.k, x.month, ...(rateVar ? [+(x.apr * 100).toFixed(4)] : []), Math.round(x.pay), Math.round(x.principal), Math.round(x.interest), ...(hasPre ? [Math.round(x.prepay)] : []), ...(hasUnpaid ? [Math.round(x.unpaid)] : []), Math.round(x.balance)]);
      const cls = [x.bonus ? 'bonus' : '', x.adj || x.k === r.count ? 'adj' : '', x.prepay ? 'pre' : ''].join(' ').trim();
      return `<tr${cls ? ` class="${cls}"` : ''}><th>${x.k}</th>${cells.slice(1).map(c => `<td>${esc(c)}</td>`).join('')}</tr>`;
    }).join('');
    $('tTable').innerHTML = `<table class="sch"><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`;
  }

  // ---- 表示の切り替え ----
  function render() {
    segUpd.forEach(f => f());
    if (!['calc', 'rates', 'table', 'explain'].includes(st.mode)) st.mode = 'calc';
    $('calcPanel').hidden = st.mode !== 'calc'; $('ratesPanel').hidden = st.mode !== 'rates'; $('tablePanel').hidden = st.mode !== 'table'; $('explainPanel').hidden = st.mode !== 'explain';
    if (st.mode === 'calc') renderCalc(); else if (st.mode === 'rates') renderRates(); else if (st.mode === 'table') renderTable();
  }

  function copyRows(rows) {
    if (!rows.length) { toast('先に正しい値を入れてください'); return; }
    const text = rows.map(r => r.join('\t')).join('\n');
    const done = () => toast('コピーしました。Excel に貼り付けられます');
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
    function fallback() {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (e) { /* 失敗 */ }
      ta.remove(); toast(ok ? 'コピーしました。Excel に貼り付けられます' : 'コピーできませんでした。表を選んでコピーしてください');
    }
  }
  $('cCopy').addEventListener('click', () => copyRows(cCopy));
  $('rCopy').addEventListener('click', () => copyRows(rCopy));
  $('tCopy').addEventListener('click', () => copyRows(tCopy));

  // ---- テーマ（QC Workbench の全ツールで共通のキー） ----
  const THEMES = ['auto', 'light', 'dark'], THEME_LABEL = { auto: '表示：自動', light: '表示：ライト', dark: '表示：ダーク' }, THEME_KEY = 'qc-workbench-theme';
  const readTheme = () => { try { const t = localStorage.getItem(THEME_KEY); return THEMES.includes(t) ? t : 'auto'; } catch (e) { return 'auto'; } };
  let theme = readTheme();
  function applyTheme(t) {
    if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = t;
    $('themeBtn').textContent = THEME_LABEL[t];
  }
  $('themeBtn').addEventListener('click', () => {
    theme = THEMES[(THEMES.indexOf(theme) + 1) % 3];
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* 保存できない環境 */ }
    applyTheme(theme);
  });
  window.addEventListener('storage', e => { if (e.key === THEME_KEY || e.key === null) { theme = readTheme(); applyTheme(theme); } });
  applyTheme(theme);
  new MutationObserver(() => render()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => render());
  let rz = 0; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(render, 150); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => render());

  // ---- 初期表示 ----
  fillInputs(); render();

  // ---- オフライン対応 ----
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').then(reg => {
        reg.addEventListener('updatefound', () => {
          const w = reg.installing; if (!w) return;
          w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) toast('新しい版を取り込みました。開き直すと反映されます'); });
        });
      }).catch(() => { /* 登録できない環境 */ });
    });
  }
})();
