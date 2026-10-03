# Contract: `POST /api/decide`

The only server route. It exists to keep `TYPESAFE_API_KEY` out of the browser. Request and response
bodies are validated with zod schemas shared between client and server.

## Request

```ts
{
  tracker: {
    reviewed: ReviewedMonster,
    state: EncounterState,
    settings: Settings,
    roster: Player[],
    log: TurnLogEntry[]      // server uses only the last 3
  },
  situation: Situation
}
```

## Server steps

1. Validate body (400 on failure, with zod issues).
2. Recompute `LegalOptions` with `options.ts` (client-supplied options are never trusted).
3. If `options.blocked`, return a blocked recommendation **without** calling Jev.
4. Build the question set (`questions.ts`, see [jev-questions.md](jev-questions.md)) and the state object.
5. One `POST {TYPESAFE_BASE_URL}/v1/systemone` with `{ state, model: JEV_MODEL, questions }`.
6. Validate the Jev response with zod; interpret (`interpret.ts`) → `Recommendation`.
7. Log `model`, `latencyMs`, `usage`, question count.

## Responses

```ts
// 200
{ ok: true, recommendation: Recommendation, options: LegalOptions,
  meta: { model: string, latencyMs: number, usage?: Record<string, number> } }

// 200, monster cannot act (hard-blocked): Jev is not called
{ ok: true, recommendation: { blocked: { reason: string, movementBy: "code" | "dm" },
    moveBefore: "hold" | null, moveAfter: "hold" | null },   // null = DM picks by hand
  options: LegalOptions, meta: { jevCalled: false } }

// 400 invalid body | 500 missing TYPESAFE_API_KEY | 502 Jev error/invalid response | 504 timeout
{ ok: false, error: { kind: "invalid-request"|"config"|"upstream"|"timeout", message: string } }
```

The client treats any `ok: false` (or network failure) as "decide by hand": it shows `error.message` and
keeps its own locally computed `LegalOptions` for manual pick and Apply.

## Guarantees

- At most one Jev request per call: exactly one when the monster can act, none when hard-blocked
  (constitution v1.0.1, Principle I). The retry inside the Jev client on 408/429/5xx/529 is a transport
  retry of the same request, not a second question set. Verified by `tests/api/decide.route.test.ts`.
- Every key in the returned recommendation exists in the returned `options`.
- The response never contains the API key, request headers or upstream raw error bodies.
