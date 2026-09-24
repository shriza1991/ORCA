# ORCA AI DEVELOPMENT RULES

Before modifying this repository, every AI coding agent MUST read:

1. `docs/ORCA_AI_MASTER_CONTEXT.md`
2. `docs/PROGRESS.md`
3. `docs/DECISIONS.md`
4. The relevant canonical contract (`docs/API_CONTRACTS.md`, `docs/CANONICAL_DATA_CONTRACTS.md`, `docs/SAFETY.md`)
5. The relevant source code and tests

Do not code immediately after receiving a request.

First inspect the existing implementation, identify the owning component and canonical contract, assess dependencies/conflicts, and form an implementation plan.

## Source of Truth

- `docs/ORCA_AI_MASTER_CONTEXT.md` — strategic vision and target architecture
- `ORCA_IMPLEMENTATION_BLUEPRINT.md` — active migration blueprint and client architecture execution
- `docs/PROGRESS.md` — current implementation state
- `docs/DECISIONS.md` — important engineering decisions and their rationale
- `code + tests` — actual executable implementation truth
- `docs/API_CONTRACTS.md` & `docs/CANONICAL_DATA_CONTRACTS.md` — detailed technical contracts
- `docs/SAFETY.md` — deterministic safety bounds and invariants

## Mandatory Workflow

`READ` → `INSPECT` → `PLAN` → `IMPLEMENT` → `TEST` → `DOCUMENT` → `VERIFY`

## Rules

- **Reuse before rewrite**: Reuse existing implementations before creating new ones.
- **No duplicate models**: Never create duplicate models, schemas, decision engines, risk engines, or route evaluators without an explicit decision.
- **No architectural drift**: Never silently change ORCA architecture.
- **Architectural conflict protocol**: If an implementation request conflicts with the master architecture, identify the conflict and record the decision before proceeding.
- **Deterministic safety authority**: Keep safety-critical calculations (geometry, distance, thresholds, legal constraints) 100% deterministic in Python.
- **Epistemic data honesty**:
  - Never represent mock, synthetic, or cached data as live.
  - Never treat missing evidence as zero risk.
  - Missing evidence != zero risk; Unknown != safe; Forecast != observation.
- **Preserve test integrity**: Never delete or weaken tests merely to make them pass.
- **Preserve shared work**: Preserve unrelated work from other developers and AI agents.

## After Every Meaningful Task

1. Update `docs/PROGRESS.md` with what changed, test verification results, and next recommended tasks.
2. If a meaningful engineering or architecture decision was made, append it to `docs/DECISIONS.md`.
3. If architecture, contracts, or behavior changed, update the relevant canonical documentation in the same task.
4. Before finishing, verify tests and repository consistency.

## Never

- Invent historical rationale (state `UNKNOWN / historical rationale not found`).
- Overwrite another agent's work.
- Force-push or destructively rewrite git history.
- Silently introduce competing architecture or bypass canonical contracts.
- Declare features complete without verifying actual implementation and tests.
