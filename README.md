# AWS Internal Lab

社内向けAWS学習・検証基盤。

## Phase 0

現在はArchitecture Feasibility Prototypeを実装中。

- 設計: `docs/03_basic_design.md`
- Prototype plan: `docs/06_phase0_prototype_plan.md`
- Service matrix: `docs/service-compatibility.md`
- GitHub Epic: #1

## Development

```bash
corepack enable
pnpm install
pnpm check
```

`pnpm check` はlint、architecture boundary、typecheck、unit test、buildを実行する。
