# Collaborative Canvas - Demo (Enhanced)
This project demonstrates a collaborative drawing app (vanilla JS + Node.js + Socket.io).

🌐 **Live Demo:** [https://collaborative-canvas-endl.onrender.com/](https://collaborative-canvas-endl.onrender.com/)

---

## How to run

```
npm install
npm start
```
Open multiple browser windows to `http://localhost:3000/?room=yourroom` to test rooms.

## New/Bonus features included
- Rooms support (multiple isolated canvases)
- Mobile/touch support (pointer events)
- Rectangle tool + Pen + Eraser
- Per-user cursor indicators (shows other users' cursors)
- Persistence: server saves sessions per room to `server/sessions/<room>.json`
- FPS counter and ping latency display
- Responsive UI for mobile
- Save/Load session buttons (server-side persistence)

## Known limitations
- Conflict resolution is still draw-order based.
- Persistence is file-based (not a DB) and synchronous for simplicity.
- Not optimized for >1000 concurrent users (would need batching, compression, and sharding).

Time spent: ~additional work for enhancements.

