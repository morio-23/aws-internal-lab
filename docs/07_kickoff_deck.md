# AWS Internal Lab キックオフ説明資料 原稿

- 対象: チーム内キックオフ
- 想定枚数: 20枚
- 参照: `01_project_proposal.md`, `02_requirements.md`
- 目的: 企画意図、初期スコープ、主要な設計思想、進め方、キックオフで合意したい事項を短時間で共有する

> この文書はPowerPoint等へ落とし込む前提の「各ページ原稿」です。  
> 1ページにつき「伝えたいこと」を1つに絞り、詳細仕様は企画書・要件定義書を参照します。

---

## 1. AWS Internal Labとは

### このページで伝えたいこと

AWS Internal Labは、実AWSを直接払い出さずに、AWS Management Consoleに近い操作を安全に反復できる社内向け学習・検証基盤である。

### スライド本文

**AWSの操作を、自由に試して、壊して、やり直せる社内Lab**

- AWS Management Consoleの実操作を基準にしたLab Consoleを提供
- AWS互換エミュレータを利用し、実AWSリソースの直接作成を原則回避
- 利用者ごとに独立したLab環境を提供
- 低コスト・安全・反復可能なAWS Playgroundを目指す
- 将来的にCLI / IaC / 障害対応 / 課題型研修へ拡張可能

### 話す内容

初期フェーズでは「教材サイト」や「資格対策サイト」を作るのではなく、まずAWSを自由に触れるPlaygroundを成立させる。  
学習者がLabで覚えた操作を、実際のAWS Management Consoleでも大きな読み替えなく使えることを重要な価値とする。

---

## 2. 背景・現在の課題

### このページで伝えたいこと

実AWSをそのまま学習環境として広く配ると、コスト・運用・セキュリティの負担が大きい。

### スライド本文

**実AWSでの学習は実践的だが、全社展開には課題がある**

- 利用者数に比例してAWS利用料金が増える
- 高額リソースの作成や削除漏れが起こり得る
- IAM / Network / Public設定の誤りが事故につながる
- AWS Account / 権限 / 請求 / 監査 / 後片付けの運用負荷が大きい
- 同じ操作を何度も試す際の初期化・再現性確保が面倒
- 本番・検証AWS環境との責任境界を明確にする必要がある

### 話す内容

AWS Jam等の実AWS Sandboxは非常に実践的だが、日常的に自由利用する用途ではコストと運用負荷が大きい。  
今回の企画では、日常的に使える社内Labとして「気軽に試せること」と「事故影響を局所化すること」を優先する。

---

## 3. 目指す姿

### このページで伝えたいこと

この企画の価値は、単なるAWS風UIではなく「実AWSに転用できる操作経験」を低リスクで提供することにある。

### スライド本文

**Labで覚えた操作を、そのまま実AWSへ持っていけることを目指す**

1. 実AWSへの影響を抑えてAWS Console操作を学べる
2. 自由に構築・破壊・再構築できる
3. 誤操作が他利用者や本番環境へ波及しない
4. 幅広いAWSサービスを段階的に対象化する
5. 実AWS Consoleと同じ考え方・操作順序を学べる
6. 社内で継続的に機能追加・保守できる
7. 将来の研修機能やIaC演習へ再利用できる

### 話す内容

「AWSの概念を説明する独自画面」ではなく、「AWS Consoleで何をどこから設定するか」を体験できることが主眼。  
一方ですべてのAWS挙動や性能を再現することは目的にしない。

---

## 4. 対象ユーザー

### このページで伝えたいこと

初学者だけでなく、設計や開発前にAWS構成を試したい実務者も対象にする。

### スライド本文

**主な利用者**

- AWS初学者
- AWS認定・社内研修の学習者
- アプリケーション開発者
- インフラ / クラウドエンジニア
- 設計レビュー前にAWS構成を試したい担当者
- AWS SDK / IaCの動作確認をしたい担当者

**対象外**

- 本番ワークロード
- 顧客データを扱う環境
- 業務システムの正式な検証環境

### 話す内容

用途を広く取りすぎると責任範囲が曖昧になるため、「学習・非本番検証」に限定する。  
業務データや本番資格情報を扱う環境ではないことを最初から明確にする。

---

## 5. 初期スコープ / 非スコープ

### このページで伝えたいこと

最初に成立させるのはLab基盤そのものであり、教材・採点機能は後段に分ける。

### スライド本文

**初期スコープ**

- 社内SSO
- Lab起動 / 停止 / Reset
- AWSサービス一覧
- AWS Consoleを基準にしたサービスUI
- AWS互換APIによるCRUD
- 利用者間分離
- Quota / TTL
- Suspend / Resume
- Audit
- 管理者による強制停止
- Compatibility表示

**初期ではやらない**

- Challenge / 自動採点
- Course / 進捗管理
- 本番ホスティング
- AWSの性能・SLA・料金体系の完全再現

### 話す内容

課題機能を先に作るとLab基盤そのものが複雑になる。  
まず「安全に自由利用できるAWS Lab」を成立させ、その上に教材機能を載せる。

---

## 6. 利用者体験

### このページで伝えたいこと

ユーザー体験は「開始 → 操作 → 保存/破棄 → 再開」というシンプルな流れにする。

### スライド本文

**基本フロー**

1. 社内SSOでログイン
2. LabWorkspaceを開始
3. AWSサービスを選択
4. Console UIからリソースを作成・変更・削除
5. 学習を中断する場合はSuspend
6. Runtimeを破棄してコストを止める
7. 後日SnapshotからResume
8. 不要になればReset / Delete

### 話す内容

利用者にRuntimeの細かい違いを意識させすぎない。  
内部的にはFargateやAdvanced Workerへ切り替わっても、利用者からは同じWorkspaceを継続して使える形にする。

---

## 7. AWS Console再現方針

### このページで伝えたいこと

UIは見た目のコピーではなく、操作導線と情報構造の学習互換性を優先する。

### スライド本文

**実AWS Consoleを基準に合わせるもの**

- サービス内ナビゲーション
- 画面構成 / 情報階層
- タブ構成
- リソース名・関連
- 主要設定項目と項目順
- 一覧 / 詳細 / 作成 / 編集 / 削除の導線
- 学習上重要な確認手順

**Lab固有表示**

- Training / Lab表示
- TTL
- Quota
- Compatibility
- Snapshot対応状況

### 話す内容

利用者が「S3 Bucketを作るにはどこを押すか」「IAM Policyをどこで確認するか」を実AWSと同じ感覚で学べることを目指す。  
AWS Console更新に追従するため、画面差分を継続管理する。

---

## 8. AWSブランド・知財の線引き

### このページで伝えたいこと

操作仕様は参照するが、AWSのWeb資産やブランド表現をコピーするプロジェクトではない。

### スライド本文

**再現する**

- 情報構造
- 設定項目
- 項目順
- 操作導線
- AWSサービス / リソース名称

**直接流用しない**

- AWS ConsoleのHTML / CSS / JavaScript
- AWSロゴ / Smile Logo
- AWS固有の画像・SVG・sprite
- AWS特有の配色・フォント・trade dress
- 長い説明文・Help文の転載

**前提**

- 社内SSO配下のみ
- AWS公式 / 公認サービスと誤認させない
- 社外提供する場合は再レビュー

### 話す内容

社内利用だから無条件で問題ない、とは扱わない。  
正式展開前には法務・知財レビューに提示可能な状態にする。

---

## 9. AWSサービス対応モデル L1 / L2 / L3

### このページで伝えたいこと

全サービスで完全再現を目指さず、対応レベルを明示して広く提供する。

### スライド本文

| Level | 名称 | 内容 |
| --- | --- | --- |
| L1 | Console / Control Plane | 作成・設定・関連付け・削除など構成操作 |
| L2 | Functional Emulator | AWS API間連携や主要なサービス挙動 |
| L3 | Executable Data Plane | コード、DB、Container等の実行処理 |

**方針**

- 全対象サービスでL1を目標
- MiniStack等で実現可能なサービスはL2 / L3へ拡大
- 実AWSとの差異をCompatibility Matrixで明示

### 話す内容

サービス数を広げるためには「全部を完全再現する」という考え方を捨てる必要がある。  
利用者に何ができて何ができないかを明示した上で、Control Plane学習を広く提供する。

---

## 10. システム全体像

### このページで伝えたいこと

Control Planeと利用者Runtimeを明確に分離し、BrowserからEngineへ直接到達させない。

### スライド本文

```text
Browser
  |
  v
Web / BFF / Control Plane
  |
  v
Lab Gateway
  |
  +---- MiniStack
  |
  +---- Internal Emulator
  |
  +---- Deny
          |
          +-- Standard Runtime: ECS / Fargate
          +-- Advanced Runtime: EC2 Worker + microVM

管理データ: Aurora PostgreSQL
Snapshot: 専用S3 + KMS
Audit / Metrics: CloudWatch 等
```

### 話す内容

利用者はLab Engineへ直接アクセスしない。  
すべてBFF / Gatewayを通すことで認可、監査、Provider Routing、実AWS誤到達防止を一か所で制御する。

---

## 11. LabWorkspace / Runtime / Snapshot

### このページで伝えたいこと

利用者の論理AWS環境と実行Runtimeを分離することが、このシステムの中心設計である。

### スライド本文

**LabWorkspace**

- 利用者が継続利用する論理AWS環境
- Virtual Account ID / Region / ARN namespaceの正本
- Suspend / Resume後も同じ論理環境を維持

**Runtime**

- 実際にMiniStack等を実行する使い捨て環境
- Standard / Advancedを必要に応じて切替

**Snapshot**

- Runtimeを止めても学習状態を再開するための静的保存
- 有効期限付き

### 話す内容

「1つのLab = 1つの常時稼働Container」ではない。  
Workspaceは残しながらRuntimeを破棄できるため、コストを止めつつ継続利用できる。

---

## 12. Standard Lab

### このページで伝えたいこと

通常用途はFargate上の使い捨てRuntimeで安全かつ軽量に提供する。

### スライド本文

**Standard Runtime**

- ECS / Fargate
- 原則 1 Lab Session = 1 Task
- Private Subnet
- Public IPなし
- TaskごとのENI
- BrowserからMiniStackへ直接接続させない
- BFF / Lab Gateway経由
- Lab終了時にTaskを破棄

**主な対象**

- Control Plane中心のサービス
- Docker daemonを必要としないL1 / L2

### 話す内容

通常の学習ではFargateを使い、EC2を常時確保しないことで運用負荷とコストを抑える。

---

## 13. Advanced Lab

### このページで伝えたいこと

Container実行やKVM等が必要なサービスだけ、より強力なAdvanced Runtimeへ移す。

### スライド本文

**Advanced Runtime**

- Nested Virtualization対応EC2 Worker Pool
- 1 Advanced Lab = 1 microVM
- Firecracker / KVM等でguest kernelを分離
- microVM内でDocker daemon / filesystem / networkを利用
- Worker Host上へ異なる利用者Containerを直接混在させない

**主な対象**

- RDS相当
- ElastiCache相当
- ECS / EKS
- Docker Lambda
- CodeBuild等

### 話す内容

Docker Containerだけでは異なる利用者を分離するセキュリティ境界として弱いため、AdvancedではmicroVMを境界にする。  
Worker自体は共有するが、利用者workloadはHost kernel上へ直接混在させない。

---

## 14. Lab Gateway / Provider Routing

### このページで伝えたいこと

MiniStackだけに依存せず、Operation単位で実装先を差し替えられる構造にする。

### スライド本文

**Lab GatewayをAWS APIの単一入口にする**

OperationごとにRouting:

- **MiniStack**
  - 互換性が高い既存実装を利用
- **Internal Emulator**
  - MiniStack未対応機能を社内実装で補完
- **Deny**
  - 安全上提供しないOperationを明示的に拒否

**メリット**

- Engine交換やforkの影響を限定
- サービス単位ではなくOperation単位で段階対応可能
- 実AWSへの誤送信を防止

### 話す内容

MiniStackは重要な部品だが、システム全体をMiniStackの仕様へ密結合させない。  
Adapter / Gateway層を置くことで長期保守性を確保する。

---

## 15. セキュリティ境界

### このページで伝えたいこと

「エミュレータだから安全」ではなく、ネットワーク・権限・Runtime境界で安全性を作る。

### スライド本文

**基本方針**

- 利用者ごとにWorkspace / Runtimeを分離
- Runtime VPCから任意Internet egressを禁止
- Public IPなし
- 実AWS CredentialをLabへ渡さない
- 既存業務AWSリソースへの汎用権限を付与しない
- StandardはTask / ENI単位で分離
- AdvancedはmicroVMをtenant境界にする
- BrowserからLab Engine管理APIへ直接接続不可
- Deny by Default

**投入禁止**

- 個人 / 顧客 / 機密情報
- 本番データ
- 本番AWS Credential
- Private Key / DB Dump

### 話す内容

安全性はMiniStackの論理アカウント分離に依存しない。  
実AWSへ「届かない・Credentialがない・権限がない」を重ねて事故影響を閉じ込める。

---

## 16. Suspend / Resume とコスト制御

### このページで伝えたいこと

常時Runtimeを維持せず、Snapshotを使って学習状態とコストを両立する。

### スライド本文

**Suspend**

1. 状態をSnapshot化
2. Snapshotを暗号化保存
3. Runtime停止・破棄

**Resume**

1. Snapshot互換性確認
2. 新しいRuntimeを起動
3. 状態復元
4. readyへ遷移

**初期Cost Guardrail案**

- Active Workspace / User: 1
- Advanced ACU / User: 4
- Snapshot / Workspace: 3
- Retention default: 7日
- Retention max: 30日
- Idle auto-Suspend: 30分
- Runtime hard TTL: 8時間

### 話す内容

この初期値はConfiguration as Codeで変更可能にし、利用実績を見ながら調整する。  
Budget通知だけでなく、Worker数・ACU・Lab数・TTL等をhard limitとして持つ。

---

## 17. 東京・大阪Virtual Region / DR学習

### このページで伝えたいこと

単一RegionのAWS操作だけでなく、DR設計の学習までLab内で扱えるようにする。

### スライド本文

**初期Virtual Region**

- 東京: `ap-northeast-1`
- 大阪: `ap-northeast-3`

**学習対象例**

- Backup / Restore
- Pilot Light
- Warm Standby
- Active / Passive
- Active / Active
- Cross-Region Replication
- Route 53 Failover
- RPO / RTO

**Fault Injection**

- 東京Region障害をWorkspace内だけで模擬
- 他利用者・Platform本体には影響させない

### 話す内容

利用者が体験するVirtual DRと、AWS Internal Lab自体のPhysical DRは別物として扱う。  
UI・設計・運用のすべてでこの2つを混同しない。

---

## 18. 運用・監査・権限

### このページで伝えたいこと

自由に使えるLabだからこそ、運営側が止められる・追跡できる・権限分離できることが必須。

### スライド本文

**Role**

- Learner
- Operator
- Administrator
- SecurityAuditor

**Operator / Admin機能**

- 稼働Lab一覧
- TTL / Resource利用状況
- 強制終了
- メンテナンス
- Snapshot状態
- Quota
- Compatibility Matrix
- Audit
- Emergency Stop

**Audit**

記録する:
- User / Workspace / Session / Operation
- Service / Action / Result
- Correlation ID

記録しない:
- Secret Value
- S3 Object Body
- DBレコード本文
- Private Key等

### 話す内容

管理者だから何でも利用者データを見られる形にはしない。  
SecurityAuditorを分離し、例外アクセスが必要な場合はIncident ID付きBreak Glassを想定する。

---

## 19. 開発ロードマップ

### このページで伝えたいこと

最初からすべて作らず、基盤成立 → サービス拡大 → 高度な実行環境 → 研修機能の順に進める。

### スライド本文

**Phase 1: Lab基盤成立**

- SSO
- Workspace lifecycle
- Standard Runtime
- S3 / IAM / STS / DynamoDB / SQS等
- Audit / Quota / TTL
- Suspend / Resume
- 管理画面

**Phase 2: サービス拡大**

- API Gateway
- EventBridge
- Step Functions
- CloudFormation
- VPC / EC2 Control Plane等

**Phase 3: Advanced Lab**

- Worker Pool
- microVM
- Standard / Advanced切替
- RDS / ElastiCache / ECS / EKS等

**Phase 4: 学習機能**

- Challenge
- 自動採点
- Course
- Troubleshooting
- CLI / IaC

### 話す内容

Phase 1の時点で「小さくても実際に使えるAWS Playground」を作る。  
高度な研修機能やAdvanced Runtimeが未完成でも、基盤単体で利用価値を出す。

---

## 20. 初期リリースDone / キックオフで決めること

### このページで伝えたいこと

初期リリースの評価軸と、キックオフで合意したい事項を明確にする。

### スライド本文

**初期リリースで最低限成立させる5観点**

### 1. 使える
- SSO Login
- Workspace Start
- 複数AWSサービスのCRUD

### 2. 戻せる
- Reset
- Suspend / Resume
- Snapshot

### 3. 漏れない
- 利用者間分離
- Private Network
- 実AWSへ誤到達しない
- SecretをAuditへ残さない

### 4. 運用できる
- Operator Kill
- TTL / Quota
- Audit
- Compatibility Matrix

### 5. 継続開発できる
- MiniStack version固定
- Engine差し替え可能
- SBOM / License管理
- Snapshot互換性
- CI/CD Gate

**キックオフで合意したいこと**

- Phase 1の対象サービスと優先順位
- 初期利用者・試用範囲
- Quota / TTL / Snapshot retention初期値
- UI再現レベル
- 情報セキュリティ / 法務・知財レビューの進め方
- Phase 1のDone条件とレビュー担当

### 話す内容

36個ある詳細受入条件を会議ではそのまま読み上げず、上記5観点で共有する。  
詳細な判定は要件定義書を正とし、キックオフでは優先度と責任者、判断ポイントを揃える。

---

# 補足: 資料化するときの体裁

- 白背景
- アクセントカラーは1色程度
- 1枚1メッセージ
- 文章を詰め込みすぎず、詳細は話す内容へ逃がす
- 構成図は以下の3枚を優先
  1. 利用者体験
  2. システム全体像
  3. LabWorkspace / Runtime / Snapshot
- Standard / Advancedは比較図にしてもよい
- 最終ページは「決めること」がそのまま議題になる構成にする

# 参照ドキュメント

- [AWS Internal Lab 企画書](./01_project_proposal.md)
- [AWS Internal Lab 要件定義書](./02_requirements.md)
- [基本設計](./03_basic_design.md)
- [知財・ブランド利用ガイドライン](./04_ip_guidelines.md)
