/* =========================================================================
   IDLE QUEST — 05 GFX CORE
   WebGL2 renderer: MSAA HDR target, cascade-less fitted shadow map, instanced
   geometry pipeline, ACES tonemap + bloom + unsharp composite.
   ========================================================================= */

const R = {
  gl: null, cv: null, w: 1, h: 1, dpr: 1,
  quality: 2,           // 0 low, 1 med, 2 high
  msaa: 4, hdr: false, shadowSize: 2048,
  prog: {}, fb: {}, tex: {},
  proj: new Float32Array(16), view: new Float32Array(16), vp: new Float32Array(16),
  lightVP: new Float32Array(16), invVP: new Float32Array(16),
  sun: [0.4, 0.8, 0.3], sky: null, camPos: [0, 20, 0],
  frame: 0, drawCalls: 0, tris: 0,
  ok: false, lost: false,
};

/* ------------------------------ SHADER PLUMBING ------------------------------ */
function shCompile(gl, type, src, name) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    console.error('[shader ' + name + ']', log, '\n' + src.split('\n').map((l, i) => (i + 1) + ': ' + l).join('\n'));
    throw new Error('shader compile failed: ' + name + '\n' + log);
  }
  return s;
}
function mkProg(gl, vs, fs, name) {
  const p = gl.createProgram();
  gl.attachShader(p, shCompile(gl, gl.VERTEX_SHADER, vs, name + '.vs'));
  gl.attachShader(p, shCompile(gl, gl.FRAGMENT_SHADER, fs, name + '.fs'));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link failed ' + name + ': ' + gl.getProgramInfoLog(p));
  const o = { p, u: {}, name };
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    const nm = info.name.replace(/\[0\]$/, '');
    o.u[nm] = gl.getUniformLocation(p, nm);
  }
  return o;
}

/* ------------------------------ GLSL CHUNKS ------------------------------ */
const GL_HEAD = `#version 300 es
precision highp float;
precision highp int;
`;
/* every scene fragment shader shares one uniform block, declared before the
   helper chunks that reference it. */
const GL_SCENE_UNI = `
uniform vec3 uSun; uniform vec3 uSunCol; uniform vec3 uAmb; uniform float uSunI;
uniform vec3 uSkyTop; uniform vec3 uSkyHor; uniform vec3 uFog; uniform vec2 uFogRange;
uniform vec3 uCam; uniform float uTime;
`;
const GL_FOG = `
vec3 applyFog(vec3 col, float dist, vec3 vdir){
  float f = smoothstep(uFogRange.x, uFogRange.y, dist);
  f = f*f*(3.0-2.0*f);
  float up = clamp(vdir.y*0.5+0.5, 0.0, 1.0);
  vec3 fc = mix(uFog, mix(uSkyHor, uSkyTop, up), 0.55);
  return mix(col, fc, f*0.86);
}`;
const GL_SHADOW = `
uniform highp sampler2DShadow uShadow; uniform mat4 uLightVP; uniform float uShadowTexel;
float shadowAt(vec3 wpos, float ndl){
  vec4 lp = uLightVP * vec4(wpos, 1.0);
  vec3 pc = lp.xyz / lp.w * 0.5 + 0.5;
  if(pc.x<0.005||pc.x>0.995||pc.y<0.005||pc.y>0.995||pc.z>1.0) return 1.0;
  float bias = mix(0.0032, 0.0008, ndl);
  pc.z -= bias;
  float s = 0.0;
  s += texture(uShadow, vec3(pc.xy + vec2(-0.94,-0.34)*uShadowTexel, pc.z));
  s += texture(uShadow, vec3(pc.xy + vec2( 0.94, 0.34)*uShadowTexel, pc.z));
  s += texture(uShadow, vec3(pc.xy + vec2(-0.34, 0.94)*uShadowTexel, pc.z));
  s += texture(uShadow, vec3(pc.xy + vec2( 0.34,-0.94)*uShadowTexel, pc.z));
  s += texture(uShadow, vec3(pc.xy, pc.z));
  s *= 0.2;
  float edge = smoothstep(0.44, 0.5, max(abs(pc.x-0.5), abs(pc.y-0.5)));
  return mix(s, 1.0, edge);
}`;
const GL_LIGHT = `
vec3 lambert(vec3 albedo, vec3 N, vec3 V, float shadow, float spec, float rough){
  float ndl = max(dot(N, uSun), 0.0);
  // slight wrap so shaded sides keep some shape instead of going flat black
  ndl = ndl*0.92 + pow(max(dot(N,uSun)*0.5+0.5, 0.0), 2.0)*0.08;
  vec3 diff = uSunCol * uSunI * ndl * (shadow*0.86 + 0.14);
  // hemisphere ambient — sky above, bounce below
  float hemi = N.y*0.5+0.5;
  vec3 amb = mix(uAmb*0.40, uAmb*1.05, hemi);
  vec3 H = normalize(uSun + V);
  float sp = pow(max(dot(N,H),0.0), mix(8.0, 96.0, 1.0-rough)) * spec * shadow * uSunI;
  // subtle rim so silhouettes read against the sky
  float rim = pow(1.0 - max(dot(N,V),0.0), 3.0) * 0.14;
  return albedo * (diff + amb) + uSunCol*sp + uSkyHor*rim*uSunI;
}`;

/* ------------------------------ PROGRAM SOURCES ------------------------------ */
const VS_TERRAIN = GL_HEAD + `
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec3 aCol;
uniform mat4 uVP; uniform vec3 uCam;
out vec3 vN; out vec3 vC; out vec3 vW; out float vD;
void main(){
  vW = aPos; vN = aNrm; vC = aCol;
  vD = length(aPos - uCam);
  gl_Position = uVP * vec4(aPos,1.0);
}`;
const FS_TERRAIN = GL_HEAD + GL_SCENE_UNI + GL_LIGHT + GL_SHADOW + GL_FOG + `
in vec3 vN; in vec3 vC; in vec3 vW; in float vD;
out vec4 o;
void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(uCam - vW);
  float ndl = max(dot(N,uSun),0.0);
  float sh = shadowAt(vW, ndl);
  vec3 alb = vC;
  // wet sand / shoreline darkening
  float wet = smoothstep(6.4, 4.6, vW.y);
  alb *= mix(1.0, 0.62, wet);
  // push saturation a little: procedural ground otherwise reads washed out
  float lum = dot(alb, vec3(0.2126,0.7152,0.0722));
  alb = mix(vec3(lum), alb, 1.28);
  vec3 c = lambert(alb, N, V, sh, mix(0.05, 0.30, wet), 0.85);
  c = applyFog(c, vD, -V);
  o = vec4(c, 1.0);
}`;

const VS_INST = GL_HEAD + `
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec4 aM0;
layout(location=3) in vec4 aM1;
layout(location=4) in vec4 aM2;
layout(location=5) in vec4 aM3;
layout(location=6) in vec4 aCol;
layout(location=7) in vec4 aXtra;   // x=emissive y=windAmp z=rough w=alpha
uniform mat4 uVP; uniform vec3 uCam; uniform float uTime;
out vec3 vN; out vec4 vC; out vec3 vW; out float vD; out vec4 vX;
void main(){
  mat4 M = mat4(aM0,aM1,aM2,aM3);
  vec3 p = aPos;
  vec4 wp = M * vec4(p,1.0);
  if(aXtra.y > 0.001){
    float ph = wp.x*0.19 + wp.z*0.23;
    float sway = sin(uTime*1.5 + ph) * 0.5 + sin(uTime*2.7 + ph*1.7) * 0.25;
    wp.xz += sway * aXtra.y * max(0.0, p.y);
  }
  vW = wp.xyz;
  vN = normalize(mat3(M) * aNrm);
  vC = aCol; vX = aXtra;
  vD = length(wp.xyz - uCam);
  gl_Position = uVP * wp;
}`;
const FS_INST = GL_HEAD + GL_SCENE_UNI + GL_LIGHT + GL_SHADOW + GL_FOG + `
in vec3 vN; in vec4 vC; in vec3 vW; in float vD; in vec4 vX;
out vec4 o;
void main(){
  vec3 N = normalize(vN);
  vec3 V = normalize(uCam - vW);
  float ndl = max(dot(N,uSun),0.0);
  float sh = shadowAt(vW, ndl);
  vec3 c = lambert(vC.rgb, N, V, sh, mix(0.02,0.55,1.0-vX.z), vX.z);
  c += vC.rgb * vX.x * 1.8;
  c = applyFog(c, vD, -V);
  o = vec4(c, vX.w);
}`;

const VS_SHADOW = GL_HEAD + `
layout(location=0) in vec3 aPos;
layout(location=2) in vec4 aM0;
layout(location=3) in vec4 aM1;
layout(location=4) in vec4 aM2;
layout(location=5) in vec4 aM3;
uniform mat4 uLightVP; uniform int uInst;
void main(){
  vec4 wp = (uInst==1) ? mat4(aM0,aM1,aM2,aM3) * vec4(aPos,1.0) : vec4(aPos,1.0);
  gl_Position = uLightVP * wp;
}`;
const FS_SHADOW = GL_HEAD + `
out vec4 o; void main(){ o = vec4(1.0); }`;

const VS_GRASS = GL_HEAD + `
layout(location=0) in vec3 aPos;      // quad, y in 0..1
layout(location=1) in vec4 aI;        // xyz pos, w scale
layout(location=2) in vec4 aC;        // rgb colour, a phase
uniform mat4 uVP; uniform vec3 uCam; uniform float uTime;
out vec3 vC; out float vD; out float vH; out vec3 vW;
void main(){
  vec3 base = aI.xyz;
  vec3 toC = normalize(vec3(uCam.x - base.x, 0.0, uCam.z - base.z));
  vec3 right = normalize(vec3(-toC.z, 0.0, toC.x));
  float w = aI.w, hgt = aI.w * 3.4;
  vec3 p = base + right * (aPos.x * w) + vec3(0.0, aPos.y * hgt, 0.0);
  float sway = sin(uTime*1.9 + aC.a*6.28 + base.x*0.13 + base.z*0.11);
  float sway2 = sin(uTime*3.3 + aC.a*3.14);
  p.xz += (sway*0.34 + sway2*0.14) * aPos.y * aPos.y * w * 1.5;
  vC = aC.rgb; vH = aPos.y; vW = p;
  vD = length(p - uCam);
  gl_Position = uVP * vec4(p, 1.0);
}`;
const FS_GRASS = GL_HEAD + GL_SCENE_UNI + GL_FOG + `
in vec3 vC; in float vD; in float vH; in vec3 vW;
out vec4 o;
void main(){
  float fade = 1.0 - smoothstep(34.0, 54.0, vD);
  if(fade < 0.02) discard;
  // darker at the root, brighter at the tip: reads as depth in a field
  vec3 c = vC * (0.28 + vH*vH*0.92);
  c *= (uAmb*0.9 + uSunCol*uSunI*0.66);
  c = applyFog(c, vD, normalize(vW-uCam));
  o = vec4(c, fade);
}`;

const VS_WATER = GL_HEAD + `
layout(location=0) in vec2 aPos;
uniform mat4 uVP; uniform vec3 uCam; uniform float uTime; uniform float uLevel;
out vec3 vW; out float vD;
void main(){
  vec3 p = vec3(aPos.x + uCam.x, uLevel, aPos.y + uCam.z);
  float d = length(p.xz - uCam.xz);
  float amp = 0.16 * (1.0 - smoothstep(40.0, 260.0, d));
  p.y += sin(p.x*0.29 + uTime*1.4)*amp + sin(p.z*0.37 - uTime*1.1)*amp*0.8
       + sin((p.x+p.z)*0.13 + uTime*0.6)*amp*1.6;
  vW = p; vD = length(p - uCam);
  gl_Position = uVP * vec4(p,1.0);
}`;
const FS_WATER = GL_HEAD + GL_SCENE_UNI + GL_FOG + `
in vec3 vW; in float vD;
out vec4 o;
float wnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f*f*(3.0-2.0*f);
  float a = fract(sin(dot(i, vec2(127.1,311.7)))*43758.5453);
  float b = fract(sin(dot(i+vec2(1,0), vec2(127.1,311.7)))*43758.5453);
  float c = fract(sin(dot(i+vec2(0,1), vec2(127.1,311.7)))*43758.5453);
  float d = fract(sin(dot(i+vec2(1,1), vec2(127.1,311.7)))*43758.5453);
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
}
void main(){
  vec3 V = normalize(uCam - vW);
  vec2 uv = vW.xz*0.14;
  float n1 = wnoise(uv + vec2(uTime*0.09, uTime*0.06));
  float n2 = wnoise(uv*2.3 - vec2(uTime*0.13, uTime*0.05));
  float n3 = wnoise(uv*5.1 + vec2(uTime*0.21, -uTime*0.17));
  vec3 N = normalize(vec3((n1-0.5)*0.55 + (n2-0.5)*0.4 + (n3-0.5)*0.25, 1.0, (n2-0.5)*0.55 + (n1-0.5)*0.4 + (n3-0.5)*0.25));
  float fres = pow(1.0 - max(dot(N,V),0.0), 4.0);
  vec3 deep = vec3(0.016,0.075,0.115);
  vec3 shal = vec3(0.09,0.30,0.34);
  vec3 base = mix(deep, shal, smoothstep(0.0,1.0,n1*0.6+0.25));
  vec3 skyc = mix(uSkyHor, uSkyTop, 0.55) * (0.55 + uSunI*0.5);
  vec3 c = mix(base*(uAmb+uSunCol*uSunI*0.35), skyc, clamp(fres*1.25,0.0,0.92));
  vec3 H = normalize(uSun + V);
  c += uSunCol * pow(max(dot(N,H),0.0), 320.0) * 2.6 * uSunI;
  c += uSunCol * pow(max(dot(N,H),0.0), 26.0) * 0.12 * uSunI;
  c = applyFog(c, vD, -V);
  o = vec4(c, 0.90);
}`;

const VS_SKY = GL_HEAD + `
layout(location=0) in vec2 aPos;
uniform mat4 uInvVP; uniform vec3 uCam;
out vec3 vDir;
void main(){
  vec4 p = uInvVP * vec4(aPos, 1.0, 1.0);
  vDir = normalize(p.xyz/p.w - uCam);
  gl_Position = vec4(aPos, 1.0, 1.0);
}`;
const FS_SKY = GL_HEAD + `
in vec3 vDir;
uniform vec3 uSkyTop; uniform vec3 uSkyHor; uniform vec3 uSun; uniform vec3 uSunCol;
uniform float uTime; uniform float uNight;
out vec4 o;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float vnoise(vec2 p){
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y);
}
float cloudFbm(vec2 p){
  float s=0.0, a=0.5;
  for(int i=0;i<5;i++){ s += a*vnoise(p); p*=2.07; a*=0.5; }
  return s;
}
void main(){
  vec3 d = normalize(vDir);
  float up = clamp(d.y, -0.2, 1.0);
  vec3 c = mix(uSkyHor, uSkyTop, pow(clamp(up,0.0,1.0), 0.62));
  // sun disc + glow
  float sd = max(dot(d, uSun), 0.0);
  c += uSunCol * pow(sd, 900.0) * 14.0;
  c += uSunCol * pow(sd, 22.0) * 0.34;
  c += uSunCol * pow(sd, 4.0) * 0.10;
  // stars at night
  if(uNight > 0.02 && d.y > 0.0){
    vec2 sp = d.xz / max(d.y, 0.06) * 1.6;
    float st = h21(floor(sp*120.0));
    float tw = 0.5 + 0.5*sin(uTime*2.0 + st*40.0);
    c += vec3(0.85,0.9,1.0) * step(0.9965, st) * uNight * (0.6+tw*0.8) * smoothstep(0.02,0.35,d.y);
  }
  // drifting clouds
  if(d.y > 0.008){
    vec2 cp = d.xz / d.y * 0.55 + vec2(uTime*0.0075, uTime*0.004);
    float n = cloudFbm(cp*1.35);
    float n2 = cloudFbm(cp*3.1 + 17.0);
    float cov = smoothstep(0.52, 0.86, n*0.75 + n2*0.35);
    float lit = smoothstep(0.35, 0.95, n);
    vec3 cc = mix(uSkyHor*0.75, vec3(1.0,0.98,0.95), lit);
    cc = mix(cc, uSunCol*1.15, pow(sd,3.0)*0.5);
    float horizonFade = smoothstep(0.008, 0.16, d.y);
    c = mix(c, cc, cov * horizonFade * 0.82);
  }
  o = vec4(c, 1.0);
}`;

const VS_PART = GL_HEAD + `
layout(location=0) in vec2 aQ;
layout(location=1) in vec4 aI;   // xyz pos, w size
layout(location=2) in vec4 aC;   // rgba
layout(location=3) in vec4 aX;   // x=rot y=kind z=spin w=unused
uniform mat4 uVP; uniform vec3 uCamR; uniform vec3 uCamU;
out vec4 vC; out vec2 vUV; out float vK;
void main(){
  float s = sin(aX.x), c = cos(aX.x);
  vec2 q = vec2(aQ.x*c - aQ.y*s, aQ.x*s + aQ.y*c);
  vec3 p = aI.xyz + uCamR*(q.x*aI.w) + uCamU*(q.y*aI.w);
  vC = aC; vUV = aQ; vK = aX.y;
  gl_Position = uVP * vec4(p,1.0);
}`;
const FS_PART = GL_HEAD + `
in vec4 vC; in vec2 vUV; in float vK;
out vec4 o;
void main(){
  float r = length(vUV);
  float a;
  if(vK < 0.5){          // soft round puff
    a = smoothstep(0.5, 0.06, r);
  } else if(vK < 1.5){   // spark / streak
    a = smoothstep(0.5, 0.0, r) * smoothstep(0.5, 0.15, abs(vUV.x)*2.0);
  } else {               // ring
    a = smoothstep(0.5, 0.42, r) * smoothstep(0.28, 0.40, r);
  }
  if(a < 0.004) discard;
  o = vec4(vC.rgb * vC.a, a * vC.a);
}`;

/* ---- post: bright pass, separable blur, composite ---- */
const VS_FULL = GL_HEAD + `
layout(location=0) in vec2 aPos;
out vec2 vUV;
void main(){ vUV = aPos*0.5+0.5; gl_Position = vec4(aPos,0.0,1.0); }`;
const FS_BRIGHT = GL_HEAD + `
in vec2 vUV; uniform sampler2D uTex; uniform float uThresh; out vec4 o;
void main(){
  vec3 c = texture(uTex, vUV).rgb;
  float l = dot(c, vec3(0.2126,0.7152,0.0722));
  float k = max(0.0, l - uThresh) / max(l, 0.0001);
  o = vec4(c * k, 1.0);
}`;
const FS_BLUR = GL_HEAD + `
in vec2 vUV; uniform sampler2D uTex; uniform vec2 uDir; out vec4 o;
void main(){
  vec3 s = texture(uTex, vUV).rgb * 0.2270270270;
  s += texture(uTex, vUV + uDir*1.3846153846).rgb * 0.3162162162;
  s += texture(uTex, vUV - uDir*1.3846153846).rgb * 0.3162162162;
  s += texture(uTex, vUV + uDir*3.2307692308).rgb * 0.0702702703;
  s += texture(uTex, vUV - uDir*3.2307692308).rgb * 0.0702702703;
  o = vec4(s, 1.0);
}`;
const FS_POST = GL_HEAD + `
in vec2 vUV;
uniform sampler2D uTex; uniform sampler2D uBloom;
uniform vec2 uTexel; uniform float uBloomAmt; uniform float uSharp;
uniform float uVig; uniform float uExposure; uniform float uFlash; uniform vec3 uFlashCol;
uniform float uDamage; uniform float uTime;
out vec4 o;
vec3 aces(vec3 x){
  const float a=2.51, b=0.03, c=2.43, d=0.59, e=0.14;
  return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0);
}
void main(){
  vec3 c = texture(uTex, vUV).rgb;
  // unsharp mask — keeps the image crisp on high-dpi phone panels
  if(uSharp > 0.001){
    vec3 n = texture(uTex, vUV + vec2(uTexel.x,0)).rgb
           + texture(uTex, vUV - vec2(uTexel.x,0)).rgb
           + texture(uTex, vUV + vec2(0,uTexel.y)).rgb
           + texture(uTex, vUV - vec2(0,uTexel.y)).rgb;
    c += (c - n*0.25) * uSharp;
  }
  c += texture(uBloom, vUV).rgb * uBloomAmt;
  c *= uExposure;
  c += uFlashCol * uFlash;
  c = aces(c);
  // gentle filmic grade: lift shadows a touch, cool them, warm highlights
  float l = dot(c, vec3(0.2126,0.7152,0.0722));
  c = mix(c, c*vec3(0.94,0.98,1.10), (1.0-l)*0.30);
  c = mix(c, c*vec3(1.07,1.02,0.93), l*0.22);
  c = pow(c, vec3(0.9615));   // ~1/1.04 contrast curve
  // damage vignette
  float d = distance(vUV, vec2(0.5));
  c = mix(c, vec3(0.55,0.02,0.02), smoothstep(0.24,0.72,d) * uDamage);
  c *= 1.0 - smoothstep(0.34, 0.86, d) * uVig;
  // ordered dither kills banding in the sky gradient
  float dth = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898,78.233))) * 43758.5453);
  c += (dth - 0.5) / 255.0;
  o = vec4(c, 1.0);
}`;

/* ------------------------------ INIT ------------------------------ */
function glInit(canvas) {
  const gl = canvas.getContext('webgl2', {
    antialias: false, alpha: false, depth: true, stencil: false,
    powerPreference: 'high-performance', preserveDrawingBuffer: false,
    desynchronized: true, failIfMajorPerformanceCaveat: false,
  });
  if (!gl) return false;
  R.gl = gl; R.cv = canvas;
  R.hdr = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
  gl.getExtension('OES_texture_float_linear');
  const maxS = gl.getParameter(gl.MAX_SAMPLES) || 1;
  R.maxSamples = maxS;

  R.prog.terrain = mkProg(gl, VS_TERRAIN, FS_TERRAIN, 'terrain');
  R.prog.inst = mkProg(gl, VS_INST, FS_INST, 'inst');
  R.prog.shadow = mkProg(gl, VS_SHADOW, FS_SHADOW, 'shadow');
  R.prog.grass = mkProg(gl, VS_GRASS, FS_GRASS, 'grass');
  R.prog.water = mkProg(gl, VS_WATER, FS_WATER, 'water');
  R.prog.sky = mkProg(gl, VS_SKY, FS_SKY, 'sky');
  R.prog.part = mkProg(gl, VS_PART, FS_PART, 'part');
  R.prog.bright = mkProg(gl, VS_FULL, FS_BRIGHT, 'bright');
  R.prog.blur = mkProg(gl, VS_FULL, FS_BLUR, 'blur');
  R.prog.post = mkProg(gl, VS_FULL, FS_POST, 'post');

  // fullscreen triangle-pair
  R.quadVAO = gl.createVertexArray();
  gl.bindVertexArray(R.quadVAO);
  const qb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, qb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);

  // water grid (local to camera)
  buildWaterGrid();

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);
  gl.clearColor(0.02, 0.03, 0.06, 1);

  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); R.lost = true; }, false);
  canvas.addEventListener('webglcontextrestored', () => { location.reload(); }, false);

  R.ok = true;
  return true;
}

function buildWaterGrid() {
  const gl = R.gl, N = 96, S = 620;
  const v = [], idx = [];
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    // exponential spacing: dense near the camera, coarse toward the horizon
    const u = (i / N) * 2 - 1, w = (j / N) * 2 - 1;
    v.push(Math.sign(u) * Math.pow(Math.abs(u), 2.1) * S, Math.sign(w) * Math.pow(Math.abs(w), 2.1) * S);
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  R.waterVAO = gl.createVertexArray(); gl.bindVertexArray(R.waterVAO);
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(idx), gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  R.waterCount = idx.length;
}

/* ------------------------------ TARGETS ------------------------------ */
function delTarget(t) {
  const gl = R.gl; if (!t) return;
  if (t.fb) gl.deleteFramebuffer(t.fb);
  if (t.tex) gl.deleteTexture(t.tex);
  if (t.rb) gl.deleteRenderbuffer(t.rb);
  if (t.db) gl.deleteRenderbuffer(t.db);
}
function mkTex(w, h, fmt, ifmt, type, filter) {
  const gl = R.gl, t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, type, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}
function mkColorTarget(w, h) {
  const gl = R.gl;
  const ifmt = R.hdr ? gl.RGBA16F : gl.RGBA8;
  const type = R.hdr ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
  const tex = mkTex(w, h, gl.RGBA, ifmt, type, gl.LINEAR);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fb, tex, w, h };
}
function glResize(w, h, dpr) {
  const gl = R.gl;
  R.w = Math.max(2, Math.floor(w * dpr)); R.h = Math.max(2, Math.floor(h * dpr));
  R.cssW = w; R.cssH = h; R.dpr = dpr;
  R.cv.width = R.w; R.cv.height = R.h;
  R.cv.style.width = w + 'px'; R.cv.style.height = h + 'px';

  delTarget(R.fb.msaa); delTarget(R.fb.res); delTarget(R.fb.b0); delTarget(R.fb.b1);
  // MSAA scene target
  const samples = R.quality >= 2 ? Math.min(4, R.maxSamples) : R.quality === 1 ? Math.min(2, R.maxSamples) : 0;
  R.msaa = samples;
  const ifmt = R.hdr ? gl.RGBA16F : gl.RGBA8;
  if (samples > 0) {
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    const rb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, ifmt, R.w, R.h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, rb);
    const db = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, db);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, R.w, R.h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, db);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) { R.msaa = 0; gl.deleteFramebuffer(fb); }
    else R.fb.msaa = { fb, rb, db, w: R.w, h: R.h };
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  R.fb.res = mkColorTarget(R.w, R.h);
  if (R.msaa === 0) {
    const db = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, db);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, R.w, R.h);
    gl.bindFramebuffer(gl.FRAMEBUFFER, R.fb.res.fb);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, db);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    R.fb.res.db = db;
  }
  const bw = Math.max(2, R.w >> 2), bh = Math.max(2, R.h >> 2);
  R.fb.b0 = mkColorTarget(bw, bh);
  R.fb.b1 = mkColorTarget(bw, bh);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  ensureShadow();
}
function ensureShadow() {
  const gl = R.gl;
  const want = R.quality >= 2 ? 2048 : R.quality === 1 ? 1536 : 1024;
  if (R.fb.shadow && R.shadowSize === want) return;
  if (R.fb.shadow) { gl.deleteFramebuffer(R.fb.shadow.fb); gl.deleteTexture(R.fb.shadow.tex); }
  R.shadowSize = want;
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, want, want, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, tex, 0);
  gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  R.fb.shadow = { fb, tex, w: want, h: want };
}

/* ------------------------------ MESH HELPERS ------------------------------ */
/** Build a VAO for an indexed pos+normal mesh with instance buffers attached. */
function makeInstMesh(verts, idx, maxInst) {
  const gl = R.gl;
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
  const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
  // instance buffer: mat4 (16) + col4 (4) + xtra4 (4) = 24 floats
  const stride = 24 * 4;
  const inb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, inb);
  gl.bufferData(gl.ARRAY_BUFFER, maxInst * stride, gl.DYNAMIC_DRAW);
  for (let i = 0; i < 4; i++) {
    const loc = 2 + i;
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, stride, i * 16);
    gl.vertexAttribDivisor(loc, 1);
  }
  gl.enableVertexAttribArray(6); gl.vertexAttribPointer(6, 4, gl.FLOAT, false, stride, 64); gl.vertexAttribDivisor(6, 1);
  gl.enableVertexAttribArray(7); gl.vertexAttribPointer(7, 4, gl.FLOAT, false, stride, 80); gl.vertexAttribDivisor(7, 1);
  gl.bindVertexArray(null);
  return { vao, vb, ib, inb, count: idx.length, maxInst, stride: 24 };
}
function uploadInstances(mesh, data, n) {
  const gl = R.gl;
  gl.bindBuffer(gl.ARRAY_BUFFER, mesh.inb);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, n * mesh.stride);
}
function drawInstMesh(mesh, n) {
  if (n <= 0) return;
  const gl = R.gl;
  gl.bindVertexArray(mesh.vao);
  gl.drawElementsInstanced(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0, n);
  R.drawCalls++; R.tris += (mesh.count / 3) * n;
}

/* ------------------------------ COMMON UNIFORMS ------------------------------ */
function setSceneUniforms(pr) {
  const gl = R.gl, u = pr.u, s = R.sky;
  if (u.uVP) gl.uniformMatrix4fv(u.uVP, false, R.vp);
  if (u.uCam) gl.uniform3fv(u.uCam, R.camPos);
  if (u.uSun) gl.uniform3fv(u.uSun, R.sun);
  if (u.uSunCol) gl.uniform3fv(u.uSunCol, s.sun);
  if (u.uAmb) gl.uniform3fv(u.uAmb, s.amb);
  if (u.uSunI) gl.uniform1f(u.uSunI, s.sunI);
  if (u.uSkyTop) gl.uniform3fv(u.uSkyTop, s.top);
  if (u.uSkyHor) gl.uniform3fv(u.uSkyHor, s.hor);
  if (u.uFog) gl.uniform3fv(u.uFog, s.fog);
  if (u.uFogRange) gl.uniform2f(u.uFogRange, R.fogNear, R.fogFar);
  if (u.uTime) gl.uniform1f(u.uTime, R.time);
  if (u.uLightVP) gl.uniformMatrix4fv(u.uLightVP, false, R.lightVP);
  if (u.uShadowTexel) gl.uniform1f(u.uShadowTexel, 1.0 / R.shadowSize);
  if (u.uShadow) {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, R.fb.shadow.tex);
    gl.uniform1i(u.uShadow, 0);
  }
}
