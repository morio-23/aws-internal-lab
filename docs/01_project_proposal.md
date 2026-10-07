# AWS Internal Lab 企画書

- 文書種別: 企画書
- 対象: 社内AWS学習・検証基盤
- リポジトリ: `aws-internal-lab`
- 初版日: 2026-10-05
- ステータス: 初版レビュー

## 1. 企画概要

AWS Internal Labは、AWSの主要サービスを社内で安全かつ低コストに試せるラボ環境を提供するための社内基盤である。

利用者はAWS Management Consoleの実画面・情報構造・操作導線を基準に再現したLab Consoleから、S3、IAM、Lambda、DynamoDB、SQS、EC2、VPC、RDS、ECS、EKS等のAWSサービスに相当するリソースを作成・変更・削除できる。Labで習得した画面操作や設定手順を実AWS Management Consoleでもそのまま適用できることを重視する。バックエンドにはAWS互換エミュレータを利用し、実AWSリソースの直接作成を原則として避けることで、反復学習時のコストと事故影響を抑える。

初期フェーズでは課題・採点・研修コース機能を主目的とせず、利用者が自由にリソース構築を試せる「AWS Playground / Lab」としての価値を優先する。将来的に課題型研修、トラブルシューティング演習、CLI/IaC演習、実AWS Sandboxへの接続等を追加できる拡張性を持たせる。

## 2. 背景

AWSを学習するためには、実AWSアカウント上で各サービスを操作する方法が最も実践的である。一方、社内で広く提供する場合は以下が課題となる。

- 利用者数に比例してAWS利用料金が発生する。
- 初学者が高額リソースを作成したり、削除漏れを起こしたりする可能性がある。
- IAM、ネットワーク、公開設定等の誤りにより、意図しない外部公開や社内システムへの接続が発生し得る。
- 実AWSアカウントを学習者へ払い出す場合、アカウント・権限・請求・監査・後片付けの運用負荷が大きい。
- 研修用途では同じ操作を何度も繰り返したいが、実AWSでは環境の初期化や再現性確保に手間がかかる。
- 学習目的の操作と、本番・検証用AWS環境の責任境界を明確にする必要がある。

AWS Jam等の仕組みは実AWS Sandboxを利用するため実環境に近い一方、本企画では日常的に自由利用できる社内ラボを優先し、利用コストと運用リスクを抑えた独自基盤を構築する。

## 3. 目的

本企画の目的は次の通りである。

1. AWS Management Consoleの実操作を、実AWSへの影響を抑えて学習できる環境を提供する。
2. 利用者が自由に構築・破壊・再構築できる使い捨てLabを提供する。
3. 利用者の誤操作や悪意のない過失が、他利用者・社内ネットワーク・本番AWS環境へ波及しない構造を実現する。
4. 可能な限り広いAWSサービスを対象とし、少なくともリソース構成・設定操作を体験できる状態を目指す。
5. Lab上で身につけた画面操作、設定項目の位置、作成・更新・削除手順を実AWS Management Consoleへ直接転用できることを目指す。
6. OSSを活用しつつ、必要に応じて社内で機能追加・フォークを継続できる技術基盤を持つ。
7. 将来的な研修課題、採点、CLI、Terraform/CloudFormation/CDK、障害対応演習等の上位機能に再利用できる基盤を作る。

## 4. 対象利用者

主な対象利用者は以下とする。

- AWS初学者
- AWS認定・社内研修の学習者
- アプリケーション開発者
- インフラ・クラウドエンジニア
- 設計レビュー前にAWSサービス構成を試したい担当者
- IaCやAWS SDKの動作確認を行いたい担当者

本サービスは本番ワークロード、業務システムの検証環境、顧客データ処理基盤としては提供しない。

## 5. 提供価値

### 5.1 学習者向け

- 実AWS料金を強く意識せず試行錯誤できる。
- リソースを壊してもLabをリセットしてやり直せる。
- AWS Management Consoleと同等の画面構成・設定項目・操作順序を学べる。
- Labで覚えた操作を実AWS Management Consoleへ移行しやすい。
- Console操作を起点に、将来的にはCLIやIaCへ同じLabを利用できる。

### 5.2 管理・教育部門向け

- AWSアカウント払い出しや研修用Organizations管理を削減できる。
- 利用可能サービス、リソース量、Lab有効時間を中央で制御できる。
- Labを使い捨てにすることで、削除漏れ・残存リソースを抑止できる。
- 将来的に共通教材や課題を同一Lab基盤へ載せられる。

### 5.3 サービス提供部門向け

- 利用者の操作を技術的なサンドボックスへ閉じ込め、事故の影響範囲を限定できる。
- 「禁止事項の周知」だけに依存せず、ネットワーク、IAM、実行環境、Quota、TTLでガードレールを構成できる。
- 利用履歴と管理操作を監査可能にできる。

## 6. スコープ

### 6.1 初期スコープ

初期スコープは「自由利用型AWS Lab」とする。

- 社内認証によるログイン
- 利用者単位のLab起動・停止・リセット
- AWSサービス一覧
- AWS Management Consoleの現行画面を基準にした各サービスのConsole UI
- AWS互換APIを利用したリソース作成・参照・更新・削除
- 利用者間のLab分離
- リソースQuota
- Lab TTL / 自動削除
- 操作監査
- 管理者によるLab強制終了
- サービス対応レベルの明示

### 6.2 後続スコープ

以下はLab基盤確立後に追加する。

- 課題・チャレンジ
- 自動採点
- ヒント・スコア
- コース・進捗管理
- トラブルシューティング演習
- ブラウザCLI
- Terraform / OpenTofu / CloudFormation / CDK演習
- 実AWS Sandboxとのハイブリッド演習

### 6.3 非対象

以下は本企画の目的外とする。

- 本番システムのホスティング
- 本番データの保存
- 実AWSと完全同一の性能・可用性・SLAの再現
- AWSサービスの課金体系そのものの完全再現

## 7. AWSサービス対応方針

本サービスは「特定の数サービスだけを提供する学習環境」ではなく、可能な限り幅広いAWSサービスを対象とする。

一方、すべてのサービスで実データプレーンまで完全再現することは現実的ではないため、サービスごとに対応レベルを定義する。

| レベル | 名称 | 定義 |
| --- | --- | --- |
| L1 | Console / Control Plane | AWS Management Consoleの実操作に近い形で、リソース作成・設定・関連付け・削除等の構成操作を体験できる |
| L2 | Functional Emulator | AWS API間の連携や主要なサービス動作を実行できる |
| L3 | Executable Data Plane | 実コード、DB、コンテナ等の実行系を伴う処理まで体験できる |

全対象サービスでL1を目標とし、MiniStack等で対応可能なものはL2/L3へ広げる。

利用者画面では、そのサービスがL1/L2/L3のどこまで利用できるか、実AWSとの差異がある場合は何が再現されないかを明示する。

## 8. MiniStack採用方針

初期のAWS互換エミュレーション基盤にはMiniStackを第一候補とする。

2026年10月時点でMiniStackは60以上のAWSサービスを掲げ、AWS CLI、AWS SDK、Terraform、CDK等との互換利用を想定している。また、MIT Licenseで公開されており、利用・改変・再配布が可能である。

採用方針は以下とする。

1. MiniStackをAWS Lab Engineのベースラインとして利用する。
2. 特定バージョンおよびコンテナイメージdigestを固定し、社内ECRへミラーする。
3. MiniStackをサービスのセキュリティ境界そのものとして信用せず、AWS側のネットワーク/IAM/実行環境で隔離する。
4. AWSとの差分はサービス対応表で管理する。
5. 一般性の高い修正は可能な限りupstreamへの還元を優先する。
6. 社内固有の安全制御や未対応AWS機能は内部拡張として実装可能とする。
7. 内部修正が必要になった時点で、upstream同期可能な社内forkを作成する。
8. fork時もMITの著作権表示・許諾表示を保持し、依存ライブラリを含むSBOM / License Scanを継続する。

MiniStackの公開方針やライセンスが将来変更された場合でも、既にMITとして取得した版を基準に社内保守を継続できる構成を目指す。

## 9. UI方針

本サービスの主要な学習価値は、AWS Management Consoleの実操作をLab環境で反復練習できることに置く。

各サービス画面はAWS Management Consoleの現行画面を基準とし、可能な限り以下を一致させる。

- サービス名称とサービス内ナビゲーション
- 画面構成と情報階層
- タブ構成
- リソース名称とリソース関係
- 主要な設定項目と項目順
- 一覧・詳細・作成・編集・削除の画面遷移
- Create / Update / Delete等の操作導線
- 学習上重要な確認ダイアログや選択手順

単にAWSの概念を説明する独自UIではなく、Labで行った手順を実AWS Management Consoleでも同じ考え方・同じ操作順序で実行できることを目標とする。

AWS Management Consoleは継続的に変更されるため、対象サービスの現行画面との差分を定期的に確認し、学習上重要な変更へ追従する。Lab固有のTTL、Quota、Compatibility、Training表示等はAWS Console再現部分と区別して追加表示する。

### 9.1 知財・ブランド観点の解消方針

実操作学習のため、画面構成、情報階層、項目名称・項目順、タブ、ウィザード、操作導線等は実AWS Management Consoleを基準に再現する。一方、AWS公式ガイドライン上のtrade dress / look and feelに関する懸念を低減するため、以下を明確に分離する。

- AWSロゴ、AWS Smile Logoは自社サービスのブランド表示として使用しない。
- AWS ConsoleのHTML、CSS、JavaScript、画像、SVG、sprite等を直接流用しない。
- AWS固有の配色、フォント、グラフィック、製品アイコンを組み合わせた視覚表現そのものはコピーせず、自社実装とする。
- AWSの説明文、ヘルプ文、長いエラーメッセージ等は原則として転載せず、自社文言へ置き換える。
- AWSサービス名、設定項目名等は、対応対象を正確に示し実操作を学習するための事実上必要な参照として使用する。
- AWS公式、AWS公認、AWS提供サービスであるとの誤認を避けるため、社内学習用LabでありAWSが提供・承認・運営するサービスではない旨を常時識別可能にする。
- スクリーンショットは社内の設計・レビュー上必要な最小限の参照に限定し、製品アセットとして恒久同梱しない。
- 本サービスは社内SSO配下に限定し、一般公開・社外販売・広告利用を行わない。

社内限定・教育目的であることはリスク低減要素として扱うが、それ自体によってAWSの商標・著作権・ブランド利用条件が適用されなくなるとは扱わない。

詳細な実装・レビュー基準は `04_ip_guidelines.md` に定義し、正式展開前に法務・知財レビューで利用範囲を確定する。

## 10. 基盤方針

管理系システムは実AWS上に構築する。

- Web / API / Control Plane: ECSを第一候補とする
- 永続管理データ: Aurora PostgreSQL
- 静的コンテンツ・成果物・ライセンス情報等: S3
- Container Image: ECR
- ログ・メトリクス: CloudWatch
- 暗号鍵: KMS
- Secret: Secrets Manager / Parameter Store

Lab実体は利用者から分離した使い捨て実行環境とする。

### 10.1 Standard Lab

Docker-in-Dockerを必要としないサービスはECS/Fargate上の使い捨てMiniStack Taskで提供する。

- 1 Lab Session = 原則1 Fargate Task
- Private Subnet
- Public IPなし
- TaskごとのENI
- 利用者からMiniStackへの直接アクセスなし
- BFF/API経由でアクセス
- Lab終了時にTaskを破棄

### 10.2 Advanced Lab

RDS、ElastiCache、ECS、EKS、Docker Lambda、CodeBuild等、コンテナ実行環境を必要とする機能についてはFargateとは分離する。

Advanced Labは、Nested Virtualization対応EC2で構成する共有Worker Pool上に配置する。EC2をLabごとに1台払い出す方式は採用せず、1台のWorker Hostに複数Labを収容する。

ただし、異なるLabのDocker workloadを同一Host kernel上へ直接混在させない。**1 Advanced Lab = 1 microVM** を基本とし、Firecracker/KVM等の仮想化境界でguest kernel、Docker daemon、filesystem、network、CPU/Memoryを分離する。

Standard LabでAdvanced必須操作が要求された場合は、Lab状態をSnapshotした上でFargateを停止し、Advanced Worker上のmicroVMへ自動移行する。Advanced必須resource/workloadがなくなった後は、次回Suspend/Resume等の安全な境界でFargateへ自動復帰可能とする。

Worker PoolはAdvanced Capacity Unit (ACU)で容量管理し、需要に応じてWorkerのサイズ・台数を自動調整する。少数利用時はWorkerを0台まで縮退し、利用量増加時のみscale outする。

## 11. セキュリティ基本方針

### 11.1 データ取扱い

Labは機密データの保存場所として提供しない。

投入禁止対象の例:

- 個人情報
- 顧客情報
- 社外秘・機密情報
- 本番データ
- 本番AWS Access Key / Secret Access Key
- Private Key
- 本番DB Dump
- その他社内規程上Labへの保存が認められない情報

Lab内データは原則一時データとし、利用者が作成したS3 Object、DynamoDB Item、Secrets Manager Secret等の値を管理系Aurora/S3へ自動保存しない。

### 11.2 分離

- 利用者ごとにLabを分離する。
- MiniStackの論理アカウント分離のみをセキュリティ境界として使用しない。
- Standard LabはFargate Task / ENI / Security Group等で境界を設ける。
- Advanced Labは共有EC2 Worker Pool上でLab単位microVMを境界とし、異なるLabのDocker workloadをHost kernel上へ直接混在させない。
- 他利用者Labへの横断アクセスを禁止する。

### 11.3 ネットワーク

LabのOutboundは原則Default Denyとする。

必要なAWS管理サービスへのアクセスはVPC Endpoint等を利用し、外部HTTP通信や社内ネットワークへの到達を標準では許可しない。

外部接続を必要とするサービスを提供する場合は、サービス単位で許可先・目的・リスクを審査し、明示的なallowlistとして追加する。

### 11.4 実AWS権限

Labコンテナ/利用者コードには、原則として実AWSリソースを操作できるTask Roleを与えない。

Advanced LabのEC2管理権限も最小化し、Lab内コンテナからEC2 Instance Metadata Serviceの認証情報へ到達できないよう制御する。

### 11.5 ガードレール

- CPU / Memory / Disk上限
- リソース数Quota
- Lab同時起動数制限
- TTL / Idle Timeout
- 利用可能サービスAllowlist
- 管理API遮断
- 管理者Kill Switch
- Audit Log
- AWS Budgets / Cost監視

を基盤機能として持つ。

## 12. 責任分界方針

サービス提供部門を利用者の誤操作から守るため、責任分界を技術・運用の両面で明確にする。

### サービス提供側の責任

- Lab間の技術的分離
- 基盤のアクセス制御
- LabのQuota/TTL/停止機能
- セキュリティ更新
- 監査ログ
- 利用条件の明示
- インシデント時のLab停止・証跡保全

### 利用者側の責任

- 機密・個人・顧客・本番データを投入しない
- 本番Credentialsを投入しない
- Labを業務システムとして利用しない
- 社内規程・利用条件に従う
- 脆弱性検証や攻撃用途等、許可されていない目的で使用しない

### 会社として合意すべき事項

正式展開前に、情報セキュリティ・法務/知財・基盤運用等の関係部門と以下を確認する。

- 利用可能な情報区分
- 禁止データ
- ログ取得範囲と保存期間
- 運用管理者がLabデータへアクセス可能な範囲
- インシデント時の調査手順
- 利用者責任と提供者責任
- AWS商標・UI表現・ブランド資産の利用範囲
- OSSライセンス

## 13. 監査方針

監査の主記録はLab EngineではなくControl Plane / BFF側とする。

記録例:

- 利用者ID
- Lab Session ID
- 日時
- Service
- Action
- Resource識別子
- Result
- 管理操作

一方、以下の値は標準監査ログへ保存しない。

- S3 Object Body
- Secret Value
- Private Key
- DBレコード本文
- Lambda Source全文
- その他利用者が投入したPayload本体

## 14. 導入フェーズ

### Phase 1: Lab基盤成立

- 社内SSO
- Lab起動/停止/リセット
- Standard Lab
- S3 / IAM / STS / DynamoDB / SQS等の主要サービスUI
- AWS Management Consoleとの主要操作導線照合
- Audit / Quota / TTL
- 管理画面

### Phase 2: 対応サービス拡大

- API Gateway
- EventBridge
- Step Functions
- CloudFormation
- VPC / EC2等のControl Plane系
- サービス対応表の拡充
- AWS Management Consoleの画面変更追従

### Phase 3: Advanced Lab

- Shared Advanced Worker Pool
- Nested Virtualization / Firecracker/KVM
- ACUベースの自動配置・自動スケール
- Standard / Advanced自動切替
- Lambda実行拡大
- RDS
- ElastiCache
- ECS
- EKS
- その他Docker-backed service

### Phase 4: 学習機能

- Challenge
- 自動採点
- Course
- Troubleshooting Lab
- CLI / IaC

## 15. 成功指標

初期導入では、単純な利用者数だけでなく以下を評価する。

- Lab起動成功率
- Labリセット成功率
- 利用中の重大な分離違反件数
- 予算超過・削除漏れ件数
- 対応AWSサービス数とL1/L2/L3カバレッジ
- 利用者がLabで習得した手順を実AWS Management Consoleで再現できる割合
- 運用担当者による手作業復旧件数
- MiniStack差分に起因する学習阻害件数
- AWS Management Consoleとの差異に起因する学習阻害件数

## 16. 主なリスクと対策

| リスク | 対策 |
| --- | --- |
| MiniStackと実AWSの挙動差 | サービス対応レベルとKnown DifferencesをUIで明示し、互換テストを実施する |
| MiniStackの開発停止・方針変更 | MIT版を社内ミラーし、必要に応じてforkを継続する |
| 利用者が機密データを投入 | 利用条件、常時表示、使い捨てLab、非永続化、アクセス分離を組み合わせる |
| 利用者コードから社内/Internetへ通信 | Lab Outbound Default Deny、allowlist方式 |
| Docker Engine権限悪用 | FargateとAdvanced Labを分離し、Advanced LabはEC2単位で使い捨てる |
| 実AWS認証情報の窃取 | Lab Task Roleを原則付与せず、IMDSへの到達を遮断する |
| AWS UI/商標・ブランド資産の利用範囲 | 操作仕様は再現しつつ、AWSロゴ・固有配色・フォント・グラフィック・製品アイコン・HTML/CSS/JS等の直接コピーを避ける。社内限定・誤認防止表示・正式展開前の法務/知財レビューを組み合わせる |
| AWS Console更新による画面差異 | 現行Consoleとの差分を定期確認し、学習上重要な変更へ追従する |
| AWSコスト増大 | TTL、Quota、同時実行制限、Budgets、Advanced Labの必要時起動を適用する |

## 17. 企画上の決定事項

本企画の初版では以下を前提とする。

- Lab用途を課題・採点より優先する。
- AWS Management Consoleの実画面・操作導線を再現対象とし、実操作を学べることをUIの第一要件とする。
- 操作・情報構造の再現と、AWSのブランド/trade dressのコピーは別物として扱う。
- 対象サービスを限定的な数サービスへ固定せず、可能な限り全AWSサービスへ拡張する。
- 全サービスでL1を目標とし、L2/L3はサービス特性とエミュレータ能力に応じて提供する。
- MiniStackを初期エンジンとするが、MiniStack固有仕様へUI/Control Planeを密結合させない。
- 管理系永続データには実AWSのAurora/S3等を使用する。
- Standard LabはECS/Fargateを第一候補とする。
- Docker-backed機能はAdvanced Labへ分離する。
- Labは機密情報を扱う基盤ではない。
- 利用者の禁止事項だけではなく、技術的ガードレールを責任分界の前提とする。
- 知財・ブランド利用の具体ルールは `04_ip_guidelines.md` を正とする。

## 18. 参考情報

- MiniStack: https://ministack.org/
- MiniStack Services: https://ministack.org/docs/services/
- MiniStack GitHub / MIT License: https://github.com/ministackorg/ministack
- Amazon ECS Fargate Security Considerations: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-security-considerations.html
- Amazon ECS Fargate Task Networking: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-task-networking.html
- Amazon ECS Fargate Task Storage: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-task-storage.html
- AWS Trademark Guidelines & License Terms: https://aws.amazon.com/trademark-guidelines/
- AWS Site Terms: https://aws.amazon.com/terms/
- AWS Internal Lab 知財・ブランド利用ガイドライン: `04_ip_guidelines.md`

---

本書は企画目的と意思決定の基準を定義する。具体的な機能要件・非機能要件は `02_requirements.md`、AWS構成・コンポーネント・データフロー・セキュリティ境界は `03_basic_design.md`、知財・ブランド利用ルールは `04_ip_guidelines.md` に定義する。