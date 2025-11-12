// client/js/main.js
(function () {
  const canvasEl = document.getElementById('canvas');
  const cursorsEl = document.getElementById('cursors');
  const app = new CanvasApp(canvasEl, cursorsEl);

  // UI elements
  const roomEl = document.getElementById('room');
  const nameEl = document.getElementById('username');
  const joinBtn = document.getElementById('join');
  const shareBtn = document.getElementById('share');
  const statusEl = document.getElementById('status');
  const userListEl = document.getElementById('userList');
  const fpsEl = document.getElementById('fps');
  const latencyEl = document.getElementById('latency');

  const toolSel = document.getElementById('tool');
  const colorEl = document.getElementById('color');
  const widthEl = document.getElementById('width');
  const undoBtn = document.getElementById('undo');
  const redoBtn = document.getElementById('redo');
  const saveBtn = document.getElementById('save');
  const loadBtn = document.getElementById('load');
  const clearBtn = document.getElementById('clear');
  const downloadBtn = document.getElementById('download');
  const toastEl = document.getElementById('toast');

  let socket = null, room = null, userId = null, isPointerDown = false;

  // small helpers
  function showToast(msg, t = 1500) {
    toastEl.textContent = msg; toastEl.classList.remove('hidden');
    setTimeout(() => toastEl.classList.add('hidden'), t);
  }
  function now() { return Date.now(); }

  // connect to room
  function connectRoom(roomName, name) {
    if (socket && socket.disconnect) socket.disconnect();
    socket = io();
    room = roomName;
    statusEl.textContent = `Joining ${room}...`;

    socket.on('connect', () => {
      userId = socket.id;
      statusEl.textContent = `Connected • ${room}`;
      socket.emit('join-room', { room, name });
    });

    socket.on('init-state', ({ strokes, users }) => {
      app.strokes = strokes || [];
      app.redraw();
      userListEl.textContent = `${users || 1} users`;
    });
    socket.on('user-count', c => userListEl.textContent = `${c} users`);

    socket.on('stroke', stroke => app.applyRemoteStroke(stroke));
    socket.on('stroke-extend', ({ id, point }) => app.applyRemoteExtend(id, point));
    socket.on('cursor', ({ id, x, y, color, tool, name }) => { if (id !== socket.id) app.updateCursor(id, { x, y, color, tool, name }); });
    socket.on('cursor-leave', ({ id }) => app.removeCursor(id));
    socket.on('undo', ({ strokeId }) => { const idx = app.strokes.findIndex(s => s.id === strokeId); if (idx >= 0) { app.redoStack.push(app.strokes.splice(idx, 1)[0]); app.redraw(); } });
    socket.on('load-state', ({ strokes }) => { app.strokes = strokes || []; app.redraw(); });
    socket.on('clear', () => app.clearAll());
    socket.on('pong', ({ ts }) => latencyEl.textContent = `${Math.max(0, Date.now() - ts)} ms`);

    setInterval(() => { if (socket && socket.connected) socket.emit('ping', { ts: Date.now() }); }, 2000);

    // auto-load local storage copy if exists
    const saved = localStorage.getItem(`whiteboard_${room}`);
    if (saved) { try { app.strokes = JSON.parse(saved); app.redraw(); showToast('Auto-loaded local save', 1100); } catch (e) { } }
  }

  // join button
  joinBtn.addEventListener('click', () => {
    const r = (roomEl.value || '').trim();
    if (!r) { alert('Enter a room name'); return; }
    const name = (nameEl.value || '').trim() || `User-${Math.random().toString(36).slice(2, 6)}`;
    connectRoom(r, name);
    // update URL so it's shareable
    const url = new URL(location.href); url.searchParams.set('room', r); history.replaceState({}, '', url);
  });

  // share button
  shareBtn.addEventListener('click', () => {
    const url = location.origin + location.pathname + '?room=' + encodeURIComponent(room || (roomEl.value || ''));
    navigator.clipboard?.writeText(url).then(() => showToast('Room link copied')).catch(() => alert(url));
  });

  // pointer helpers
  function pointFromEvent(e) {
    const rect = canvasEl.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }
  canvasEl.style.touchAction = 'none';

  canvasEl.addEventListener('pointerdown', (e) => {
    e.preventDefault(); isPointerDown = true;
    const p = pointFromEvent(e);
    const tool = toolSel.value;
    const stroke = {
      id: `${socket && socket.id ? socket.id : 'local'}_${now()}_${Math.random().toString(36).slice(2, 8)}`,
      userId: socket && socket.id ? socket.id : 'local',
      points: [p],
      color: tool === 'eraser' ? '#ffffff' : colorEl.value,
      width: Number(widthEl.value),
      mode: tool === 'eraser' ? 'erase' : 'draw',
      tool
    };
    app.beginStroke(stroke);
    if (socket && socket.connected) socket.emit('begin-stroke', { room, stroke });
  });

  canvasEl.addEventListener('pointermove', (e) => {
    e.preventDefault();
    const p = pointFromEvent(e);
    if (socket && socket.connected) socket.emit('cursor', { room, x: p.x, y: p.y, color: colorEl.value, tool: toolSel.value });
    if (isPointerDown && app.drawing && app.currentStroke) {
      app.extendStroke(p);
      if (socket && socket.connected) socket.emit('extend-stroke', { room, id: app.currentStroke.id, point: p });
    }
    fpsEl.textContent = `${app.frameTick()} FPS`;
  });

  window.addEventListener('pointerup', () => {
    if (isPointerDown && app.drawing) {
      app.endStroke();
      if (socket && socket.connected) socket.emit('end-stroke', { room });
    }
    isPointerDown = false;
  });

  // Undo-my (server removes last stroke by this user)
  undoBtn.addEventListener('click', () => {
    if (socket && socket.connected) { socket.emit('undo-my', { room }); }
    else { app.removeLastStrokeByUser('local'); }
  });

  // Redo: client returns stroke object; then send to server to re-add for everyone
  redoBtn.addEventListener('click', () => {
    const strok = app.redo();
    if (strok && socket && socket.connected) socket.emit('redo-my', { room, stroke: strok });
  });

  // Save/load local + server
  saveBtn.addEventListener('click', () => {
    try { localStorage.setItem(`whiteboard_${room}`, JSON.stringify(app.strokes)); showToast('Saved locally'); } catch (e) { console.error(e); }
    if (socket && socket.connected) socket.emit('save', { room });
  });
  loadBtn.addEventListener('click', () => {
    try {
      const data = localStorage.getItem(`whiteboard_${room}`);
      if (data) { app.strokes = JSON.parse(data); app.redraw(); showToast('Loaded local save'); }
      else showToast('No local save');
    } catch (e) { console.error(e); }
    if (socket && socket.connected) socket.emit('load', { room });
  });

  // Clear
  clearBtn.addEventListener('click', () => {
    if (!confirm('Clear canvas for everyone?')) return;
    app.clearAll();
    try { localStorage.removeItem(`whiteboard_${room}`); } catch (e) { }
    if (socket && socket.connected) socket.emit('clear', { room });
  });

  // Download PNG
  downloadBtn.addEventListener('click', () => {
    // temporarily draw to an offscreen canvas the current visual (taking DPR into account)
    const ratio = window.devicePixelRatio || 1;
    const tmp = document.createElement('canvas');
    tmp.width = canvasEl.width;
    tmp.height = canvasEl.height;
    const ctx = tmp.getContext('2d');
    // draw background (optional)
    ctx.fillStyle = window.getComputedStyle(canvasEl).background || '#ffffff';
    ctx.fillRect(0, 0, tmp.width, tmp.height);
    // draw strokes by reusing app.strokes but scaled to physical pixels
    // we can reuse app.redraw logic by temporarily setting ctx, but simpler: use toDataURL of visible canvas
    const url = canvasEl.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url; a.download = `${room || 'whiteboard'}.png`; a.click();
  });

  // auto-join from URL ?room=
  const params = new URLSearchParams(location.search);
  const initialRoom = params.get('room');
  if (initialRoom) {
    roomEl.value = initialRoom;
    nameEl.value = nameEl.value || '';
    joinBtn.click();
  }

})();
