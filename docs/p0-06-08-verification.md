# P0-06〜P0-08 検証記録と実AWS Smoke Test

- Date: 2026-10-08
- Scope: AWS非依存の実装・CDK synth・local PostgreSQL/MiniStack検証
- 実AWS deploy: 未実施

## P0-06 Issue #7 Acceptance 判定

| Acceptance | AWS非依存の証拠 | 実AWSで残る確認 |
| --- | --- | --- |
| APIからStandard Runtime start/stop | Control Plane → Outbox → FIFO Queue interface → Operation Worker → `StandardRuntimeProvisioner`のDB結合試験成功 | 実SQS/ECS `RunTask`/`StopTask`とGateway到達性 |
| BrowserからRuntimeへ直接到達不可 | Webは同一Origin `/platform-api`、BFFがPrivate Gatewayへ署名付き転送。CDKにpublic listenerなし | ネットワーク経路と外部からの到達不能性 |
| public IPなし | `RunTask` mockで`assignPublicIp=DISABLED`、CDKにIGW/NATなし | task ENIにpublic IPがないこと |
| runtime identityがWorkspaceにbinding | Task環境変数、Gatewayの署名token・Workspace/Session/Account/Region検証unit test | 実Taskのbindingと権限境界 |
| task crashをSession failedとして検出 | `reconcileStandardRuntimes`のDB結合試験成功 | 実Task crash後の検知時間・DB遷移 |
| cleanupでorphan taskを残さない | ECS一覧mockのpagination/tag選別、DB参照と10分grace付き停止unit test | 実ECS orphan停止、残存EBS volume清掃 |

CDK template assertionは2 AZのPrivate Isolated subnet、NAT/IGWなし、S3 Gateway Endpoint、ECR API/DKR・Logs Interface Endpoint、ECS Cluster、Fargate Task Definition、2 container、非privileged、Docker socketなし、ECS IAM権限を確認する。ADR-0005をAcceptedとし、Phase 0 private accessはVPC Peering + Task private IPと決定した。RuntimeStackにはPlatform CIDR向けPeering routeとPlatform BFF Security Groupから8080へのingressを追加した。`pnpm cdk:synth`は`cdk.out/AwsInternalLabRuntime.template.json`を生成する。実AWSでの成立はこの結果から推定しない。

Fargate GatewayはMiniStack endpointを`127.0.0.1`のHTTP loopbackに限定し、設定ミスによるAWS public endpointへの転送を起動時に拒否する。

## P0-07 Issue #8 local結果

`pnpm test:integration:db`の14件がlocal PostgreSQL/MiniStackで成功。MiniStackのS3 bucket/object、DynamoDB table/item、SQS queue/message、東京/大阪state分離、Virtual Account/Workspace分離、Control Plane/BFF → 署名付きLab Gateway → MiniStackの操作を含む。Service Capabilityは代表operationのsubsetであり、サービス全体のAWS互換性を意味しない。

## P0-08 Issue #9 local結果

GatewayにはPlatform token必須の `POST /admin/quiesce` / `POST /admin/persist` / `POST /admin/unquiesce` を追加した。quiesce開始後は新規invokeを409で拒否し、既存in-flight requestが0になるまでdrainする。MiniStack 1.5.22向けASGI overlay `/_aws_internal_lab/persist` を追加し、upstream自身の `save_all(_build_persistence_save_dict())` と `os.sync()` をTask停止前に実行する。ADR-0006を参照。

`tests/snapshot/ministack-persistence.test.ts`をwrite/verifyの2段階で実施。MiniStack 1.5.22を停止し、`PERSIST_STATE`によるshutdown flushをログで確認した後、状態ボリュームを別ボリュームにコピーして別containerを起動した。復元後、S3 object body、DynamoDB item、SQS messageを取得できた。AWS EBS Snapshot API、ECS task replacement、S3 manifestとDB状態遷移の全結合試験ではない。Manifestのchecksum欠落・不一致、未対応formatの拒否はunit test対象。

## 2026-10-08 AWS非依存で追加した安全策

- ADR-0005をAccepted: Phase 0はVPC Peering + Task ENI private IPを採用。
- RuntimeStackへPeeringのRuntime側routeとBFF SG限定8080 ingressを追加。
- PlatformOperationsStackを追加し、SQS FIFO operation queue、FIFO DLQ、immutable ECR Worker repositoryをIaC化。
- Managed EBS volumeへ `ManagedBy` / `WorkspaceId` / `SessionId` tagを付与。
- Reconcilerへ、DB上activeでない・`available`・grace期間超過のmanaged EBS volume削除を追加。
- Managed EBS Snapshotを `OwnerIds=self` + `ManagedBy=aws-internal-lab` で棚卸しし、DB上保護対象でない古いSnapshotを削除するReconcilerを追加。available/restoring/quarantinedと直近1時間のcreatingは保護する。
- Runtime Task SGをDefault Deny egressへ変更。ECR/CloudWatch Logs interface endpoint:443と、S3 managed prefix list:443だけを許可する。
- Gateway quiesce/drain protocolを追加。新規操作停止とin-flight=0をunit test対象とし、Operation WorkerのSuspend処理からquiesceを呼ぶよう結線した。
- MiniStack 1.5.22のlive persist overlayを追加。Gatewayからloopbackでpersistし、filesystem sync後にEBS Snapshotを作成する非破壊順序へ変更した。
- EBS Snapshot/manifest作成失敗時はStopTaskを実行せずGatewayをunquiesceする。DB integration testでこのrollbackを固定した。

## 実AWS Smoke Testチェックリスト

- [ ] RuntimeStackを隔離した検証Accountへdeployし、2 AZ subnet、route table、NAT/IGWなし、4 endpoint、private DNSを確認する。
- [ ] GatewayとMiniStackの固定image digestをECRへpushし、ECR pull/CloudWatch Logs送信がisolated subnetから成功することを確認する。Runtime Task SGのegressがInterface Endpoint:443とS3 managed prefix list:443以外へ通らないことも確認する。
- [ ] Platform側VPC Peering作成、reciprocal route、BFF Security GroupをIaC化し、RuntimeStackのPeering parameterへ接続する。Platform/BFFからRuntime Gateway:8080へ到達し、Browser/他SGから到達できないことを確認する。
- [ ] API startを実行し、TaskがFARGATE、public IPなし、Task Roleに業務AWS権限なし、privilegedなし、Docker socket mountなし、Workspace/Session/Virtual Account bindingありと確認する。
- [ ] Lab Credentialから実AWS public endpointへの通信が失敗し、AWS credentialがLabへ渡されないことを確認する。
- [ ] API stop後にTask停止、Session終了、source EBS volumeの削除を確認する。
- [ ] Taskを強制停止し、reconcilerがSessionをfailedにすることを確認する。
- [ ] DB参照のない管理タグ付きTaskを作り、grace期間後にreconcilerが停止することを確認する。無関係Taskが停止されないことも確認する。
- [ ] DB参照のない `ManagedBy=aws-internal-lab` のavailable EBS volumeを作り、grace期間後にreconcilerが削除すること、active volumeと無関係volumeを削除しないことを確認する。
- [ ] failed/expired等でDB保護対象外となった管理EBS Snapshotを作り、grace期間後にreconcilerが削除要求すること、available/restoring/quarantinedおよび実行中creating Snapshotを削除しないことを確認する。
- [ ] S3/DynamoDB/SQSの代表dataを作成し、Suspend時にGateway quiesce→MiniStack live persist→filesystem sync→EBS Snapshot completed→manifest checksum→DB availableの順になることを確認する。
- [ ] 新TaskへResumeし、3サービスのdata、Virtual Account、ARNが維持されることを確認する。
- [ ] EBS Snapshot作成失敗を注入し、StopTaskが呼ばれず元Runtimeがunquiesceされることを確認する。
- [ ] corrupt/incomplete manifest、StopTask失敗、Resume失敗を注入し、元Snapshot保全とorphan Task/Volume清掃を確認する。

## Blocker / known limitations

1. ADR-0005の接続方式は確定しRuntime側IaCも追加したが、Platform側VPC Peering作成・reciprocal route・BFF/Worker SGのIaCは未実装。実AWS疎通は未確認。Runtime側はDefault Deny egressへ変更済みで、deploy時にRegionのS3 managed prefix list IDをparameterとして渡す必要がある。
2. SQS FIFO/DLQとWorker用ECRはPlatformOperationsStackへ追加した。Operation Worker ECS Service、Task Role、DB secret/network、Queue権限、Runtime Accountへの権限委譲は未整備。
3. MiniStack標準機能はshutdown保存のみだが、ADR-0006のPhase 0 overlayでlive persistを追加し、Suspendを `quiesce -> live persist -> EBS Snapshot -> manifest -> StopTask` に変更した。Snapshot/manifest失敗時は元Taskを止めずunquiesceするため、非破壊rollbackはローカル実装上成立した。実EBS上でのapplication consistencyはAWS Smoke未確認。
4. Managed EBS volume/Snapshotの所有tagとorphan cleanupは実装したが、実ECS managed EBSでtag/status/削除、およびpending EBS Snapshot削除要求が想定通りになることはAWS Smokeで確認が必要。
5. EBS Snapshot作成、task volume attach、Fargate上のMiniStack graceful shutdown、Endpoint経由image pullは実AWSで未確認。Issue #9はOpenのまま維持する。
6. MiniStack overlayはupstream private/internal symbolへ依存するため、1.5.22からのversion更新時に互換性試験が必要。将来upstreamがlive persistを正式提供した場合はoverlayを廃止する。
