# AWS Internal Lab 事故対策・安全設計規程

- 文書種別: 事故対策・安全設計規程
- 対象: 社内AWS学習・検証基盤
- リポジトリ: `aws-internal-lab`
- 初版日: 2026-10-06
- ステータス: 初版レビュー

## 1. 文書目的

本書は、AWS Internal Lab の利用・運用・実装において想定される事故、誤操作、不正利用、基盤障害に対し、サービス提供部門が取るべき予防・検知・封じ込め・復旧・証跡保全の基本ルールを定義する。

本サービスは初学者を含む利用者が自由にAWS相当リソースを構築・変更・削除する性質を持つため、「利用者は誤操作しない」「禁止事項を必ず守る」という前提には立たない。

事故対策は以下を基本原則とする。

> 利用者が誤操作・過失・不正利用を行っても、影響をLab内部へ局所化し、既存業務システム、他利用者、社内ネットワーク、実AWS資産、サービス提供基盤へ波及させない。

## 2. 適用範囲

本規程は以下を対象とする。

- Web / API / BFF
- Lab Control Plane
- Standard Lab / ECS Fargate
- Advanced Lab / EC2 Worker
- MiniStack / Internal Emulator
- Snapshot Store
- Aurora / Platform S3 / ECR / CloudWatch等の管理基盤
- 運用者・管理者操作
- 利用者のAWS Console相当操作、コード実行、ファイルアップロード、IaC実行

## 3. 安全設計の共通原則

### 3.1 Default Deny

- LabからInternetへの任意通信を原則禁止する。
- Labから社内ネットワークへの任意通信を禁止する。
- Labから既存業務AWSリソースへのアクセスを禁止する。
- LabへのInboundはPlatformから必要な通信だけを許可する。
- 実AWS IAM権限は必要最小限とし、Lab Runtimeには原則として業務AWS資産へ到達可能なRoleを付与しない。

### 3.2 Isolation First

- 利用者ごとにLabを分離する。
- Standard LabはTask/ENI等の実行境界を利用する。
- 高権限なAdvanced Labは専用Workerまたは1 Lab = 1 EC2を優先する。
- MiniStack内部の論理アカウント分離のみをセキュリティ境界として扱わない。

### 3.3 Ephemeral by Default

- Runtimeは使い捨てとする。
- 明示Suspendした場合のみSnapshotを保存する。
- Snapshotは期限付き保存とする。
- 通常終了では新規Snapshotを作成しない。

### 3.4 Least Privilege

- Platform Task Role、Lab Task Role、Advanced Worker Roleを分離する。
- Snapshot S3 / KMSへのアクセスRoleを分離する。
- 管理者も通常運用ではLab/Snapshot内容を直接閲覧できない設計とする。

### 3.5 Killability

運営者は最低限以下を即時実行できること。

- 個別Lab強制停止
- Advanced Worker強制Terminate
- Resume禁止
- Snapshot隔離/削除
- 新規Lab作成停止
- サービス単位無効化
- Advanced Lab全面停止
- 必要に応じてLab egress全面遮断

## 4. 事故対応フェーズ

すべての事故について以下5フェーズを基準とする。

### 4.1 Prevent / 予防

事故そのものを起こしにくくする制御。

例:

- IAM最小権限
- Network Default Deny
- Quota
- TTL
- Input validation
- Image digest pin
- Snapshot期限

### 4.2 Detect / 検知

事故を早期に発見する。

例:

- Audit
- CloudWatch Alarm
- GuardDuty / Runtime Monitoringの利用検討
- Cost Anomaly Detection / Budgets
- Snapshot整合性検査
- DLP補助検知

### 4.3 Contain / 封じ込め

影響拡大を止める。

例:

- Lab Freeze
- egress遮断
- Runtime停止
- Credential無効化
- Snapshot Quarantine

### 4.4 Recover / 復旧

安全な状態へ戻す。

例:

- Lab再作成
- Snapshot削除
- Credential rotation
- 既知安全Imageへ戻す
- Platform設定修正

### 4.5 Record / 証跡

原因分析・再発防止に必要な最小限の情報を残す。

原則として利用者Payload本体を証跡目的で無制限保存しない。

## 5. インシデントレベル

### SEV1 - Critical

以下のいずれか。

- 実AWS業務資産への不正/誤アクセスが確認された
- 顧客情報・機密情報の外部流出が確認された
- 本番CredentialがLab経由で利用された、または漏えいした可能性が高い
- 他利用者Lab/Snapshotへの不正アクセスが確認された
- Platform Control Planeが侵害された
- Container/VM escape等によりLab境界を越えたアクセスが確認された
- Labが社内/外部への攻撃踏み台として実際に利用された

対応:

- 即時封じ込め
- 新規Lab起動停止を検討
- 関係するCredential失効/rotation
- Security/Incident Responseへエスカレーション
- 必要に応じて証跡保全
- 原因判明・安全確認まで対象機能を再開しない

### SEV2 - High

- 外部公開設定が発生したがアクセス事実は未確認
- egress制御違反を検知した
- malware/crypto mining/scanner等の実行を検知した
- Advanced Worker上で想定外の高権限操作を検知した
- 大規模リソース消費/コスト上昇が発生した
- Snapshotへ禁止データが保存された可能性が高い

対応:

- 対象Lab/WorkerをFreezeまたはTerminate
- SnapshotをQuarantine
- 関係ログ確認
- 必要に応じてSecurityへ報告

### SEV3 - Medium

- Lab単体のOOM/CPU枯渇
- Quota超過
- Snapshot restore失敗
- Snapshot破損
- Emulator異常終了
- 単一ユーザー範囲に閉じた誤操作

対応:

- Lab停止/再作成
- Snapshot復旧可否確認
- 既知不具合/制限として管理

### SEV4 - Low

- 軽微なUI差異
- 一時的エラー
- 学習上の制約でセキュリティ影響なし

通常障害として扱う。

## 6. 事故シナリオ別対策

## 6.1 機密情報・個人情報・顧客情報の誤投入

### 想定

- S3相当領域へアップロード
- DynamoDB/RDS相当領域へ登録
- Secrets Manager/Parameter Store相当領域へ保存
- Lambda source / environment variableへ記載
- SuspendによりSnapshotへ永続化

### 予防

- 常時Training/Lab表示
- Upload/Secret入力画面で警告
- 本番データ投入禁止の利用条件
- DLP補助検知を将来実装可能とする

### 封じ込め

- 対象LabをFreeze
- Resume禁止
- 対象SnapshotをQuarantine
- 外部通信を遮断

### 復旧

- Runtime削除
- Snapshot完全削除
- Multipart upload/temporary object等の残存も確認
- 必要に応じて関連する認証情報をrotation

### Snapshot方針

Snapshot Storeは「禁止情報が混入している可能性のあるUntrusted User Data」として扱う。

- 専用S3 Bucket
- Block Public Access
- SSE-KMS
- 利用者Browserから直接アクセス不可
- 管理者も通常閲覧不可
- Lifecycleによる期限削除
- Cross-Region Replication / AWS Backup / 長期Archiveを原則行わない
- Object Lockは即時削除要件と競合するため原則利用しない

## 6.2 本番Credential / Private Key誤投入

### 想定

- AWS Access Key / Secret Access Key
- GitHub PAT
- DB password
- SSH private key
- API token

### 対策

投入が判明したCredentialは、Labから削除するだけでは不十分とする。

原則:

> 一度Labへ投入された本番Credentialは漏えいした可能性があるものとして失効またはrotationする。

追加対策:

- PEM/Access Key等のパターン検知
- Authorization header等をログへ出力しない
- Lab Runtimeから実AWS Metadata/Credential endpointへ到達させない

## 6.3 実AWSリソースへの誤アクセス・誤作成

### 想定

- Emulator endpointではなく実AWS endpointへSDKが接続
- Lab内コードがAWS SDKデフォルトendpointへアクセス
- Task Role/Instance Profileを取得して実AWSへAPI実行

### 予防

- Lab Runtimeに業務AWS権限を付与しない
- Standard LabからInternet/AWS public endpointへの任意egressを禁止
- 必要AWSサービスはVPC Endpoint単位でallowlist
- AWS SDK endpointをLab Engineへ明示設定
- Advanced LabでIMDS到達を制御

### 検知

- CloudTrailでLab関連Roleの実AWSAPI利用を監視
- Lab Roleに想定外API callがあればAlert

### 対応

- 該当Role/Session無効化
- Lab停止
- 作成された実AWSリソースを特定・削除
- 権限設計の欠陥としてSEV1/SEV2判定

## 6.4 Labからの外部通信・情報流出

### 想定

- Lambda等からHTTP送信
- EventBridge API Destination
- SMTP送信
- webhook送信
- DNS/HTTPを利用したデータ持ち出し

### 予防

- egress Default Deny
- Internet NAT経路を標準では提供しない
- 外部送信機能はService Capabilityで無効化
- 必要な場合のみProxy/allowlist経由

### 検知

- VPC Flow Logs
- Proxy log
- GuardDuty等

### 対応

- egress遮断
- Lab Freeze/Terminate
- Snapshot隔離

## 6.5 他利用者Lab / Snapshotへのアクセス

### 想定

- IDOR
- Lab ID推測
- API authorization漏れ
- Snapshot key推測
- Network横断

### 予防

- 全APIでowner check
- object keyだけに依存せずAurora metadataで所有権確認
- BrowserへSnapshot S3 URLを露出しない
- Lab間Network分離
- Runtime endpointを利用者へ公開しない

### 対応

他利用者データへアクセスできた場合は原則SEV1とする。

## 6.6 Control Plane / BFFの脆弱性悪用

### 想定

- SQL injection
- XSS
- SSRF
- command injection
- path traversal
- arbitrary AWS API proxy abuse

### 予防

- 入力validation
- parameterized query
- CSP等のWeb対策
- 任意URL proxyを提供しない
- Service APIをallowlist型で実装
- BrowserからLab Engine管理APIへ直接到達させない

### 検知

- WAF/ALB/Application logs
- 異常Rate監視
- Audit異常検知

### 対応

Control Plane侵害の疑いはSEV1扱いとする。

## 6.7 Emulator / Container escape

### 想定

- MiniStack脆弱性
- 利用者コードからContainer境界突破
- Docker socket悪用

### 予防

Standard Lab:

- Fargate優先
- Docker socketなし
- privilegedなし
- CPU/Memory制限
- ephemeral storage制限

Advanced Lab:

- 業務ホストと同居しない
- 可能な限り1 Lab = 1 EC2
- Lab終了時EC2 terminate
- Host IAM Role最小化
- IMDS制御
- Security Group分離

AWSはFargateでTaskごとにハードウェア仮想化された分離を提供しており、強いTask分離を必要とする用途ではFargateが推奨されている。

## 6.8 Malware / Crypto Mining / Scanner / 攻撃用途

### 想定

- 利用者が任意コードでcrypto miner実行
- port scan
- vulnerability scan
- bot/malware実行
- password cracking

### 予防

- Internet egress禁止
- CPU/Memory/PID/時間制限
- 利用規約で禁止
- Advanced Labの機能制限

### 検知

- CPU異常
- Network異常
- GuardDuty Runtime Monitoringの利用検討
- 実行時間/プロセス数監視

### 対応

- 即時Terminate
- 再発利用者のLab停止/利用制限を検討
- 目的・影響によりSEV1/SEV2

## 6.9 Resource Exhaustion / DoS

### 想定

- 無限ループ
- fork bomb
- 大量S3 object
- 大量Queue/Table/Role作成
- disk fill
- API flood

### 予防

- Fargate/Container CPU Memory上限
- ephemeral storage上限
- PID limit（利用可能なRuntimeで設定）
- Resource Count Quota
- API Rate Limit
- Concurrent Lab Limit
- Max Snapshot Size

### 対応

Quota超過時は対象LabのみThrottle/Stopし、Platform全体へ波及させない。

## 6.10 AWSコスト暴騰

### 想定

- Advanced EC2削除漏れ
- Snapshot大量保存
- Fargate大量起動
- CloudWatch Logs肥大化
- ECR image増加
- NAT Gateway大量通信

### 予防

- TTL
- Concurrent Lab Limit
- Advanced Lab最大数
- Snapshot Lifecycle
- Log retention
- ECR Lifecycle
- NATを標準利用しない
- Budget / Cost Anomaly Detection

### 検知

- 日次/時間単位のコスト監視
- Lab runtime数監視
- orphan resource reconciliation

### 対応

- 新規Lab起動Kill Switch
- Advanced Lab停止
- orphan cleanup

## 6.11 Snapshot破損 / Resume失敗

### 想定

- upload途中のTask終了
- checksum不一致
- MiniStack version差異
- Snapshot format変更
- 一部サービスだけ復元できない

### 予防

- manifest
- checksum
- snapshotFormatVersion
- engineVersion/imageDigest保存
- atomic publish（upload完了後にavailableへ遷移）
- Compatibility Matrixでfull/partial/none管理

### 対応

- `snapshot_failed` / `restore_failed`
- 元Runtimeが生存している場合は破棄を遅延可能とする
- 壊れたSnapshotから無理にResumeしない

## 6.12 Snapshotに禁止データが残る

### 予防

- 短期retention
- Platform Backup対象外
- Cross-Region Replicationなし
- Object Lockなし
- Versioningは原則無効。利用する場合は全version/delete markerを削除可能なPurge処理を必須とする

### 検知

- 利用者申告
- DLP/Macie等による補助検査を将来選択可能とする

### 対応

- Quarantine
- Resume禁止
- Purge
- Credentialが含まれる場合はrotation

## 6.13 Audit / Logへの機微情報混入

### 想定

- Request body logging
- Secret値
- S3 object body
- Lambda source
- Authorization header
- DB query parameter

### 予防

- Payload非記録をデフォルトとする
- structured auditはmetadataのみ
- log sanitizer
- debug logを本番で無効

### 対応

- 該当Log Groupへのアクセス制限
- retention短縮/削除可否判断
- credential rotation
- 再発防止

## 6.14 運用者・管理者による誤閲覧/誤操作

### 想定

- 管理者がSnapshot内容を閲覧
- 誤って別ユーザーLabをTerminate
- KMS/S3権限過大

### 予防

- RBAC
- Break Glass方式
- 二者承認を検討する高リスク操作
- 管理者UIではSnapshot本文を表示しない
- KMS key policy最小化
- 管理操作Audit

### Break Glass

Lab/Snapshot内容の直接調査が必要な場合は通常権限では実施せず、以下を満たすこと。

- Incident番号
- 承認者
- 対象Lab/Snapshot
- 調査目的
- 有効期限
- 実施者
- 実施操作Audit

## 6.15 SSOアカウント/Session乗っ取り

### 予防

- 社内SSO/MFA方針へ準拠
- Session timeout
- CSRF対策
- Secure/HttpOnly cookie
- 管理者操作は必要に応じてstep-up authenticationを検討

### 対応

- Session失効
- 利用者Lab停止
- 操作Audit確認

## 6.16 Supply Chain / Emulator Image改ざん

### 想定

- MiniStack upstream侵害
- ECR image上書き
- dependency compromise
- malicious package

### 予防

- upstream version pin
- image digest pin
- 社内ECR mirror
- immutable tag
- SBOM
- vulnerability scan
- dependency license report
- 更新時Compatibility/Security test

AWS ECSのセキュリティベストプラクティスでもECR immutable tagの利用が推奨されている。

### 対応

- 該当image digest利用停止
- 新規Lab作成停止
- 既知安全versionへrollback
- 稼働Labの再作成を検討

## 6.17 EmulatorのAWS互換性誤り

### 想定

- 実AWSでは拒否される設定をLabが許可
- IAM評価が異なる
- リソース状態遷移が異なる

### リスク

直接のSecurity Incidentではないが、誤学習・誤設計につながる。

### 対策

- Compatibility Matrix
- Known Differences表示
- 実AWSとの差分テスト
- 代表操作の回帰テスト
- 学習上重大な差異は対象機能を一時無効化

## 6.18 Orphan Runtime / Resource削除漏れ

### 想定

- Aurora上stoppedだがECS Taskが生存
- EC2 Workerが残る
- Snapshot multipart uploadが残る

### 対策

- Control Plane reconcile job
- TTL
- tagによるLabSession紐付け
- orphan detector
- 強制cleanup

## 6.19 Platform障害時の危険な継続

### 想定

- Aurora障害でowner check不可
- Audit書込不能
- Control Planeが状態不整合

### 方針

Fail-openではなくFail-closedを原則とする。

- owner確認不能なら変更操作を拒否
- Audit不能なら高リスク変更操作を停止
- Lab新規作成を停止
- 既存LabのRead-only継続可否は詳細設計で決定

## 7. 技術ガードレール一覧

最低限以下を実装対象とする。

| 分類 | ガードレール |
| --- | --- |
| Identity | 社内SSO、owner check、RBAC、Break Glass |
| Network | Private Subnet、No Public IP、Default Deny egress、SG分離 |
| Runtime | Fargate優先、Advanced専用EC2、privileged制限、Docker socket分離 |
| AWS IAM | Lab Runtime最小権限、業務資産権限なし、IMDS防御 |
| Resource | CPU/Memory/Storage/Resource Count/API Rate Quota |
| Data | Snapshot専用S3、SSE-KMS、Block Public Access、短期Lifecycle |
| Logging | Payload非記録、Audit metadataのみ |
| Supply Chain | version/digest pin、ECR immutable、SBOM、scan |
| Cost | TTL、同時Lab数、Budgets、Anomaly Detection、orphan cleanup |
| Operations | Kill Switch、Freeze、Quarantine、Purge、reconcile |

S3 Snapshot StoreではBlock Public Accessを全設定有効にすることを基本とする。AWSもS3 Block Public Accessの全設定有効化を推奨している。

## 8. Kill Switch設計

最低限以下のスコープを持つ。

### Level 1 - Lab

1つのLabだけを停止。

### Level 2 - User

特定ユーザーの全Lab/Resumeを停止。

### Level 3 - Service

Lambda/RDS等、特定サービス機能を全Labで無効化。

### Level 4 - Runtime Class

Advanced Labのみ全面停止等。

### Level 5 - Platform

新規Lab作成を全面停止。

既存Labを一括Terminateする機能は誤操作リスクが高いため、別権限・確認操作・Auditを必須とする。

## 9. Snapshot Quarantine

禁止データ混入、malware、セキュリティ事故の疑いがあるSnapshotは通常状態から切り離す。

状態例:

```text
creating
available
quarantined
purging
purged
expired
failed
```

`quarantined`では以下を禁止する。

- Resume
- Download
- Clone
- Share

Security承認のBreak Glass以外では内容を閲覧しない。

## 10. 証跡保全方針

セキュリティ事故時でも、「調査のために機密データ本体を無期限保存する」ことを標準動作にしない。

原則保存するもの:

- user id
- lab id
- snapshot id
- timestamp
- source IP等の認証メタデータ
- service/action/resource identifier
- result
- runtime id
- image digest
- engine version
- network metadata
- operator action

Payload本体を保全する必要がある場合は、Security/法務判断のもとBreak Glassで実施する。

## 11. 運用者ランブック最低要件

正式展開前に最低限以下のRunbookを用意する。

1. 機密情報誤投入
2. Credential漏えい
3. 他Labアクセス
4. 実AWS誤操作
5. 外部通信/情報流出
6. malware/crypto mining
7. Advanced Worker侵害
8. Control Plane侵害
9. Snapshot Quarantine/Purge
10. Cost runaway
11. MiniStack/image脆弱性
12. Platform全面停止/Kill Switch

各Runbookには以下を含める。

- 発火条件
- Severity
- 初動
- 停止対象
- 連絡先
- Credential rotation要否
- データ削除要否
- 証跡
- 復旧条件
- 再開承認者

## 12. 利用者責任とサービス提供者責任

### 利用者

- 機密情報、本番データ、本番Credentialを投入しない
- Labを本番用途へ利用しない
- 攻撃、スキャン、マイニング等へ利用しない
- 利用条件に従う
- 誤投入や事故に気付いた場合は速やかに申告する

### サービス提供者

- 技術的ガードレールを維持する
- Lab間分離を実装する
- 実AWS/社内ネットワークへの波及を防止する
- TTL/Quota/Kill Switchを提供する
- Auditを保持する
- Incident Runbookを維持する
- 脆弱性/OSS更新を監視する

禁止事項を利用者へ示したことだけを、サービス提供側の唯一の安全対策とはしない。

## 13. 正式展開前の受入条件

以下が満たされるまで正式展開しない。

- Network Default Denyが検証されている
- 他LabへのアクセスができないことをE2Eで検証している
- Lab Runtimeから業務AWS Credentialを取得できないことを検証している
- Snapshot S3がPublic Access不可である
- Snapshot owner checkが検証されている
- Snapshot Quarantine/Purgeが動作する
- Kill Switchが動作する
- Quota/TTLが動作する
- orphan cleanupが動作する
- AuditへSecret/Payloadが記録されないことを確認している
- Advanced LabのHost境界がレビュー済みである
- Cost Alertが設定されている
- SBOM/Vulnerability scanが実施されている
- 最低限のIncident Runbookが完成している
- 情報セキュリティ部門のレビューを受けている

## 14. 参考

- AWS Fargate security best practices: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/security-fargate.html
- Amazon ECS security considerations for Fargate: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/security-fargate-ec2.html
- Amazon ECS task/container security best practices: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/security-tasks-containers.html
- Amazon S3 Block Public Access: https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html
- AWS S3 access control best practices: https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-management.html
- AWS IAM security controls: https://docs.aws.amazon.com/prescriptive-guidance/latest/security-controls-by-caf-capability/identity-and-access-controls.html

---

本規程は `02_requirements.md`、`03_basic_design.md` のセキュリティ・運用要件を補足する。事故対応の具体手順は後続Runbookで定義する。