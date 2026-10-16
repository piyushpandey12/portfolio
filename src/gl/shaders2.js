export const V2_FULL = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
out vec2 vUV;
void main(){
  vUV = vec2(aPos.x, 1.0 - aPos.y);
  gl_Position = vec4(aPos * 2.0 - 1.0, 0.0, 1.0);
}`;

export const F2_ENV = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uGrain;
uniform vec2  uRes;
uniform float uTime;
uniform float uAspect;
uniform float uWake;
uniform float uBurst;
uniform vec2  uCore;
uniform vec3  uStroke;
out vec4 frag;

void main(){
  vec2 p = vUV;
  vec2 d = (p - uCore) * vec2(uAspect, 1.0);
  float r = length(d);

  vec3 col = vec3(0.010, 0.009, 0.012);

  float bloom = exp(-r * r * 7.0);
  col += vec3(0.085, 0.010, 0.014) * bloom * (0.2 + 0.8 * uWake);
  col += vec3(0.20, 0.035, 0.04) * exp(-r * r * 16.0) * uBurst * 0.22;

  vec2 hd = (p - uStroke.xy) * vec2(uAspect, 1.0);
  col += vec3(0.30, 0.055, 0.045) * exp(-dot(hd, hd) * 18.0) * uStroke.z;
  col += vec3(0.16, 0.028, 0.024) * exp(-abs(p.x - uStroke.x) * uAspect * 5.0)
       * smoothstep(0.68, 1.0, p.y) * 0.30 * uStroke.z;

  float horizon = uCore.y + 0.30;
  if(p.y > horizon){
    float f = (p.y - horizon) / max(1.0 - horizon, 1e-3);
    float sheen = exp(-abs(p.x - uCore.x) * uAspect * 3.6) * (1.0 - f);
    col += vec3(0.13, 0.016, 0.020) * sheen * 0.40 * (0.3 + 0.7 * uWake);

    float grid = smoothstep(0.965, 1.0, abs(sin((p.x - uCore.x) * 34.0)));
    col += vec3(0.05, 0.012, 0.014) * grid * (1.0 - f) * 0.25 * uWake;
    col *= mix(1.0, 0.55, f);
  }

  float g = texture(uGrain, p * (uRes / 512.0) * 0.55 + vec2(uTime * 0.003, 0.0)).r;
  col += (g - 0.5) * 0.028;

  vec2 v = (p - 0.5) * vec2(uAspect, 1.0);
  col *= 1.0 - smoothstep(0.42, 1.15, length(v)) * 0.92;

  frag = vec4(col, 1.0);
}`;

export const F2_RING = `#version 300 es
precision highp float;
in vec2 vUV;
uniform vec2  uRes;
uniform float uTime;
uniform float uAspect;
uniform float uLife;
uniform float uBurst;
uniform vec2  uCore;
uniform float uScale;
out vec4 frag;

float arc(vec2 d, float R, float w, float spin, float coverage){
  float r = length(d);
  float band = smoothstep(w, 0.0, abs(r - R));
  float a = atan(d.y, d.x) + spin;
  float s = 0.5 + 0.5 * sin(a);
  float gate = smoothstep(1.0 - coverage - 0.12, 1.0 - coverage + 0.12, s);
  return band * mix(0.28, 1.0, gate);
}

void main(){
  vec2 d = (vUV - uCore) * vec2(uAspect, 1.0) / max(uScale, 1e-3);
  float t = uTime;
  float pulse = 0.82 + 0.18 * sin(t * 0.9);

  float e = 0.0;
  e += arc(d, 0.150, 0.0030, t * 0.28, 0.62) * 0.62;
  e += arc(d, 0.205, 0.0022, -t * 0.19, 0.50) * 0.40;
  e += arc(d, 0.268, 0.0018, t * 0.13, 0.40) * 0.28;
  e += arc(d, 0.330, 0.0014, -t * 0.09, 0.30) * 0.18;

  float r = length(d);
  e += exp(-r * r * 42.0) * 0.16;

  e *= pulse * uLife;

  e += uBurst * exp(-r * r * 26.0) * 0.20;

  vec3 col = vec3(1.0, 0.14, 0.13) * e;
  col += vec3(1.0, 0.72, 0.66) * pow(max(e - 0.75, 0.0), 2.0) * 1.4;
  frag = vec4(col, 1.0);
}`;

export const V2_CARD = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
uniform mat4 uMVP;
uniform vec2 uHalf;
out vec2 vP;
out float vDepth;
void main(){
  vP = aPos * 2.0 - 1.0;
  vec4 clip = uMVP * vec4(vP * uHalf, 0.0, 1.0);
  vDepth = clip.w;
  gl_Position = clip;
}`;

export const F2_CARD = `#version 300 es
precision highp float;
in vec2 vP;
in float vDepth;
uniform sampler2D uLogo;
uniform sampler2D uGrain;
uniform vec2  uLogoScale;
uniform float uRadius;
uniform float uOpacity;
uniform float uMat;
uniform float uHover;
uniform float uAspect;
uniform vec2  uLight;
uniform float uTime;
out vec4 frag;

float sdRound(vec2 p, vec2 b, float r){
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

void main(){
  vec2 p = vec2(vP.x * uAspect, vP.y);
  vec2 b = vec2(uAspect, 1.0);
  float d = sdRound(p, b, uRadius);

  float soft = mix(0.075, 0.006, uMat);
  float face = smoothstep(soft, -soft, d);
  if(face <= 0.002) discard;

  vec3 col = vec3(0.055, 0.055, 0.066);
  col *= 1.0 - 0.40 * (vP.y * 0.5 + 0.5);

  col += vec3(0.030, 0.031, 0.038)
       * clamp(0.5 - vP.x * 0.35 + vP.y * 0.22, 0.0, 1.0);

  float rim = smoothstep(0.075, 0.0, abs(d));
  float facing = clamp(dot(normalize(p + 1e-5), normalize(uLight)), 0.0, 1.0);
  col += vec3(0.95, 0.18, 0.16) * rim * (0.12 + 0.88 * facing) * (0.65 + uHover);
  col += vec3(0.42, 0.45, 0.54) * rim * 0.42;

  float sheen = exp(-length(p - uLight * 0.7) * 1.3);
  col += vec3(0.10, 0.03, 0.035) * sheen * (0.6 + uHover * 0.8);

  vec2 luv = (vP / uLogoScale) * 0.5 + 0.5;
  if(luv.x > 0.0 && luv.x < 1.0 && luv.y > 0.0 && luv.y < 1.0){
    vec4 lg = texture(uLogo, vec2(luv.x, 1.0 - luv.y));

    vec3 lc = lg.rgb * (1.0 + uHover * 0.55);
    col = mix(col, lc, lg.a * mix(0.55, 1.0, uMat));
  }

  float g = texture(uGrain, gl_FragCoord.xy / 512.0 + vec2(uTime * 0.01, 0.0)).r;
  col += (g - 0.5) * 0.030;

  float haze = clamp((vDepth - 3.0) / 9.0, 0.0, 0.62);
  col = mix(col, vec3(0.030, 0.012, 0.016), haze);

  float a = face * uOpacity;
  frag = vec4(col * a, a);
}`;

export const V2_RIBBON = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aSide;
uniform mat4 uMVP;
out float vAcross;
out float vAge;
out float vZ;
out float vDepth;
void main(){
  vAcross = aSide.x;
  vAge = aSide.y;
  vZ = aPos.z;
  vec4 clip = uMVP * vec4(aPos, 1.0);
  vDepth = clip.w;
  gl_Position = clip;
}`;

export const F2_RIBBON = `#version 300 es
precision highp float;
in float vAcross;
in float vAge;
in float vZ;
in float vDepth;
uniform float uIntensity;
uniform float uTime;
uniform vec2  uZBand;
out vec4 frag;

void main(){

  if(vZ < uZBand.x || vZ >= uZBand.y) discard;

  float x = abs(vAcross);
  float core = exp(-x * x * 40.0);
  float glow = exp(-x * x * 3.6);
  float bloom = exp(-x * x * 1.1);

  float heat = 1.0 - vAge;
  float fade = 0.38 + 0.62 * pow(heat, 1.35);
  fade *= smoothstep(1.0, 0.93, vAge);
  vec3 body = mix(vec3(0.62, 0.05, 0.04), vec3(1.0, 0.16, 0.10), fade);
  vec3 hot  = mix(vec3(1.0, 0.45, 0.30), vec3(1.0, 0.88, 0.78),
                  smoothstep(0.25, 0.0, vAge));

  float flow = 0.80 + 0.20 * sin(vAge * 46.0 + uTime * 3.4);

  vec3 col = body * (glow * 1.1 + bloom * 0.35) + hot * core * 2.0;
  float a = (glow * 0.7 + core * 1.35 + bloom * 0.22) * fade * uIntensity * flow;

  float headness = smoothstep(0.045, 0.0, vAge);
  a += core * headness * 1.6 * uIntensity;
  a += exp(-x * x * 1.6) * headness * 0.55 * uIntensity;
  a *= clamp(1.25 - vDepth * 0.035, 0.3, 1.0);
  frag = vec4(col * a, a);
}`;

export const V2_SPARK = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aSeed;
uniform mat4 uMVP;
uniform float uTime;
uniform float uConverge;
uniform float uLife;
uniform vec2 uPointer;
uniform vec3 uHead;
uniform float uRes;
out float vGlow;
out float vBlur;
void main(){
  vec3 p = aPos;
  float ph = aSeed.x * 6.283;
  p.x += sin(uTime * aSeed.z * 0.55 + ph) * 0.34 + uPointer.x * 0.25;
  p.y += cos(uTime * aSeed.z * 0.42 + ph * 1.7) * 0.28 - uPointer.y * 0.16;
  p.z += sin(uTime * aSeed.z * 0.31 + ph * 2.3) * 0.30;

  p *= mix(1.0, 0.42, uConverge);

  vec4 clip = uMVP * vec4(p, 1.0);
  gl_Position = clip;
  float near = clamp(3.0 / max(clip.w, 0.4), 0.15, 3.2);
  gl_PointSize = (2.5 + aSeed.y * 32.0) * near * (uRes / 900.0);
  vBlur = clamp(near * 0.42, 0.12, 1.0);

  float wave = 0.5 + 0.5 * sin(p.x * 0.42 + p.z * 0.30 - uTime * 0.42 + ph * 0.3);
  float boost = 0.28 + 1.55 * wave * wave * wave;

  float d = length(p - uHead);
  boost += 1.7 * exp(-d * d * 0.55);

  vGlow = uLife * (0.22 + aSeed.y * 0.85) * clamp(near, 0.2, 1.6) * boost;
}`;

export const F2_SPARK = `#version 300 es
precision highp float;
in float vGlow;
in float vBlur;
out vec4 frag;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c) * 2.0;

  float core = exp(-r * r / max(vBlur * 0.55, 0.05));
  float halo = exp(-r * r * 2.1);
  float a = (core * 0.9 + halo * 0.35) * vGlow;
  if(a <= 0.003) discard;
  vec3 col = mix(vec3(1.0, 0.42, 0.20), vec3(1.0, 0.86, 0.70), core);
  frag = vec4(col * a, a);
}`;

export const F2_FIGURE = `#version 300 es
precision highp float;
in vec2 vP;
in float vDepth;
uniform sampler2D uFig;
uniform sampler2D uGrain;
uniform float uOpacity;
uniform float uRim;
uniform vec2  uLightDir;
uniform float uTime;
out vec4 frag;

void main(){
  vec2 uv = vP * 0.5 + 0.5;
  vec4 s = texture(uFig, vec2(uv.x, 1.0 - uv.y));
  float a = s.a;
  if(a <= 0.004) discard;

  vec3 col = s.rgb * (0.92 + 0.18 * uRim);

  vec2 texel = vec2(1.0) / vec2(textureSize(uFig, 0));
  float ax = texture(uFig, vec2(uv.x + texel.x, 1.0 - uv.y)).a
           - texture(uFig, vec2(uv.x - texel.x, 1.0 - uv.y)).a;
  float ay = texture(uFig, vec2(uv.x, 1.0 - uv.y - texel.y)).a
           - texture(uFig, vec2(uv.x, 1.0 - uv.y + texel.y)).a;
  vec2 n = vec2(-ax, -ay);
  float edge = length(n);
  if(edge > 0.001){
    float facing = clamp(dot(normalize(n), normalize(uLightDir)), 0.0, 1.0);
    col += vec3(1.0, 0.28, 0.18) * pow(facing, 5.0) * edge * 0.85 * uRim;
    col += vec3(0.8, 0.15, 0.10) * pow(facing, 2.5) * edge * 0.35 * uRim;
  }

  float g = texture(uGrain, gl_FragCoord.xy / 512.0).r;
  col += (g - 0.5) * 0.015;

  float o = a * uOpacity;
  frag = vec4(col * o, o);
}`;

export const V2_QUAD3D = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
uniform mat4 uMVP;
uniform vec2 uHalf;
out vec2 vP;
out float vDepth;
void main(){
  vP = aPos * 2.0 - 1.0;
  vec4 clip = uMVP * vec4(vP * uHalf, 0.0, 1.0);
  vDepth = clip.w;
  gl_Position = clip;
}`;

export const F2_CUBE = `#version 300 es
precision highp float;
in vec2 vP;
in float vDepth;
uniform float uOpacity;
uniform vec2  uLight;
out vec4 frag;
void main(){
  vec2 p = abs(vP);
  float d = max(p.x, p.y);
  float face = smoothstep(1.0, 0.965, d);
  if(face <= 0.004) discard;
  vec3 col = vec3(0.030, 0.030, 0.036);
  float rim = smoothstep(0.90, 1.0, d);
  float facing = clamp(dot(normalize(vP + 1e-5), normalize(uLight)), 0.0, 1.0);
  col += vec3(0.75, 0.13, 0.12) * rim * facing * 0.85;
  float a = face * uOpacity;
  frag = vec4(col * a, a);
}`;

export const F2_POST = `#version 300 es
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
  float vig = smoothstep(0.46, 1.18, length(v));
  frag = vec4(vec3(g * uAmount), vig * 0.5);
}`;
