# Roadmap

## Phase 1: Playable Single-Player MVP

- Signed round-state tokens and in-memory document cache.
- `/api/round` creates a start and goal pair.
- `/api/click` validates that the requested next article exists in the current article links.
- Frontend shows current article HTML, available links, timer, click count, and path.
- Playable NamuWiki links are rewritten inside the rendered article body.
- Visited path state is reflected in the UI.
- Daily challenge leaderboard stores the current day's scores in a JSON file.

## Phase 2: Better Game Quality

- Expand curated article pools for steadier round quality.
- Continue tuning filters for obscure people, disambiguation-like pages, maintenance pages, and oversized broad pages.
- Add per-round result summaries and fastest/fewest-click ranking.
- Add optional hints or route analysis once caching is mature enough.

## Phase 3: Multiplayer and Groups

- Group invite codes.
- Synchronized current round.
- Live player progress.
- Post-round path comparison.

## Phase 4: Production Readiness

- Persistent database for rounds, attempts, clicks, and cached documents.
- Background cache warmer with conservative rate limits.
- License/attribution review and permission request to NamuWiki if public traffic is expected.
- Abuse prevention, observability, and deployment.
