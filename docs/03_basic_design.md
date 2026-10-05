# AWS Internal Lab 基本設計書

- 文書種別: 基本設計書
- 対象: 社内AWS学習・検証基盤
- リポジトリ: `aws-internal-lab`
- 初版日: 2026-10-05
- ステータス: 初版レビュー

## 1. 文書目的

本書は、AWS Internal Lab の初期リリースを実装するための基本設計を定義する。

本システムは、利用者が AWS の各サービス相当のリソースを安全に試せる社内 Lab を提供する。初期フェーズでは課題・採点機能を対象外とし、各サービスの Console UI と Lab 実行基盤を優先する。

## 2. 設計原則

1. 利用者操作を既存業務 AWS 資産から分離する。
2. Lab は使い捨てとし、利用者データの永続保存を前提としない。
3. MiniStack を利用するが、MiniStack 自体をセキュリティ境界として信用しない。
4. Browser から Lab Engine を直接公開しない。
5. Standard Lab と Advanced Lab を分離する。
6. AWS サービスごとの対応差異を Compatibility Matrix で明示する。
7. UI と Emulator Engine は Adapter で分離し、MiniStack の fork や交換を可能にする。
8. 管理データは実 AWS のマネージドサービスへ保存する。
9. 機微データを保持しない設計を優先し、Audit も最小限のメタデータに限定する。
10. AWS Management Console の外観コピーではなく、AWS の概念・情報構造・操作フローを学べる独自 UI とする。

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
              └────────────┘   │
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
| 管理DB | Aurora PostgreSQL | Lab状態・設定・Auditメタデータ |
| オブジェクト保存 | S3 | ドキュメント・成果物・SBOM等 |
| Container Image | ECR | MiniStack imageも社内mirror |
| ログ | CloudWatch Logs | Payload全文は記録しない |
| メトリクス | CloudWatch | Lab稼働数・CPU・Memory等 |
| 暗号鍵 | KMS | Aurora/S3/Logs等 |
| Secret | Secrets Manager / SSM | Platform側Secretのみ |
| DNS | Route 53 | 社内DNS構成に合わせる |

## 4. コンポーネント設計

## 4.1 Web / API / BFF

### 責務

- 社内SSO認証
- 画面配信
- Lab所有者確認
- Service Console API
- Quota / Guardrail適用
- Audit Event生成
- Lab EngineへのProxy/Adapter呼び出し
- 管理者UI

### 設計方針

Browser は MiniStack endpoint を知らない。

すべての操作は以下の経路とする。

```text
Browser
  ↓
BFF / API
  ↓
Service Adapter
  ↓
Lab Engine
```

利用者の AWS API リクエストを無制限に透過Proxyする方式は初期段階では採用しない。Web Console から必要な操作を BFF API として明示的に実装し、許可操作・入力値・Auditを制御可能にする。

## 4.2 Lab Control Plane

### 責務

- Lab作成
- Lab停止
- Labリセット
- TTL管理
- Runtime割当
- Runtime状態監視
- Standard / Advanced Lab判定
- 強制終了

### Lab状態

```text
requested
  ↓
provisioning
  ↓
ready
  ↓
stopping
  ↓
stopped
```

異常系として以下を持つ。

- failed
- expired
- terminated_by_operator

状態遷移は Aurora 側を管理上の正とし、ECS Task / EC2 状態との不整合を定期的に reconcile する。

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
- Lab終了時Task破棄
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

## 5. MiniStack 管理設計

## 5.1 採用方式

- upstream MiniStackを初期ベースとする。
- 採用versionを明示固定する。
- Container image digestを固定する。
- imageは社内ECRへmirrorする。
- Sourceも社内Gitへmirror可能な状態を維持する。

## 5.2 fork 方針

以下の場合に社内forkを作成する。

- 社内セキュリティ制御がupstreamへ適さない。
- 必要AWS APIの実装を社内優先で追加する必要がある。
- Docker依存を減らすmetadata-only mode等を追加する。
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
| lastVerifiedAt | 最終互換確認 |

### 6.2 UI 表示

サービス画面には必要に応じて以下を表示する。

```text
Compatibility
Level 2 - Functional Emulator

Known differences from AWS:
- EC2 instances do not run a real VM in Standard Lab.
- CloudFront does not provide a real edge CDN.
```

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
```

## 7.2 Standard Lab

- Private Subnet
- Public IPなし
- Security GroupはPlatform経由通信のみ許可
- Internet Gateway/NAT経由の任意Outboundは原則許可しない
- ECR、CloudWatch等はVPC Endpoint利用を優先

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
- CloudWatch Logs/Metrics

既存業務S3、DB、Secrets等への汎用権限は付与しない。

## 8.2 Standard Lab Task Role

MiniStack Taskに実AWSの業務リソース操作権限を付与しない。

原則としてRuntime維持に必要な最小権限のみとする。

## 8.3 Advanced Worker Role

Standard Labと完全分離する。

必要権限を限定し、利用者コードからInstance Metadata / AWS Credentialを取得できる可能性も考慮して防御する。

IMDS設定、network namespace、runtime security等は詳細設計で確定する。

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

### ServiceCapability

- serviceCode
- enabled
- maxLevel
- runtimeType
- provider
- knownLimitations
- testedVersion
- lastVerifiedAt

### QuotaPolicy

- id
- scope
- maxConcurrentLabs
- ttlSeconds
- cpuLimit
- memoryLimit
- storageLimit
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

Platform S3には以下を保存可能とする。

- SBOM
- License reports
- Documentation assets
- Compatibility test artifacts
- Exportした非機微な診断情報

利用者がLab内へ投入したS3 Object等を自動同期しない。

## 9.3 Labデータ

Lab Runtime内部のみで保持し、原則Lab終了時に破棄する。

永続化機能を提供する場合は将来の別機能として設計し、本初期設計では保証しない。

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

## 10.2 UIガード

Lab Header等に常時以下の趣旨を表示する。

```text
TRAINING / LAB ENVIRONMENT
本環境に機密情報・個人情報・本番認証情報を保存しないでください。
Labデータは保存を保証しません。
```

S3 Upload、Secrets Manager、Parameter Store、Lambda Code等、機微データ投入可能性が高い画面では追加警告を表示する。

## 10.3 DLP補助

将来、BFFを通過する入力について以下の補助検知を検討する。

- AWS Access Key形式
- PEM Private Key
- 一般的なSecret pattern

DLPで完全防止できるとは扱わず、警告・ブロックの補助機能とする。

## 10.4 Payload logging

Application access log / AuditではBodyを標準出力しない。

禁止例:

- PutObject body
- SecretString
- Lambda source
- DB records
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

BFF側Auditを運用上の正とする。

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

Quota超過時はAWS風エラーを無理に再現するより、Lab Platformの制限であることを明示する。

```text
Lab quota exceeded: maximum 10 EC2 instances in this Lab.
```

## 13. UI基本設計

## 13.1 共通レイアウト

```text
┌────────────────────────────────────────────┐
│ AWS Internal Lab   Region   Lab Status     │
├──────────────┬─────────────────────────────┤
│ Services     │                             │
│              │ Service Console             │
│ S3           │                             │
│ EC2          │                             │
│ IAM          │                             │
│ RDS          │                             │
│ ...          │                             │
├──────────────┴─────────────────────────────┤
│ TRAINING ENVIRONMENT / expires in xx:xx    │
└────────────────────────────────────────────┘
```

## 13.2 主要画面

初期の画面群は以下とする。

1. Login / SSO callback
2. Home / Lab Dashboard
3. Start Lab
4. Service Catalog
5. Service Console
6. Lab Settings / Status
7. Compatibility Information
8. Operator - Active Labs
9. Operator - Lab Detail
10. Admin - Service Capability / Quota

## 13.3 AWSらしさの範囲

再現するもの:

- サービス概念
- リソース名称
- 設定項目
- リソース関係
- 操作順序

直接コピーしないもの:

- AWS UI配色
- AWS独自アイコンセット
- Consoleのピクセルレイアウト
- AWSロゴの不適切な利用

## 14. API基本設計

APIは概念上以下の区分に分ける。

### Lab API

```text
POST   /api/labs
GET    /api/labs/{labId}
POST   /api/labs/{labId}/reset
DELETE /api/labs/{labId}
```

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
```

### Configuration API

```text
GET    /api/admin/services
PUT    /api/admin/services/{serviceCode}
GET    /api/admin/quotas
PUT    /api/admin/quotas/{id}
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

### ProviderError

MiniStack/AWS SDK由来のエラーは、機微情報を除去したうえで利用者へ表示可能な内容を返す。

内部endpoint、container ID、AWS account管理情報等をそのまま表示しない。

## 16. 監視設計

### Platform

監視対象:

- Web/API 5xx
- ALB health
- Aurora connections / errors
- Lab provisioning failures
- Lab count
- Lab startup duration
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

### BFF停止

- ECS Serviceで復旧
- Lab Runtimeは即時削除しない
- 復旧後reconcile

### Aurora障害

Control Plane操作を停止し、Lab新規作成を抑止する。

既存Labを利用継続させるかは詳細設計で決定するが、Audit不能状態での変更操作継続は避ける方向とする。

### Advanced Worker異常

WorkerまたはEC2ごと隔離・破棄できることを優先する。

## 18. セキュリティレビュー論点

正式展開前に以下をレビュー対象とする。

1. 利用者データが存在し得る場所の一覧
2. Lab終了時の破棄保証範囲
3. ECS/EC2管理者がLabデータへアクセス可能な範囲
4. CloudWatch Logs等への機微データ流出防止
5. Labからのegress
6. Advanced Workerのcontainer runtime権限
7. IAM Role / IMDS経由で実AWS Credentialを取得できないこと
8. SBOM / OSS License
9. AWS商標・画面デザイン利用範囲
10. Audit保存期間と閲覧権限
11. Incident時の責任分界と利用規約

## 19. 段階リリース

### Phase 0: Technical Validation

- MiniStack version固定
- ECS/Fargate上での起動検証
- Network隔離検証
- S3/IAM/DynamoDB/SQS等の代表API検証
- License/SBOM確認

### Phase 1: Standard Lab MVP

- SSO
- Lab lifecycle
- Service Catalog
- Standard Lab
- S3/IAM/DynamoDB/SQS等の複数Console
- Quota
- TTL
- Audit
- Operator kill switch

### Phase 2: Service Expansion

- 対象サービスを順次拡大
- Compatibility Matrix自動テスト
- L1 Control Plane UI拡充

### Phase 3: Advanced Lab

- Dedicated EC2 Worker
- Lambda Data Plane
- RDS
- ElastiCache
- ECS/EKS等

### Phase 4: Learning Features

- Challenge
- 採点
- コース
- Troubleshooting Lab
- CLI / IaC

## 20. 初期ディレクトリ構成案

```text
aws-internal-lab/
├─ docs/
│  ├─ 01_project_proposal.md
│  ├─ 02_requirements.md
│  ├─ 03_basic_design.md
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
   └─ compatibility/
```

実装時の具体的な言語・Framework・IaCツールは実装計画作成時に確定する。

## 21. 未決事項

本基本設計時点で、以下は後続の技術検証または社内基準確認で確定する。

- 社内SSO製品とOIDC連携方式
- AWSアカウント/VPC配置先
- Aurora Serverless v2 / provisioned等の選択
- ECS/Fargateの具体的CPU/Memory値
- Lab TTL / Idle timeout初期値
- Advanced Labを1 Lab = 1 EC2とする範囲
- Audit保存期間
- DLP補助機能の初期導入有無
- 外部通信を許可するサービスの扱い
- UI実装Framework
- IaCツール

これらは企画・要件の変更ではなく、詳細設計・技術検証で決定可能な項目として扱う。

## 22. 参考

- MiniStack: https://ministack.org/
- MiniStack GitHub: https://github.com/ministackorg/ministack
- MiniStack Services: https://ministack.org/docs/services/
- MiniStack Limitations: https://ministack.org/docs/limitations
- MiniStack Configuration: https://ministack.org/docs/configuration
- AWS ECS/Fargate security considerations: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-security-considerations.html
