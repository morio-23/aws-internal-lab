# AWS Internal Lab 知財・ブランド利用ガイドライン

- 文書種別: 知財・ブランド利用ガイドライン
- 対象: 社内AWS学習・検証基盤
- リポジトリ: `aws-internal-lab`
- 初版日: 2026-10-06
- ステータス: 初版レビュー

## 1. 文書目的

本書は、AWS Internal Lab が AWS Management Console の実操作を学習可能な画面を提供するにあたり、著作権、商標、trade dress / look and feel、AWSブランド資産等に関する懸念を低減するための設計・実装・運用ルールを定義する。

本書は法的判断そのものを代替するものではなく、正式社内展開前の法務・知財レビューに提示する技術・運用上の基本方針を定めるものである。

## 2. 前提

- 本サービスは社内限定で提供し、一般公開・社外販売・広告利用を行わない。
- 主目的は AWS Management Console の実操作学習である。
- 画面遷移、設定項目、項目順、操作導線等は、Labで習得した手順を実AWS Management Consoleへ転用できるよう可能な限り再現する。
- 一方、AWSのブランド表現やWebサイトのtrade dress / look and feelそのものを複製することは目的としない。
- 実装は自社コードとして行い、AWS ConsoleのHTML、CSS、JavaScript、画像その他の実装資産を直接取得・再配布・組み込みしない。

## 3. AWS公式ガイドライン上の主要論点

2026年10月時点の AWS Trademark Guidelines では、AWS Webサイトの trade dress / look and feel について、branding、color combinations、fonts、graphic designs、product icons 等を含む模倣を行わないよう定めている。

また、AWS Marks の fair use については、顧客の混同を招かないこと、事実に基づく参照であること、原則としてplain textであること、AWSとの提携・後援・承認を示唆しないことが示されている。

AWSのスクリーンショット、図、コード、ドキュメント等の著作物については、第三者向け出版物への一般的な利用許諾は限定的である一方、教育・非営利目的の限定的なfair useには異議を述べない旨が示されている。

AWS Site Termsでは、AWS Site上のテキスト、グラフィック、ロゴ、ボタンアイコン、画像、ソフトウェア等がAWSまたは権利者の著作物である旨が示されている。

したがって、本サービスでは「AWSの操作仕様・機能を学習するための再現」と「AWSが作成した視覚・著作表現のコピー」を区別する。

## 4. 基本方針

### 4.1 再現するもの

学習目的上必要な以下の要素は、実AWS Management Consoleを基準に可能な限り一致させる。

- サービス名称
- AWSのリソース名称、用語、概念モデル
- サービス内ナビゲーションの論理構造
- 一覧、詳細、作成、編集、削除の遷移
- タブ名称、タブ順
- 設定セクション名称と表示順
- フォームの項目名称、項目順、選択肢
- AWS仕様に由来する既定値
- リソース作成ウィザードの操作順
- 確認操作・削除確認等の手順
- 実AWS操作習得のために必要な情報階層

これらは「Labで覚えた手順を実AWSで適用できること」を評価基準とする。

### 4.2 直接コピーしないもの

以下は原則としてAWS資産を直接コピーせず、自社実装・自社デザインとする。

- AWSロゴ、AWS Smile Logo
- AWS Consoleのブランド配色そのもの
- AWS固有フォントまたは配布権が確認できないフォント
- AWS Webサイト/Console固有の背景、装飾、graphic design
- AWS Consoleの製品アイコン、ボタンアイコン等の無断複製
- AWS ConsoleのHTML、CSS、JavaScript、DOM構造のコピー
- AWS Consoleから抽出した画像、SVG、sprite、Web asset
- AWS画面のピクセル単位のレイアウトコピー
- AWSの説明文、ヘルプ文、ツールチップ、エラーメッセージ等の長文転載

### 4.3 自社実装として再構成するもの

以下は実AWS Consoleを機能参照しながら、自社のコンポーネントとして実装する。

- Header / navigation
- Sidebar
- Tabs
- Table
- Form controls
- Modal / confirmation dialog
- Wizard / stepper
- Notification / alert
- Resource detail panel

見た目は操作対象や情報構造を理解しやすい範囲で近づけても、ブランド、色、フォント、アイコン、グラフィック等を組み合わせたAWS特有のtrade dressをそのまま再現しない。

## 5. サービス名・商標の扱い

AWS、Amazon S3、Amazon EC2、AWS Lambda等の名称は、対応するAWSサービスを正確に示すための事実上の参照として利用する。

以下を遵守する。

- AWSとの提携、認定、スポンサー、公式サービスであると誤認させない。
- AWSロゴを自社サービスのロゴ、製品名、ヘッダーのブランド表示として使用しない。
- AWS Marksを自社サービス名やロゴへ組み込まない。
- 社外公開URLや独自ドメイン・サブドメインにAWS Marksを組み込まない方針とする。
- 「AWS Internal Lab」はリポジトリ/社内プロジェクト上の仮称として扱い、正式サービス名は法務・知財レビューで確認する。

## 6. 誤認防止表示

Lab画面には、実AWS Management Consoleと混同しないよう常時識別可能な表示を行う。

表示例:

```text
INTERNAL TRAINING LAB
AWS Management Console operation training environment
Not an AWS service / Not affiliated with or endorsed by AWS
```

日本語表示例:

```text
社内学習用Lab
AWS Management Consoleの操作学習を目的とした社内環境です。
AWSが提供・承認・運営するサービスではありません。
```

この表示は、操作学習を妨げない範囲でHeader等の共通領域へ配置する。

## 7. スクリーンショット・AWSコンテンツの扱い

### 7.1 開発参照

実装者が現行AWS Management Consoleの画面を参照して画面構成・操作導線を確認することは、UI追従作業として必要となる。

スクリーンショットを取得する場合は、以下を基本とする。

- 社内の設計・レビュー用途に限定する。
- リポジトリの製品アセットとして恒久的に同梱しない。
- 公開サイト・営業資料・外部配布資料への転用を行わない。
- 必要最小限の範囲・枚数とする。
- アカウントID、ARN、メールアドレス、顧客データ等を含めない。
- 保存期間・保存場所は社内情報管理ルールに従う。

### 7.2 文言

AWS仕様上必要な短いラベル、サービス名、設定項目名は操作整合性のため利用する。

一方、AWS Consoleの説明文、ヘルプ文章、ガイド文、長いエラーメッセージ等は原則として自社文言へ書き換え、AWS著作物の長文コピーを避ける。

## 8. アイコン方針

AWS Architecture Iconsは、AWSが顧客・パートナーによるアーキテクチャ図、ホワイトペーパー、プレゼンテーション等での利用を認めている資産である。

ただし、Architecture Iconsの利用許可をAWS Console UIのサービスアイコン利用許可と同一視しない。

Lab ConsoleのUIアイコンは次を優先する。

1. 自社アイコン
2. ライセンスが明確なOSSアイコン
3. AWSから当該用途について明示的に利用可能とされている資産

AWS公式サービスアイコンをConsole UIへ使用する場合は、正式展開前の法務・知財レビューで用途を確認する。

## 9. UI実装ルール

### 9.1 Reference-based reimplementation

各サービスUIは以下の手順で実装する。

1. 現行AWS Management Consoleを操作し、学習上必要な画面・操作を整理する。
2. 画面仕様として、項目、順序、状態遷移、操作結果を記録する。
3. AWSのHTML/CSS/JavaScriptを流用せず、自社コンポーネントで再実装する。
4. AWS固有のブランド表現を除いた状態で、操作手順が一致することを確認する。
5. 実AWS Consoleで同一手順を再実行し、学習転用性を確認する。
6. 知財チェック項目をUIレビューに含める。

### 9.2 UIレビュー項目

サービス画面のレビューでは最低限以下を確認する。

- 操作手順が実AWSと整合しているか
- 項目名称・順序が学習目的に適切か
- AWSロゴを利用していないか
- AWS固有の配色をそのままコピーしていないか
- AWS固有フォントをコピーしていないか
- AWSの製品アイコン/グラフィックを無断利用していないか
- AWSのHTML/CSS/JSを流用していないか
- AWS説明文を長文コピーしていないか
- AWS公式サービスと誤認する表示になっていないか
- Lab固有表示が明確か

## 10. 社内限定によるリスク低減

本サービスは社内限定とし、以下を技術・運用面で担保する。

- 社内SSO必須
- Internetへの一般公開を行わない
- 外部ユーザー登録を行わない
- 社外への再配布・SaaS提供を行わない
- 営業・マーケティング目的でAWS Console再現画面を利用しない
- 社外デモを行う場合は事前に法務・知財レビューを行う

社内限定であることはリスク低減要素として扱うが、AWS Trademark Guidelinesや著作権上の要件が適用されなくなるとはみなさない。

## 11. 法務・知財レビューの確認事項

正式展開前に少なくとも以下を確認する。

1. AWS Management Consoleの機能的な画面構造・操作導線再現の許容範囲
2. AWSサービス名称をUI上で利用する方法
3. 「AWS Internal Lab」等のサービス名称・プロジェクト名称
4. AWSロゴ・サービスアイコンの使用有無と許容範囲
5. スクリーンショットの社内設計資料利用
6. AWS Consoleの短いラベル・設定項目名称の利用
7. AWS Consoleの文言・ヘルプ・エラーメッセージの利用範囲
8. 自社UIの配色・フォント・アイコンがtrade dress模倣に当たらないこと
9. 社内限定、非営利、教育目的という利用条件の評価
10. 将来社外提供へ変更する場合に必要となる再レビュー

## 12. 変更管理

以下の場合、知財方針の再レビューを行う。

- AWS Trademark Guidelines / AWS Site Termsが変更された場合
- 社内限定から社外提供へ対象を変更する場合
- AWSロゴ・アイコン等の利用を追加する場合
- AWS Consoleスクリーンショットを製品画面・教材へ直接組み込む場合
- AWS公式コンポーネント・CSS・フロントエンドコードを利用する場合
- サービス名称・ドメイン・ブランドを変更する場合

AWS Trademark Guidelinesは変更され得るため、Console UI追従確認と合わせて定期確認する。

## 13. 本プロジェクトにおける判断

現時点では以下を採用する。

- AWS Management Consoleの実操作学習を第一要件として維持する。
- 機能・情報構造・操作順序は可能な限り実AWSに合わせる。
- AWSのブランド・trade dressそのものの再現は要件に含めない。
- AWSのHTML/CSS/JavaScript、画像、アイコン等は直接コピーしない。
- Lab UIは自社実装する。
- AWS名称は対応サービスを正確に示す目的で利用し、AWS公式・提携サービスとの誤認を防ぐ。
- 社内限定アクセスを維持する。
- 正式展開前に法務・知財レビューを必須とする。

## 14. 参考

- AWS Trademark Guidelines & License Terms: https://aws.amazon.com/trademark-guidelines/
- AWS Site Terms: https://aws.amazon.com/terms/
- AWS Architecture Icons: https://aws.amazon.com/architecture/icons/

---

本書の方針は `01_project_proposal.md`、`02_requirements.md`、`03_basic_design.md` のUI・知財関連要件を補足する。正式な利用許諾の解釈は社内法務・知財レビューで確定する。
