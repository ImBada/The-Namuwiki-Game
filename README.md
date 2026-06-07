# The Namuwiki Game

A small MVP for a NamuWiki-based link traversal game inspired by The Wiki Game.

## Run

```sh
npm start
```

Open `http://localhost:3000`.

## MVP Scope

- Create a round with a NamuWiki start article and goal article.
- Fetch and cache NamuWiki article metadata, sanitized article HTML, and internal article links.
- Render the current NamuWiki article body in the game view and rewrite playable wiki links.
- Let the player move only through links that exist on the current article.
- Track elapsed time, click count, difficulty, link counts, and the visited path.
- Filter sparse, namespace, sensitive, and goal subpage candidates for steadier rounds.

## Test

```sh
npm test
```

## Notes

NamuWiki pages indicate a CC BY-NC-SA 2.0 KR license. The app keeps attribution visible and should be operated as a non-commercial project unless separate permission is secured.
