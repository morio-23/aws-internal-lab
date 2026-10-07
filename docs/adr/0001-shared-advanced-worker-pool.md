# ADR-0001: Advanced Runtime は共有EC2 Worker Pool上のLab単位microVMとする

- Status: Accepted
- Date: 2026-10-07
- Decision scope: Advanced Runtime / Cost / Tenant Isolation

## Context

AWS Internal Labでは、通常のControl Plane/Functional EmulatorはECS/Fargateで安全かつ低コストに提供できる一方、RDS、ECS、EKS、Docker Lambda、CodeBuild等の一部L3機能はDocker daemon、KVM、DB/container runtime等を必要とする。

全LabにEC2を割り当てる方式は単純だが、Advanced機能を利用しない時間も含めてEC2台数がLab数に比例し、初期段階からコスト効率が悪い。

一方、1台のEC2上で複数利用者のDocker containerを直接混在させる方式は、EC2 container host上のcontainerを強いsecurity boundaryとして扱えないため、本Labのtenant isolation要件と合わない。

2026年時点ではAmazon EC2の対応instance familyでNested Virtualizationが利用でき、KVMをL1 hypervisorとして実行できる。このため、共有EC2 host上にLab単位のmicroVMを配置し、VM境界でtenantを分離する構成を採用できる。

## Decision

### 1. Standard Lab

Advanced機能を必要としないLabは、従来どおり1 Active Lab = 1 ECS/Fargate Taskを基本とする。

Fargate Task内に以下を配置する。

- Lab Router
- MiniStack
- Internal Emulator
- Snapshot Agent

### 2. Advanced Lab

Advanced機能が必要なLabは、Fargate TaskをSuspendし、状態をSnapshotした上で、共有Advanced Worker Pool上のLab専用microVMへResumeする。

利用者から見たLabWorkspace、Virtual AWS Account ID、Region、ARN namespaceは変更しない。

```text
LabWorkspace
    │
    ├─ Standard active
    │     ECS/Fargate
    │
    └─ Advanced active
          Shared EC2 Worker Pool
                  │
            Firecracker/KVM
                  │
             microVM per Lab
                  │
          MiniStack + Docker
          Internal Emulator
```

同一LabについてFargate RuntimeとAdvanced microVMを同時Activeにはしない。これにより、Cross-Service Integrationとstate ownershipを単一Runtimeに保つ。

### 3. Shared Worker Pool

Advanced WorkerはAuto Scaling Groupで管理する。

各WorkerはNested Virtualization対応EC2 Instanceを使用する。

初期候補:

- M7i / M7i-flex
- M8i / M8i-flex
- C7i / C8i
- R7i / R8i

実際のinstance family/sizeはPhase 0のbenchmarkと東京Regionの価格・供給状況を基に決定する。

Worker Host上では利用者コードやLab Docker containerを直接実行しない。Worker Hostが実行するのは以下のみとする。

- Worker Agent
- Firecracker/KVM
- microVM lifecycle process
- network/storage isolation process
- monitoring agent

### 4. Isolation Boundary

1 Lab = 1 microVM とする。

microVM内部にはそのLab専用の以下を配置する。

- MiniStack
- Docker Engine
- RDS/ElastiCache等のbackend container
- ECS/Lambda/CodeBuild等のuser workload
- Internal Emulator
- Lab-local state

異なるLabのDocker daemon、filesystem、PID namespace、guest kernelは共有しない。

Firecrackerを採用する場合はproduction hostでJailer、seccomp、cgroups、namespace isolation、non-root executionを必須とする。

### 5. Resource Profiles

Advanced microVMは固定profileから選択する。

初期案:

| Profile | vCPU | Memory | Lab data disk | 用途 |
| --- | ---: | ---: | ---: | --- |
| small | 1 | 2 GiB | 8 GiB | 小規模RDS/Lambda |
| medium | 2 | 4 GiB | 16 GiB | RDS + Lambda / ECS |
| large | 4 | 8 GiB | 32 GiB | EKS/複数backend |

利用者が任意のCPU/Memoryを指定する方式は採用しない。

HostはOS/Worker Agent/Firecracker overheadのためCPU/Memoryの15〜20%を予約し、残りのみをmicroVMへ割り当てる。

### 6. Placement / Bin Packing

Schedulerはmemoryを第一制約、vCPUを第二制約としてbin-packする。

新規Advanced Lab要求時:

1. ReadyなWorkerから必要profileを収容可能なhostを検索する。
2. 収容可能なWorkerがあれば最も残余capacityが小さくなるhostへ配置する。
3. なければASGをscale outする。
4. Workerがreadyになった後にmicroVMを起動する。

1 host上の最大microVM数にもhard limitを設定する。

### 7. Scale Out / Scale In

Scale Out条件:

- placement可能なWorkerが存在しない
- memory reservationが閾値を超過
- active microVM数がhost上限へ到達

Scale In条件:

- Worker上のactive microVMが0
- drain完了
- minimum idle period経過

Active microVMを別Workerへlive migrationすることは初期要件としない。

Worker障害時は、そのLabをfailedとして扱い、最新Snapshotから別WorkerへResumeする。

### 8. Worker Capacity

初期段階ではActive learner workloadにSpot Instanceを利用しない。

使用量が安定した後、以下を検討する。

- Compute Savings Plans / EC2 Instance Savings Plans
- Business hoursだけmin capacity = 1
- Off-hours min capacity = 0
- compatibility test/CI workloadのみSpot

### 9. Networking

各microVMは専用network namespace/TAPを持つ。

- microVMからInternetへの直接egressは禁止
- corporate networkへのrouteを持たせない
- IMDS `169.254.169.254` へ到達させない
- HostのDocker socket、filesystem、management portへ到達させない
- Cross-Lab trafficをdeny
- Platform/Runtime Gatewayから当該Lab endpointへのみ到達可能

外部通信が必要な学習シナリオはLab-aware Egress Proxyを経由する。

### 10. Storage

Worker Hostには暗号化EBS data volumeを配置し、Labごとに専用disk imageを作成する。

- disk imageを異なるmicroVM間で共有しない
- host directoryをguestへshared mountしない
- microVM終了時にLab diskをSnapshot Storeへ保存する場合のみexportする
- Suspend/Stop後にlocal disk imageを削除する
- Worker lifecycle終了時にdata volumeをDeleteOnTerminationで削除する

Snapshot StoreのS3/KMSポリシーは既存設計に従う。

### 11. Snapshot

Standard → Advanced:

1. Fargateをquiesce
2. Snapshot作成
3. Fargate Task削除
4. Workerをallocate
5. Lab microVM作成
6. Snapshot restore
7. MiniStack/Docker起動
8. health check
9. ready

Advanced → Suspend:

1. mutation停止
2. user workload停止
3. MiniStack graceful shutdown
4. guest filesystem flush
5. microVM停止
6. state/data disk export
7. Snapshot S3 upload/checksum
8. local disk削除
9. placement解放

Advanced → Standardへの自動降格は行わない。Advanced-only resourceが存在しないことを検証した上で、将来の明示操作として提供可能とする。

### 12. Host Security

Worker Hostでは以下を必須とする。

- SSH原則無効
- SSM Session ManagerのみBreak Glassで利用
- IMDSv2 required
- host instance role最小権限
- microVM guestからIMDS route deny
- SELinux enforcingを優先
- immutable/managed AMI
- regular patch/recycle
- ECR/image digest pin
- Worker Agent以外のmanagement APIをVPC公開しない
- Worker Agent endpointはPlatform Control Planeからのみ認証付きアクセス

### 13. Cost Model

Advanced compute costはLab数ではなくWorker capacityで決まる。

```text
Advanced Cost
  ≒ Σ Worker EC2 runtime
    + Worker EBS
    + Snapshot S3/KMS
```

1 Lab = 1 EC2と比較し、unused capacityを複数Labでbin-packすることでAdvanced利用率が上がるほどコスト効率を改善できる。

Standard LabはFargateのまま維持し、Advanced機能を必要としないLabがWorker Pool capacityを消費しないようにする。

## Consequences

### Positive

- Advanced EC2台数がLab数に1:1で増えない
- Standard LabのFargateコスト特性を維持できる
- 同一EC2上でもLab間はguest kernel/KVM境界で分離できる
- Docker escapeが発生しても原則として当該microVM内へblast radiusを限定できる
- MiniStackとDocker backendを同じmicroVM内へ置けるためremote Docker APIをVPCへ公開しなくてよい
- Cross-Service Integrationを1 Lab = 1 Active Runtimeで単純化できる

### Negative

- Worker SchedulerとmicroVM lifecycle管理が必要
- Nested Virtualization対応instance familyに依存する
- Fargate-only構成よりHost OS/KVM/Firecrackerのpatch責任が増える
- microVM boot imageとguest OSの保守が必要
- Worker障害時のactive LabはHAではなくSnapshotからの再開となる

## Rejected Alternatives

### 1 Lab = 1 EC2

Isolationは単純だが、Advanced Lab数にEC2台数が比例し、初期からコスト効率が悪いため不採用。

### Shared Docker Host

1 EC2上に複数LabのDocker containerを直接配置する方式。Containerをtenant security boundaryとして扱えず、Lab間分離要件に適さないため不採用。

### Fargate MiniStack + Remote Docker Host

Fargateを常時維持し、Docker-backed機能だけ共有EC2へremote `DOCKER_HOST`で逃がす方式。MiniStack側にremote Dockerの素地はあるが、Docker APIの強い権限、Labごとのendpoint routing、state一貫性、二重compute costが増えるため初期採用しない。

## Validation Required

Phase 0で以下を検証する。

1. 東京RegionでNested Virtualization対応instance typeが利用可能であること
2. Firecracker/KVM microVMの起動・停止時間
3. 1 hostあたりの安全なmicroVM収容数
4. RDS / ECS / EKS / Lambda Docker / CodeBuild / OpenSearch等のL3動作
5. Standard → Advanced Snapshot migration
6. Advanced Snapshot → 別Worker restore
7. Cross-Lab network isolation
8. guest → IMDS/host filesystem/host management endpoint遮断
9. CPU/Memory/Disk starvation耐性
10. Worker kill時のblast radiusと復旧手順
