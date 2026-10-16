export const V3 = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
out vec2 vUV;
void main(){
  vUV = vec2(aPos.x, 1.0 - aPos.y);
  gl_Position = vec4(aPos * 2.0 - 1.0, 0.0, 1.0);
}`;

export const F3_ROOM = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uGrain;
uniform vec2  uRes;
uniform float uTime;
uniform float uAspect;
uniform float uWake;
uniform float uRings;
uniform vec2  uFloor;
uniform vec2  uPivot;
uniform float uHeat;
uniform vec2  uActive;
uniform vec2  uFig;
out vec4 frag;

const vec3 AMBER = vec3(1.00, 0.56, 0.20);
const vec3 EMBER = vec3(1.00, 0.22, 0.07);

vec2 floorSpace(vec2 p, vec2 c){
  vec2 d = (p - c) * vec2(uAspect, 1.0);
  d.y /= 0.30;
  return d;
}

void main(){
  vec2 p = vUV;
  vec3 col = vec3(0.013, 0.010, 0.009);

  vec2 dp = (p - uPivot) * vec2(uAspect, 1.0);
  col += AMBER * 0.045 * exp(-dot(dp, dp) * 1.1) * uWake;

  float horizon = 0.545;
  {

    float onFloor = smoothstep(horizon - 0.05, horizon + 0.06, p.y);
    float depth = clamp((p.y - horizon) / (1.0 - horizon), 0.0, 1.0);

    vec2 fp = floorSpace(p, uFloor);
    float r = length(fp);
    float a = atan(fp.y, fp.x);

    vec2 fd = vec2((p.x - uFig.x) * uAspect, (p.y - uFig.y + 0.10) * 2.1);
    float pool = exp(-dot(fd, fd) * 3.4);
    col += vec3(1.0, 0.44, 0.16) * pool * 0.16 * uWake;

    float rings = 0.0;
    for(int i = 0; i < 5; i++){
      float fi = float(i);
      float R = 0.16 + fi * 0.135;
      float spin = uTime * (0.05 + fi * 0.023) * (mod(fi, 2.0) < 0.5 ? 1.0 : -1.4);
      float band = smoothstep(0.010, 0.0, abs(r - R));

      float sweep = 0.55 + 0.45 * sin(a * (1.0 + fi) + spin * 6.0);
      rings += band * sweep * (1.0 - fi * 0.14);
    }
    col += AMBER * rings * 0.5 * uRings * (1.0 - depth * 0.35) * onFloor
         * (1.0 + pool * 2.2);

    float streak = exp(-abs(p.x - uFloor.x) * uAspect * 2.0);
    col += AMBER * streak * 0.16 * (1.0 - depth) * uWake * onFloor;

    float hx = exp(-abs(p.x - uActive.x) * uAspect * 3.2);
    col += EMBER * hx * 0.20 * (1.0 - depth) * uHeat * onFloor;

    col *= mix(1.0, 0.35, depth * onFloor);
  }

  float g = texture(uGrain, p * (uRes / 512.0) * 0.5 + vec2(uTime * 0.002, 0.0)).r;
  col += (g - 0.5) * 0.024;
  vec2 v = (p - 0.5) * vec2(uAspect, 1.0);
  col *= 1.0 - smoothstep(0.44, 1.16, length(v)) * 0.9;

  frag = vec4(col, 1.0);
}`;

export const F3_CLOCK = `#version 300 es
precision highp float;
in vec2 vUV;
uniform vec2  uRes;
uniform float uTime;
uniform float uAspect;
uniform vec2  uPivot;
uniform vec2  uDialC;
uniform float uDial;
uniform float uReveal;
uniform float uHand;
uniform float uHand2;
uniform vec2  uTarget;
uniform float uBeam;
uniform float uHeat;
out vec4 frag;

float handShape(vec2 d, float ang, float len, float w0, float w1){
  vec2 hv = vec2(cos(ang), sin(ang));
  float along = dot(d, hv);
  float across = abs(d.x * hv.y - d.y * hv.x);
  if(along < 0.0 || along > len) return 0.0;
  float wid = mix(w0, w1, along / len);
  return smoothstep(wid, wid * 0.25, across);
}

const vec3 AMBER = vec3(1.00, 0.60, 0.24);
const vec3 EMBER = vec3(1.00, 0.20, 0.06);

void main(){
  vec2 p = vUV;
  vec2 d = (p - uPivot) * vec2(uAspect, 1.0);
  float r = length(d);
  float a = atan(d.y, d.x);
  vec3 col = vec3(0.0);
  float draw = smoothstep(0.0, 1.0, uReveal);

  vec2 dd = (p - uDialC) * vec2(uAspect, 1.0);
  float dr = length(dd);
  float da2 = atan(dd.y, dd.x);
  float onScreen = smoothstep(0.05, 0.45, da2) * smoothstep(3.10, 2.70, da2);

  float rim = smoothstep(0.0035, 0.0, abs(dr - uDial));
  col += AMBER * rim * 0.60 * onScreen * draw;
  float rim2 = smoothstep(0.0026, 0.0, abs(dr - uDial * 0.945));
  col += AMBER * rim2 * 0.32 * onScreen * draw;
  float rim3 = smoothstep(0.0030, 0.0, abs(dr - uDial * 1.07));
  col += AMBER * rim3 * 0.14 * onScreen * draw;

  {
    float n = da2 * 190.0 / 3.14159;
    float f = abs(fract(n) - 0.5);
    float major = step(0.5, abs(fract(n / 5.0) - 0.5) * 2.0 - 0.4);
    float tick = smoothstep(0.42, 0.48, f);
    float len = mix(0.011, 0.022, major);
    float inBand = smoothstep(len, 0.0, abs(dr - uDial * 0.972));
    col += AMBER * tick * inBand * (0.45 + 0.55 * major) * onScreen * draw;
  }

  float da = a - uHand;
  da = atan(sin(da), cos(da));
  float reach = smoothstep(1.30, 0.05, r);
  float wedge = exp(-da * da * 70.0);
  col += EMBER * wedge * reach * 0.50 * uBeam * (0.86 + 0.14 * sin(uTime * 2.2));
  col += mix(EMBER, vec3(1.0, 0.62, 0.34), 0.45)
       * exp(-da * da * 850.0) * reach * 0.80 * uBeam;

  vec2 td = (p - uTarget) * vec2(uAspect, 1.0);
  col += vec3(1.0, 0.24, 0.08) * exp(-dot(td, td) * 160.0) * 1.1 * uBeam;
  col += vec3(1.0, 0.50, 0.24) * exp(-dot(td, td) * 950.0) * 1.3 * uBeam;

  float h1 = handShape(d, uHand, 0.34, 0.0050, 0.0010);
  col += vec3(1.0, 0.90, 0.78) * h1 * 1.05 * draw;

  float h2 = handShape(d, uHand2, 0.30, 0.0056, 0.0008);
  col += vec3(0.98, 0.84, 0.66) * h2 * 0.95 * draw;
  {
    vec2 hv2 = vec2(cos(uHand2), sin(uHand2));

    vec2 orn = hv2 * 0.135;
    vec2 ov = d - orn;
    float od = length(ov);
    float oa = atan(ov.y, ov.x);
    float orad = 0.0110 * (0.72 + 0.28 * cos(4.0 * (oa - uHand2)));
    float rose = smoothstep(orad, orad * 0.70, od)
               * smoothstep(0.0036, 0.0052, od);
    col += vec3(0.98, 0.86, 0.70) * rose * 1.0 * draw;

    float h2c = handShape(d, uHand2, 0.30, 0.0016, 0.0004);
    float outer = smoothstep(0.15, 0.19, dot(d, hv2));
    col += vec3(1.0, 0.96, 0.90) * h2c * outer * 0.9 * draw;
  }

  {
    float ball = smoothstep(0.0165, 0.0135, r);
    vec2 hi = d - vec2(-0.005, -0.005);
    float sheen = exp(-dot(hi, hi) * 9000.0);
    col += (vec3(0.92, 0.80, 0.66) * 0.85 + vec3(1.0, 0.98, 0.94) * sheen) * ball * draw;
    col += AMBER * exp(-r * r * 900.0) * 0.5 * draw;
  }

  frag = vec4(col, 1.0);
}`;

export const F3_TRACK = `#version 300 es
precision highp float;
in vec2 vUV;
uniform vec2  uRes;
uniform float uTime;
uniform float uAspect;
uniform vec3  uArc;
uniform vec2  uSpan;
uniform float uReveal;
uniform float uActiveU;
uniform float uHeat;
uniform vec2  uNodes[6];
uniform float uNodeIn[6];
out vec4 frag;

const vec3 AMBER = vec3(1.00, 0.62, 0.26);
const vec3 EMBER = vec3(1.00, 0.24, 0.08);

void main(){
  vec2 p = vUV;
  vec2 d = (p - uArc.xy) * vec2(uAspect, 1.0);
  float r = length(d);
  float a = atan(d.y, d.x);
  vec3 col = vec3(0.0);

  float u = clamp((a - uSpan.x) / (uSpan.y - uSpan.x), 0.0, 1.0);
  float within = step(min(uSpan.x, uSpan.y) - 0.02, a)
               * step(a, max(uSpan.x, uSpan.y) + 0.02);
  float drawn = smoothstep(uReveal + 0.02, uReveal - 0.06, u);

  float line = smoothstep(0.0016, 0.0, abs(r - (uArc.z - 0.0035)));
  float line2 = smoothstep(0.0014, 0.0, abs(r - (uArc.z + 0.0035)));
  float glow = exp(-pow((r - uArc.z) / 0.011, 2.0));
  col += AMBER * (line * 0.85 + line2 * 0.55 + glow * 0.24) * within * drawn;

  {
    float tn = a * 260.0 / 3.14159;
    float tf = smoothstep(0.40, 0.47, abs(fract(tn) - 0.5));
    float band2 = smoothstep(0.0, 0.004, r - (uArc.z + 0.006))
                * smoothstep(0.017, 0.009, r - (uArc.z + 0.006));
    col += AMBER * tf * band2 * 0.30 * within * drawn;
  }

  float head = uActiveU / 5.0;
  float chase = fract(u * 2.4 - uTime * 0.28);
  float pulse = pow(max(0.0, 1.0 - abs(u - head) * 6.0), 2.0);
  col += EMBER * (line + line2 * 0.6) * (0.55 * pulse + 0.20 * pow(chase, 8.0))
       * within * drawn * (0.6 + 0.4 * uHeat);

  col += EMBER * line * smoothstep(head + 0.04, head - 0.10, u) * 0.30 * within * drawn;

  for(int i = 0; i < 6; i++){
    vec2 nd = (p - uNodes[i]) * vec2(uAspect, 1.0);
    float ndr = length(nd);
    float near = 1.0 - clamp(abs(float(i) - uActiveU), 0.0, 1.0);
    float k = uNodeIn[i];
    col += vec3(1.0, 0.88, 0.74) * smoothstep(0.0055, 0.0015, ndr) * k;
    col += mix(AMBER, EMBER, near) * exp(-ndr * ndr * 2600.0) * (0.5 + 0.9 * near) * k;

    col += EMBER * exp(-ndr * ndr * 420.0) * 0.42 * near * k * uHeat;
  }

  frag = vec4(col, 1.0);
}`;

export const V3_QUAD = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
uniform vec4 uRect;
uniform vec2 uRes;
out vec2 vUV;
void main(){
  vUV = aPos;
  vec2 px = uRect.xy + aPos * uRect.zw;
  gl_Position = vec4(px.x / uRes.x * 2.0 - 1.0, 1.0 - px.y / uRes.y * 2.0, 0.0, 1.0);
}`;

export const F3_FIGURE = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uFig;
uniform sampler2D uGrain;
uniform float uOpacity;
uniform float uRim;
uniform vec2  uLightDir;
uniform float uHeat;
out vec4 frag;

void main(){

  vec4 s = texture(uFig, vUV);
  float a = s.a;
  if(a <= 0.004) discard;

  vec3 col = s.rgb * (0.95 + 0.15 * uHeat);

  vec2 texel = vec2(1.0) / vec2(textureSize(uFig, 0));
  float ax = texture(uFig, vUV + vec2(texel.x, 0.0)).a
           - texture(uFig, vUV - vec2(texel.x, 0.0)).a;
  float ay = texture(uFig, vUV + vec2(0.0, texel.y)).a
           - texture(uFig, vUV - vec2(0.0, texel.y)).a;
  vec2 n = vec2(-ax, -ay);
  float edge = length(n);
  if(edge > 0.001){
    vec2 nn = normalize(n);
    float key = clamp(dot(nn, normalize(uLightDir)), 0.0, 1.0);
    float fill = clamp(dot(nn, normalize(vec2(-uLightDir.x, uLightDir.y))), 0.0, 1.0);
    float up = clamp(-nn.y, 0.0, 1.0);

    col += vec3(1.0, 0.60, 0.28) * pow(key, 3.2) * edge * 0.70 * uRim;
    col += vec3(0.9, 0.45, 0.18) * pow(fill, 3.0) * edge * 0.35 * uRim;
    col += vec3(1.0, 0.70, 0.32) * pow(up, 2.5) * edge * 0.30 * uRim;
    col += vec3(1.0, 0.28, 0.10) * pow(key, 2.0) * edge * 0.25 * uRim * uHeat;
  }

  col += vec3(1.0, 0.48, 0.20) * smoothstep(0.70, 1.0, vUV.y) * 0.12 * uRim * a;

  float g = texture(uGrain, gl_FragCoord.xy / 512.0).r;
  col += (g - 0.5) * 0.012;

  float o = a * uOpacity;
  frag = vec4(col * o, o);
}`;

export const F3_RINGS_FRONT = `#version 300 es
precision highp float;
in vec2 vUV;
uniform float uTime;
uniform float uAspect;
uniform float uRings;
uniform vec2  uFloor;
uniform float uCut;
out vec4 frag;

void main(){
  vec2 p = vUV;
  if(p.y < uCut){ discard; }
  vec2 d = (p - uFloor) * vec2(uAspect, 1.0);
  d.y /= 0.30;
  float r = length(d);
  float a = atan(d.y, d.x);
  float e = 0.0;
  for(int i = 0; i < 5; i++){
    float fi = float(i);
    float R = 0.16 + fi * 0.135;
    float spin = uTime * (0.05 + fi * 0.023) * (mod(fi, 2.0) < 0.5 ? 1.0 : -1.4);
    float band = smoothstep(0.010, 0.0, abs(r - R));
    float sweep = 0.55 + 0.45 * sin(a * (1.0 + fi) + spin * 6.0);
    e += band * sweep * (1.0 - fi * 0.14);
  }
  float soft = smoothstep(uCut, uCut + 0.03, p.y);
  vec3 col = vec3(1.0, 0.56, 0.20) * e * 0.30 * uRings * soft;
  frag = vec4(col, 0.0);
}`;

export const F3_POST = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uGrain;
uniform vec2 uRes;
uniform float uTime;
uniform float uAmount;
uniform float uAspect;
out vec4 frag;
void main(){
  vec2 j = vec2(fract(sin(uTime * 12.9898) * 43758.5453),
                fract(sin(uTime * 78.233) * 12345.6789));
  float g = texture(uGrain, vUV * (uRes / 512.0) + j).r - 0.5;
  vec2 v = (vUV - 0.5) * vec2(uAspect, 1.0);
  frag = vec4(vec3(g * uAmount), smoothstep(0.48, 1.2, length(v)) * 0.45);
}`;
