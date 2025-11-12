# ARCHITECTURE (Enhanced)
## Rooms & Persistence
- Clients connect with `?room=<name>` query. Server uses Socket.io rooms and stores per-room `strokes`.
- Sessions are saved to `server/sessions/<room>.json` after stroke events or on explicit save.

## Cursor & Metrics
- Clients emit `cursor` events (x,y,color) at pointermove; server broadcasts to other clients in same room.
- Clients send `ping` periodically and server replies with `pong` to measure latency.

## Tools & Undo
- Tools supported: pen, rectangle, eraser. Each stroke includes `tool` and `mode`.
- Undo removes a stroke by id from room state; redo is client-local.

## Persistence format
JSON: `{ "strokes":[ ... ] }` where each stroke contains id, userId, points, color, width, mode, tool.

## Future improvements
- Implement CRDT/OT for strong global undo/redo and conflict-free merging.
- Batch extend-stroke events and compress (e.g., simplify path points) for performance.
- Use DB (Redis/Postgres) and background persistence for scale.
