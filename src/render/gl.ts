/** 最简 WebGL2 工具：shader 编译、program 链接、uniform 绑定 */

export function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('无法创建 shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error('Shader 编译失败: ' + log);
  }
  return shader;
}

export function createProgram(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error('无法创建 program');
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error('Program 链接失败: ' + gl.getProgramInfoLog(program));
  }
  return program;
}

export function makeUniforms(gl: WebGL2RenderingContext, program: WebGLProgram): Record<string, WebGLUniformLocation | null> {
  return new Proxy({} as Record<string, WebGLUniformLocation | null>, {
    get(_target, prop: string) {
      return gl.getUniformLocation(program, prop);
    },
  });
}
