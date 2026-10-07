# AWS Internal Lab 要件定義書

- 文書種別: 要件定義書
- 対象: 社内AWS学習・検証基盤
- リポジトリ: `aws-internal-lab`
- 初版日: 2026-10-05
- ステータス: 初版レビュー

## 1. 文書目的

本書は、AWS Internal Lab の初期リリースに必要な業務要件、機能要件、非機能要件、セキュリティ要件、運用要件を定義する。

初期リリースの主目的は、課題・採点型研修ではなく、利用者が AWS サービス相当のリソースを自由に作成・変更・削除できる Lab 環境を安全に提供することである。

## 2. 前提

- システムは社内向けに提供する。
- システム基盤は AWS 上に配置する。
- 管理系永続データは実 AWS の Aurora PostgreSQL、S3 等を利用してよい。
- AWS 互換エミュレータの第一候補は MiniStack とする。
- MiniStack の挙動差異や未対応機能は、サービス側の Adapter、社内拡張、必要に応じた fork で補完可能な構造とする。
- UI は AWS Management Console の実画面を基準とし、画面構成、ナビゲーション、設定項目、項目順、操作導線、主要な操作単位を可能な限り再現する。利用者が本 Lab で習得した操作手順を実 AWS Management Console でそのまま適用できることを目標とする。
- 操作・情報構造の再現と、AWSのブランド/trade dress/著作物の直接コピーは分離して扱う。
- Lab Runtime は原則使い捨てとする。利用者が明示的に Suspend / Save を実行した場合のみ、再開に必要な Lab Snapshot を期限付きで永続保存できることとする。
- Snapshot を保存していない Lab のデータ永続性は保証しない。

## 3. 用語

| 用語 | 定義 |
| --- | --- |
| Lab | 利用者ごとに払い出される独立した AWS エミュレーション環境 |
| LabWorkspace | Suspend/ResumeやRuntime切替を跨いで継続する論理AWS環境。Virtual Account/Region/ARN namespaceの正本 |
| Standard Lab | ECS/Fargate 上で実行する標準Runtime。Docker daemonを必要としないL1/L2を中心に提供 |
| Advanced Lab | 共有EC2 Worker Pool上のLab専用microVMで実行するRuntime。Docker/KVM等を必要とするL3を提供 |
| Control Plane | AWS リソースの作成、設定、参照、更新、削除等の管理 API |
| Data Plane | 実際のコード実行、DB接続、データ処理等の実行処理 |
| Lab Engine | AWS API 互換挙動を提供するバックエンド。初期候補は MiniStack |
| Lab Snapshot | Lab Runtime を破棄した後でも再開できるよう、Lab Engine の状態と必要なデータを静的に保存したもの |
| Suspend | Lab の状態を Snapshot として保存したうえで実行 Runtime を停止・破棄する操作 |
| Resume | 保存済み Snapshot から新しい Runtime を起動し、Lab 状態を復元する操作 |
| Compatibility Matrix | AWS サービスごとの対応レベル、制約、差異、Snapshot対応状況を管理する一覧 |
| BFF | Browser から Lab Engine へのアクセスを仲介する Backend for Frontend / API 層 |

## 4. 利用者区分

### 4.1 Learner / User

- 自身の Lab を開始できる。
- 自身の Lab 内の AWS サービス画面を利用できる。
- 自身の Lab をリセット・終了できる。
- 対応する Lab について Suspend / Resume できる。
- 自身の Snapshot を削除できる。
- 他利用者の Lab / Snapshot は参照・操作できない。

### 4.2 Operator

- 稼働 Lab を参照できる。
- Lab の状態、利用者、開始時刻、TTL、利用量を確認できる。
- 問題のある Lab を強制終了できる。
- Snapshot の有無、サイズ、期限等のメタデータを確認できる。
- サービス提供可否やメンテナンス状態を確認できる。

### 4.3 Administrator

Operator 権限に加え、以下を行える。

- 利用可能サービスの制御
- Quota / TTL / Snapshot retention 設定
- Compatibility Matrix 管理
- システム設定変更
- Audit 参照
- 緊急停止

### 4.4 SecurityAuditor

- Audit / Incident情報を参照できる。
- 通常のLab/Workspace変更権限を持たない。
- 利用者Payloadを通常権限では閲覧できない。
- Break Glassが必要な調査はIncident ID、理由、期限、承認を伴う別権限とする。

## 5. 業務要件

### BR-001 自由利用型 Lab

利用者は課題や教材を選択しなくても Lab を開始でき、提供対象の AWS サービスを自由に操作できること。

### BR-002 利用者分離

利用者の操作が他利用者の Lab、サービス提供基盤、既存業務システムへ影響しないこと。

### BR-003 幅広い AWS サービス対応

特定サービスだけに限定せず、技術的に実現可能な限り幅広い AWS サービスを対象とすること。

### BR-004 対応レベルの明示

各サービスについて、実 AWS と同等に利用できる範囲と、再現されない範囲を利用者に説明可能であること。

### BR-005 低コスト反復利用

Lab の作成、破棄、再作成を繰り返しても、実 AWS リソースを利用者単位で直接払い出す方式と比べてコストを抑えられること。

### BR-006 事故影響の局所化

初学者の誤操作、大量リソース作成、不適切な設定等が発生しても、サービス提供側で影響を局所化・停止できること。

### BR-007 実 AWS Console 操作習得

利用者が Lab 上で身につけた画面操作、設定項目の探し方、リソース作成手順を、実 AWS Management Console 上でも大きな読み替えなく適用できること。

### BR-008 Lab 中断・再開

利用者は学習途中の Lab Runtime を常時稼働させることなく、必要な状態を静的に保存して中断し、後日新しい Runtime 上で再開できること。

## 6. 機能要件

## 6.1 認証・認可

### FR-AUTH-001 社内認証

社内 SSO と連携して利用者を認証できること。

### FR-AUTH-002 ロール管理

Learner / Operator / Administrator / SecurityAuditor の権限を分離できること。

### FR-AUTH-003 Lab 所有者チェック

すべての利用者向けWorkspace/Lab APIで、認証ユーザーとWorkspace ownerの一致を検証すること。

### FR-AUTH-004 Lab Engine 直接アクセス禁止

利用者 Browser から Lab Engine の管理ポート/APIへ直接アクセスできないこと。

### FR-AUTH-005 Snapshot 所有者チェック

Snapshot の作成、参照、Resume、削除において、認証ユーザーと Snapshot owner の一致を検証すること。

### FR-AUTH-006 OIDC Session Protection

社内OIDC認証を利用し、Browserに長期CredentialやIdP refresh tokenを直接保持させないこと。Web sessionはSecure / HttpOnly等のWeb security属性を利用できること。

### FR-AUTH-007 Deny by default

Application authorizationはdeny-by-defaultとし、RoleおよびResource ownershipの両方で認可すること。

### FR-AUTH-008 SecurityAuditor

Audit/Incident参照専用RoleをOperator/Administratorから分離できること。

### FR-AUTH-009 Service identity

Platform component間の認証に利用者Credentialを流用せず、IAM Role等のworkload identityまたは短命なruntime-bound credentialを利用すること。

### FR-AUTH-010 Break Glass

利用者PayloadまたはSnapshot内容への例外的アクセスが必要な場合、Incident ID、対象、理由、実施者、承認者、有効期限を記録するBreak Glass方式を利用できること。

## 6.2 Lab ライフサイクル

### FR-LAB-001 Lab 開始

利用者は UI から Lab を開始できること。

### FR-LAB-002 Lab 状態

Lab は最低限以下の状態を持つこと。

- provisioning
- ready
- suspending
- suspended
- resuming
- stopping
- stopped
- failed
- expired

### FR-LAB-003 Lab リセット

利用者は自身の Lab を初期状態へリセットできること。

### FR-LAB-004 Lab 終了

利用者は自身の Lab を明示的に終了できること。通常の終了では Snapshot を新規作成せず、既存 Snapshot を残すか削除するかは利用者または retention policy に従うこと。

### FR-LAB-005 TTL

Lab Runtime は設定された TTL を超過した場合、自動停止または自動破棄されること。

### FR-LAB-006 Idle timeout

一定時間操作がない Lab Runtime を自動 Suspend または自動停止できる構造を持つこと。自動 Suspend を利用するかは運用設定で選択可能とすること。

### FR-LAB-007 強制終了

Operator / Administrator が任意の Lab を強制終了できること。

### FR-LAB-008 同時 Lab 数制限

利用者単位または全体で同時 Lab 数を制御できること。

### FR-LAB-009 Suspend

利用者は対応する Lab を Suspend できること。Suspend 時は Lab Engine の状態を整合した状態で保存した後、実行 Runtime を停止・破棄できること。

### FR-LAB-010 Resume

利用者は自身の有効な Snapshot から Lab を Resume できること。Resume 時は新しい Runtime を作成し、保存済み状態を復元した後に ready 状態へ遷移すること。

### FR-LAB-011 Snapshot retention

Snapshot には保存期限を持たせ、期限到来時に自動削除できること。保存期間は管理者が設定可能であること。

### FR-LAB-012 Snapshot 削除

利用者または管理者は不要な Snapshot を削除できること。

### FR-LAB-013 Restore compatibility

Snapshot には Lab Engine version、image digest、runtime type、region、サービス対応情報等、復元互換性を判断するための情報を保持すること。原則として作成時と同一または互換性確認済みの Lab Engine で復元すること。

### FR-LAB-014 Snapshot 対応可否表示

サービスまたは Runtime の特性により完全な Suspend / Resume を提供できない場合、Compatibility Matrix と UI で `full / partial / none` 等の対応状況を明示すること。

## 6.3 AWS サービス UI

### FR-UI-001 サービス一覧

提供対象 AWS サービスを一覧表示できること。

### FR-UI-002 サービス状態表示

各サービスについて以下を表示できること。

- 提供可否
- 対応レベル L1/L2/L3
- 既知の制約
- 実 AWS の差異
- Snapshot / Resume 対応状況

### FR-UI-003 AWS Management Console 操作再現

各サービス画面は AWS Management Console の現行画面を基準として設計し、実 AWS で必要となる操作を Lab 上で練習できること。少なくとも画面構成、主要ナビゲーション、タブ構成、主要設定項目、項目順、作成・編集・削除の操作導線を可能な限り実 AWS と一致させること。

### FR-UI-004 CRUD 操作

対応サービスについて、技術的に可能な範囲でリソースの Create / Read / Update / Delete を行えること。

### FR-UI-005 非本番表示

実 AWS Management Console と同様の操作体験を提供しつつ、すべての Lab 画面で本環境が Training / Lab 環境であることを明確に識別できる表示を行うこと。

### FR-UI-006 操作導線整合性

AWS Management Console の画面変更を定期的に確認し、学習上重要な変更があった場合は Lab Console の画面・導線を追従できること。意図的に実 AWS と異なる表示・操作を採用する場合は、その差異を Compatibility 情報として明示すること。

## 6.4 サービス対応レベル

### FR-COMP-001 L1

L1 対応サービスでは、Control Plane 上の主要なリソース作成・設定・参照・削除を行えること。

### FR-COMP-002 L2

L2 対応サービスでは、主要 API とサービス間連携が実行可能であること。

### FR-COMP-003 L3

L3 対応サービスでは、実コード、DB、コンテナ等の Data Plane を実行できること。

### FR-COMP-004 Matrix 管理

Compatibility Matrix をシステム管理情報として保持できること。

### FR-COMP-005 Provider 抽象化

UI / API 層が MiniStack 固有実装へ直接依存せず、Service Adapter / Provider 経由で Lab Engine を利用すること。

## 6.5 Quota / Guardrail

### FR-GUARD-001 CPU / Memory 制限

Lab ごとに CPU / Memory 上限を設定できること。

### FR-GUARD-002 Storage 制限

Lab ごとに一時ストレージ上限を設定できること。

### FR-GUARD-003 Resource Quota

サービス・リソース種別ごとに作成上限を設定できる構造を持つこと。

### FR-GUARD-004 Request Rate Limit

短時間の過剰 API 呼び出しを制限できること。

### FR-GUARD-005 Service Allowlist

利用可能な AWS サービスを環境単位・利用者区分単位等で制御可能な構造を持つこと。

### FR-GUARD-006 危険機能の無効化

外部送信、host 権限、privileged 実行等を伴う機能を明示的に無効化または Advanced Lab に隔離できること。

### FR-GUARD-007 Snapshot Quota

利用者単位で Snapshot 数および総保存容量を制限できること。

### FR-GUARD-008 Advanced Capacity Unit

Advanced Runtimeの必要量を固定ProfileとCapacity Unitで管理し、利用者が任意にHost resourceを占有できないこと。

### FR-GUARD-009 Advanced Worker Auto Scaling

Advanced Worker Poolはpending capacity、利用率、idle時間、推定時間単価に基づいてWorker Classと台数を自動調整できること。

初期閾値は以下とする。

- Scale Out: Fleet利用率80%が5分継続、pending capacity不足、またはplacement failure
- Scale In候補: active/starting Labが0のWorkerが15分idle
- Consolidation: Fleet利用率45%未満が30分継続

### FR-GUARD-010 Runtime Auto Promotion

Standard RuntimeでAdvanced Runtime必須操作が要求された場合、Lab状態を保持したまま自動的にAdvanced Runtimeへ移行し、要求操作を継続できること。

### FR-GUARD-011 Runtime Auto Downgrade

Advanced必須resource/workloadが存在しなくなったLabはStandard復帰可能状態として管理し、次回Suspend/Resume等の安全な境界でFargateへ自動復帰できること。利用中のLabをコスト最適化のみを理由に強制移行しないこと。

## 6.6 ネットワーク

### FR-NET-001 Private 配置

Lab 実行環境は原則 Private Subnet に配置し、Public IP を持たないこと。

### FR-NET-002 Inbound 制御

Lab Engine への通信元をサービス側 BFF/API 等の必要コンポーネントへ限定すること。

### FR-NET-003 Outbound Default Deny

Lab から Internet、社内業務ネットワーク、本番 AWS 資産への任意通信を原則許可しないこと。

### FR-NET-004 必要通信 Allowlist

ECR、CloudWatch Logs、Snapshot 保存用 S3 等、Lab 実行上必要な通信は VPC Endpoint 等を優先して明示許可すること。

### FR-NET-005 Advanced Lab 分離

Docker daemon 等を利用する Advanced Lab は Standard Lab と実行基盤・Security Group・IAM Role 等を分離すること。

共有Advanced Worker上では、異なる利用者のLabを同一Host kernel上のDocker containerとして直接混在させず、Lab単位のmicroVM等の仮想化境界で分離すること。

### FR-NET-006 Advanced Lab間通信分離

同一Advanced Worker上の異なるLab microVM間で直接通信できないこと。guestからWorker Host管理ネットワーク、IMDS、Host filesystem、Host container runtimeへ到達できないこと。

## 6.7 データ保護

### FR-DATA-001 Lab データ既定非永続

通常の Lab Runtime 内データは原則一時データとし、Snapshot を明示作成していない状態では Runtime 終了時に破棄されること。

### FR-DATA-002 Platform Data 分離

Lab Runtime 内データ、Snapshot payload、Aurora 等に保存する Platform 管理データを論理的・権限的に分離すること。

### FR-DATA-003 禁止データ表示

利用者に対し、以下の投入禁止を UI 上で明示すること。

- 個人情報
- 顧客情報
- 社外秘情報
- 本番データ
- 本番 Credentials
- Private Key
- 本番 DB Dump

Snapshot を利用する場合も上記禁止事項は変わらないことを明示すること。

### FR-DATA-004 Secret / Payload 非記録

Audit Log に以下を原則保存しないこと。

- Secret 値
- Object 本体
- Request Body 全文
- Lambda source code 全文
- DB レコード本文

### FR-DATA-005 暗号化

Platform が永続保存する管理データおよび Snapshot は AWS 標準の暗号化機能を利用すること。

### FR-DATA-006 Snapshot 保存先

Snapshot payload は専用の S3 Bucket 等、Platform 管理データと分離した保存先へ格納すること。Aurora には Snapshot 本体を保存せず、メタデータのみ保持すること。

### FR-DATA-007 Snapshot アクセス制御

Snapshot payload には利用者 Browser から直接アクセスさせず、復元処理を行う Platform / Lab Control Plane の最小権限 Role のみがアクセスできること。

### FR-DATA-008 Snapshot KMS

Snapshot は SSE-KMS 等で暗号化し、Snapshot 用 KMS Key と Key Policy を利用してアクセス主体を限定できること。

### FR-DATA-009 Snapshot 削除保証

利用者削除または retention 終了時に Snapshot payload と関連メタデータを削除すること。削除失敗は監視・再試行対象とすること。

### FR-DATA-010 Snapshot 機微性

禁止データ投入を前提としつつも、Snapshot には利用者が作成した S3 Object、Secret、Function code 等が含まれる可能性があるため、Snapshot 自体を機微データを含み得る保存物として保護すること。

## 6.8 Audit / 運用管理

### FR-AUDIT-001 操作 Audit

最低限以下を記録すること。

- timestamp
- user
- lab id
- service
- action
- resource identifier
- result

### FR-AUDIT-002 管理操作 Audit

Lab 強制停止、設定変更等の管理操作も記録すること。

### FR-AUDIT-003 Active Lab 一覧

Operator は稼働中 Lab を一覧表示できること。

### FR-AUDIT-004 利用量表示

可能な範囲で CPU、Memory、Storage、Resource Count、Snapshot size 等を確認できること。

### FR-AUDIT-005 Kill Switch

運用者は個別 Lab、および必要に応じて新規 Lab 起動全体を緊急停止できること。

### FR-AUDIT-006 Snapshot Audit

Snapshot の作成、Suspend、Resume、削除、期限切れ削除、復元失敗を Audit 対象とすること。ただし Snapshot payload 本体は Audit に記録しないこと。

## 6.9 MiniStack / Emulator 管理

### FR-EMU-001 Version Pin

採用する Lab Engine のバージョンを固定できること。

### FR-EMU-002 社内 Mirror

利用 Container Image や Source を社内管理可能な場所へ mirror できること。

### FR-EMU-003 Upstream 差分管理

社内変更と upstream MiniStack の差分を追跡できること。

### FR-EMU-004 Fork 可能性

必要に応じて MiniStack の MIT License 範囲で社内 fork へ移行可能であること。

### FR-EMU-005 SBOM / License

MiniStack および依存パッケージの SBOM / License Scan を実施できること。

### FR-EMU-006 State export / restore

採用する Lab Engine について、Suspend / Resume に必要な状態の保存・復元方式を実装または検証できること。MiniStack の永続化機能を利用する場合は、`PERSIST_STATE` / `STATE_DIR`、S3 object bytes の `S3_PERSIST` / `S3_DATA_DIR` 等を利用し、Runtime のローカル保存領域から Snapshot Store へ退避・復元すること。

## 6.10 仮想AWS環境

### FR-VAWS-001 LabWorkspace

利用者が継続利用する論理AWS環境をLabWorkspaceとして管理し、LabSession/Runtimeの作成・破棄とは分離すること。

### FR-VAWS-002 Virtual Account ID

各WorkspaceにPlatform内で一意な12桁Virtual AWS Account IDを割り当てること。

Virtual Account IDは利用者識別情報を埋め込まず、Workspace存続中に変更せず、削除後も意図的に再利用しないこと。

### FR-VAWS-003 Region

初期提供するVirtual Regionは以下の2つとする。

- Asia Pacific (Tokyo): `ap-northeast-1`
- Asia Pacific (Osaka): `ap-northeast-3`

defaultは東京とし、同一Workspaceで東京・大阪双方のRegional resourceを同時に保持できること。

物理RuntimeのAWS Regionとは分離して扱い、初期リリースでは上記2Region以外を利用者が作成・選択できないこと。将来追加可能なデータ構造は維持すること。

### FR-VAWS-004 Global / Regional service

AWSサービスごとにglobal / regional scopeを管理できること。Regional stateはVirtual Account IDとVirtual Regionで分離すること。

### FR-VAWS-005 ARN namespace

ProviderやRuntimeが変わっても、同一WorkspaceではVirtual Account ID、Region、ARN namespaceを維持すること。

### FR-VAWS-006 ARN format

サービス固有差異を考慮した共通ARN生成機構を持ち、UI/Providerごとに独自ARN生成を実装しないこと。

### FR-VAWS-007 Lab Credential

Lab内AWS SDKへ実AWS Credentialを渡さず、Virtual Accountに紐づくLab専用Credentialを利用できること。

### FR-VAWS-008 実AWS誤到達防止

Lab SDK endpointをLab Gatewayへ向け、実AWS public endpointへのegress制御と組み合わせて、Lab Credentialから実AWSへ誤到達しない構造とすること。

### FR-VAWS-009 DR Learning

東京・大阪の2 Virtual Regionを利用して、Backup and Restore、Pilot Light、Warm Standby、Active/Passive、Active/Active等のDR構成を学習できること。

### FR-VAWS-010 Regional Fault Injection

利用者は自身のWorkspace内だけでVirtual Region障害を模擬できること。Regional Fault Injectionは他WorkspaceおよびPlatform Control Planeへ影響しないこと。

### FR-VAWS-011 Cross-Region Replication

対応サービスでは東京・大阪間の非同期replication、replication lag、replication停止、failover/failbackを学習できる構造を持つこと。

### FR-VAWS-012 Virtual DRとPlatform DRの分離

Virtual RegionによるDR学習機能と、AWS Internal Labサービス自身の物理可用性・DRを明確に分離して設計・表示すること。

## 6.11 Provider Routing / Integration

### FR-ROUTE-001 Single Gateway

Console BFFおよびLab内AWS SDKからのAWS互換requestは、Active Runtime内の単一Lab Gatewayを経由すること。

### FR-ROUTE-002 Operation routing

Provider RoutingはAWSサービス単位だけでなくOperation単位で設定できること。

### FR-ROUTE-003 Provider types

少なくともMiniStack / Internal Emulator / Reference / DenyをProvider routeとして扱えること。

### FR-ROUTE-004 Guardrail before provider

禁止Operation、Quota、Runtime requirement等をProvider呼び出し前に検査し、許可されないrequestをProviderへ送らないこと。

### FR-ROUTE-005 Runtime requirement

Advanced必須OperationがStandard Runtimeで要求された場合、Runtime Promotionへ連携できること。

### FR-ROUTE-006 Cross-provider integration

MiniStackとInternal Providerを跨ぐservice integrationについて、canonical ARN等を用いてtargetを解決・中継できる構造を持つこと。

### FR-ROUTE-007 Double delivery prevention

同一service integrationについてMiniStack native integrationとInternal Integration Bridgeが二重実行しないよう、integration ownerを管理できること。

## 6.12 API共通要件

### FR-API-001 Versioning

Platform APIはversionを明示できること。初期versionはv1とする。

### FR-API-002 Workspace centric

利用者向けAPIはLabSession/RuntimeではなくLabWorkspaceを主要resourceとして扱うこと。

### FR-API-003 Async operation

Provision、Suspend、Resume、Runtime Promotion等の長時間処理は非同期Operationとして扱い、Operation状態を取得できること。

### FR-API-004 Idempotency

Workspace作成、Start、Reset、Suspend、Resume、Snapshot restore等のmutationについてIdempotency Keyで重複実行を防止できること。

### FR-API-005 Concurrency

Workspace lifecycle mutationは同時実行させず、排他またはoptimistic concurrencyにより競合を防止すること。

### FR-API-006 Correlation ID

Browser requestからBFF、Lab Operation、Lab Gateway、Provider、Auditまで共通Correlation IDを引き継げること。

### FR-API-007 Pagination

一覧APIはcursor paginationを利用できること。

### FR-API-008 Error envelope

Platform固有ErrorとAWS Provider互換Errorを識別可能な共通error formatを持つこと。

## 7. 非機能要件

## 7.1 セキュリティ

### NFR-SEC-001 最小権限

ECS Task Role、EC2 Instance Profile、運用 IAM Role 等は最小権限とすること。

### NFR-SEC-002 実 AWS 資産分離

Lab 実行 Role に、既存業務 AWS リソースへの汎用アクセス権を付与しないこと。

### NFR-SEC-003 Docker socket

Web/API/Standard Lab へ Docker socket をマウントしないこと。

### NFR-SEC-004 Advanced Worker

Container runtime を必要とする場合は共有Advanced Worker Pool上のLab専用microVM内でのみ利用すること。Worker Host上へ利用者containerを直接配置しないこと。

### NFR-SEC-004A Advanced tenant boundary

Advanced Runtimeのtenant security boundaryはDocker containerではなくmicroVM/KVM等の仮想化境界とすること。

### NFR-SEC-005 脆弱性管理

Lab Engine、OS/Container Image、依存ライブラリの脆弱性を継続確認できること。

### NFR-SEC-006 法務・情報セキュリティレビュー

正式社内展開前に、少なくとも情報セキュリティ、法務/知財、社内規程担当のレビュー対象とすること。

### NFR-SEC-007 Snapshot 分離

Snapshot Store は一般の Platform asset 用 S3 と分離し、専用 Bucket / Prefix、Bucket Policy、KMS Key、Lifecycle を用いて保護すること。

## 7.2 可用性

### NFR-AVL-001 Control Plane

Web/API/管理 DB 等の Control Plane は、単一 Lab 障害に巻き込まれないこと。

### NFR-AVL-002 Lab 障害分離

1 Lab の crash、OOM、異常終了が他 Lab を停止させないこと。

### NFR-AVL-003 自動回復

Control Plane は ECS 等の標準機能で自動再起動できること。

### NFR-AVL-004 Snapshot 復元失敗

Snapshot からの Resume に失敗した場合、元 Snapshot を破壊せず、再試行または別 Runtime への復元を可能とすること。

## 7.3 性能

### NFR-PERF-001 Lab 起動時間

初期リリースでは Lab 起動時間に厳密な SLA は設けないが、継続計測し改善可能であること。

### NFR-PERF-002 UI 応答

通常の一覧・設定画面は、Lab Engine の応答遅延を除き社内 Web アプリとして実用的なレスポンスを維持すること。

### NFR-PERF-003 Suspend / Resume 時間

Snapshot size、対象サービス、Runtime type と Suspend / Resume 所要時間を計測可能とし、運用上の上限値を後続設計で設定できること。

## 7.4 拡張性

### NFR-EXT-001 Service Adapter

新しい AWS サービスを既存サービスへ大きな影響を与えず追加できること。

### NFR-EXT-002 Emulator 交換可能性

MiniStack の変更・fork・別 Emulator 採用が UI 全面改修へ直結しないこと。

### NFR-EXT-003 Advanced 実行基盤

Standard Lab と Advanced Lab の実行基盤を独立して拡張できること。

### NFR-EXT-004 Snapshot Provider

Lab Snapshot の保存・復元を Lab Engine 固有実装へ密結合させず、Runtime / Provider ごとに Snapshot 実装を差し替えられる構造とすること。

## 7.5 保守性

### NFR-MNT-001 Infrastructure as Code

AWS 基盤構成を IaC で管理すること。

### NFR-MNT-002 Configuration as Code

サービス対応レベル、Feature Flag、基本 Quota、Snapshot retention 等をコードまたはバージョン管理可能な設定として保持すること。

### NFR-MNT-003 Compatibility Test

対応を宣言する AWS API について回帰テスト可能な構造を持つこと。

### NFR-MNT-004 Console UI 追従性

AWS Management Console の学習上重要な画面変更を定期的に確認し、サービス画面ごとに実 AWS との UI 差分を管理・更新できること。

### NFR-MNT-005 Snapshot compatibility test

採用する Lab Engine version ごとに Snapshot 作成・復元の回帰テストを実施可能であること。

## 8. データ要件

Platform 側で最低限保持するデータは以下とする。

- User
- Role
- LabSession
- LabRuntime
- LabSnapshot
- ServiceCapability
- CompatibilityNote
- QuotaPolicy
- AuditEvent
- SystemSetting

LabSnapshot の管理メタデータには最低限以下を保持する。

- snapshotId
- labSessionId
- ownerUserId
- status
- runtimeType
- engineVersion
- engineImageDigest
- region
- snapshotFormatVersion
- storageLocation
- sizeBytes
- checksum
- createdAt
- expiresAt
- lastRestoredAt

Snapshot payload 本体は Aurora に保存しない。

利用者が Lab 内へ投入した Object、DB データ、Secret、Lambda source 等は、Snapshot を利用しない限り Platform の永続領域へ保存しない。Snapshot を利用する場合は専用 Snapshot Store に含まれ得るため、通常の Platform 管理データより強いアクセス制御を適用する。

## 9. 運用要件

- 稼働 Lab 一覧を確認できること。
- Lab の異常終了を検知できること。
- Lab Engine version を確認できること。
- 新規 Lab 起動を停止するメンテナンスモードを持てること。
- 個別 Lab を強制削除できること。
- Snapshot の数、容量、期限、作成/復元失敗を確認できること。
- 期限切れ Snapshot を自動削除できること。
- Snapshot 保存容量を監視し、利用者単位・全体の Quota を運用できること。
- Compatibility Matrix を更新できること。
- AWS Management Console の変更を定期確認し、学習上重要な UI・操作導線の差分を追従する運用を定義すること。
- 脆弱性情報や upstream 更新を定期確認する運用を定義すること。
- Audit Log の保存期間は社内基準に合わせて基本設計・運用設計で確定すること。
- AWS Trademark Guidelines / AWS Site Terms の変更を定期確認し、知財・ブランド利用方針への影響をレビューすること。

## 10. 利用ルール要件

利用開始時または常時確認可能な場所に以下を明示する。

- 本サービスは非本番の学習・検証 Lab である。
- Snapshot を保存しない限りデータ永続性を保証しない。
- Snapshot は学習継続のための一時保存機能であり、業務データの保管場所として利用してはならない。
- Snapshot には保存期限があり、期限到来時に削除される。
- Lab は予告なくリセット・削除される場合がある。
- 機密情報、個人情報、本番データ、本番資格情報を投入してはならない。
- 本番システムや顧客サービス用途に使用してはならない。
- 不適切利用が確認された場合、運営者が Lab / Snapshot を停止・削除できる。
- 本サービスはAWSが提供・承認・運営するサービスではないこと。

## 11. 初期リリース受入条件

初期リリースは以下をすべて満たした状態を最低条件とする。

1. 社内認証済み利用者が Lab を開始できる。
2. 利用者 A が利用者 B の Lab / Snapshot を参照・操作できない。
3. Standard Lab が Private Network 内に配置される。
4. Browser から Lab Engine 管理 API へ直接到達できない。
5. 少なくとも複数の AWS サービスについてリソース CRUD を実行できる。
6. Lab リセットと終了が動作する。
7. TTL による自動終了が動作する。
8. Standard Lab について Suspend → Runtime破棄 → Resume → 状態復元の一連動作が確認できる。
9. Resume 後に、対応対象の主要リソース状態と S3 object data 等の永続対象データが復元される。
10. Snapshot が専用保存先へ暗号化して保存され、他利用者から参照できない。
11. Snapshot retention による自動削除が動作する。
12. Operator が Lab を強制終了できる。
13. 操作 Audit が記録される。
14. Audit に Secret / Object Body 等が記録されない。
15. Lab から既存業務 AWS リソースへ汎用アクセスできない。
16. Compatibility Matrix によりサービス対応状況と Snapshot 対応状況を説明できる。
17. 採用 MiniStack version / image digest が固定される。
18. SBOM / License Scan の実施方法が確立される。
19. 情報セキュリティ・法務/知財レビューに提示可能な構成・責任分界が文書化される。
20. 初期提供対象の代表サービスについて、AWS Management Console の実画面と主要な操作導線を照合し、Lab で習得した操作手順を実 AWS でも適用できることが確認される。
21. AWSロゴ、AWS固有の配色・フォント・グラフィック・製品アイコン、AWS ConsoleのHTML/CSS/JavaScript等を無断で製品資産へ直接コピーしていないことが確認される。
22. AWS公式サービスとの誤認防止表示が実装される。
23. `04_ip_guidelines.md` の知財チェック項目について法務・知財レビューに提示可能な状態であること。


24. WorkspaceのVirtual Account ID / Region / ARN namespaceがSuspend/ResumeおよびStandard/Advanced切替後も維持される。
24a. 東京 `ap-northeast-1` と大阪 `ap-northeast-3` に同一WorkspaceのRegional resourceを作成でき、東京障害を模擬した状態で大阪側へfailoverするDR演習が他利用者へ影響せず実施できる。
25. Lab内SDKへ実AWS Credentialを渡さず、実AWS public endpointへ誤送信できないことを確認できる。
26. Operation単位のProvider RoutingでMiniStack / Internal / Denyを切り替えられる。
27. 同じIdempotency KeyによるLifecycle API再送で二重Runtime/Snapshotを作成しない。
28. Learner / Operator / Administrator / SecurityAuditorの権限分離とowner checkが確認できる。
29. Correlation IDにより利用者操作からProvider/Auditまで追跡でき、Payload本文は記録されない。

## 12. 後続要件候補

初期 Lab 基盤確立後、別要件として以下を検討する。

- Challenge / 課題管理
- 自動採点
- コース・進捗管理
- Browser Terminal
- CLI Credentials 発行
- Terraform / OpenTofu / CDK
- 障害注入
- Lab Template / Snapshot共有
- 講師用一括 Lab 配布
- Advanced Lab のサービス別完全Snapshot / Resume拡張
- Snapshot 世代管理 / Clone
- 実 AWS Sandbox 連携

## 13. 知財・ブランド要件

### NFR-IP-001 Reference-based reimplementation

AWS Management Console は操作仕様の参照元として利用し、画面実装は自社コード・自社コンポーネントで行うこと。

### NFR-IP-002 AWS実装資産の直接流用禁止

AWS Console の HTML、CSS、JavaScript、画像、SVG、sprite、その他Web assetを製品へ直接組み込まないこと。

### NFR-IP-003 ブランド/trade dress分離

AWS Management Consoleの操作・情報構造は再現対象とする一方、AWSロゴ、ブランド配色、AWS固有フォント、グラフィック、製品アイコン等を組み合わせたAWS特有のtrade dress / look and feelそのものは再現要件としないこと。

### NFR-IP-004 文言利用

AWSサービス名、リソース名、短い設定項目名等、操作整合性に必要な名称は利用可能とする。一方、AWSの説明文、ヘルプ文章、長いエラーメッセージ等は原則として自社文言に置き換えること。

### NFR-IP-005 誤認防止

AWS公式・AWS公認・AWS提供サービスであるとの誤認を生じさせない表示を行うこと。

### NFR-IP-006 社内限定

本サービスは社内SSO配下に限定し、一般公開、社外販売、広告利用、外部ユーザー向けSaaS提供を初期要件に含めないこと。

### NFR-IP-007 スクリーンショット

AWS Consoleのスクリーンショットは社内設計・レビュー上必要な最小限の参照に限定し、製品アセットとして恒久同梱しないこと。外部配布へ転用する場合は再レビューを行うこと。

### NFR-IP-008 変更時再レビュー

AWS Trademark Guidelines / AWS Site Terms の変更、社外提供へのスコープ変更、AWSロゴ・アイコン利用追加等が発生した場合は知財方針を再レビューすること。

詳細は `04_ip_guidelines.md` を正とする。