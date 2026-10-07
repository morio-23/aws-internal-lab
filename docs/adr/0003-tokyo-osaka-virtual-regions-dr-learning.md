# ADR-0003: Virtual Regionは東京・大阪の2リージョンとしDR学習を提供する

- Status: Accepted
- Date: 2026-10-07

## Decision

初期Virtual Regionは以下の2つに固定する。

- Asia Pacific (Tokyo): `ap-northeast-1`
- Asia Pacific (Osaka): `ap-northeast-3`

defaultは東京とする。

同一LabWorkspaceで両RegionのRegional resourceを保持できる。

## DR Learning

東京をPrimary、大阪をRecovery Regionとする構成を基本教材とし、以下を学習対象とする。

- Backup and Restore
- Pilot Light
- Warm Standby
- Active / Passive
- Multi-Region Active / Active
- Route 53 failover / health checks
- cross-region replication
- RPO / RTO
- failover / failback

教材によりPrimary/Secondaryの逆転は許容する。

## Regional Fault Injection

Virtual Region outageはLab Gateway / Provider上の論理Faultとして実装する。

障害対象Regionのregional API/data planeのみ利用不可とし、他RegionとGlobal serviceは継続する。

FaultはWorkspace単位で隔離し、他利用者やPlatform Control Planeへ波及させない。

## Important Boundary

Virtual Multi-RegionはAWSのDR設計を学習するためのsimulationであり、AWS Internal Lab自身のphysical multi-region DRとは別設計とする。

## Consequences

- 学習対象を国内2Regionに絞れるためUI/Provider/Compatibility検証範囲を抑制できる。
- 東京・大阪を使った実運用に近いDR手順を再現しやすい。
- 全AWS Region再現は初期スコープ外となる。
- Cross-region replication semanticsはserviceごとに個別実装・検証が必要となる。
