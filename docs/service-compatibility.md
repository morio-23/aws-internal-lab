# AWS Internal Lab サービス互換性・提供レイヤーマトリクス

- 文書種別: Service Compatibility Matrix
- 対象: 社内AWS学習・検証基盤
- リポジトリ: `aws-internal-lab`
- 基準日: 2026-10-07
- ステータス: Draft v0.1
- AWS母集団: AWS General Reference `Service endpoints and quotas` 掲載サービス
- MiniStack基準: 公式Services catalog / `SERVICE_REGISTRY`（2026-10-07確認）

## 1. 目的

本書は、AWS Internal Lab が対象とする現行AWSサービスについて、どの学習レイヤーまで提供するか、Standard / Advanced のどのRuntimeで扱うか、MiniStackで現在利用可能か、Snapshot/Resumeをどの程度提供できるかを一元管理する正本である。

企画上の「可能な限り全AWSサービスを対象とする」を、サービス単位の実装計画へ落とすために使用する。

## 2. 母集団

2026-10-07時点の AWS General Reference `Service endpoints and quotas` 掲載項目を母集団とする。

- AWSサービス/関連サービス数: **269**
- R / Reference: **8**
- L1: **17**
- L2: **200**
- L3: **44**
- MiniStackに直接/間接マッピング可能なAWSサービス項目: **71**

AWSの製品ページにはサービス以外のプログラム、ツール、Decision Guide等も存在するため、「現行全サービス」の機械的な基準としてendpoint/quota一覧を採用する。AWS側でサービス追加・名称変更・廃止があった場合、本表を更新する。

## 3. レイヤー定義

| Layer | 定義 | Labで提供するもの |
| --- | --- | --- |
| R | Reference | 契約・人的サービス・portalそのもの等。概要・操作説明は対象にできるが、AWS resource emulatorは提供しない |
| L1 | Console / Control Plane | 実AWS Consoleを基準に、resource作成・設定・関連付け・更新・削除等の操作を学習できる |
| L2 | Functional Emulator | AWS API、主要なservice behavior、service間連携、data operationを安全なemulatorで実行できる |
| L3 | Executable Data Plane | DB、container、code、stream processor等の実行backendまで動かす。任意コード/高権限実行はAdvanced隔離を原則とする |

**Target Layerは最終到達目標**であり、現在の実装済みレベルを意味しない。

## 4. Runtime定義

| Runtime | 方針 |
| --- | --- |
| Standard | ECS/Fargate等。Docker socket/privilegedを利用せず、metadata/control-plane/安全なfunctional emulatorを提供 |
| Hybrid | 通常はStandard。L3が必要なLabはSnapshotを介して共有EC2 Worker Pool上のLab専用microVMへ昇格 |
| Reference | emulator runtimeなし |

Advanced Runtimeは共有EC2 Worker Pool上に配置する。ただしtenant境界はEC2 HostではなくLab専用microVMとし、`1 Advanced Lab = 1 microVM` とする。異なるLabのDocker workloadをHost kernel上へ直接混在させない。

## 5. MiniStack列の意味

`MiniStack Current` は、MiniStackにサービス相当のhandler/API surfaceが存在するかを示すだけで、AWS完全互換を意味しない。

| 値 | 意味 |
| --- | --- |
| Yes | 現行MiniStackのregistryまたは対応moduleに直接mappingできる |
| Yes (EC2 module) | VPC/EBS等、EC2 module内のsurfaceとして実装 |
| Partial (...) | AWSサービス全体ではなく一部surfaceのみ |
| Indirect | 専用handlerはないが、MiniStackの複数サービスを組み合わせて主要ユースケースを構成可能 |
| No | 現行MiniStackに直接対応なし。Internal ProviderでL1から補完予定 |
| N/A | resource emulatorの対象外 |

MiniStack公式は60+サービスを掲げるが、完全実装、部分実装、metadata-only、real backend依存が混在する。提供開始前に各サービスのoperation coverageとknown limitationsを再検証する。

## 6. Snapshot列の意味

| 値 | 意味 |
| --- | --- |
| Full | Standard RuntimeのstateとしてSnapshot/Resume対象にできる設計 |
| Partial | L3の外部runtime/container/DB/filesystem等を含むため、control-plane stateは保存できてもdata plane完全復元は個別設計が必要 |
| N/A | resource emulator対象外 |

Snapshotは機密情報等が混入し得るUntrusted User Dataとして扱い、`05_incident_guardrails.md` に従う。

## 7. 優先度

| Priority | 意味 |
| --- | --- |
| P0 | Lab基盤成立に必要な主要AWSサービス。先行実装・検証 |
| P1 | MiniStackで既にsurfaceがあり、比較的早期に拡張可能 |
| P2 | Internal ProviderによるL1/L2追加を順次実施 |
| P3 | 物理設備、外部SaaS/契約、人的サービス、特殊用途等。後順位またはReference中心 |

## 8. 全AWSサービスマトリクス

> 注意: 本表の `Target` はAWS Internal Labとしての設計目標。MiniStackの現在の完全互換性を表すものではない。

| AWS Service | Target | Runtime | Provider | MiniStack Current | Snapshot | Priority | 方針 / 主な差異 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Amazon AI Operations | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Amplify | L2 | Standard | MiniStack+Internal | Indirect | Full | P1 | MiniStackにAmplify専用handlerはないが、Cognito/AppSync/S3/Lambda等の基盤サービス経由でGen2系を部分利用可能。 |
| API Gateway | L2 | Standard | MiniStack | Yes | Full | P0 | MiniStack handlerあり。提供前にoperation coverage/known limitationsをservice単位で検証。 |
| AWS AppConfig | L2 | Standard | MiniStack | Yes | Full | P1 | MiniStack handlerあり。提供前にoperation coverage/known limitationsをservice単位で検証。 |
| AppFabric | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| ARC | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| App Mesh | L1 | Standard | Internal | No | Full | P2 | Internal metadata/control-plane simulatorでL1を提供。 |
| App Runner | L3 | Hybrid | Internal | No | Partial | P2 | まずInternal L1/L2を実装。L3は隔離したAdvanced runtimeまたは安全な代替実装を追加。 |
| Amazon AppFlow | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Application Auto Scaling | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Application Discovery Service | L1 | Standard | Internal | No | Full | P2 | Internal metadata/control-plane simulatorでL1を提供。 |
| MGN | L1 | Standard | Internal | No | Full | P2 | Internal metadata/control-plane simulatorでL1を提供。 |
| WorkSpaces Applications | L1 | Standard | Internal | No | Full | P3 | Internal metadata/control-plane simulatorでL1を提供。 |
| AWS App Studio | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| AWS AppSync | L2 | Standard | MiniStack | Yes | Full | P0 | MiniStackはGraphQL data planeをbest-effort実装。VTL等に差異あり。 |
| Athena | L2 | Standard | MiniStack | Yes | Full | P1 | MiniStackはDuckDB利用でS3データへのSQL実行が可能。Glue連携は限定的。 |
| Audit Manager | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Amazon A2I | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Aurora | L3 | Hybrid | Internal | No | Partial | P2 | まずInternal L1/L2を実装。L3は隔離したAdvanced runtimeまたは安全な代替実装を追加。 |
| Aurora DSQL | L3 | Hybrid | MiniStack | Yes | Partial | P1 | MiniStackはcontrol-plane、optional Postgres backendあり。L3はAdvanced。 |
| AWS Auto Scaling | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| AWS MCP Server | R | Reference | Reference | N/A | N/A | P3 | AWS提供MCP server自体はLab resource emulator対象外。必要に応じ利用方法を教材化。 |
| B2B Data Interchange | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| AWS Backup | L2 | Standard | MiniStack | Yes | Full | P0 | MiniStack handlerあり。提供前にoperation coverage/known limitationsをservice単位で検証。 |
| AWS Batch | L3 | Hybrid | MiniStack | Yes | Partial | P1 | MiniStackはcontrol-plane中心でSubmitJobは実computeを必ずしも実行しない。 |
| Amazon Bedrock | L2 | Standard | MiniStack | Yes | Full | P1 | MiniStackはBedrock API surfaceを持ち、local model proxy等が可能。外部モデル接続はegress審査対象。 |
| Amazon Bedrock AgentCore | L2 | Standard | MiniStack | Yes | Full | P1 | MiniStack handlerあり。対応operationと実AWS差異を実装前に再検証。 |
| Billing and Cost Management | L2 | Standard | MiniStack | Partial (Budgets/CUR) | Full | P1 | MiniStackはBudgets/CUR等の一部surfaceのみ。実課金・usage集計は再現しない。 |
| AWS Billing Conductor | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Braket | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| AWS Certificate Manager | L2 | Standard | MiniStack | Yes | Full | P1 | MiniStackはcertificateを自動ISSUED。実DNS/HTTP validationは行わない。 |
| Amazon Chime | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Amazon Chime SDK | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| AWS Clean Rooms | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| AWS Clean Rooms ML | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Cloud Control API | L2 | Standard | MiniStack | Yes | Full | P1 | MiniStack handlerあり。提供前にoperation coverage/known limitationsをservice単位で検証。 |
| AWS Cloud9 | L3 | Hybrid | Internal | No | Partial | P2 | まずInternal L1/L2を実装。L3は隔離したAdvanced runtimeまたは安全な代替実装を追加。 |
| Cloud Directory | L1 | Standard | Internal | No | Full | P2 | Internal metadata/control-plane simulatorでL1を提供。 |
| Cloud WAN | L1 | Standard | Internal | No | Full | P2 | Internal metadata/control-plane simulatorでL1を提供。 |
| CloudFormation | L2 | Standard | MiniStack | Yes | Full | P0 | MiniStack handlerあり。提供前にoperation coverage/known limitationsをservice単位で検証。 |
| CloudFront | L2 | Standard | MiniStack | Yes | Full | P1 | MiniStackでdistribution/viewer pathは扱えるが、実Edge CDN/caching/geo等は再現しない。 |
| AWS CloudHSM | L1 | Standard | Internal | No | Full | P3 | Internal metadata/control-plane simulatorでL1を提供。 |
| AWS Cloud Map | L2 | Standard | MiniStack | Yes | Full | P1 | MiniStack handlerあり。提供前にoperation coverage/known limitationsをservice単位で検証。 |
| Amazon CloudSearch | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| CloudShell | L3 | Hybrid | Internal | No | Partial | P2 | まずInternal L1/L2を実装。L3は隔離したAdvanced runtimeまたは安全な代替実装を追加。 |
| Amazon CodeCatalyst | L1 | Standard | Internal | No | Full | P2 | Internal metadata/control-plane simulatorでL1を提供。 |
| AWS Control Catalog | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| CloudTrail | L2 | Standard | MiniStack | Yes | Full | P0 | MiniStack handlerあり。提供前にoperation coverage/known limitationsをservice単位で検証。 |
| CloudWatch | L2 | Standard | MiniStack | Yes | Full | P0 | 一部metrics/action連携は実AWSとの差異あり。学習対象ごとに互換確認する。 |
| CloudWatch Application Insights | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| CloudWatch Application Signals | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| CloudWatch Events | L2 | Standard | MiniStack | Yes | Full | P1 | MiniStack handlerあり。提供前にoperation coverage/known limitationsをservice単位で検証。 |
| CloudWatch Internet Monitor | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| CloudWatch Logs | L2 | Standard | MiniStack | Yes | Full | P0 | MiniStack handlerあり。提供前にoperation coverage/known limitationsをservice単位で検証。 |
| CloudWatch Network Synthetic Monitor | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| CloudWatch OAM | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| CloudWatch Observability Admin | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| CloudWatch RUM | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| CloudWatch Synthetics | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| CodeArtifact | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| CodeBuild | L3 | Hybrid | MiniStack | Yes | Partial | P1 | control-planeはStandard、real build executionは任意コード実行のためAdvanced。 |
| CodeCommit | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| CodeConnections | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| CodeDeploy | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| CodeGuru Profiler | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| CodeGuru Reviewer | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| CodeGuru Security | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| CodePipeline | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| AWS CodeStar Connections | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| AWS CodeStar Notifications | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Amazon Cognito | L2 | Standard | MiniStack | Yes | Full | P0 | MiniStackでUser Pool/Identity Pool/JWT/OAuth flowを利用可能。issuer差異を検証。 |
| Amazon Comprehend | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Amazon Comprehend Medical | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Compute Optimizer | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| AWS Config | L2 | Standard | MiniStack | Yes | Full | P0 | MiniStack handlerあり。提供前にoperation coverage/known limitationsをservice単位で検証。 |
| Connect Customer | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Connect Health | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| AWS Control Tower | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| AWS Data Exchange | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Amazon DataZone | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Amazon Data Lifecycle Manager | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| AWS Data Pipeline | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| DataSync | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| AWS DMS | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| AWS Deadline Cloud | L3 | Hybrid | Internal | No | Partial | P2 | まずInternal L1/L2を実装。L3は隔離したAdvanced runtimeまたは安全な代替実装を追加。 |
| AWS DeepRacer | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Detective | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| DevOps Guru | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Device Farm | L2 | Standard | Internal | No | Full | P3 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| AWS Direct Connect | L1 | Standard | Internal | No | Full | P3 | Internal metadata/control-plane simulatorでL1を提供。 |
| Directory Service | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Amazon DocumentDB | L3 | Hybrid | Internal | No | Partial | P2 | まずInternal L1/L2を実装。L3は隔離したAdvanced runtimeまたは安全な代替実装を追加。 |
| DynamoDB | L2 | Standard | MiniStack | Yes | Full | P0 | MiniStackのtable/item/query/scan/TTL/transaction等を利用。Snapshotにitem dataを含み得る。 |
| Elastic Beanstalk | L3 | Hybrid | Internal | No | Partial | P2 | まずInternal L1/L2を実装。L3は隔離したAdvanced runtimeまたは安全な代替実装を追加。 |
| Amazon EBS | L2 | Standard | MiniStack | Yes (EC2 module) | Full | P0 | MiniStack EC2系でvolume metadataを扱う。実block device相当は別途検討。 |
| Amazon EC2 | L3 | Hybrid | MiniStack | Yes | Partial | P0 | MiniStackは既定でmetadata/control-plane。実Instanceはcontainer-backed opt-inのためL3はAdvanced扱い。 |
| Amazon EC2 Auto Scaling | L3 | Hybrid | MiniStack | Yes | Partial | P0 | MiniStack handlerあり。L3 data planeはAdvanced隔離で提供可否を個別検証。 |
| EC2 Image Builder | L1 | Standard | Internal | No | Full | P2 | Internal metadata/control-plane simulatorでL1を提供。 |
| EC2 Instance Connect | L1 | Standard | Internal | No | Full | P2 | Internal metadata/control-plane simulatorでL1を提供。 |
| Amazon ECR | L2 | Standard | MiniStack | Yes | Full | P0 | MiniStack handlerあり。提供前にoperation coverage/known limitationsをservice単位で検証。 |
| Amazon ECR Public | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Amazon ECS | L3 | Hybrid | MiniStack | Yes | Partial | P0 | MiniStackはhost Docker daemonでreal tasksを実行。Advanced限定。 |
| Amazon EKS | L3 | Hybrid | MiniStack | Yes | Partial | P0 | MiniStackはk3s sidecarを利用。Advanced限定でAWS EKSとの完全同一性はない。 |
| Amazon EFS | L3 | Hybrid | MiniStack | Yes | Partial | P1 | MiniStackはfile system/mount target等のmetadata中心。実NFS/POSIX data planeは未再現。 |
| Elastic Load Balancing | L2 | Standard | MiniStack | Yes | Full | P0 | MiniStack handlerあり。提供前にoperation coverage/known limitationsをservice単位で検証。 |
| Elastic Disaster Recovery | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| ElastiCache | L3 | Hybrid | MiniStack | Yes | Partial | P0 | MiniStackはRedis/Memcached/Valkey系containerを利用。L3はAdvanced。 |
| Elemental Inference | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Amazon MemoryDB | L3 | Hybrid | Internal | No | Partial | P2 | まずInternal L1/L2を実装。L3は隔離したAdvanced runtimeまたは安全な代替実装を追加。 |
| AWS Entity Resolution | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| AWS End User Messaging | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Amazon EMR | L2 | Standard | MiniStack | Yes | Full | P1 | MiniStackはcluster/step metadata中心。実Spark/Hadoop実行は現状対象外。 |
| EventBridge | L2 | Standard | MiniStack | Yes | Full | P0 | API Destination等の外部送信機能はLab egress policyにより既定無効化。 |
| EventBridge Pipes | L2 | Standard | MiniStack | Yes | Full | P0 | MiniStackは一部source/targetのみ実delivery。その他はstored-onlyの場合あり。 |
| EventBridge Scheduler | L2 | Standard | MiniStack | Yes | Full | P0 | MiniStack handlerあり。提供前にoperation coverage/known limitationsをservice単位で検証。 |
| EventBridge Schemas | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Amazon EVS | L1 | Standard | Internal | No | Full | P3 | Internal metadata/control-plane simulatorでL1を提供。 |
| FinSpace | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| AWS FIS | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Firehose | L2 | Standard | MiniStack | Yes | Full | P1 | MiniStack handlerあり。提供前にoperation coverage/known limitationsをservice単位で検証。 |
| Firewall Manager | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Forecast | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Amazon Fraud Detector | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| FreeRTOS | L1 | Standard | Internal | No | Full | P3 | Internal metadata/control-plane simulatorでL1を提供。 |
| Amazon FSx | L3 | Hybrid | Internal | No | Partial | P2 | まずInternal L1/L2を実装。L3は隔離したAdvanced runtimeまたは安全な代替実装を追加。 |
| Amazon GameLift Servers | L3 | Hybrid | Internal | No | Partial | P2 | まずInternal L1/L2を実装。L3は隔離したAdvanced runtimeまたは安全な代替実装を追加。 |
| Amazon GameLift Streams | L3 | Hybrid | Internal | No | Partial | P2 | まずInternal L1/L2を実装。L3は隔離したAdvanced runtimeまたは安全な代替実装を追加。 |
| Global Accelerator | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Global Networks for Transit Gateways | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| AWS Glue | L3 | Hybrid | MiniStack | Yes | Partial | P1 | Catalog/Crawlerに加えjob実行あり。Spark/Docker系はAdvanced扱い。 |
| DataBrew | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Amazon Managed Grafana | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| AWS Ground Station | L1 | Standard | Internal | No | Full | P3 | Internal metadata/control-plane simulatorでL1を提供。 |
| GuardDuty | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| AWS Health | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| HealthImaging | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| HealthLake | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| AWS HealthOmics | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| IAM | L2 | Standard | MiniStack | Yes | Full | P0 | MiniStack handlerあり。提供前にoperation coverage/known limitationsをservice単位で検証。 |
| IAM Access Analyzer | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| IAM Identity Center | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| IAM Roles Anywhere | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Incident Manager | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Amazon Inspector | L2 | Standard | MiniStack | Yes | Full | P1 | MiniStackはenable/disableやfinding stub等。実scanは行わない。 |
| Amazon Inspector Classic | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| AWS IoT Core | L2 | Standard | MiniStack | Yes | Full | P1 | MiniStack handlerあり。提供前にoperation coverage/known limitationsをservice単位で検証。 |
| AWS IoT Device Defender | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| AWS IoT Device Management | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| AWS IoT FleetWise | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| AWS IoT Wireless | L2 | Standard | MiniStack | Yes | Full | P1 | MiniStack handlerあり。提供前にoperation coverage/known limitationsをservice単位で検証。 |
| AWS IoT Greengrass V1 | L3 | Hybrid | Internal | No | Partial | P2 | まずInternal L1/L2を実装。L3は隔離したAdvanced runtimeまたは安全な代替実装を追加。 |
| AWS IoT Greengrass V2 | L3 | Hybrid | Internal | No | Partial | P2 | まずInternal L1/L2を実装。L3は隔離したAdvanced runtimeまたは安全な代替実装を追加。 |
| AWS IoT SiteWise | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| AWS IoT TwinMaker | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Amazon IVS | L3 | Hybrid | Internal | No | Partial | P2 | まずInternal L1/L2を実装。L3は隔離したAdvanced runtimeまたは安全な代替実装を追加。 |
| Amazon Kendra | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Amazon Keyspaces | L3 | Hybrid | Internal | No | Partial | P2 | まずInternal L1/L2を実装。L3は隔離したAdvanced runtimeまたは安全な代替実装を追加。 |
| AWS KMS | L2 | Standard | MiniStack | Yes | Full | P0 | MiniStackでkey/encrypt/decrypt/grant/alias等を利用。実HSM保証は再現しない。 |
| Kinesis Data Streams | L2 | Standard | MiniStack | Yes | Full | P1 | MiniStackでstream/shard/record/consumerを利用可能。 |
| Kinesis Video Streams | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Lake Formation | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Lambda | L3 | Hybrid | MiniStack | Yes | Partial | P0 | local runtimeはStandard候補、Docker/custom/image runtimeはAdvanced。任意コード実行ガード必須。 |
| Launch Wizard | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Amazon Lex | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| License Manager | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Lightsail | L3 | Hybrid | Internal | No | Partial | P2 | まずInternal L1/L2を実装。L3は隔離したAdvanced runtimeまたは安全な代替実装を追加。 |
| Amazon Location Service | L2 | Standard | MiniStack | Yes | Full | P1 | MiniStack handlerあり。提供前にoperation coverage/known limitationsをservice単位で検証。 |
| Lookout for Equipment | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Macie | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| AWS Mainframe Modernization | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Amazon ML | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Managed Blockchain | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Managed Service for Apache Flink | L3 | Hybrid | Internal | No | Partial | P2 | まずInternal L1/L2を実装。L3は隔離したAdvanced runtimeまたは安全な代替実装を追加。 |
| AWS Managed Services | R | Reference | Reference | N/A | N/A | P3 | 人的/運用サービスのためemulator対象外。 |
| AWS Management Console | R | Reference | Reference | N/A | N/A | P3 | 本Lab自身がConsole操作学習UIを提供するため、AWS Management Console自体のemulation対象ではない。 |
| Amazon MWAA | L3 | Hybrid | MiniStack | Yes | Partial | P1 | MiniStackはmanaged Airflow environmentのcontrol-plane metadata中心。 |
| AWS Marketplace | R | Reference | Reference | N/A | N/A | P3 | 契約・購入・請求を伴うため実処理はemulateしない。 |
| Mechanical Turk | R | Reference | Reference | N/A | N/A | P3 | 外部worker marketplaceのためemulator対象外。 |
| Amazon MSK | L3 | Hybrid | MiniStack | Yes | Partial | P1 | MiniStackはcontrol-planeに加えreal broker利用あり。L3はAdvanced。 |
| Amazon MSK Connect | L3 | Hybrid | Internal | No | Partial | P2 | まずInternal L1/L2を実装。L3は隔離したAdvanced runtimeまたは安全な代替実装を追加。 |
| MediaConnect | L2 | Standard | MiniStack | Yes | Full | P1 | MiniStack handlerあり。提供前にoperation coverage/known limitationsをservice単位で検証。 |
| MediaConvert | L3 | Hybrid | Internal | No | Partial | P2 | まずInternal L1/L2を実装。L3は隔離したAdvanced runtimeまたは安全な代替実装を追加。 |
| MediaLive | L3 | Hybrid | Internal | No | Partial | P2 | まずInternal L1/L2を実装。L3は隔離したAdvanced runtimeまたは安全な代替実装を追加。 |
| MediaPackage | L3 | Hybrid | Internal | No | Partial | P2 | まずInternal L1/L2を実装。L3は隔離したAdvanced runtimeまたは安全な代替実装を追加。 |
| MediaTailor | L3 | Hybrid | Internal | No | Partial | P2 | まずInternal L1/L2を実装。L3は隔離したAdvanced runtimeまたは安全な代替実装を追加。 |
| Migration Hub | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Migration Hub Orchestrator | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| AWS Migration Hub Refactor Spaces | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Migration Hub Strategy Recommendations | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Amazon Monitron | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Amazon MQ | L2 | Standard | MiniStack | Yes | Full | P1 | MiniStackはbroker control-plane中心。実broker data planeは現状再現しない。 |
| Neptune | L3 | Hybrid | Internal | No | Partial | P2 | まずInternal L1/L2を実装。L3は隔離したAdvanced runtimeまたは安全な代替実装を追加。 |
| Network Firewall | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| OpenSearch Service | L3 | Hybrid | MiniStack | Yes | Partial | P1 | MiniStackはcontrol-planeに加えoptional real clusterを起動可能。L3はAdvanced。 |
| Oracle Database@AWS | L3 | Hybrid | Internal | No | Partial | P2 | まずInternal L1/L2を実装。L3は隔離したAdvanced runtimeまたは安全な代替実装を追加。 |
| Organizations | L2 | Standard | MiniStack | Yes | Full | P1 | MiniStackでOrganization/Root/Account/OUの主要control-planeを利用。 |
| AWS Outposts | L1 | Standard | Internal | No | Full | P3 | Internal metadata/control-plane simulatorでL1を提供。 |
| AWS Panorama | L1 | Standard | Internal | No | Full | P3 | Internal metadata/control-plane simulatorでL1を提供。 |
| AWS Payment Cryptography | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| AWS PCS | L3 | Hybrid | Internal | No | Partial | P2 | まずInternal L1/L2を実装。L3は隔離したAdvanced runtimeまたは安全な代替実装を追加。 |
| Amazon Personalize | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Amazon Pinpoint | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Amazon Polly | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| AWS Private CA | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Amazon Managed Service for Prometheus | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| AWS Proton | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Amazon Q Business | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Amazon Q Developer | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Quick Setup | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Amazon Quick Sight | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| AWS RAM | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Recycle Bin | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Amazon Redshift | L3 | Hybrid | Internal | No | Partial | P2 | まずInternal L1/L2を実装。L3は隔離したAdvanced runtimeまたは安全な代替実装を追加。 |
| Amazon Rekognition | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Amazon RDS | L3 | Hybrid | MiniStack | Yes | Partial | P0 | MiniStackはPostgres/MySQL/MariaDBをDockerで起動。L3はAdvanced。 |
| AWS re:Post Private | R | Reference | Reference | N/A | N/A | P3 | コミュニティ/ナレッジサービスのためresource emulator対象外。 |
| Resilience Hub | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Resource Explorer | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Resource Groups and Tagging | L2 | Standard | MiniStack | Yes | Full | P1 | MiniStack handlerあり。提供前にoperation coverage/known limitationsをservice単位で検証。 |
| Red Hat OpenShift Service on AWS | L3 | Hybrid | Internal | No | Partial | P2 | まずInternal L1/L2を実装。L3は隔離したAdvanced runtimeまたは安全な代替実装を追加。 |
| Route 53 | L2 | Standard | MiniStack | Yes | Full | P0 | MiniStack内のrecord変更はhost/global DNSへ伝播しない。 |
| SageMaker AI | L3 | Hybrid | Internal | No | Partial | P2 | まずInternal L1/L2を実装。L3は隔離したAdvanced runtimeまたは安全な代替実装を追加。 |
| Secrets Manager | L2 | Standard | MiniStack | Yes | Full | P0 | MiniStack handlerあり。提供前にoperation coverage/known limitationsをservice単位で検証。 |
| Security Lake | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Security Hub CSPM | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| AWS Security Incident Response | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Service Quotas | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| AWS Serverless Application Repository | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| AWS Service Catalog endpoints and quotas | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Shield Advanced | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Amazon S3 | L2 | Standard | MiniStack | Yes | Full | P0 | MiniStackの主要data operationが充実。Snapshot対象にuser dataが入るためUntrusted User Dataとして扱う。 |
| Amazon Glacier | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Amazon SES | L2 | Standard | MiniStack | Yes | Full | P1 | MiniStack handlerあり。提供前にoperation coverage/known limitationsをservice単位で検証。 |
| AWS Signer | L2 | Standard | MiniStack | Yes | Full | P1 | MiniStack handlerあり。提供前にoperation coverage/known limitationsをservice単位で検証。 |
| AWS Sign-In | R | Reference | Reference | N/A | N/A | P3 | 認証は社内SSOを使用し、AWS Sign-In画面の再現対象外。 |
| Amazon SimpleDB | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Amazon SNS | L2 | Standard | MiniStack | Yes | Full | P0 | MiniStackのtopic/subscription/publish/fan-outを利用。外部endpointは制限。 |
| Amazon SQS | L2 | Standard | MiniStack | Yes | Full | P0 | MiniStackのqueue/message/FIFO/DLQ等を利用。 |
| AWS STS | L2 | Standard | MiniStack | Yes | Full | P0 | MiniStack handlerあり。提供前にoperation coverage/known limitationsをservice単位で検証。 |
| Amazon SWF | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Snow Family | L1 | Standard | Internal | No | Full | P3 | Internal metadata/control-plane simulatorでL1を提供。 |
| Step Functions | L2 | Standard | MiniStack | Yes | Full | P1 | MiniStack handlerあり。提供前にoperation coverage/known limitationsをservice単位で検証。 |
| Storage Gateway | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Support | R | Reference | Reference | N/A | N/A | P3 | AWS Support契約/ケース実体はemulateしない。必要なら学習用reference UIのみ。 |
| Systems Manager | L2 | Standard | MiniStack | Partial (SSM) | Full | P0 | MiniStackはSSM Parameter Store等を含む一部surface。Systems Manager全機能の対応を意味しない。 |
| AWS Systems Manager for SAP | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Amazon Textract | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Timestream | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| AWS TNB | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| AWS Transform | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Amazon Transcribe | L2 | Standard | MiniStack | Yes | Full | P1 | MiniStack handlerあり。提供前にoperation coverage/known limitationsをservice単位で検証。 |
| Transfer Family | L2 | Standard | MiniStack | Yes | Full | P1 | MiniStackはSFTP listenerを提供可能だがFTP/FTPS等に差異あり。 |
| Amazon Translate | L2 | Standard | MiniStack | Yes | Full | P1 | MiniStack handlerあり。提供前にoperation coverage/known limitationsをservice単位で検証。 |
| Trusted Advisor API | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| User Notifications | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| AWS User Experience Customization | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Verified Access | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Verified Permissions | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Amazon VPC | L2 | Standard | MiniStack | Yes (EC2 module) | Full | P0 | MiniStackはVPC/Subnet/Route/SG等を保持するが、実packet routingは再現しない。 |
| VPC Lattice | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| AWS WAF | L2 | Standard | MiniStack | Yes | Full | P1 | MiniStackはWebACL/rule等を保持するが、rule enforcementは限定的/未実装。 |
| AWS WAF Classic | L2 | Standard | MiniStack | Yes | Full | P1 | MiniStackはlegacy API stub中心。新規学習はAWS WAFを優先。 |
| AWS Well-Architected Tool | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| AWS Wickr | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Amazon WorkMail | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Amazon WorkSpaces | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| Amazon WorkSpaces Instances | L3 | Hybrid | Internal | No | Partial | P2 | まずInternal L1/L2を実装。L3は隔離したAdvanced runtimeまたは安全な代替実装を追加。 |
| Amazon WorkSpaces Secure Browser | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |
| X-Ray | L2 | Standard | Internal | No | Full | P2 | Internal L1から開始し、API/主要挙動を安全なemulatorとしてL2へ拡張。 |

## 9. 実装ルール

1. **L1はUIだけのmockにしない。** resource stateを持ち、作成・変更・削除・関連付けが後続操作へ反映されるcontrol-plane simulatorとする。
2. **L2はAWS API shapeだけでなく主要behaviorを確認する。** stored-onlyな設定はKnown Differencesへ明記する。
3. **L3は任意コード・container・DB等の実行境界を評価する。** Standardへ無理に載せずAdvancedへ分離する。
4. MiniStackにhandlerがある場合でも、そのまま全operationを利用可能にしない。Service Adapterでallowlistし、危険operation/egressを制御する。
5. MiniStack未対応サービスでも、UIをMiniStack有無に依存させない。Internal ProviderでL1を追加できる構造を維持する。
6. AWS Consoleの画面/操作追従は `04_ip_guidelines.md` に従い、AWSのHTML/CSS/JS/ブランドassetを直接コピーしない。
7. Snapshot/Resume可否はservice追加時に必ず評価する。
8. 実AWSとの意図的差異は `knownLimitations` として利用者へ表示可能にする。

## 10. Compatibility Matrixの機械可読化

将来的には本Markdownを手編集の唯一のsourceにせず、以下のschemaをYAML/JSONで保持してMarkdownを生成する。

```yaml
serviceCode: s3
displayName: Amazon S3
targetLevel: L2
runtimeType: standard
provider: ministack
ministackCurrent: true
snapshotSupport: full
priority: P0
testedEngineVersion: null
consoleVerifiedAt: null
knownLimitations: []
```

実装開始後は `testedEngineVersion`、`consoleVerifiedAt`、`implementedLevel`、`enabled` を追加し、**TargetとCurrent implementationを分離**する。

## 11. 更新ルール

以下のいずれかで本表を更新する。

- AWS General Referenceへサービス追加/削除/名称変更があった場合
- MiniStackのSERVICE_REGISTRY変更時
- MiniStack version更新時
- Internal Provider追加時
- L1/L2/L3実装完了時
- Snapshot support変更時
- AWS Management Consoleの主要操作変更時
- セキュリティ上の理由でRuntime区分を変更した場合

少なくとも四半期ごと、およびMiniStack採用version更新時に全件差分確認を行う。

## 12. 参照

- AWS General Reference - Service endpoints and quotas: https://docs.aws.amazon.com/general/latest/gr/aws-service-information.html
- AWS Products: https://aws.amazon.com/products/
- MiniStack Services: https://ministack.org/docs/services/
- MiniStack Known limitations: https://ministack.org/docs/limitations
- MiniStack GitHub: https://github.com/ministackorg/ministack
- `03_basic_design.md`
- `04_ip_guidelines.md`
- `05_incident_guardrails.md`

---

本表は初期分類である。特にL2/L3は「最終的に学習価値としてどこまで再現するか」の設計目標であり、実装開始時にサービス単位のAWS Console/API調査を行って確定する。
