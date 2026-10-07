# ADR-0004: Standard Runtime SnapshotはECS managed EBS Snapshotを使用する

- Status: Accepted
- Date: 2026-10-07

## Context

MiniStackは `PERSIST_STATE=1` の場合、ASGI lifespan shutdown時に全service stateを `STATE_DIR` へ保存する。

Fargateのephemeral task volumeを使用したままでは、MiniStackを正常停止した後にtask filesystemを別processから取得できず、停止前のlive archiveではapplication-consistent snapshotを保証しにくい。

Amazon ECS standalone taskは、task definitionで `configuredAtLaunch=true` としたAmazon EBS volumeをFargate taskへattachでき、`deleteOnTermination=false` によりtask停止後もvolumeを保持できる。

## Decision

Standard Runtimeの `/lab-state` はECS managed EBS volumeを使用する。

```text
Active Fargate Task
  └ /lab-state -> ECS managed encrypted EBS
        │
        │ Suspend
        ▼
Gateway mutation freeze
        ↓
ECS StopTask
        ↓
MiniStack graceful shutdown
        ↓
PERSIST_STATE save_all()
        ↓
Task STOPPED
        ↓
EBS volume preserved
        ↓
CreateSnapshot
        ↓
Snapshot completed
        ↓
S3 manifest publish
        ↓
DB snapshot status = available
        ↓
source EBS volume delete
```

Resume:

```text
LabSnapshot
  └ EBS snapshot ID
        ↓
RunTask(volumeConfigurations.snapshotId)
        ↓
new encrypted EBS volume
        ↓
mount /lab-state
        ↓
MiniStack startup / state restore
        ↓
health check
        ↓
Workspace ready
```

## Storage Roles

### EBS Snapshot

Standard Runtimeの実state/data payloadを保持する。

- encryption required
- dedicated KMS keyをProductionでは使用する
- Cross-Region copyは初期無効
- AWS Backup / DLMの自動長期保護対象外
- retention expiration時にDeleteSnapshot
- incident purge時にDeleteSnapshot
- public sharing禁止

### Snapshot S3

共通manifest/audit metadataを保持する。

Standard Snapshotのmanifest例:

```json
{
  "snapshotFormatVersion": 1,
  "runtimeType": "standard",
  "payloadType": "ebs-snapshot",
  "ebsSnapshotId": "snap-...",
  "workspaceId": "...",
  "engineVersion": "...",
  "engineImageDigest": "...",
  "createdAt": "...",
  "consistencyLevel": "application-consistent"
}
```

S3へStandard Runtimeのblock payloadそのものを二重保存しない。

## Failure Semantics

- ECS StopTask前にSnapshot recordを `creating` とする。
- task停止失敗時はSnapshotをfailedとし、Runtime状態を再評価する。
- EBS snapshot作成失敗時は元EBS volumeを削除しない。
- manifest publish失敗時はEBS snapshotを保持し、retry可能とする。
- DBを `available` にする前にEBS snapshot completionとmanifest存在を確認する。
- Resume失敗時は元EBS snapshotを変更・削除しない。
- Resumeで作成したpartial EBS volume/taskのみcleanupする。

## Cost

Active Standard Labごとに小容量gp3 EBS costが追加される。

Prototype初期値は8 GiBとし、Phase 0 benchmarkで実state量を測定して最小化する。

Fargate task停止後のsource volumeはSnapshot作成完了後すぐ削除し、idle EBS volume costを残さない。

## Security

- task roleへEC2/EBS権限を付与しない
- EBS attach/manageはECS infrastructure roleのみ
- snapshot create/deleteはRuntime Orchestratorの限定権限
- learner codeからEBS APIへ到達不可
- Snapshot IDはPlatform metadataで管理し、利用者へraw EC2 API accessを与えない

## Consequences

### Positive

- MiniStackの正式なshutdown persistence pathを利用できる
- live filesystem archiveを避けられる
- Resume時にfilesystemをそのまま復元できる
- task/containerへS3 snapshot upload権限を与えずに済む
- source task停止後もstateを安全に保持できる

### Negative

- Active LabごとにEBS料金が追加される
- ECS EBS infrastructure roleが必要
- snapshot lifecycle/delete orchestrationが必要
- Standard Snapshot payloadがS3単一storeではなくEBS Snapshotへ分かれる

## References

- Amazon ECS configuredAtLaunch / managed EBS volumes
- Amazon ECS standalone task EBS termination policy
- MiniStack persistence shutdown behavior
