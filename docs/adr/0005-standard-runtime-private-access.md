# ADR-0005: PlatformからStandard Runtime GatewayへのPrivate Access

- Status: Accepted
- Date: 2026-10-08

## Context

RuntimeStackのTaskはPrivate Isolated subnetに置き、public IP、IGW、NATを持たない。Control Plane/BFFはLab Gatewayへprivate network経由で接続する必要がある。

Phase 0ではStandalone Fargate TaskをWorkspaceごとに動的作成するため、Task IPは起動ごとに変わる。一方でControl PlaneはECS DescribeTasksからTask ENI private IPを取得し、DBの`private_endpoint`へ記録できる。

PrivateLink/NLBをWorkspace単位に作成する方式はPhase 0として構成要素が多く、共有NLBでは誤ったWorkspace Taskへload balanceされる可能性がある。VPC LatticeもPhase 0の要件に対して追加のcontrol-plane管理を必要とする。

## Decision

Phase 0では以下を採用する。

1. Platform VPCとRuntime VPCを **VPC Peering** で接続する。
2. BFF/Control PlaneはDBへ記録した **Task ENI private IP + 8080** に直接接続する。
3. Runtime側route tableはPlatform VPC CIDRのみPeeringへroutingする。
4. Platform側route tableはRuntime VPC CIDRのみPeeringへroutingする。
5. Runtime Task Security Groupの8080 ingressは **Platform BFF Security Group** からのみ許可する。Workerの署名付き管理API要求はBFFの内部リレーが中継する。
6. Lab GatewayはPlatform署名tokenでWorkspace / Session / Virtual Accountを再検証する。Network到達性だけを認可境界としない。
7. BrowserからTask ENIへ到達するroute、public listener、public IPを作成しない。
8. RuntimeからInternetおよび実AWS public endpointへfallbackする経路を作成しない。

Phase 0ではPeering connection自体とPlatform側routeをPlatform Network IaCの責務とする。RuntimeStackは以下をdeployment parameterとして受け取り、Runtime側routeとSecurity Group ingressを作成する。

- `PlatformAccountId`
- `PlatformVpcCidr`
- `PlatformBffSecurityGroupId`
- `RuntimeVpcPeeringConnectionId`

## Service Discovery

専用Service DiscoveryはPhase 0では導入しない。

Control Plane / Operation WorkerがECS `DescribeTasks`からTask ENI private IPv4 addressを取得し、`lab_runtime.private_endpoint`へ保存する。Task replacement / Resumeでは新Taskのprivate IPへ更新する。

BFFは必ずWorkspaceのactive Runtime metadataを解決してから接続する。利用者入力から接続先IP/hostを直接指定させない。

## Security

### Network

- Runtime Task: public IPなし
- Runtime subnet: Private Isolated
- Internet Gateway / NAT Gatewayなし
- Platform CIDR以外へのPeering routeを作らない
- 8080 ingressはPlatform BFF SGに限定
- MiniStack 4566はTask内loopback用途とし、Security Group ingressを作らない

### Application authentication

Gatewayはprivate network内であってもPlatform tokenを必須とする。

Tokenは最低限以下へbindingする。

- Workspace ID
- Session ID
- Virtual Account ID
- 有効期限

別Workspace用tokenによる呼出しを拒否する。

### Fail closed

以下の場合、BFFはRuntimeへfallback接続しない。

- `private_endpoint`が未確定
- Runtime heartbeat不整合
- Sessionがready以外
- Platform token生成失敗
- Peering/route障害
- Gateway health check失敗

## Alternatives

### Transit Gateway

複数Runtime VPC / 複数Accountへ拡大した段階では有力。Phase 0ではVPC数が少なく、TGW自体の運用・コストを増やすため採用しない。

移行条件の例:

- Runtime VPC/Accountが複数へ増加
- Peering route管理が複雑化
- Network segmentationを中央集約したい

### PrivateLink + NLB

Task単位target registrationとlifecycle同期が必要であり、Phase 0では採用しない。将来、固定service endpointが必要になった場合に再評価する。

### VPC Lattice

サービス間接続、認証、複数VPC接続を統合できるが、Phase 0ではControl Planeの追加実装量が増えるため採用しない。

## Consequences

### Positive

- 既存のTask private IP取得処理をそのまま利用できる。
- Browser公開用Load Balancerが不要。
- Workspace Task誤配信をLoad Balancer層で発生させない。
- 構成が単純でSmoke Testしやすい。

### Negative

- Platform/Runtime双方のroute管理が必要。
- VPC数増加時にはPeering meshが複雑になる。
- private IP変更をControl Plane metadataへ確実に反映する必要がある。

## Phase 0 Smoke Test

実AWSでは最低限以下を確認する。

- Platform BFF subnetからTask Gateway:8080へ疎通可能
- Platform BFF以外のSecurity Groupから8080へ到達不可
- Browser/InternetからTaskへ到達不可
- MiniStack:4566へVPC経由で到達不可
- Task replacement後にBFFが新private endpointへ追従
- 別Workspace tokenが401
- Peering routeを外すとfail closedし、public endpointへfallbackしない

## Follow-up

Runtime VPC数またはAccount数が増えた時点で、VPC PeeringからTransit Gateway等への移行ADRを作成する。
