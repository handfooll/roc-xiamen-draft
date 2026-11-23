# Russian Education Center landing

Static one-page site plus a small lead service.

```
content/      texts (ru.json, later zh.json) and the partner universities
src/          page template, styles, script, static files
build.mjs     node build.mjs -> dist/ (API=/api/lead for the server build)
server/       lead intake (Python 3 stdlib + SQLite) and its tests
scripts/      checks run in CI
```

Local: `node build.mjs && python3 -m unittest discover -s server`
