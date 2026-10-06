# AWS Internal Lab 基本設計書

- 文書種別: 基本設計書
- 対象: 社内AWS学習・検証基盤
- リポジトリ: `aws-internal-lab`
- 初版日: 2026-10-05
- ステータス: 初版レビュー

## 1. 文書目的

本書は、AWS Internal Lab の初期リリースを実装するための基本設計を定義する。

本システムは、利用者が AWS の各サービス相当のリソースを安全に試せる社内 Lab を提供する。初期フェーズでは課題・採点機能を対象外とし、AWS Management Console の実操作を学べる各サービスの Console UI と Lab 実行基盤を優先する。

## 2. 設計原則

1. 利用者操作を既存業務 AWS 資産から分離する。
2. Lab Runtime は使い捨てとするが、利用者が明示的に Suspend した場合は Lab Snapshot を外部保存し、後日新しい Runtime で再開可能とする。
3. Snapshot を保存しない通常終了では Lab 内データの永続保存を前提としない。
4. MiniStack を利用するが、MiniStack 自体をセキュリティ境界として信用しない。
5. Browser から Lab Engine を直接公開しない。
6. Standard Lab と Advanced Lab を分離する。
7. AWS サービスごとの対応差異と Snapshot 対応状況を Compatibility Matrix で明示する。
8. UI と Emulator Engine は Adapter で分離し、MiniStack の fork や交換を可能にする。
9. 管理データは実 AWS のマネージドサービスへ保存する。
10. 機微データを保持しない設計を優先し、Audit も最小限のメタデータに限定する。
11. AWS Management Console の現行画面を UI 設計の基準とし、画面構成、ナビゲーション、設定項目、項目順、操作導線を可能な限り再現する。Lab で習得した手順を実 AWS Management Console でそのまま適用できることを優先する。
12. Lab 固有の安全表示、Quota、TTL、Compatibility 情報は AWS Console 再現部分と区別して付加する。
13. 操作・情報構造の再現と、AWSブランド/trade dress/著作物の直接コピーを分離する。

## 3. システム構成

### 3.1 論理構成

```text
                         社内SSO
                            │
                            ▼
                    ALB / CloudFront
                            │
                 ┌──────────▼──────────┐
                 │   Web / API / BFF   │
                 │      ECS Service    │
                 └───────┬─────┬───────┘
                         │     │
                   SQL   │     │ AWS SDK / Internal API
                         │     │
              ┌──────────▼─┐   │
              │ Aurora PG  │   │
              │ metadata   │   │
              └──────┬─────┘   │
                     │         │
            Snapshot metadata  │
                     │         │
              ┌──────▼──────┐  │
              │ Snapshot S3 │  │
              │ + SSE-KMS   │  │
              └─────────────┘  │
                               │
                        ┌──────▼──────┐
                        │ Lab Control │
                        │   Plane     │
                        └──────┬──────┘
                               │
              ┌────────────────┴────────────────┐
              │                                 │
              ▼                                 ▼
      Standard Lab                         Advanced Lab
      ECS / Fargate                        Dedicated EC2
              │                                 │
         MiniStack                          MiniStack
        ephemeral                         container runtime
```

### 3.2 AWS 基盤サービス

| 用途 | AWSサービス候補 | 備考 |
| --- | --- | --- |
| Web/API | ECS + ALB | Fargateを第一候補 |
| 認証 | 社内IdP/OIDC | Cognitoは必要に応じて仲介 |
| 管理DB | Aurora PostgreSQL | Lab状態・設定・Audit・Snapshotメタデータ |
| Platformオブジェクト保存 | S3 | ドキュメント・成果物・SBOM等 |
| Lab Snapshot Store | S3 | 専用Bucket。SSE-KMS、Lifecycle、Public Access Block |
| Container Image | ECR | MiniStack imageも社内mirror |
| ログ | CloudWatch Logs | Payload全文は記録しない |
| メトリクス | CloudWatch | Lab稼働数・CPU・Memory・Snapshot容量等 |
| 暗号鍵 | KMS | Aurora/S3/Logs/Snapshot等 |
| Secret | Secrets Manager / SSM | Platform側Secretのみ |
| DNS | Route 53 | 社内DNS構成に合わせる |

## 4. コンポーネント設計

## 4.1 Web / API / BFF

### 責務

- 社内SSO認証
- 画面配信
- Lab所有者確認
- Snapshot所有者確認
- Service Console API
- Quota / Guardrail適用
- Audit Event生成
- Lab EngineへのProxy/Adapter呼び出し
- Suspend / Resume 操作受付
- 管理者UI

### 設計方針

Browser は MiniStack endpoint および Snapshot Store の S3 object URL を知らない。

すべての操作は以下の経路とする。

```text
Browser
  ↓
BFF / API
  ↓
Service Adapter / Lab Control Plane
  ↓
Lab Engine / Snapshot Store
```

利用者の AWS API リクエストを無制限に透過Proxyする方式は初期段階では採用しない。Web Console から必要な操作を BFF API として明示的に実装し、許可操作・入力値・Auditを制御可能にする。

Web Console の画面仕様は、対象時点の AWS Management Console をサービスごとに参照して定義する。Lab Engine の制約によって実 AWS と同一動作を実現できない場合でも、可能な限り画面遷移・入力項目・操作順序は AWS Management Console に合わせ、機能差は Compatibility 情報として表示する。

## 4.2 Lab Control Plane

### 責務

- Lab作成
- Lab停止
- Labリセット
- Lab Suspend
- Lab Resume
- Snapshot作成・削除・期限管理
- TTL管理
- Runtime割当
- Runtime状態監視
- Standard / Advanced Lab判定
- 強制終了
- Runtime / Snapshot整合性reconcile

### Lab状態

```text
requested
  ↓
provisioning
  ↓
ready
  ├─→ suspending → suspended → resuming ─┐
  │                                      │
  └──────────────────────────────────────┘
  ↓
stopping
  ↓
stopped
```

異常系として以下を持つ。

- failed
- expired
- terminated_by_operator
- snapshot_failed
- restore_failed

状態遷移は Aurora 側を管理上の正とし、ECS Task / EC2 / Snapshot Store 状態との不整合を定期的に reconcile する。

## 4.3 Standard Lab Runtime

Standard Lab は ECS/Fargate を第一候補とする。

### 原則

- 原則 1 Lab Session = 1 Fargate Task
- Public IPなし
- Private Subnet
- Task単位ENI
- ephemeral storage
- MiniStack管理endpoint非公開
- Platformからのみアクセス可能
- 通常終了時Task破棄
- Docker socketなし
- privileged実行なし

### 対象

Docker daemon を必要としない L1/L2 サービスを中心とする。

例:

- S3
- IAM
- STS
- DynamoDB
- SQS
- SNS
- CloudWatch系
- EventBridge
- Step Functions
- API Gateway
- VPC/EC2 Control Plane
- Route 53
- CloudFormation

実対応可否は Compatibility Matrix で決定する。

### Snapshot / Resume 方式

Standard Lab では MiniStack の永続化機能を利用して Lab 状態を Runtime 内の一時領域へ書き出し、Suspend 時のみ専用 S3 Snapshot Store へ退避する。

想定設定:

```text
PERSIST_STATE=1
STATE_DIR=/lab-state/state
S3_PERSIST=1
S3_DATA_DIR=/lab-state/s3
```

`/lab-state` 自体は Fargate の ephemeral storage とし、常時 S3 をマウントして直接動作させない。

Suspend フロー:

```text
User: Suspend
   ↓
LabSession = suspending
   ↓
新規変更操作を停止
   ↓
MiniStackをgraceful shutdown
   ↓
STATE_DIRへ各サービス状態をflush
S3_DATA_DIRへS3 object bytesを保持
   ↓
Snapshot manifest作成
   ↓
state/dataをarchiveまたはprefix単位でSnapshot S3へupload
   ↓
checksum確認
   ↓
LabSnapshot = available
LabSession = suspended
   ↓
Fargate Task削除
```

Resume フロー:

```text
User: Resume
   ↓
LabSession = resuming
   ↓
Snapshot manifest / checksum / compatibility確認
   ↓
新しいFargate Task起動
   ↓
Snapshot S3から/lab-stateへdownload
   ↓
保存時と同一または互換確認済みMiniStack versionで起動
   ↓
MiniStackがpersisted stateをrestore
   ↓
health / resource sanity check
   ↓
LabSession = ready
```

Resume が失敗しても元 Snapshot object は変更・削除しない。

## 4.4 Advanced Lab Runtime

Standard Lab 上で安全に提供できない Data Plane を対象とする。

### 想定対象

- RDS 実DB
- ElastiCache 実Redis/Memcached
- ECS workload
- EKS/k3s
- Docker executorを利用するLambda Runtime
- その他 nested container / privileged相当機能を要求するサービス

### 初期設計

Advanced Lab は専用 EC2 Worker Pool 上に配置する。

初期段階では共有EC2上に複数利用者の高権限Labを混在させるより、必要に応じて「1 Advanced Lab = 1 EC2」を選択できる構成を優先する。

```text
Start Advanced Lab
        ↓
EC2 Launch
        ↓
Bootstrap MiniStack + runtime
        ↓
Ready
        ↓
Use
        ↓
Terminate EC2
```

EC2 Worker は既存業務サーバーと同居させない。

### Advanced Lab Snapshot

RDS/ECS/EKS等は MiniStack state JSON だけでなく Docker volume や実データプレーンの保存が必要になるため、Standard Lab と同じ Snapshot 実装をそのまま適用しない。

初期リリースでは Advanced Lab の Snapshot 対応を Compatibility Matrix で `full / partial / none` として管理し、完全 Resume は後続フェーズとする。将来的には専用 EBS data volume の Snapshot、サービス別export、またはEC2単位の復元方式を検討する。

## 4.5 Service Adapter

UI / API から MiniStack 固有実装を分離する。

概念インターフェースは以下とする。

```text
AwsLabServiceAdapter
 ├ capabilities()
 ├ listResources()
 ├ getResource()
 ├ createResource()
 ├ updateResource()
 └ deleteResource()
```

実際にはAWSサービスごとに型安全なAdapterへ分割する。

例:

```text
S3Adapter
IamAdapter
Ec2Adapter
RdsAdapter
```

Provider 実装は将来的に以下を許容する。

```text
MiniStackProvider
InternalEmulatorProvider
RealAwsSandboxProvider
```

Snapshot 実装も Provider / Runtime ごとに抽象化する。

```text
LabSnapshotProvider
 ├ createSnapshot()
 ├ validateSnapshot()
 ├ restoreSnapshot()
 └ deleteSnapshot()
```

## 5. MiniStack 管理設計

## 5.1 採用方式

- upstream MiniStackを初期ベースとする。
- 採用versionを明示固定する。
- Container image digestを固定する。
- imageは社内ECRへmirrorする。
- Sourceも社内Gitへmirror可能な状態を維持する。
- Standard LabではSnapshot対応のため永続化機能の回帰テストを実施する。

## 5.2 fork 方針

以下の場合に社内forkを作成する。

- 社内セキュリティ制御がupstreamへ適さない。
- 必要AWS APIの実装を社内優先で追加する必要がある。
- Docker依存を減らすmetadata-only mode等を追加する。
- Snapshot format / state export 等で社内要件を満たす拡張が必要となる。
- upstream更新待ちが社内展開を阻害する。

一般的なAWS互換性修正はupstreamへの還元を優先する。

## 5.3 License

MiniStackのMIT Licenseの著作権表示・許諾表示を保持する。

依存パッケージは別ライセンスを含み得るため、CIまたはリリース工程で以下を生成する。

- SBOM
- dependency license report
- vulnerability report

## 6. Service Compatibility Matrix

サービス対応状況をコードまたはバージョン管理可能な設定として保持する。

### 6.1 管理項目

| 項目 | 説明 |
| --- | --- |
| serviceCode | AWSサービス識別子 |
| displayName | 表示名称 |
| enabled | 提供可否 |
| maxLevel | L1/L2/L3 |
| runtimeType | standard / advanced |
| provider | ministack / internal / other |
| testedVersion | 検証済MiniStack version |
| knownLimitations | 既知差異 |
| dangerousFeatures | 無効化対象 |
| snapshotSupport | full / partial / none |
| snapshotNotes | Resume時の制約 |
| lastVerifiedAt | 最終互換確認 |
| consoleReference | UI設計時に参照したAWS Management Consoleの画面・確認日 |
| consoleDifferences | 実AWS Consoleとの差異 |

### 6.2 UI 表示

サービス画面には必要に応じて以下を表示する。

```text
Compatibility
Level 2 - Functional Emulator
Snapshot: Full

Known differences from AWS:
- EC2 instances do not run a real VM in Standard Lab.
- CloudFront does not provide a real edge CDN.
```

Compatibility表示は実AWS Consoleの操作領域を置き換えず、Lab固有情報として識別可能な形で付加する。

## 7. ネットワーク設計

## 7.1 基本方針

Labからの通信は Default Deny を原則とする。

```text
Internet                  X
Corporate Network         X
Production AWS Resources  X

Platform BFF
     │
     ▼
Lab Runtime
     │
     └── VPC Endpoint ── Snapshot S3
```

## 7.2 Standard Lab

- Private Subnet
- Public IPなし
- Security GroupはPlatform経由通信のみ許可
- Internet Gateway/NAT経由の任意Outboundは原則許可しない
- ECR、CloudWatch、Snapshot S3等はVPC Endpoint利用を優先

## 7.3 Advanced Lab

Advanced Lab は Standard Lab と Security Group、Subnet、IAM Role、実行Cluster等を分離する。

Container runtimeを操作できるプロセスからPlatformの管理ネットワークへ到達させない。

## 7.4 外部通信が必要なAWSサービス

AWSサービスの性質上、HTTP destination、SMTP等の外部接続機能が存在する場合、初期状態では無効とする。

提供する場合は明示Allowlist、Proxy、専用egress等を別設計する。

## 8. IAM 設計

## 8.1 Platform Task Role

Web/APIは以下のみを許可する。

- Aurora接続に必要なSecret取得
- Lab Control Plane操作に必要なECS/EC2権限
- Platform S3アクセス
- Snapshot metadata操作
- CloudWatch Logs/Metrics

既存業務S3、DB、Secrets等への汎用権限は付与しない。

## 8.2 Standard Lab Task Role

MiniStack Taskに実AWSの業務リソース操作権限を付与しない。

Snapshot transfer を Runtime 自身に行わせる場合は、当該 Lab の Snapshot prefix のみに限定した S3/KMS 権限を付与する。より厳格な構成では Snapshot sidecar / Control Plane が transfer を担当し、MiniStack process 自体には実AWS資格情報を与えない。

## 8.3 Advanced Worker Role

Standard Labと完全分離する。

必要権限を限定し、利用者コードからInstance Metadata / AWS Credentialを取得できる可能性も考慮して防御する。

IMDS設定、network namespace、runtime security等は詳細設計で確定する。

## 8.4 Snapshot Store Role

Snapshot Store への権限は以下を原則とする。

- Lab owner の Browser へ S3 credential / presigned download URL を直接渡さない。
- Control Plane / Snapshot worker のみ read/write/delete 可能とする。
- `snapshot/{ownerUserId}/{snapshotId}/` 等のprefix単位でアクセスを限定する。
- KMS Decrypt/Encrypt も同一主体へ限定する。
- 運用者は原則メタデータ参照のみとし、payload閲覧はbreak-glass扱いとする。

## 9. データ設計

## 9.1 Platform永続データ

Aurora PostgreSQLに以下を保持する。

### User

- id
- externalSubject
- displayName
- email
- role
- createdAt
- lastLoginAt

### LabSession

- id
- userId
- status
- runtimeType
- runtimeId
- currentSnapshotId
- region
- startedAt
- expiresAt
- stoppedAt
- terminationReason

### LabRuntime

- id
- type
- ecsTaskArn / ec2InstanceId
- privateEndpoint
- engineVersion
- engineImageDigest
- createdAt

### LabSnapshot

- id
- labSessionId
- ownerUserId
- status
- runtimeType
- engineVersion
- engineImageDigest
- region
- snapshotFormatVersion
- storagePrefix
- sizeBytes
- checksum
- createdAt
- expiresAt
- lastRestoredAt
- deleteRequestedAt
- deletedAt

Snapshot status例:

```text
creating
available
restoring
expired
deleting
deleted
failed
```

### ServiceCapability

- serviceCode
- enabled
- maxLevel
- runtimeType
- provider
- knownLimitations
- snapshotSupport
- snapshotNotes
- testedVersion
- lastVerifiedAt
- consoleReference
- consoleDifferences

### QuotaPolicy

- id
- scope
- maxConcurrentLabs
- ttlSeconds
- cpuLimit
- memoryLimit
- storageLimit
- maxSnapshots
- maxSnapshotBytes
- snapshotRetentionDays
- resourceLimitsJson

### AuditEvent

- id
- occurredAt
- userId
- labSessionId
- service
- action
- resourceType
- resourceIdentifier
- result
- metadataJson

## 9.2 S3保存対象

Platform asset 用 S3 には以下を保存可能とする。

- SBOM
- License reports
- Documentation assets
- Compatibility test artifacts
- Console UI comparison artifacts that contain no restricted data
- Exportした非機微な診断情報

Snapshot payload は上記とは別の専用 Snapshot Bucket に保存する。

## 9.3 Snapshot Store

Snapshot Bucket は利用者データを含み得るため、Platform asset Bucket より厳格に扱う。

必須設定:

- Block Public Access
- SSE-KMS
- 専用 KMS Key
- Versioning は削除・復旧要件とコストを踏まえて詳細設計で決定
- Lifecycle による期限削除
- Bucket Policy によるアクセス主体限定
- VPC Endpoint 経由を優先
- CloudTrail data event の有効化を検討

保存構造例:

```text
s3://<snapshot-bucket>/
  snapshots/
    <user-id>/
      <snapshot-id>/
        manifest.json
        state.tar.zst
        s3-data.tar.zst
```

manifestには以下を含める。

- snapshotFormatVersion
- engineVersion
- engineImageDigest
- runtimeType
- region
- createdAt
- file checksums
- service capability version

## 9.4 Labデータ

実行中の Lab データは Runtime 内部のみで保持する。

- 通常 Stop / Expire: Runtime削除とともに破棄
- Suspend: Snapshot対象データをSnapshot Storeへ明示保存してからRuntime削除
- Resume: Snapshot Storeから新規Runtimeへ復元

Snapshot は永続業務ストレージではなく、学習途中状態の期限付き保存機能として扱う。

## 10. セキュリティ設計

## 10.1 禁止データ

以下を利用規約・UIで禁止する。

- 個人情報
- 顧客情報
- 社外秘データ
- 本番データ
- 本番Credentials
- Private Key
- 本番DB Dump

Snapshot 機能を利用しても禁止データポリシーは変わらない。

## 10.2 UIガード

AWS Management Consoleの操作再現を阻害しない位置に、Lab固有の識別表示を常時行う。

```text
TRAINING / LAB ENVIRONMENT
本環境に機密情報・個人情報・本番認証情報を保存しないでください。
Snapshotは学習継続用の期限付き保存であり、業務データ保管用途ではありません。
```

S3 Upload、Secrets Manager、Parameter Store、Lambda Code等、機微データ投入可能性が高い画面では追加警告を表示する。

## 10.3 Snapshot Security

Snapshot は禁止データが投入されていないことを前提とするが、実際には S3 object、Secret、Function code 等を含み得るため、機微性のある保存物として保護する。

- 専用Bucket
- SSE-KMS
- 最小権限IAM
- owner分離
- retention / Lifecycle
- payloadのAuditログ出力禁止
- 管理者による直接downloadを標準運用にしない
- 削除失敗監視

## 10.4 DLP補助

将来、BFFを通過する入力について以下の補助検知を検討する。

- AWS Access Key形式
- PEM Private Key
- 一般的なSecret pattern

DLPで完全防止できるとは扱わず、警告・ブロックの補助機能とする。

## 10.5 Payload logging

Application access log / AuditではBodyを標準出力しない。

禁止例:

- PutObject body
- SecretString
- Lambda source
- DB records
- Snapshot payload
- Authorization header
- Cookie

## 11. Audit 設計

Auditは「誰が、どのLabで、何を、どのリソースへ、結果どうなったか」を記録する。

### 記録例

```text
2026-10-05T16:00:00+09:00
user=u-001
lab=lab-123
service=s3
action=CreateBucket
resource=training-assets
result=SUCCESS
```

Snapshot関連では以下も記録する。

- Suspend requested / completed / failed
- Snapshot created / expired / deleted
- Resume requested / completed / failed
- 管理者によるSnapshot削除

BFF / Control Plane側Auditを運用上の正とする。

MiniStack側の内部ログ・CloudTrail互換機能は診断補助として扱う。

## 12. Quota 設計

最低限以下を制御可能とする。

- User単位同時Lab数
- Lab TTL
- Idle timeout
- CPU
- Memory
- Ephemeral Storage
- API Rate
- サービス別Resource Count
- User単位Snapshot数
- Snapshot総容量
- Snapshot retention days

Quota超過時はAWS風エラーを無理に再現するより、Lab Platformの制限であることを明示する。

```text
Lab quota exceeded: maximum 10 EC2 instances in this Lab.
Snapshot quota exceeded: maximum 3 saved Labs.
```

## 13. UI基本設計

## 13.1 UI再現方針

AWS Management Console の現行画面をサービスUIの正とする。

画面設計時は各サービスについて実 AWS Management Console を確認し、以下を可能な限り一致させる。

- グローバルナビゲーションとサービス内ナビゲーション
- 一覧、詳細、作成、編集、削除の画面構成
- タブ名称とタブ順
- 設定セクション名称と表示順
- フォーム項目、選択肢、既定値
- 主要ボタンの意味と操作順序
- リソース作成ウィザードのステップ
- 確認画面・確認ダイアログ
- リソース作成後に確認する画面への導線

UI実装の評価基準は「独自UIとして分かりやすいか」ではなく、「Labで覚えた操作を実 AWS Management Console で再現できるか」を第一とする。

Lab固有機能は、AWS Console操作との混同を避けるため識別可能な補助領域として追加する。

- Training / Lab 表示
- Lab TTL
- Suspend / Resume
- Reset / Stop Lab
- Snapshot期限
- Quota
- Compatibility / Known differences

## 13.2 共通レイアウト

共通レイアウトも AWS Management Console の利用体験を基準に設計する。ただし Lab 固有の状態・安全表示を追加する。

```text
┌────────────────────────────────────────────────────┐
│ AWS Internal Lab  Region  Lab Status  [Suspend]    │
├──────────────┬─────────────────────────────────────┤
│ AWS Consoleに対応したナビゲーション                │
│              │ Service Console                     │
│              │                                     │
├──────────────┴─────────────────────────────────────┤
│ TRAINING / expires in xx:xx / snapshot: yyyy-mm-dd │
└────────────────────────────────────────────────────┘
```

実装時には上記概念図そのものではなく、対象時点の AWS Management Console の構造を参照して具体化する。

## 13.3 主要画面

初期の画面群は以下とする。

1. Login / SSO callback
2. Home / Lab Dashboard
3. Start Lab
4. Saved Labs / Snapshot一覧
5. AWS Management Console相当のService Catalog / Service navigation
6. Service Console
7. Lab Settings / Status
8. Compatibility Information
9. Operator - Active Labs / Suspended Labs
10. Operator - Lab Detail
11. Admin - Service Capability / Quota / Snapshot Policy

## 13.4 AWS Management Consoleとの差分管理

実AWSとの差分は「独自デザイン」として積極的に作るのではなく、以下の場合に限定する。

- Lab固有の安全表示・管理機能を追加する場合
- MiniStack / Internal Emulator が機能を再現できない場合
- セキュリティ上、実AWSと同じ操作を許可できない場合
- 正式な法務・知財レビューで利用方法の調整が必要となった場合

Suspend / Resume / Snapshot はLab固有機能であり、AWS Console再現部分と視覚的に区別する。

差分が学習操作に影響する場合は Service Compatibility Matrix に記録し、利用者から確認可能とする。

AWS Management Consoleの変更は定期的に確認し、学習上重要な画面変更へ追従する。

## 13.5 UIリファレンス管理

サービス画面ごとに最低限以下を管理する。

- 対象AWSサービス
- 参照したAWS Management Console画面
- 確認日
- 実装対象操作
- 再現済み画面・導線
- 意図的な差分
- 未対応項目

スクリーンショット等の保存・共有方法は社内ルールおよび法務・知財レビュー結果に従う。

## 13.6 知財を考慮したUI実装方式

UIは reference-based reimplementation とする。

1. 現行AWS Management Consoleを操作し、学習上必要な画面、項目、順序、状態遷移を仕様化する。
2. AWS ConsoleのHTML、CSS、JavaScript、DOM、画像、SVG等はコピーせず、自社のUIコンポーネントで実装する。
3. AWS仕様に由来するサービス名、リソース名、設定項目名、選択肢、既定値、操作順序は学習整合性のため再現する。
4. AWS固有のブランド配色、フォント、グラフィック、製品アイコンを組み合わせたtrade dressは実装要件に含めない。
5. AWSの説明文、ヘルプ文、長文エラー等は原則自社文言とする。
6. 実AWS Consoleとの操作手順比較と、知財チェックを同じUIレビュー工程で実施する。

Lab共通Header等には、AWS公式サービスとの誤認を避けるため、社内学習用LabでありAWSが提供・承認・運営するサービスではない旨を識別可能に表示する。

詳細ルールは `04_ip_guidelines.md` を正とする。

## 14. API基本設計

APIは概念上以下の区分に分ける。

### Lab API

```text
POST   /api/labs
GET    /api/labs/{labId}
POST   /api/labs/{labId}/reset
POST   /api/labs/{labId}/suspend
POST   /api/labs/{labId}/resume
DELETE /api/labs/{labId}
```

### Snapshot API

```text
GET    /api/lab-snapshots
GET    /api/lab-snapshots/{snapshotId}
POST   /api/lab-snapshots/{snapshotId}/resume
DELETE /api/lab-snapshots/{snapshotId}
```

利用者へ Snapshot object の直接download APIは提供しない。

### Service API

```text
GET    /api/labs/{labId}/services
GET    /api/labs/{labId}/services/{serviceCode}/capabilities
```

サービス固有API例:

```text
GET    /api/labs/{labId}/s3/buckets
POST   /api/labs/{labId}/s3/buckets
GET    /api/labs/{labId}/s3/buckets/{bucket}
DELETE /api/labs/{labId}/s3/buckets/{bucket}
```

各Service APIはAdapterへ委譲する。

### Operator API

```text
GET    /api/admin/labs
GET    /api/admin/labs/{labId}
POST   /api/admin/labs/{labId}/terminate
GET    /api/admin/snapshots
DELETE /api/admin/snapshots/{snapshotId}
```

### Configuration API

```text
GET    /api/admin/services
PUT    /api/admin/services/{serviceCode}
GET    /api/admin/quotas
PUT    /api/admin/quotas/{id}
GET    /api/admin/snapshot-policy
PUT    /api/admin/snapshot-policy
```

## 15. エラー設計

Platform固有エラーとAWS Emulator由来エラーを区別する。

### PlatformError

例:

- LAB_NOT_READY
- LAB_EXPIRED
- LAB_ACCESS_DENIED
- LAB_QUOTA_EXCEEDED
- SERVICE_DISABLED
- SERVICE_NOT_SUPPORTED
- RUNTIME_UNAVAILABLE
- SNAPSHOT_NOT_FOUND
- SNAPSHOT_EXPIRED
- SNAPSHOT_QUOTA_EXCEEDED
- SNAPSHOT_INCOMPATIBLE
- SNAPSHOT_CREATE_FAILED
- SNAPSHOT_RESTORE_FAILED

### ProviderError

MiniStack/AWS SDK由来のエラーは、機微情報を除去したうえで利用者へ表示可能な内容を返す。

内部endpoint、container ID、Snapshot S3 path、AWS account管理情報等をそのまま表示しない。

可能な場合は AWS Management Console が表示するエラーコード・意味との対応を保ち、実AWSでのトラブルシュート学習を阻害しないことを優先する。

## 16. 監視設計

### Platform

監視対象:

- Web/API 5xx
- ALB health
- Aurora connections / errors
- Lab provisioning failures
- Lab count
- Lab startup duration
- Suspend / Resume duration
- Snapshot creation / restore failures
- Snapshot storage bytes / count
- Snapshot expiration deletion failures
- Forced termination count
- Audit write failures

### Runtime

- ECS Task health
- CPU
- Memory
- ephemeral storage
- MiniStack health endpoint
- Advanced EC2 health

## 17. 障害時動作

### MiniStack crash

- LabSessionをfailedへ遷移
- Userへ再起動/Resetを案内
- 他Labへ影響させない
- 既存Snapshotがある場合はそのSnapshotを破壊しない

### Snapshot作成失敗

- LabSessionを `snapshot_failed` または ready に戻す
- 既存Runtimeを可能な限り維持する
- 不完全なS3 objectはcleanup対象とする
- available状態になっていないSnapshotをResume対象にしない

### Resume失敗

- LabSessionを `restore_failed` とする
- 新規Runtimeをcleanupする
- 元Snapshotは保持する
- 再試行可能とする

### BFF停止

- ECS Serviceで復旧
- Lab Runtimeは即時削除しない
- 復旧後reconcile

### Aurora障害

Control Plane操作を停止し、Lab新規作成・Suspend・Resumeを抑止する。

既存Labを利用継続させるかは詳細設計で決定するが、Audit不能状態での変更操作継続は避ける方向とする。

### Advanced Worker異常

WorkerまたはEC2ごと隔離・破棄できることを優先する。

## 18. セキュリティレビュー論点

正式展開前に以下をレビュー対象とする。

1. 利用者データが存在し得る場所の一覧
2. Lab終了時の破棄保証範囲
3. Snapshotに保存され得るデータと保存期間
4. Snapshot Bucket / KMS / IAM / Lifecycle
5. ECS/EC2管理者がLabデータ・Snapshotへアクセス可能な範囲
6. CloudWatch Logs等への機微データ流出防止
7. Labからのegress
8. Advanced Workerのcontainer runtime権限
9. IAM Role / IMDS経由で実AWS Credentialを取得できないこと
10. SBOM / OSS License
11. AWS Management Consoleの画面・操作再現に伴う商標・著作物・ブランド資産の利用範囲
12. AWSロゴ、配色、フォント、グラフィック、製品アイコン等を直接コピーしていないこと
13. AWS ConsoleのHTML/CSS/JavaScript/画像等を直接流用していないこと
14. AWS公式サービスとの誤認防止表示
15. AWS Consoleスクリーンショットの社内参照方法と保存範囲
16. Audit保存期間と閲覧権限
17. Incident時の責任分界と利用規約

## 19. 段階リリース

### Phase 0: Technical Validation

- MiniStack version固定
- ECS/Fargate上での起動検証
- Network隔離検証
- S3/IAM/DynamoDB/SQS等の代表API検証
- `PERSIST_STATE` / `S3_PERSIST` を用いた状態保存・復元検証
- Fargate ephemeral storage → S3 Snapshot → 新Task restoreのPoC
- 代表サービスのAWS Management Console実画面・操作フロー調査
- UI再現方式の知財チェック
- License/SBOM確認

### Phase 1: Standard Lab MVP

- SSO
- Lab lifecycle
- Service Catalog
- Standard Lab
- Suspend / Resume
- Snapshot Store / KMS / retention
- S3/IAM/DynamoDB/SQS等の複数Console
- 実AWS Management Consoleとの主要操作導線比較
- Quota
- TTL
- Audit
- Operator kill switch

### Phase 2: Service Expansion

- 対象サービスを順次拡大
- Compatibility Matrix自動テスト
- Snapshot対応Matrix拡充
- L1 Control Plane UI拡充
- AWS Management Console変更追従

### Phase 3: Advanced Lab

- Dedicated EC2 Worker
- Lambda Data Plane
- RDS
- ElastiCache
- ECS/EKS等
- Advanced Lab Snapshot方式検証

### Phase 4: Learning Features

- Challenge
- 採点
- コース
- Troubleshooting Lab
- CLI / IaC
- Snapshot Clone / Template化

## 20. 初期ディレクトリ構成案

```text
aws-internal-lab/
├─ docs/
│  ├─ 01_project_proposal.md
│  ├─ 02_requirements.md
│  ├─ 03_basic_design.md
│  ├─ 04_ip_guidelines.md
│  ├─ service-compatibility.md       # 後続
│  └─ adr/                           # 後続
│
├─ apps/
│  ├─ web/
│  └─ lab-control-plane/
│
├─ packages/
│  ├─ db/
│  ├─ contracts/
│  ├─ service-adapters/
│  ├─ snapshot-provider/
│  └─ ui/
│
├─ infra/
│  └─ aws/
│
├─ emulator/
│  └─ patches/                       # forkが必要になるまで空でもよい
│
└─ tests/
   ├─ integration/
   ├─ compatibility/
   └─ snapshot/
```

実装時の具体的な言語・Framework・IaCツールは実装計画作成時に確定する。

## 21. 未決事項

本基本設計時点で、以下は後続の技術検証または社内基準確認で確定する。

- 社内SSO製品とOIDC連携方式
- AWSアカウント/VPC配置先
- Aurora Serverless v2 / provisioned等の選択
- ECS/Fargateの具体的CPU/Memory値
- Lab TTL / Idle timeout初期値
- Idle timeout時に自動Suspendするか自動破棄するか
- Snapshot retention初期値
- User単位Snapshot数 / 容量Quota
- Snapshot archive形式・圧縮方式
- Snapshot Bucket Versioningの有無
- Snapshot transferをControl Plane側/sidecar側のどちらで行うか
- Advanced Labを1 Lab = 1 EC2とする範囲
- Advanced Lab Snapshot方式
- Audit保存期間
- DLP補助機能の初期導入有無
- 外部通信を許可するサービスの扱い
- AWS Management ConsoleのUI差分確認・更新頻度
- AWSブランド資産・スクリーンショット等の最終的な利用範囲
- UI実装Framework
- IaCツール

これらは企画・要件の変更ではなく、詳細設計・技術検証で決定可能な項目として扱う。ただしAWS Management Consoleの実操作を学べること、およびStandard LabのSuspend/Resumeを提供すること自体は未決事項ではなく、本システムの前提要件とする。

## 22. 参考

- MiniStack: https://ministack.org/
- MiniStack GitHub: https://github.com/ministackorg/ministack
- MiniStack Services: https://ministack.org/docs/services/
- MiniStack Limitations: https://ministack.org/docs/limitations
- MiniStack Configuration / Persistence: https://ministack.org/docs/configuration
- AWS ECS/Fargate security considerations: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-security-considerations.html
- AWS Trademark Guidelines & License Terms: https://aws.amazon.com/trademark-guidelines/
- AWS Site Terms: https://aws.amazon.com/terms/
- AWS Architecture Icons: https://aws.amazon.com/architecture/icons/
- AWS Internal Lab 知財・ブランド利用ガイドライン: `04_ip_guidelines.md`

## 23. 知財・ブランド設計

### 23.1 設計境界

本サービスでは、AWS Management Consoleの「機能・情報構造・操作順序」と「AWSの視覚・ブランド表現」を別レイヤーとして扱う。

再現対象:

- サービス/リソース概念
- ナビゲーションの論理構造
- タブ、設定セクション、フォーム項目
- 項目順、選択肢、既定値
- 画面遷移
- 作成/変更/削除の操作手順

直接コピーしない対象:

- AWSロゴ、AWS Smile Logo
- AWS固有のブランド配色
- AWS固有フォント
- AWS固有のgraphic design
- AWS Consoleの製品アイコン/ボタンアイコン
- AWS ConsoleのHTML/CSS/JavaScript/DOM
- AWS Consoleから抽出した画像/SVG/sprite等
- AWSの説明文・ヘルプ文章等の長文著作物

### 23.2 誤認防止

共通Header等に、少なくとも以下の趣旨を常時表示する。

```text
社内学習用Lab
AWS Management Consoleの操作学習を目的とした社内環境です。
AWSが提供・承認・運営するサービスではありません。
```

### 23.3 スクリーンショット

AWS Consoleのスクリーンショットは、現行画面との差分確認・社内設計レビューに必要な最小限の範囲でのみ使用する。

- 製品配布物へ恒久同梱しない。
- 公開サイト・営業資料へ流用しない。
- アカウントID、ARN、メールアドレス等の社内/顧客情報を含めない。
- 社外利用が必要となった場合は再レビューする。

### 23.4 UIレビューゲート

サービスUIのレビューでは、機能再現に加えて以下をチェックする。

- AWSロゴの無断利用がないこと
- AWS固有の配色/フォント/グラフィック/製品アイコンをそのままコピーしていないこと
- AWS ConsoleのHTML/CSS/JavaScript/画像を流用していないこと
- AWSの長文説明を転載していないこと
- AWS公式サービスと誤認しないこと
- Lab固有表示が明確であること
- Labで覚えた操作を実AWSで再現できること

詳細は `04_ip_guidelines.md` に従う。