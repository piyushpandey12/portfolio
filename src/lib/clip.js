export class Clip {
  constructor({ src, poster, w, h, track, loopFade = 0.55 }) {
    this.w = w;
    this.h = h;
    this.track = track || null;
    this.loopFade = loopFade;
    this.ready = false;
    this.needsUpload = false;
    this._lastTime = -1;

    const v = document.createElement('video');
    v.muted = true;
    v.defaultMuted = true;
    v.loop = true;
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
    v.preload = 'auto';
    v.crossOrigin = 'anonymous';
    v.disablePictureInPicture = true;
    if (poster) v.poster = poster;

    for (const s of src) {
      const el = document.createElement('source');
      el.src = s.url;
      el.type = s.type;
      v.appendChild(el);
    }
    this.el = v;
    this.duration = 0;

    v.addEventListener('loadedmetadata', () => { this.duration = v.duration; });
    v.addEventListener('canplay', () => { this.ready = true; });
    v.load();
  }

  whenReady() {
    if (this.el.readyState >= 3) return Promise.resolve(this);
    return new Promise((res) => {
      const done = () => { cleanup(); res(this); };
      const cleanup = () => {
        this.el.removeEventListener('canplaythrough', done);
        this.el.removeEventListener('canplay', done);
        this.el.removeEventListener('error', done);
      };
      this.el.addEventListener('canplaythrough', done, { once: true });
      this.el.addEventListener('canplay', done, { once: true });
      this.el.addEventListener('error', done, { once: true });
    });
  }

  async play() {
    try {
      await this.el.play();
      return true;
    } catch {
      return false;
    }
  }

  pause() { this.el.pause(); }

  poll() {
    const t = this.el.currentTime;
    if (t !== this._lastTime && this.el.readyState >= 2) {
      this._lastTime = t;
      return true;
    }
    return false;
  }

  box() {
    if (!this.track || !this.track.length) return [0.25, 0.05, 0.75, 0.98];
    const d = this.duration || 1;
    const i = Math.min(this.track.length - 1,
      Math.max(0, Math.floor((this.el.currentTime / d) * this.track.length)));
    return this.track[i];
  }

  seamFade() {
    const d = this.duration;
    if (!d || !this.loopFade) return 1;
    const t = this.el.currentTime;
    const f = this.loopFade;
    if (t > d - f) return Math.max(0, (d - t) / f);
    if (t < f) return Math.min(1, t / f);
    return 1;
  }
}
