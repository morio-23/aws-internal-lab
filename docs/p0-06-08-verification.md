# P0-06〜P0-08 検証記録と実AWS Smoke Test

- Date: 2026-10-07
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

CDK template assertionは2 AZのPrivate Isolated subnet、NAT/IGWなし、S3 Gateway Endpoint、ECR API/DKR・Logs Interface Endpoint、ECS Cluster、Fargate Task Definition、2 container、非privileged、Docker socketなし、ECS IAM権限を確認する。`pnpm cdk:synth`は`cdk.out/AwsInternalLabRuntime.template.json`を生成する。実AWSでの成立はこの結果から推定しない。

Fargate GatewayはMiniStack endpointを`127.0.0.1`のHTTP loopbackに限定し、設定ミスによるAWS public endpointへの転送を起動時に拒否する。

## P0-07 Issue #8 local結果

`pnpm test:integration:db`の14件がlocal PostgreSQL/MiniStackで成功。MiniStackのS3 bucket/object、DynamoDB table/item、SQS queue/message、東京/大阪state分離、Virtual Account/Workspace分離、Control Plane/BFF → 署名付きLab Gateway → MiniStackの操作を含む。Service Capabilityは代表operationのsubsetであり、サービス全体のAWS互換性を意味しない。

## P0-08 Issue #9 local結果

`tests/snapshot/ministack-persistence.test.ts`をwrite/verifyの2段階で実施。MiniStack 1.5.22を停止し、`PERSIST_STATE`によるshutdown flushをログで確認した後、状態ボリュームを別ボリュームにコピーして別containerを起動した。復元後、S3 object body、DynamoDB item、SQS messageを取得できた。AWS EBS Snapshot API、ECS task replacement、S3 manifestとDB状態遷移の全結合試験ではない。Manifestのchecksum欠落・不一致、未対応formatの拒否はunit test対象。

## 実AWS Smoke Testチェックリスト

- [ ] RuntimeStackを隔離した検証Accountへdeployし、2 AZ subnet、route table、NAT/IGWなし、4 endpoint、private DNSを確認する。
- [ ] GatewayとMiniStackの固定image digestをECRへpushし、ECR pull/CloudWatch Logs送信がisolated subnetから成功することを確認する。
- [ ] Platform/BFFからRuntime Gatewayへの**private network path**と8080 ingressを設計・実装し、BrowserからTask ENIへ直接到達できないことを確認する。
- [ ] API startを実行し、TaskがFARGATE、public IPなし、Task Roleに業務AWS権限なし、privilegedなし、Docker socket mountなし、Workspace/Session/Virtual Account bindingありと確認する。
- [ ] Lab Credentialから実AWS public endpointへの通信が失敗し、AWS credentialがLabへ渡されないことを確認する。
- [ ] API stop後にTask停止、Session終了、source EBS volumeの削除を確認する。
- [ ] Taskを強制停止し、reconcilerがSessionをfailedにすることを確認する。
- [ ] DB参照のない管理タグ付きTaskを作り、grace期間後にreconcilerが停止することを確認する。無関係Taskが停止されないことも確認する。
- [ ] S3/DynamoDB/SQSの代表dataを作成し、Suspend時のMiniStack flush、EBS Snapshot completed、manifest checksum、DB availableを順に確認する。
- [ ] 新TaskへResumeし、3サービスのdata、Virtual Account、ARNが維持されることを確認する。
- [ ] corrupt/incomplete manifest、Snapshot失敗、Resume失敗を注入し、元Snapshot保全とorphan Task/Volume清掃を確認する。

## Blocker / known limitations

1. PlatformからRuntime Gatewayへのprivate接続方式とSecurity Group ingressが未確定。現CDKのTask SGには8080 ingressがなく、実AWSのBFF→Gatewayは未成立。ADR候補`adr/0005-standard-runtime-private-access-proposal.md`を参照。
2. Orphan Taskは停止するが、`deleteOnTermination=false`のEBS volumeに対する自動清掃は未実装。実AWS smokeで残存量を確認し、所有タグを基に安全な清掃を設計する。
3. SuspendはBFFで新規操作を409にするが、Gatewayのin-flight mutation drain/quiesce protocolは未実装。高負荷時のapplication-consistent保証は実AWSで未確認。
4. EBS Snapshot作成、task volume attach、Fargate上のMiniStack正常終了、Endpoint経由image pullは実AWSで未確認。Issue #9はOpenのまま維持する。
5. Workerのoutbox→SQS FIFO→operation実行→reconcile loopは実装したが、Platform側SQS FIFO/DLQ・Worker serviceのIaC/deployおよび実SQS権限は未整備。local integrationはin-memory queueで検証した。
