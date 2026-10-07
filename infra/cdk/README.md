# Infrastructure

Phase 0ではAWS CDK TypeScriptを使用する。

## Runtime stack

`RuntimeStack` はP0-06 Standard Runtime用に以下を作成する。

- Runtime VPC `10.30.0.0/16`
- 2 AZのPrivate Isolated subnet
- NAT Gatewayなし
- S3 Gateway Endpoint
- ECR API / ECR DKR / CloudWatch Logs Interface Endpoint
- ECS Cluster
- Standard Fargate Task Definition
  - 1 vCPU / 2 GiB
  - 30 GiB ephemeral storage
  - MiniStack container
  - Lab Gateway container
  - Docker socketなし
  - privilegedなし
- Lab Gateway / MiniStack mirror用ECR Repository

Standard Runtime Taskは `assignPublicIp = DISABLED` でControl PlaneからRunTaskする。

## Commands

```bash
pnpm cdk:synth
```

Phase 0ではRuntime Accountへのdeployを想定する。Production/Stagingのaccount分離は基本設計に従う。

## Image bootstrap

Task Definitionは以下のimmutable tagを参照する。

```text
lab-gateway:prototype
ministack-mirror:prototype
```

初回RunTask前にCIまたは手動bootstrapで両imageをECRへpushする。

MiniStackは外部registryをRuntimeから直接pullせず、社内ECR mirrorを利用する。
