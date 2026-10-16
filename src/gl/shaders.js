export const VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
uniform vec4 uRect;
uniform vec2 uRes;
uniform vec4 uUV;
uniform vec2 uSkew;
out vec2 vUV;
out vec2 vLocal;
out vec2 vScreen;
void main(){
  vLocal = aPos;
  vUV = uUV.xy + aPos * uUV.zw;
  vec2 px = uRect.xy + aPos * uRect.zw + uSkew;
  vScreen = px / uRes;
  vec2 clip = vec2(px.x / uRes.x * 2.0 - 1.0, 1.0 - px.y / uRes.y * 2.0);
  gl_Position = vec4(clip, 0.0, 1.0);
}`;

export const FRAG_BG = `#version 300 es
precision highp float;
in vec2 vScreen;
uniform sampler2D uGrain;
uniform vec2 uRes;
uniform float uTime;
uniform float uEmber;
uniform vec2  uEmberAt;
uniform float uAspect;
out vec4 frag;

void main(){
  vec2 p = vScreen;
  float g = texture(uGrain, p * (uRes / 512.0) * 0.6 + vec2(uTime * 0.004, 0.0)).r;

  vec3 col = vec3(0.008, 0.008, 0.010);
  col += (g - 0.5) * 0.035;

  vec2 d = (p - uEmberAt) * vec2(uAspect, 1.0);
  float ember = exp(-dot(d, d) * 2.4);
  col += vec3(0.115, 0.012, 0.014) * ember * uEmber;

  vec2 v = (p - 0.5) * vec2(uAspect, 1.0);
  float vig = 1.0 - smoothstep(0.38, 1.15, length(v));
  col *= mix(0.35, 1.0, vig);

  frag = vec4(col, 1.0);
}`;

export const FRAG_LETTER = `#version 300 es
precision highp float;
in vec2 vUV;
in vec2 vLocal;
in vec2 vScreen;
uniform sampler2D uGlyph;
uniform sampler2D uGrunge;
uniform vec2  uGrungeScale;
uniform vec2  uGrungeOffset;
uniform vec3  uInk;
uniform float uOpacity;
uniform float uReveal;
uniform float uSoften;
uniform float uEdgeLight;
uniform float uWear;
uniform float uWearGain;
out vec4 frag;

float glyph(vec2 uv, float r){
  if(r < 0.0002) return texture(uGlyph, uv).r;
  float a = texture(uGlyph, uv).r * 0.30;
  a += texture(uGlyph, uv + vec2(0.0,  r      )).r * 0.20;
  a += texture(uGlyph, uv + vec2(0.0, -r      )).r * 0.20;
  a += texture(uGlyph, uv + vec2(0.0,  r * 2.1)).r * 0.15;
  a += texture(uGlyph, uv + vec2(0.0, -r * 2.1)).r * 0.15;
  return a;
}

void main(){
  float cov = glyph(vUV, uSoften);
  if(cov <= 0.001) discard;

  vec2 gu = vScreen * uGrungeScale + uGrungeOffset;
  float tex = texture(uGrunge, gu).r;
  float tex2 = texture(uGrunge, gu * 3.1 + vec2(0.37, 0.11)).r;
  float wear = mix(tex, tex2, 0.42);
  wear = clamp((wear - 0.5) * uWearGain + 0.5, 0.0, 1.0);

  vec3 col = uInk * mix(1.0 - uWear, 1.0 + uWear * 0.30, wear);
  col = mix(col, uInk * vec3(0.42, 0.30, 0.30),
            smoothstep(0.30, 0.02, wear) * uWear * 1.2);

  float lift = smoothstep(0.0, 0.22, 1.0 - vLocal.y);
  col += uInk * lift * uEdgeLight * 0.28;

  float n = wear * 0.55 + vLocal.y * 0.45;
  float m = clamp((uReveal * 1.4 - n) / 0.4, 0.0, 1.0);
  float a = cov * uOpacity * m;

  frag = vec4(col * a, a);
}`;

export const FRAG_FIGURE = `#version 300 es
precision highp float;
in vec2 vUV;
in vec2 vLocal;
in vec2 vScreen;
uniform sampler2D uClip;
uniform sampler2D uGrunge;
uniform sampler2D uMask;
uniform vec4  uMaskUV;
uniform float uUseMask;
uniform float uOpacity;
uniform float uReveal;
uniform float uFeetFade;
uniform float uTopFade;
uniform float uExposure;
uniform float uLift;
uniform float uRimRed;
uniform float uContrast;
uniform float uDesat;
uniform vec2  uTexel;
uniform float uFloorY;
uniform vec2  uBand;
out vec4 frag;

vec4 sampleClip(vec2 uv){
  if(uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0);

  vec2 c = vec2(clamp(uv.x * 0.5, uTexel.x, 0.5 - uTexel.x), uv.y);
  vec3 col = texture(uClip, c).rgb;
  float a = texture(uClip, c + vec2(0.5, 0.0)).r;
  return vec4(col, a);
}

void main(){
  vec4 s = sampleClip(vUV);
  float a = s.a;
  if(a <= 0.004) discard;
  vec3 col = s.rgb / max(a, 0.06);

  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, 1.0 - uDesat);
  col = (col - 0.5) * uContrast + 0.5;
  col *= uExposure;
  col += vec3(0.010, 0.014, 0.030) * uLift * (1.0 - smoothstep(0.0, 0.5, l));

  float edge = 1.0 - smoothstep(0.20, 0.90, s.a);
  float behindType = smoothstep(uBand.x - 0.04, uBand.x + 0.03, vScreen.y)
                   * (1.0 - smoothstep(uBand.y - 0.02, uBand.y + 0.05, vScreen.y));
  col += vec3(0.80, 0.10, 0.11) * uRimRed * edge * mix(0.12, 1.0, behindType);

  col = max(col, vec3(0.0));

  if(uUseMask > 0.5){
    vec2 mu = uMaskUV.xy + vLocal * uMaskUV.zw;
    a *= texture(uMask, mu).r;
  }
  a *= smoothstep(0.0, uFeetFade, 1.0 - vLocal.y);
  a *= smoothstep(0.0, uTopFade, vLocal.y);

  if(uFloorY < 1.0 && vUV.y > uFloorY){
    float depth = clamp((vUV.y - uFloorY) / max(1.0 - uFloorY, 1e-3), 0.0, 1.0);
    a *= mix(1.0, smoothstep(0.40, 0.82, a), min(depth * 1.6, 1.0));
    col *= mix(1.0, 0.10, smoothstep(0.0, 0.95, depth));
  }

  float n = texture(uGrunge, vLocal * vec2(1.7, 0.9) + vec2(0.13, 0.41)).r;
  float field = n * 0.45 + (1.0 - vLocal.y) * 0.55;
  a *= clamp((uReveal * 1.4 - field) / 0.4, 0.0, 1.0) * uOpacity;

  frag = vec4(col * a, a);
}`;

export const FRAG_SHADOW = `#version 300 es
precision highp float;
in vec2 vLocal;
uniform float uOpacity;
uniform vec2  uFalloff;
out vec4 frag;
void main(){
  vec2 d = (vLocal - vec2(0.5, 1.0)) / uFalloff;
  float a = exp(-dot(d, d) * 3.0) * uOpacity;
  frag = vec4(0.0, 0.0, 0.0, clamp(a, 0.0, 1.0));
}`;

export const FRAG_POST = `#version 300 es
precision highp float;
in vec2 vScreen;
uniform sampler2D uGrain;
uniform vec2 uRes;
uniform float uTime;
uniform float uAmount;
uniform float uAspect;
uniform float uFlash;
out vec4 frag;
void main(){
  vec2 p = vScreen;
  vec2 jitter = vec2(fract(sin(uTime * 12.9898) * 43758.5453),
                     fract(sin(uTime * 78.233) * 12345.6789));
  float g = texture(uGrain, p * (uRes / 512.0) + jitter).r - 0.5;
  vec2 v = (p - 0.5) * vec2(uAspect, 1.0);
  float vig = smoothstep(0.42, 1.2, length(v));
  vec3 col = vec3(g * uAmount);
  col += vec3(0.085, 0.008, 0.011) * uFlash;
  frag = vec4(col, vig * 0.55 + uFlash * 0.1);
}`;
