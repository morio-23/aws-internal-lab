# AWS Internal Lab ドキュメント一覧

本ディレクトリの文書は以下の優先関係で管理する。

| 文書 | 役割 |
| --- | --- |
| `01_project_proposal.md` | 企画目的・スコープ・意思決定方針 |
| `02_requirements.md` | 業務要件・機能要件・非機能要件 |
| `03_basic_design.md` | AWS基盤・Lab Runtime・データ・ネットワーク等の基本設計 |
| `04_ip_guidelines.md` | AWS Console再現に関する知財・ブランド利用ルール |
| `05_incident_guardrails.md` | 事故想定、技術的ガードレール、Severity、封じ込め・復旧・Runbook要件 |
| `06_phase0_prototype_plan.md` | Phase 0 Prototypeの実装順、Done Criteria、Go/No-Go Gate |
| `adr/0001-shared-advanced-worker-pool.md` | 共有Advanced Worker / microVM / ACU Auto Scaling |
| `adr/0002-virtual-aws-workspace-and-provider-routing.md` | Virtual Account/Region/ARN、Provider Routing、認証認可、API境界 |
| `adr/0003-tokyo-osaka-virtual-regions-dr-learning.md` | 東京・大阪Virtual Region、Regional Fault Injection、DR学習 |

`04_ip_guidelines.md` と `05_incident_guardrails.md` は補足資料ではなく、それぞれ知財・安全設計に関する規範文書として扱う。

`adr/0001-shared-advanced-worker-pool.md` はAdvanced Runtimeの共有EC2/microVM分離・ACU配置・自動スケール・Standard/Advanced切替に関する採用済みアーキテクチャ判断とする。

`adr/0003-tokyo-osaka-virtual-regions-dr-learning.md` により、初期Virtual Regionは東京 `ap-northeast-1` と大阪 `ap-northeast-3` の2つを正とする。

実装・レビュー時に要件定義書または基本設計書と解釈が衝突する場合は、企画意図を確認した上で文書間の不整合を解消し、いずれかを黙示的に無視しない。

## サービス互換性管理

- `service-compatibility.md` - 現行AWS全サービスのTarget Layer、Runtime、MiniStack対応、Snapshot対応、優先度を管理する正本

## 今後追加予定

- `runbooks/` - 事故種別の具体Runbook
- `adr/` - 重要なアーキテクチャ意思決定。採用済みADRは基本設計と同等に実装判断へ反映する
