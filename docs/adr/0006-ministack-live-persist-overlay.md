# ADR-0006: Standard Runtime用MiniStack Live Persist Overlay

- Status: Accepted for Phase 0
- Date: 2026-10-08
- Applies to: MiniStack 1.5.22 based Standard Runtime image

## Context

P0-08 Suspend / Resumeでは、EBS Snapshot作成に失敗した場合でも元Runtimeを破棄せず利用継続できる必要がある。

MiniStack 1.5.22の標準永続化は `PERSIST_STATE=1` の場合にlifespan shutdownで
`save_all(_build_persistence_save_dict())` を実行する。したがって標準機能だけで
application stateをdiskへ確定させるには先にMiniStackを停止する必要があり、その後の
EBS Snapshot失敗時に元Runtimeをそのまま継続できない。

一方、同じMiniStack process内には永続化に必要なservice state collectorと
`save_all` が既に存在する。

## Decision

Phase 0ではMiniStackをforkしてservice実装を複製せず、固定versionの公式image上に
薄いASGI overlayを追加する。

Overlayは内部endpoint:

`POST /_aws_internal_lab/persist`

を追加し、以下を実行する。

1. `PERSIST_STATE=1` を確認
2. MiniStackのreset lockを取得
3. MiniStack自身の `save_all(_build_persistence_save_dict())` を実行
4. `os.sync()` を実行
5. 完了後に200を返す

元のAWS API / health / reset等はupstream ASGI applicationへそのまま委譲する。

## Access boundary

このendpointをBrowser、BFF、Operation Workerへ直接公開しない。

呼出し経路は以下だけとする。

```text
Operation Worker
  -> Lab Gateway :8080 /admin/persist
     [Platform signed token]
  -> 127.0.0.1:4566 /_aws_internal_lab/persist
     [same Fargate Task network namespace]
```

Runtime Security Groupは4566 ingressを作成しない。Lab Gatewayは任意URL proxyを提供しない。

## Suspend protocol

Standard Suspendは以下の順序とする。

```text
ready
  -> Gateway quiesce
  -> reject new invoke
  -> wait activeInvocations = 0
  -> MiniStack live persist
  -> filesystem sync
  -> EBS Snapshot create
  -> wait Snapshot completed
  -> write/checksum manifest
  -> StopTask
  -> wait stopped
  -> mark Snapshot available / Workspace suspended
  -> delete source EBS volume
```

EBS Snapshotまたはmanifest作成が失敗した場合、StopTask前なので:

```text
failure
  -> delete partial managed snapshot/manifest where possible
  -> Gateway unquiesce
  -> original Runtime remains active
```

これによりP0-08の「failed Suspendで元Runtimeを早期破棄しない」を設計上満たす。

## Consistency scope

Phase 0で `application-consistent` と判定する対象は、Compatibility MatrixでSnapshot full対応としたサービスに限定する。

最低限P0-07対象:

- S3
- DynamoDB
- SQS

について、以下を実AWS Smoke Testで確認する。

- quiesce前の成功済みmutationがResume後に存在
- quiesce開始後のmutationが拒否される
- persist完了後・Task稼働中にEBS Snapshotを作成できる
- 新Taskへrestore後、代表state/dataが復元
- Snapshot失敗注入時に元Taskを停止せずunquiesceできる

background workerや外部data planeを持つサービスは、この検証なしに
`application-consistent` / Snapshot `full` としない。

## Image maintenance

- base image versionを明示固定する。
- OverlayはMiniStackのprivate/internal Python symbolを利用するため、MiniStack upgrade時に互換性試験を必須とする。
- upgrade時は最低限 `PERSIST_STATE`, `save_all`, `_build_persistence_save_dict`, `_get_reset_lock` の存在・意味を確認する。
- upstreamで正式なlive persist機能が提供された場合、本overlayを廃止して公式機能へ移行する。
- Phase 0通過後、必要に応じてupstream contributionを検討する。

## Consequences

### Positive

- Snapshot失敗前に元Runtimeを破棄しない。
- service固有のserializationをLab側へ複製しない。
- upstream差分が小さい。
- current MiniStack persistence formatをそのまま使用できる。

### Negative

- private/internal MiniStack APIへの依存が生じる。
- MiniStack version update時にoverlay互換性確認が必要。
- serviceによってはbackground mutationを別途停止する必要がある。
- 実EBS上でのapplication consistencyはAWS Smoke Test完了まで確定しない。
