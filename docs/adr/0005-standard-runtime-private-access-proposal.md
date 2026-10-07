# ADR-0005候補: PlatformからStandard Runtime GatewayへのPrivate Access

- Status: Proposed / 未決定
- Date: 2026-10-07

## Context

RuntimeStackのTaskはPrivate Isolated subnetに置き、public IP、IGW、NATを持たない。Control Plane/BFFはGatewayのprivate IPへHTTP接続する設計だが、PlatformとRuntime Account間のrouting、DNS、Security Group ingressはまだ定義されていない。現Task SGには8080 ingressがないため、実AWSでのBFF→Gateway疎通は未検証かつ現templateだけでは成立しない。

## 要決定事項

- Platform VPCとRuntime VPCの接続方式（例: Transit Gateway、PrivateLink等）
- Account境界を越えた8080 ingressの限定方法
- BFFがTask IP更新を安全に追うService Discovery方式
- Workspace間Gatewayへの横断接続を防ぐ認可とNetwork Policy
- RuntimeからAWS public endpointへfallbackしないことの実測方法

## 現時点の扱い

方式は未選定。P0-06のCDK synthおよびlocal mock testはNetwork成立の証拠として扱わない。方式決定後にADRをAcceptedへ更新し、CDK、疎通試験、Security Smoke Testを追加する。
