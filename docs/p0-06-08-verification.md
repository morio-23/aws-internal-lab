# P0-06〜P0-08 検証記録と実AWS Smoke Test

- Date: 2026-10-10（PR #19最終再検証）
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

`pnpm test:integration:db`の15件がlocal PostgreSQL/MiniStackで成功。MiniStackのS3 bucket/object、DynamoDB table/item、SQS queue/message、東京/大阪state分離、Virtual Account/Workspace分離、Control Plane/BFF → 署名付きLab Gateway → MiniStackの操作を含む。Service Capabilityは代表operationのsubsetであり、サービス全体のAWS互換性を意味しない。

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

## PR #19 作業依頼の最終ローカル検証

PR本文に記載された追補前の実測値はunit 46件、DB/MiniStack integration 14件。今回の差分に対する実測値は下表のとおり。`pnpm check`はCIと同じ `MINISTACK_ENDPOINT=http://localhost:4566` を設定して実行した。Gateway fixtureだけで `http://127.0.0.1:4566` を明示し、public endpoint拒否は維持した。

| 実行 | 結果 | 件数・対象 |
| --- | --- | --- |
| `pnpm check` | PASS | lint、architecture boundaries、typecheck、CDK typecheck、unit 64/64、TypeScript build、Web build |
| `pnpm cdk:synth` | PASS | PlatformOperations、PlatformRuntimeConnectivity、Runtimeの既存3 Stack |
| `pnpm test:integration:db` | PASS | local PostgreSQL/MiniStack 15/15、FAIL 0、SKIP 0。S3/DynamoDB/SQS、Virtual Account/Region分離、Snapshot rollbackを含む |
| `docker build -f runtime/standard/ministack.Dockerfile` | PASS | MiniStack 1.5.22 overlay |
| MiniStack live persist→状態ファイル→health | PASS | 稼働中のS3/DynamoDB/SQSを書き込み、3つのJSONを確認。元containerは稼働継続 |
| 保存volumeの別volumeへのcopy→別containerでverify | PASS | S3 object body、DynamoDB item、SQS messageを復元 |
| `docker build -f runtime/standard/operation-worker.Dockerfile` | PASS | Worker imageのローカルbuild |

ローカルsmokeで、root所有の新規volume上ではMiniStack 1.5.22の`save_state`がPermission deniedをログへ記録する一方、元のoverlayはpersist成功を返す問題を検出した。entrypointでstate/S3 data directoryを非rootのMiniStack userへ譲渡し、persist後はcollector失敗と各state fileの更新を確認してから成功を返すよう修正した。CI smokeもroot所有のDocker volumeでS3/DynamoDB/SQS state fileとhealthを検証する。

書き込み不能を再現するためstate directoryを一時的にmode 555へ変更するとpersistはHTTP 500を返し、mode 755へ戻すと再び成功した。権限はテスト後に復元済み。

Gateway quiesce/drain/unquiesce、署名付きadmin、Snapshot/manifest失敗時の元Runtime継続とStopTask未実行、corrupt/incomplete manifest拒否、orphan Task/Volume/Snapshot cleanupはunit/DB integrationに含まれる。実EBS Snapshotと実Fargateのapplication consistencyは未検証。

## 実AWS Smoke Testチェックリスト

- [ ] RuntimeStackを隔離した検証Accountへdeployし、2 AZ subnet、route table、NAT/IGWなし、4 endpoint、private DNSを確認する。
- [ ] GatewayとMiniStackの固定image digestをECRへpushし、ECR pull/CloudWatch Logs送信がisolated subnetから成功することを確認する。Runtime Task SGのegressがInterface Endpoint:443とS3 managed prefix list:443以外へ通らないことも確認する。
- [ ] PlatformOps→Runtime→PlatformConnectivity→PlatformOps更新の順にdeployし、reciprocal routeとBFF SG限定8080 ingressを確認する。Worker→内部BFF→Gatewayの署名付き管理APIとBFF→Gatewayが成功し、Worker/Browser/他SGからGatewayへ直接到達できないことを確認する。
- [ ] Worker Serviceが専用SGのみを使い、private subnetでpublic IPなし、QueueとDB/BFF内部portへ到達し、STSでRuntime roleをAssumeRoleしてECS/EC2/S3を操作できることを確認する。既存private route tableにInternet Gateway/NAT Gatewayへのdefault routeがないことを確認する。
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

1. Platform側reciprocal route、Worker専用SG/Service、FIFO権限、Secrets Manager注入、VPC endpoint、cross-account STSはCDK synthとunit testまで実装した。Worker管理APIは内部BFFリレーへ変更し、Gateway:8080 ingressはBFF SGだけに限定した。既存BFF SG/private subnet/route table、DB、Secret、S3 prefix list IDを接続して実AWSで検証する作業は未実施。WorkerへBFF SGを付けないことはtemplate assertionで確認した。importしたprivate route tableにInternet fallbackがないことはCDK assertionだけでは保証できず、deploy前に実リソースを確認する。
2. PlatformOperationsStackは初回`WorkerDesiredCount=0`で作り、RuntimeStack outputsとWorker imageを登録した後に`1`へ更新する。実Queue配送、WorkerのECS/DB/STS/EC2/S3権限、Peering/BFF→Gateway疎通は未検証。詳細は`infra/cdk/README.md`。
3. MiniStack標準機能はshutdown保存のみだが、ADR-0006のPhase 0 overlayでlive persistを追加し、Suspendを `quiesce -> live persist -> EBS Snapshot -> manifest -> StopTask` に変更した。Snapshot/manifest失敗時は元Taskを止めずunquiesceするため、非破壊rollbackはローカル実装上成立した。実EBS上でのapplication consistencyはAWS Smoke未確認。
4. Managed EBS volume/Snapshotの所有tagとorphan cleanupは実装したが、実ECS managed EBSでtag/status/削除、およびpending EBS Snapshot削除要求が想定通りになることはAWS Smokeで確認が必要。
5. EBS Snapshot作成、task volume attach、Fargate上のMiniStack graceful shutdown、Endpoint経由image pullは実AWSで未確認。Issue #9はOpenのまま維持する。
6. MiniStack overlayはupstream private/internal symbolへ依存するため、1.5.22からのversion更新時に互換性試験が必要。将来upstreamがlive persistを正式提供した場合はoverlayを廃止する。
