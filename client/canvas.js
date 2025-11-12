// client/js/canvas.js
class CanvasApp {
  constructor(canvasEl, cursorsEl) {
    this.canvas = canvasEl;
    this.cursorsEl = cursorsEl;
    this.ctx = this.canvas.getContext('2d');
    this.devicePixelRatio = Math.max(window.devicePixelRatio || 1, 1);

    this.drawing = false;
    this.currentStroke = null;
    this.strokes = [];
    this.redoStack = [];
    this.cursorMap = new Map();
    this.lastFrameTime = performance.now();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = Math.max(window.innerWidth, 300);
    const h = Math.max(window.innerHeight - 112, 200);
    const ratio = this.devicePixelRatio;
    // preserve image if possible (best-effort)
    try {
      const img = this.ctx.getImageData(0, 0, this.canvas.width || 1, this.canvas.height || 1);
      this.canvas.width = Math.floor(w * ratio);
      this.canvas.height = Math.floor(h * ratio);
      this.canvas.style.width = w + "px";
      this.canvas.style.height = h + "px";
      this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      if (img) this.ctx.putImageData(img, 0, 0);
    } catch (e) {
      this.canvas.width = Math.floor(w * ratio);
      this.canvas.height = Math.floor(h * ratio);
      this.canvas.style.width = w + "px";
      this.canvas.style.height = h + "px";
      this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    this.redraw();
  }

  beginStroke(stroke, remote = false) {
    this.drawing = true;
    this.currentStroke = stroke;
    this.strokes.push(stroke);
    if (!remote && !["rect", "line", "circle"].includes(stroke.tool)) {
      this.drawStrokeSegment(stroke, 0, 1);
    }
  }

  extendStroke(point, strokeId = null, remote = false) {
    const s = remote ? this.strokes.find(st => st.id === strokeId) : this.currentStroke;
    if (!s) return;
    if (["rect", "circle", "line"].includes(s.tool)) {
      s.points[1] = point;
      this.redraw();
    } else {
      s.points.push(point);
      this.drawStrokeSegment(s, s.points.length - 2, s.points.length - 1);
    }
  }

  endStroke(remote = false) {
    if (!this.drawing) return;
    const s = this.currentStroke;
    this.drawing = false;
    if (["rect", "circle", "line"].includes(s.tool) && s.points.length === 1) s.points.push(s.points[0]);
    this.currentStroke = null;
    if (!remote) this.redoStack = [];
  }

  drawStrokeSegment(stroke, i0, i1) {
    const pts = stroke.points;
    if (!pts || pts.length < 2) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = stroke.mode === 'erase' ? 'destination-out' : 'source-over';
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = stroke.color; ctx.lineWidth = stroke.width;
    ctx.beginPath(); ctx.moveTo(pts[i0].x, pts[i0].y); ctx.lineTo(pts[i1].x, pts[i1].y);
    ctx.stroke(); ctx.restore();
  }

  drawShape(stroke) {
    const ctx = this.ctx;
    const p0 = stroke.points[0], p1 = stroke.points[1] || p0;
    const x = Math.min(p0.x, p1.x), y = Math.min(p0.y, p1.y), w = Math.abs(p1.x - p0.x), h = Math.abs(p1.y - p0.y);
    ctx.save(); ctx.lineWidth = stroke.width; ctx.strokeStyle = stroke.color;
    ctx.globalCompositeOperation = stroke.mode === 'erase' ? 'destination-out' : 'source-over';
    if (stroke.tool === 'rect') ctx.strokeRect(x, y, w, h);
    else if (stroke.tool === 'line') { ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke(); }
    else if (stroke.tool === 'circle') { const cx = (p0.x + p1.x) / 2, cy = (p0.y + p1.y) / 2, r = Math.sqrt(w * w + h * h) / 2; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
  }

  redraw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width / this.devicePixelRatio, this.canvas.height / this.devicePixelRatio);
    for (const s of this.strokes) {
      if (["rect", "circle", "line"].includes(s.tool)) { this.drawShape(s); continue; }
      if (!s.points || s.points.length < 2) continue;
      ctx.save();
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.globalCompositeOperation = s.mode === 'erase' ? 'destination-out' : 'source-over';
      ctx.strokeStyle = s.color; ctx.lineWidth = s.width;
      ctx.beginPath(); ctx.moveTo(s.points[0].x, s.points[0].y);
      for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y);
      ctx.stroke(); ctx.restore();
    }
  }

  // Undo (global pop) - kept for fallback
  undo() { if (this.strokes.length === 0) return null; const last = this.strokes.pop(); this.redoStack.push(last); this.redraw(); return last ? last.id : null; }

  // remove last stroke by a specific userId
  removeLastStrokeByUser(userId) {
    for (let i = this.strokes.length - 1; i >= 0; i--) {
      if (this.strokes[i].userId === userId) {
        const removed = this.strokes.splice(i, 1)[0];
        this.redoStack.push(removed);
        this.redraw();
        return removed.id;
      }
    }
    return null;
  }

  // redo: return whole stroke object (client will send to server)
  redo() { if (this.redoStack.length === 0) return null; const s = this.redoStack.pop(); this.strokes.push(s); this.redraw(); return s; }

  clearAll() { this.strokes = []; this.redoStack = []; this.redraw(); }

  applyRemoteStroke(stroke) { if (this.strokes.find(s => s.id === stroke.id)) return; this.strokes.push(stroke); this.redraw(); }
  applyRemoteExtend(id, point) { const s = this.strokes.find(st => st.id === id); if (!s) return; if (["rect", "circle", "line"].includes(s.tool)) { s.points[1] = point; this.redraw(); } else { s.points.push(point); this.drawStrokeSegment(s, s.points.length - 2, s.points.length - 1); } }
  applyRemoteEnd(id) { const s = this.strokes.find(st => st.id === id); if (!s) return; if (["rect", "circle", "line"].includes(s.tool) && s.points.length === 1) s.points.push(s.points[0]); this.redraw(); }

  // cursor rendering
  updateCursor(userId, info) {
    let el = this.cursorMap.get(userId);
    if (!el) {
      el = document.createElement('div');
      el.className = 'user-cursor';
      const dot = document.createElement('span'); dot.className = 'dot';
      el.appendChild(dot);
      const name = document.createElement('span'); name.className = 'name';
      el.appendChild(name);
      this.cursorsEl.appendChild(el);
      this.cursorMap.set(userId, el);
    }
    const dot = el.querySelector('.dot');
    const name = el.querySelector('.name');
    dot.style.background = info.color || '#fff';
    name.textContent = info.name || userId.slice(-4);
    el.style.left = (info.x || 0) + 'px';
    el.style.top = (info.y || 0) + 'px';
    if (info.tool === 'eraser') {
      dot.style.width = '12px'; dot.style.height = '12px'; dot.style.borderRadius = '6px';
    } else {
      dot.style.width = '10px'; dot.style.height = '10px'; dot.style.borderRadius = '50%';
    }
  }

  removeCursor(userId) { const el = this.cursorMap.get(userId); if (el) { el.remove(); this.cursorMap.delete(userId); } }

  frameTick() { const now = performance.now(); const dt = now - this.lastFrameTime; this.fps = Math.round(1000 / Math.max(dt, 1)); this.lastFrameTime = now; return this.fps; }
}
