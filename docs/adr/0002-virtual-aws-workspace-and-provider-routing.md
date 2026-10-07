# ADR-0002: LabWorkspaceを仮想AWSアカウントの正本とし、Operation単位でProvider Routingする

- Status: Accepted
- Date: 2026-10-07

## Context

AWS Internal Labでは、Standard Fargate RuntimeとAdvanced microVM Runtimeを切り替えながら、利用者には1つの継続したAWS環境として見せる必要がある。

また、現行AWSサービス全体を対象とするため、MiniStackだけではなくInternal EmulatorやReference-only実装を同一UI/API体系から利用できる必要がある。

## Decision

### 1. LabWorkspace

LabWorkspaceを論理AWS環境の永続単位とする。

LabSession / LabRuntimeはWorkspaceを一時的に実行するための実体であり、Suspend / ResumeやStandard / Advanced切替によって入れ替わる。

Workspaceは少なくとも以下を保持する。

- workspaceId
- ownerUserId
- virtualAccountId
- partition
- defaultRegion
- enabledRegions
- activeSessionId
- currentSnapshotId
- standardEligible

### 2. Virtual AWS Account

各WorkspaceへPlatform内で一意な12桁Virtual AWS Account IDを割り当てる。

Virtual Account IDは利用者識別情報を含めず、Workspace存続中は変更しない。削除後も意図的に再利用しない。

### 3. Virtual Region / ARN

物理RuntimeのAWS RegionとVirtual Regionを分離する。

ProviderやRuntimeが変わっても、同一WorkspaceではVirtual Account ID、Virtual Region、ARN namespaceを維持する。

ARNは共通ArnFactoryで生成し、service固有のARN形式差異を吸収する。

### 4. Lab Gateway

Console BFFおよびLab内AWS SDKからのAWS互換requestはActive Runtime内のLab Gatewayを単一入口とする。

BrowserからLab Gatewayへ直接到達させない。

### 5. Provider Routing

Provider Routingはservice単位だけでなくOperation単位で管理する。

Provider種別:

- ministack
- internal
- reference
- deny

Routing前にWorkspace binding、Virtual Account/Region、Operation allowlist、Quota、Runtime requirementを検証する。

Advanced必須OperationがStandard Runtimeで要求された場合はRuntime Promotionへ連携する。

### 6. Cross-provider integration

MiniStack内で完結するintegrationはMiniStack native pathを優先する。

MiniStackとInternal Providerを跨ぐintegrationはIntegration Bridgeを使用する。

各integrationにownerを定義し、native pathとBridgeによる二重実行を防止する。

### 7. Lab Credential

Lab内コードへ実AWS Credentialを渡さない。

Lab専用CredentialとLab Gateway endpointを使用し、Runtimeから実AWS public endpointへのegress denyを併用する。

### 8. Authentication / Authorization

Corporate OIDCを利用し、Application authorizationはdeny-by-defaultとする。

Role:

- Learner
- Operator
- Administrator
- SecurityAuditor

Learner操作ではWorkspace owner checkを必須とする。

Operator / Administrator / SecurityAuditorにも利用者Payloadの通常閲覧権限は与えず、必要時はBreak Glassを利用する。

### 9. API

利用者向けAPIはLabSessionではなくWorkspaceを中心とする。

長時間処理は非同期Operationとし、Lifecycle mutationにはIdempotency Key、Workspace排他、Correlation IDを使用する。

## Consequences

### Positive

- Runtime切替後もAWS Account/Region/ARNが変わらない
- MiniStack未対応サービスをInternal Providerで段階的に追加できる
- Operationごとに安全性・Runtime要件を制御できる
- 実AWS Credential誤利用のblast radiusを低減できる
- API retryによる二重Runtime/Snapshot作成を防止できる

### Negative

- Lab Gateway、ProviderRoute、Integration Bridgeの実装が必要
- ARN/service metadataを継続的に管理する必要がある
- Cross-provider integration testが増える
- OIDC/RBAC/ownershipをBFF全APIで一貫適用する必要がある

## Validation Required

1. StandardからAdvancedへ移行してもVirtual Account/Region/ARNが維持されること
2. Multi-region resource stateが分離されること
3. Global service stateがRegion切替で重複しないこと
4. Operation単位Provider Routingが動作すること
5. Cross-provider integrationで二重deliveryしないこと
6. Lab Credentialで実AWSへ到達できないこと
7. IDORを含むcross-workspace accessが拒否されること
8. Lifecycle API再送で二重処理が発生しないこと
