const SEGMENTS = 340;

const TRAIL_SECONDS = 7.5;

export class Ribbon {
  constructor(gl, figureZ = 1.6) {
    this.gl = gl;
    this.figureZ = figureZ;
    this.count = SEGMENTS;

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, SEGMENTS * 2 * 3 * 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    this.sideBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.sideBuf);
    const side = new Float32Array(SEGMENTS * 2 * 2);
    for (let i = 0; i < SEGMENTS; i++) {
      const a = i / (SEGMENTS - 1);
      side[i * 4 + 0] = -1; side[i * 4 + 1] = a;
      side[i * 4 + 2] = 1; side[i * 4 + 3] = a;
    }
    gl.bufferData(gl.ARRAY_BUFFER, side, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.verts = new Float32Array(SEGMENTS * 2 * 3);
    this.headPos = [0, 0, 0];
  }

  head(t) {

    const th = t * 0.72;
    const R = 2.9 + 1.5 * Math.sin(t * 0.21 + 1.2);
    const Rz = 2.4 + 1.1 * Math.sin(t * 0.166 + 0.4);
    let x = Math.cos(th) * R;
    let z = this.figureZ + Math.sin(th) * Rz;

    let y = -1.15 + 2.0 * Math.sin(t * 0.131 + 0.9) + 0.5 * Math.sin(th * 2.0 + 0.5);

    x += 1.9 * Math.sin(t * 0.093 + 2.0);
    y += 0.8 * Math.sin(t * 0.117 + 0.7);
    z += 0.9 * Math.sin(t * 0.071 + 3.1);
    return [x, y, z];
  }

  update(t, width, draw, entry) {
    const v = this.verts;
    const span = TRAIL_SECONDS * Math.max(draw, 0.001);

    for (let i = 0; i < SEGMENTS; i++) {
      const age = i / (SEGMENTS - 1);
      const ts = t - age * span;
      let p = this.head(ts);
      if (entry < 1) {
        const k = 1 - entry;
        p = [p[0] * (1 - k) + (-8.5) * k,
          p[1] * (1 - k) + (-1.9) * k,
          p[2] * (1 - k) + (2.4) * k];
      }
      const q = this.head(ts - 0.05);

      let tx = p[0] - q[0];
      let ty = p[1] - q[1];
      const len = Math.hypot(tx, ty) || 1;
      tx /= len; ty /= len;

      const taper = (1.15 - age * 0.55) * (0.85 + 0.15 * Math.sin(ts * 3.1));
      const w = width * taper * Math.min(1, (1 - age) * 14)
        * Math.min(1, age * 60 + 0.25);
      const nx = -ty * w;
      const ny = tx * w;

      v[i * 6 + 0] = p[0] + nx; v[i * 6 + 1] = p[1] + ny; v[i * 6 + 2] = p[2];
      v[i * 6 + 3] = p[0] - nx; v[i * 6 + 4] = p[1] - ny; v[i * 6 + 5] = p[2];

      if (i === 0) this.headPos = p;
    }

    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, v);
  }

  draw() {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, SEGMENTS * 2);
    gl.bindVertexArray(null);
  }
}
