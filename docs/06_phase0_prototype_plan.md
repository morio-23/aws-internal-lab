# Phase 0 Prototype 実装計画

- Status: Approved for implementation
- Date: 2026-10-07
- Purpose: AWS Internal Labの中核アーキテクチャ成立性を縦切りで検証する
- Scope: Production完成ではなく、基本設計の主要技術判断にGo/No-Goを出せるPrototype

## 1. Prototype Goal

Phase 0ではAWSサービス数を広げることより、以下の一連の経路が実際に成立することを優先する。

```text
Corporate Login
  ↓
Web / BFF
  ↓
LabWorkspace
  ├ Virtual Account ID
  ├ Tokyo  ap-northeast-1
  └ Osaka  ap-northeast-3
  ↓
Lab Gateway
  ↓
Provider Routing
  ↓
Standard Fargate / MiniStack
  ↓
Snapshot
  ↓
Shared Advanced Worker
  ↓
Lab microVM
  ↓
DR Fault Injection / Failover
```

## 2. Prototype Done Criteria

以下をすべて満たした場合、Phase 0 Prototypeを技術成立と判定する。

1. 社内認証またはPrototype用認証stubでLoginでき、Application Roleを解決できる。
2. LabWorkspaceを作成し、12桁Virtual Account IDを払い出せる。
3. 同一Workspaceで東京 `ap-northeast-1` と大阪 `ap-northeast-3` を切り替えられる。
4. Standard RuntimeをECS/Fargateで起動できる。
5. Lab GatewayがWorkspace / Account / Region / Operationを検証できる。
6. Operation単位でMiniStack / Internal / DenyへProvider Routingできる。
7. S3 / DynamoDB / SQSの代表CRUD/Data Planeを利用できる。
8. Standard RuntimeをSuspendし、Snapshot保存後にRuntimeを破棄できる。
9. 新しいStandard RuntimeへResumeし、resource/dataを復元できる。
10. Nested Virtualization対応EC2 Worker上でLab単位microVMを起動できる。
11. 1台のWorker Hostへ2つ以上のLab microVMを同居させ、相互分離を確認できる。
12. Advanced必須OperationからStandard → Advanced Promotionを自動実行できる。
13. RDSまたはDocker-backed LambdaをAdvanced microVM内で動作させられる。
14. Advanced LabをSuspendし、別microVMへResumeできる。
15. 東京Virtual Region障害をWorkspace単位でFault Injectionし、大阪側resourceへfailoverできる。
16. Lab Credentialから実AWS public endpointへ到達できないことを検証できる。
17. Correlation ID / Auditにより一連の操作を追跡でき、Secret/Payload本文を記録しない。

## 3. Prototype Technology Baseline

最終技術選定を拘束しないPhase 0 baselineとして以下を採用する。

| Area | Prototype baseline |
| --- | --- |
| Repository | pnpm workspace / TypeScript monorepo |
| Web | Next.js |
| API / Control Plane | Node.js + TypeScript |
| DB access | PostgreSQL driver + migration tool。ORMは実装Issueで最小選定 |
| Queue | SQS FIFO |
| Standard Runtime | ECS/Fargate |
| Lab Engine | MiniStack |
| Advanced Worker | Nested Virtualization対応EC2 |
| microVM | Firecracker/KVM第一候補 |
| Worker Agent | Host lifecycleを安全に扱える実装。Goを第一候補、PoCでは最小構成可 |
| Snapshot | S3 + manifest/checksum |
| IaC | PrototypeではAWS CDK TypeScriptを第一候補 |
| CI | GitHub Actions + AWS OIDC |
| Telemetry | CloudWatch + OpenTelemetry互換 |

Prototype baselineで技術的問題が判明した場合、ADRを追加して変更する。

## 4. Repository Layout

初期案:

```text
apps/
  web/
  control-plane/
  operation-worker/
  lab-gateway/

packages/
  domain/
  db/
  aws-virtual/
  service-capabilities/
  observability/
  test-utils/

runtime/
  standard/
  advanced-worker/
  microvm/

infra/
  cdk/

tests/
  contract/
  integration/
  e2e/
  security/
  snapshot/

docs/
```

## 5. Implementation Order

### Stage A - Platform Skeleton

- P0-01 Repository / Toolchain Bootstrap
- P0-02 Control Plane / DB / Authentication Skeleton
- P0-03 LabWorkspace / Virtual AWS Namespace
- P0-04 Lifecycle Operation / Outbox / Idempotency

Exit:
Workspace作成とOperation状態遷移がlocal integration testで動作する。

### Stage B - Standard Runtime

- P0-05 Lab Gateway / Provider Routing / Lab Credential
- P0-06 Standard Fargate Runtime
- P0-07 S3 / DynamoDB / SQS Vertical Slice
- P0-08 Standard Snapshot / Resume

Exit:
Fargate上のWorkspaceをSuspend/Resumeしてdataを復元できる。

### Stage C - Advanced Runtime

- P0-09 Nested Virtualization / Firecracker Technical Spike
- P0-10 Shared Worker Agent / microVM Isolation
- P0-11 Advanced Promotion / RDS or Lambda Vertical Slice
- P0-12 ACU Scheduler / Shared Worker Capacity

Exit:
1 EC2上に2 Labを安全に同居させ、StandardからAdvancedへPromotionできる。

### Stage D - Multi-Region / Safety

- P0-13 Tokyo / Osaka Virtual Region and DR Fault Injection
- P0-14 Network / Real AWS Egress Guard
- P0-15 Audit / Correlation / Observability
- P0-16 CI/CD / Compatibility / Snapshot Gates

Exit:
DR演習、安全性、追跡性、再現可能buildを確認できる。

### Stage E - Prototype Qualification

- P0-17 End-to-End Prototype Qualification

Exit:
17のPrototype Done Criteriaを自動/手動試験で証跡化し、Go/Conditional Go/No-Goを決定する。

## 6. Issue Dependency Graph

```text
P0-01
  ↓
P0-02
  ↓
P0-03
  ↓
P0-04
  ↓
P0-05
  ├──────────────┐
  ↓              ↓
P0-06          P0-14
  ↓
P0-07
  ↓
P0-08
  ↓
P0-09
  ↓
P0-10
  ↓
P0-11
  ↓
P0-12
  ↓
P0-13
  ├── P0-15
  └── P0-16
       ↓
     P0-17
```

P0-14/15/16は依存する最低基盤が揃い次第並行可能。

## 7. Go / No-Go Gates

### Gate A - Standard Feasibility

Go条件:

- Fargate上でMiniStack P0 sliceが安定動作
- Lab Gatewayのroutingが成立
- Snapshot / Resumeで主要state/dataが復元

No-Go/Redesign条件:

- Fargate制約によりStandard Runtimeが成立しない
- MiniStack persistenceが継続利用に耐えない
- Provider RoutingでAWS API compatibilityを維持できない

### Gate B - Advanced Isolation

Go条件:

- Nested Virtualization対応WorkerでKVM/microVM起動
- 2 Lab以上の同居
- Cross-Lab / Host / IMDS遮断
- Docker-backed serviceの実行
- Snapshotから別microVMへのrestore

No-Go/Redesign条件:

- Nested virtualization / Firecrackerの性能・制約が実用にならない
- tenant isolationを十分に担保できない
- Worker密度が低く1 Lab 1 EC2とコスト差が出ない

### Gate C - Cost

Phase 0実測から以下を算出する。

- Standard Lab 1時間あたり概算
- ACU-hour概算
- Worker class別usable ACU
- Host overhead
- Advanced Lab concurrency別の1 Lab-hour
- 1 Lab = 1 EC2との損益分岐

Goの目安:

共有Workerが想定利用率でDedicated EC2より明確に低コスト、または同程度のコストで運用/隔離上の価値があること。

### Gate D - DR Learning

Go条件:

- Tokyo / Osaka state separation
- Fault InjectionがWorkspace外へ波及しない
- 少なくとも1つのcross-region replication scenario
- failover / failback手順が再現可能

## 8. Prototype Test Matrix

| Area | Required test |
| --- | --- |
| Workspace | account ID uniqueness / owner isolation |
| Region | Tokyo/Osaka state separation |
| ARN | Runtime/Provider切替後も不変 |
| Gateway | provider route / deny / invalid region |
| Credential | real AWS-like credential拒否 / public egress deny |
| Lifecycle | duplicate request / concurrent mutation / compensation |
| Snapshot | checksum / incomplete upload / old runtime cleanup |
| Fargate | crash / restart / idle suspend |
| microVM | host/IMDS/cross-lab isolation |
| Worker | bin-pack / no-capacity / drain |
| DR | Tokyo fault / Osaka continue / recovery |
| Audit | correlation / payload redaction |
| Release | pinned image / compatibility regression |

## 9. Prototype Non-Goals

Phase 0では以下を完成させない。

- 269サービスの実装
- AWS Console全画面
- Challenge / scoring / course
- Production-grade全サービスDR
- SnapshotのCross-Region payload replication
- Full live migration
- Advanced Workerの最終Savings Plan
- 外部公開
- 完全なDLP

## 10. Deliverables

- 動作するPrototype
- IaC
- Automated tests
- Phase 0 benchmark結果
- Security isolation test結果
- Cost comparison
- Compatibility更新
- Go/No-Go report
- 必要なADR


## 11. GitHub Issue Map

- Epic: #1
- P0-01: #2
- P0-02: #3
- P0-03: #4
- P0-04: #5
- P0-05: #6
- P0-06: #7
- P0-07: #8
- P0-08: #9
- P0-09: #10
- P0-10: #11
- P0-11: #12
- P0-12: #13
- P0-13: #14
- P0-14: #15
- P0-15: #16
- P0-16: #17
- P0-17: #18

Issueの依存順は本書のImplementation Orderを正とする。
