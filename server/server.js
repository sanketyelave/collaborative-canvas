// server/server.js
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;
const SESSIONS_DIR = path.join(__dirname, 'sessions');
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR);

// serve client static
app.use(express.static(path.join(__dirname, '../client')));

// load/save room JSON
function loadRoomState(room) {
  const fn = path.join(SESSIONS_DIR, `${room}.json`);
  if (fs.existsSync(fn)) {
    try { return JSON.parse(fs.readFileSync(fn, 'utf8')); } catch (e) { console.warn('load err', e); }
  }
  return { strokes: [] };
}
function saveRoomState(room, state) {
  const fn = path.join(SESSIONS_DIR, `${room}.json`);
  try { fs.writeFileSync(fn, JSON.stringify(state)); } catch (e) { console.error('save err', e); }
}

// keep simple in-memory cache per instance
if (!io.sockets.adapter.roomsState) io.sockets.adapter.roomsState = {};

io.on('connection', socket => {
  console.log('client connected', socket.id);

  // join-room event: client emits when ready with {room, name}
  socket.on('join-room', ({ room, name }) => {
    if (!room) return;
    socket.join(room);
    socket.data.room = room;
    socket.data.name = name || `User-${socket.id.slice(0, 4)}`;

    // ensure room state loaded
    if (!io.sockets.adapter.roomsState[room]) {
      io.sockets.adapter.roomsState[room] = loadRoomState(room);
      if (!Array.isArray(io.sockets.adapter.roomsState[room].strokes)) {
        io.sockets.adapter.roomsState[room].strokes = [];
      }
    }

    const state = io.sockets.adapter.roomsState[room];
    socket.emit('init-state', { strokes: state.strokes, users: io.sockets.adapter.rooms.get(room)?.size || 1 });
    io.to(room).emit('user-count', io.sockets.adapter.rooms.get(room)?.size || 1);
  });

  // begin-stroke: add stroke to canonical state and broadcast
  socket.on('begin-stroke', ({ room: r, stroke }) => {
    const stRoom = r || socket.data.room;
    if (!stRoom || !stroke) return;
    io.sockets.adapter.roomsState[stRoom] = io.sockets.adapter.roomsState[stRoom] || { strokes: [] };
    io.sockets.adapter.roomsState[stRoom].strokes.push(stroke);
    socket.to(stRoom).emit('stroke', stroke);
    saveRoomState(stRoom, io.sockets.adapter.roomsState[stRoom]);
  });

  // extend-stroke: push point and broadcast small event
  socket.on('extend-stroke', ({ room: r, id, point }) => {
    const stRoom = r || socket.data.room;
    if (!stRoom || !id || !point) return;
    const state = io.sockets.adapter.roomsState[stRoom];
    if (!state) return;
    const s = state.strokes.find(x => x.id === id);
    if (s) {
      s.points.push(point);
      socket.to(stRoom).emit('stroke-extend', { id, point });
      saveRoomState(stRoom, state);
    }
  });

  socket.on('end-stroke', ({ room: r }) => {
    const stRoom = r || socket.data.room;
    if (!stRoom) return;
    saveRoomState(stRoom, io.sockets.adapter.roomsState[stRoom]);
  });

  // cursor presence (color + tool + name)
  socket.on('cursor', ({ room: r, x, y, color, tool }) => {
    const stRoom = r || socket.data.room;
    if (!stRoom) return;
    socket.to(stRoom).emit('cursor', { id: socket.id, x, y, color, tool, name: socket.data.name });
  });

  // undo-my: remove last stroke authored by socket.id
  socket.on('undo-my', ({ room: r }) => {
    const stRoom = r || socket.data.room;
    if (!stRoom) return;
    const arr = io.sockets.adapter.roomsState[stRoom]?.strokes;
    if (!arr || arr.length === 0) return;
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i].userId === socket.id) {
        const removed = arr.splice(i, 1)[0];
        io.to(stRoom).emit('undo', { strokeId: removed.id });
        saveRoomState(stRoom, io.sockets.adapter.roomsState[stRoom]);
        break;
      }
    }
  });

  // redo-my: client supplies a stroke object to re-add
  socket.on('redo-my', ({ room: r, stroke }) => {
    const stRoom = r || socket.data.room;
    if (!stRoom || !stroke) return;
    io.sockets.adapter.roomsState[stRoom] = io.sockets.adapter.roomsState[stRoom] || { strokes: [] };
    io.sockets.adapter.roomsState[stRoom].strokes.push(stroke);
    io.to(stRoom).emit('stroke', stroke);
    saveRoomState(stRoom, io.sockets.adapter.roomsState[stRoom]);
  });

  // clear room
  socket.on('clear', ({ room: r }) => {
    const stRoom = r || socket.data.room;
    if (!stRoom) return;
    io.sockets.adapter.roomsState[stRoom] = { strokes: [] };
    io.to(stRoom).emit('clear');
    saveRoomState(stRoom, io.sockets.adapter.roomsState[stRoom]);
  });

  // save/load server persistence
  socket.on('save', ({ room: r }) => {
    const stRoom = r || socket.data.room;
    if (!stRoom) return;
    saveRoomState(stRoom, io.sockets.adapter.roomsState[stRoom] || { strokes: [] });
    socket.emit('saved', { ok: true });
  });

  socket.on('load', ({ room: r }) => {
    const stRoom = r || socket.data.room;
    if (!stRoom) return;
    const loaded = loadRoomState(stRoom);
    io.sockets.adapter.roomsState[stRoom] = loaded;
    io.to(stRoom).emit('load-state', { strokes: loaded.strokes || [] });
  });

  socket.on('ping', ({ ts }) => socket.emit('pong', { ts }));

  socket.on('disconnect', () => {
    const stRoom = socket.data.room;
    if (stRoom) {
      socket.to(stRoom).emit('cursor-leave', { id: socket.id });
      io.to(stRoom).emit('user-count', io.sockets.adapter.rooms.get(stRoom)?.size || 0);
    }
  });
});

server.listen(PORT, () => console.log('✅ Server listening on', PORT));
