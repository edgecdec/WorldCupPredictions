# Code Style and Organization

## File Size and Splitting
- No file should exceed ~150 lines. Extract logic into separate files if it does.
- One component per file. One hook per file. One utility concern per file.

## Shared Logic
- Before writing any logic, search the codebase for existing implementations.
- Key shared modules:
  - `src/lib/db.ts` — database access
  - `src/lib/auth.ts` — JWT and password hashing
  - `src/lib/scoring.ts` — all scoring calculations
  - `src/lib/bracketData.ts` — tournament data utilities
  - `src/lib/knockoutBracket.ts` — knockout bracket generation
- If you write the same pattern in two places, extract it immediately.

## Component Organization
- `src/components/common/` — reusable UI (Navbar, ThemeRegistry, CountdownTimer, ScoringEditor, etc.)
- `src/components/auth/` — authentication forms
- `src/components/bracket/` — bracket and prediction components
- Components should accept props, not fetch their own data. Data fetching happens in page components.

## Types
- All shared TypeScript interfaces go in `src/types/index.ts`.
- Never use `any`. Define proper types.
- Never inline complex type definitions — extract to src/types/.

## Naming Conventions
- Files: camelCase for utilities (`scoring.ts`), PascalCase for components (`Navbar.tsx`).
- Functions: camelCase (`scoreGroupStage`, `getTeamByName`).
- Types/Interfaces: PascalCase (`Team`, `ScoringSettings`).
- Constants: UPPER_SNAKE_CASE (`DEFAULT_SCORING`, `KNOCKOUT_ROUNDS`).

## Imports
- Use the `@/` path alias for all internal imports.
- Group imports: external packages first, then internal modules, then types.

## Tables and Sorting
- All data tables should have sortable columns by default.
- Use MUI TableSortLabel in table headers.
- Default sort should be the most useful column for the context.
