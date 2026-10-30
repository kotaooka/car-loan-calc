# 開発者向け情報（car-loan-calc）

利用者向けの説明は [README.md](README.md) にあります。

## ファイル構成

```
index.html             画面（スタイルを含む）。解説は docs/explanation.md から埋め込む
js/loan.js             計算（元利均等・元金均等、据置、ボーナス、端数の調整、繰上げ返済、金利の変化）と金利の例（PRESETS）。Node でも読み込み可
js/app.js              画面処理（返済額、残高の図、支払の内訳、比べる表、金利の比較、返済表、テーマ、入力の保存、Service Worker の登録）
sw.js                  オフライン用のキャッシュ処理（Service Worker）
manifest.webmanifest   アプリとして追加するための設定
og.png                 SNS 共有用の画像（tools/screenshots.py で作る）
icons/                 アプリアイコン（tools/make_icons.py で作る）
docs/explanation.md    「解説」タブの原稿
docs/screenshots/      README 用のスクリーンショット（tools/screenshots.py で撮る）
tools/build.py         解説を index.html に埋め込む
tests/test.js          検算テスト
.github/workflows/     push 時の自動テスト
```

## 更新して公開するとき

- `index.html`・`js/`・`icons/` を変更したら、**`sw.js` 先頭の `VERSION` を必ず上げてから** push してください。上げないと、すでに使っている人の端末に古いファイルが残り続けます
- 画面の見た目を変えたときは、`docs/screenshots/` の画像と `og.png` も撮り直してください（撮影手順は `tools/screenshots.py` の先頭）
- 解説を直すときは `docs/explanation.md` を編集し、`python tools/build.py`（`pip install markdown`）で index.html に埋め込んでください。埋め込み忘れは CI で検出します
- GitHub Pages は main ブランチのルートを公開しています

## 金利の例を更新するとき

- `js/loan.js` の `PRESETS` と `RATES_CHECKED`（確認日）を直します。出典は会社の公式ページを優先し、読み取れないときだけ二次情報にして `official: false` にします
- README の「金利の比較」の確認日と、表に載せている会社も合わせて直します
- ジャックス・オリコなど信販会社は金利を公表していないので、会社名だけの固定値は載せません

## テスト

```
node tests/test.js    # 不一致があれば終了コード 1
```

## 実装のメモ

- **単位**：金額は円、金利は年利の小数。月利は年利 ÷ 12、利息は毎回 1 円未満切捨て
- **返済の進め方**：`simulate` は 1 本のローン（毎月分、銀行の形のボーナスがあればボーナス分も）を回ごとに `step` で進めます。利息は前の支払からの月数で単利に積み、支払う回に払います（毎月払う分は月複利と同じ）
- **均等額**：`levelPayment` で、その時点の金利がこの先も続くとして求め、単位未満を切り捨てます
- **端数の調整**：調整する回の額は `solveAdjust` で、その後を実際に進めて最終回が目標（残価、または月額）になる額を割線法で求めます。公表の支払例（マツダ）はこの方法で 1 円まで一致します
- **ボーナス**：`amount` はボーナス月の額を固定（`include: 'add'` は月額に加算、`'total'` はその月は月額の代わり）。`share` は借入額の一部を別のローンとしてボーナス月だけで返します。据置があるときは最終回にボーナスを足しません
- **金利の変化**：`rateChanges` は「その回の利息から適用」。`recalc` は変わった回に均等額を出し直し、`5y125` は 61・121 回目に出し直して 1.25 倍で頭打ち、払いきれない利息は `unpaid` に繰り越して最終回で払います
- **繰上げ返済**：毎月分の元金に充てます。期間短縮は、その時点の金利で月額のまま返し切る回を新しい最終回にし（あとで金利が変わって出し直すときも、この最終回まで）、返済額軽減は残りの回数で均等額を出し直します。据置があるときは計算しません
- **入力の保存**：localStorage のキー `car-loan-calc-inputs`。読み書きはすべて try/catch で囲み、保存できない環境でも動きます
- **テーマ**：QC Workbench の全ツールで共通のキー `qc-workbench-theme`
