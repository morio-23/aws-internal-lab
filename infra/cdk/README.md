# Phase 0 infrastructure

Phase 0 は既存の Platform VPC と、RuntimeStack が作る隔離 VPC を同一 Region で peering する。ここに記載した手順は運用時の順序であり、このPRではAWSへdeployしない。

## Stack とネットワーク

| Stack | Account | 主なリソース |
| --- | --- | --- |
| `AwsInternalLabPlatformOperations` | Platform | FIFO queue/DLQ、immutable Worker ECR、Worker Fargate Service、Peering accepter role、SQS/STS/ECS/EC2/Secrets Manager/ECR/Logs interface endpoint、S3 gateway endpoint |
| `AwsInternalLabRuntime` | Runtime | Runtime VPC、Peering connection、Gateway ingress、Standard Runtime ECS、Snapshot S3/KMS、Runtime orchestrator role |
| `AwsInternalLabPlatformRuntimeConnectivity` | Platform | 既存Platform private route tableからRuntime CIDRへの相互route |

`PlatformOperationsStack` は既存VPC、2つのprivate subnetとそのroute table、BFF/DB SG、S3 managed prefix list IDをparameterで受ける。Workerには専用SGだけを付け、default deny egressからprivate AWS endpoint:443、S3 prefix list:443、DB:5432、BFF SG:3001のみを許可する。Workerの署名付き管理API要求はBFFの`/internal/runtime-admin/*`がactive Runtime metadataを照合してGatewayへ中継する。Runtime側Gateway:8080は既存BFF SGからのみ許可する。BFF SGはWorkerから到達可能な内部BFF service ENIへ付け、`PlatformBffInternalUrl`はそのprivate URLを指定する。`assignPublicIp` は無効。Runtime Taskのdefault deny egressは変更しない。既存private route tableにInternet Gateway/NAT Gatewayへのdefault routeがないことをdeploy前に確認する。

Workerの`DATABASE_URL`、Platform署名用private/public keyは既存Secrets Manager secret ARNをparameterで受け、ECSのsecret injectionを使う。Secret値はCloudFormation parameterや通常のcontainer environmentへ渡さない。BFFの内部管理APIは既存の`PLATFORM_RUNTIME_PRIVATE_KEY_B64`から公開鍵を導出し、署名とactive Runtimeのsession/account/private endpointを照合する。Worker Task Roleは当該FIFO queueへのsend/receive/delete/change-visibilityと、Runtime orchestrator roleへのAssumeRoleのみを持ち、DLQを直接操作しない。ECS/EC2/S3 SDK clientはSTSの一時資格情報を使用する。

| Stack | 主要parameter | 次段へ渡すoutput |
| --- | --- | --- |
| PlatformOperations | `RuntimeAccountId`, `RuntimeCloudFormationRoleArn`, `PlatformVpcId`, `PlatformVpcCidr`, `PlatformPrivateSubnetIdA/B`, `PlatformPrivateRouteTableIdA/B`, `PlatformBffSecurityGroupId`, `PlatformBffInternalUrl`, `PlatformDatabaseSecurityGroupId`, `S3ManagedPrefixListId`, `DatabaseUrlSecretArn`, `PlatformRuntimePrivateKeySecretArn`, `PlatformRuntimePublicKeySecretArn`, `WorkerDesiredCount` | `OperationWorkerTaskRoleArn`, `OperationWorkerSecurityGroupId`, `RuntimeVpcPeeringAccepterRoleArn`, `OperationQueueUrl`, `OperationWorkerRepositoryUri` |
| Runtime | `PlatformAccountId`, `PlatformWorkerTaskRoleArn`, `PlatformVpcId`, `PlatformVpcCidr`, `PlatformBffSecurityGroupId`, `PlatformVpcPeeringRoleArn`, `S3ManagedPrefixListId` | `PlatformRuntimeVpcPeeringId`, `StandardClusterArn`, `StandardTaskDefinitionArn`, `StandardSubnetIds`, `StandardTaskSecurityGroupId`, `EcsEbsInfrastructureRoleArn`, `SnapshotBucketName` |
| PlatformRuntimeConnectivity | `RuntimeVpcPeeringConnectionId`, `RuntimeVpcCidr`, `PlatformPrivateRouteTableIdA/B` | `RuntimeRouteAId`, `RuntimeRouteBId` |

PlatformOperationsのWorker Task環境設定にはRuntime outputsの`StandardClusterArn`、`StandardTaskDefinitionArn`、`StandardSubnetIds`、`StandardSecurityGroupIds`（Runtime outputの`StandardTaskSecurityGroupId`を渡す）、`EcsEbsInfrastructureRoleArn`、`SnapshotBucketName`も必要。3 StackのCIDR・route table・SG IDは同じ実値を渡す。

## Deployment order

1. Platform VPCのprivate subnet/route table、BFF SG、DB SG、DB、3つのSecrets Manager secretとS3 prefix list IDを確認する。`aws ec2 describe-route-tables --route-table-ids <A> <B>`で、両route tableに`0.0.0.0/0`や`::/0`のInternet Gateway/NAT Gateway routeがないことを確認する。Runtime側CloudFormation実行role ARNを確定する。Platform/Runtime CIDRが重複しないことと、両側のVPC DNS解決を確認する。
2. PlatformOperationsStackを`WorkerDesiredCount=0`でdeployする。まだ存在しないRuntimeStack outputsを参照する`StandardClusterArn`、`StandardTaskDefinitionArn`、`StandardSubnetIds`、`StandardSecurityGroupIds`、`EcsEbsInfrastructureRoleArn`、`SnapshotBucketName`には初回のみ非秘密の仮値を渡す。Serviceは0 taskなので起動しない。`OperationWorkerTaskRoleArn`と`RuntimeVpcPeeringAccepterRoleArn`を控える。
3. RuntimeStackへPlatform VPC ID/CIDR、Platform account ID、BFF SG ID、前段のPeering accepter role ARN、Worker task role ARN、Runtime RegionのS3 prefix list IDを渡してdeployする。`PlatformRuntimeVpcPeeringId`とStandard Runtime/EBS/Snapshot outputsを控える。
4. PlatformRuntimeConnectivityStackへPeering ID、Runtime CIDR、Platform側2 private route table IDを渡してdeployする。Runtime側routeはRuntimeStackが作る。Peering connectionを重複作成しない。
5. Worker imageを下記のimmutable ECR repositoryへpushし、PlatformOperationsStackの仮値をRuntimeStack outputsに置き換えて`WorkerDesiredCount=1`へ更新する。GatewayとMiniStack imageもRuntime側ECRへpushしてからRuntime Taskを開始する。

Cross-accountのRuntime orchestrator roleは`PlatformWorkerTaskRoleArn`という単一のTask Role ARNのみを信頼する。Peering accepter roleは`RuntimeCloudFormationRoleArn`のみを信頼する。Account root全体をtrust principalにしない。Runtimeの`RunTask`/`StopTask`/`ListTasks`はTask DefinitionとClusterで制約し、Snapshot/Volumeの変更は`ManagedBy=aws-internal-lab` tagで制約する。実AWS上のIAM評価はSmoke Testで検証する。

## Image bootstrap and local validation

```bash
pnpm check
pnpm cdk:synth
pnpm test:integration:db
docker build -f runtime/standard/operation-worker.Dockerfile -t aws-internal-lab-operation-worker:p0 .
docker build -f runtime/standard/ministack.Dockerfile -t aws-internal-lab-ministack:p0 .
```

Runtime Task Definitionは`lab-gateway:prototype`と`ministack-mirror:prototype`、Worker Serviceは`operation-worker:prototype`を参照する。各repositoryはimmutable tagなので新imageは新tagで登録し、Task Definitionのtag/digestを更新する。MiniStackはRuntimeから外部registryへ直接pullせずRuntime accountのECR mirrorを使用する。CIのMiniStack smokeは稼働中のSQS state作成→live persist→状態ファイル→health継続を確認する。

## Operations and real AWS smoke

Deploy後に`aws ecs describe-services`でWorker Serviceが1 task、public IPなしで稼働することを確認し、`aws sqs get-queue-attributes`でFIFO/DLQのredrive状態を確認する。`aws ec2 describe-vpc-peering-connections`、`aws ec2 describe-route-tables`、`aws ec2 describe-vpc-endpoints`で相互routeとendpoint/private DNSを確認する。`aws ecs describe-tasks`でRuntime ENI private IPとEBS volumeを確認する。CloudWatch LogsでWorkerのloopを監視し、失敗messageはDLQで調査する。

本PRで未実施の実AWS smokeは、Worker→内部BFF→Gatewayの署名付き管理API、BFF→Gateway private疎通、Worker→SQS/DB/STS/ECS/EC2/S3疎通、Fargate ECR pull、S3/DynamoDB/SQSを含むlive persist→EBS Snapshot→別TaskへのResume、StopTask/Resume失敗注入、許可外SGとpublic endpointからの到達拒否である。AWS資格情報、実Account ID、Secret値をリポジトリへ保存しない。
