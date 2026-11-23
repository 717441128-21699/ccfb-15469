/** 着色器源码：水面（Gerstner 风格正弦叠加）、纯色实体、线条 */

export const WATER_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
uniform mat4 uVP;
uniform float uTime;
uniform float uCamX;
out vec2 vWorld;
out float vWave;
void main() {
  vec2 p = aPos;
  p.x += uCamX;
  float w =
    sin(p.x * 0.35 + uTime * 1.6) * 0.18 +
    sin(p.y * 0.8 + uTime * 2.1 + p.x * 0.12) * 0.10 +
    sin((p.x + p.y) * 0.55 - uTime * 1.2) * 0.06;
  vWave = w;
  vWorld = p;
  gl_Position = uVP * vec4(p, w * 0.15, 1.0);
}`;

export const WATER_FS = `#version 300 es
precision highp float;
in vec2 vWorld;
in float vWave;
uniform float uTime;
out vec4 outColor;
void main() {
  float depth = 0.5 + 0.5 * sin(vWorld.x * 0.05);
  vec3 deep = vec3(0.04, 0.18, 0.26);
  vec3 shallow = vec3(0.10, 0.36, 0.46);
  vec3 base = mix(deep, shallow, depth);
  // 波峰高光
  float crest = smoothstep(0.12, 0.32, vWave);
  base += vec3(0.25, 0.45, 0.5) * crest;
  // 细碎闪光
  float sparkle = pow(0.5 + 0.5 * sin(vWorld.x * 3.1 + vWorld.y * 2.7 + uTime * 3.0), 18.0);
  base += sparkle * 0.12;
  outColor = vec4(base, 1.0);
}`;

export const SHAPE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
uniform mat4 uVP;
uniform vec2 uOffset;
uniform float uAngle;
uniform vec2 uScale;
void main() {
  vec2 p = aPos * uScale;
  float c = cos(uAngle), s = sin(uAngle);
  p = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
  gl_Position = uVP * vec4(p + uOffset, 0.0, 1.0);
}`;

export const SHAPE_FS = `#version 300 es
precision highp float;
uniform vec4 uColor;
out vec4 outColor;
void main() { outColor = uColor; }`;

export const LINE_VS = SHAPE_VS;
export const LINE_FS = SHAPE_FS;
