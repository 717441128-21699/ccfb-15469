/** 程序化几何：所有网格用单位空间坐标，绘制时用 uScale/uAngle/uOffset 变换 */

export interface Mesh {
  vao: WebGLVertexArrayObject;
  vertexCount: number;
  mode: number;
}

export function createMesh(
  gl: WebGL2RenderingContext,
  vertices: number[],
  mode: number = gl.TRIANGLES,
): Mesh {
  const vao = gl.createVertexArray();
  if (!vao) throw new Error('VAO 创建失败');
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return { vao, vertexCount: vertices.length / 2, mode };
}

/** 龙舟船体侧影：尖头尖尾的狭长轮廓（单位长度，绘制时缩放到 15.6m） */
export function hullMesh(gl: WebGL2RenderingContext): Mesh {
  // 沿 x 轴，半宽随位置变化
  const sections: [number, number][] = [
    [-0.5, 0.0],
    [-0.42, 0.35],
    [-0.2, 0.5],
    [0.25, 0.5],
    [0.42, 0.32],
    [0.5, 0.0],
  ];
  const verts: number[] = [];
  for (let i = 0; i < sections.length - 1; i++) {
    const [x0, w0] = sections[i];
    const [x1, w1] = sections[i + 1];
    // 四边形（上下两条边）
    verts.push(x0, -w0, x1, -w1, x1, w1);
    verts.push(x0, -w0, x1, w1, x0, w0);
  }
  return createMesh(gl, verts);
}

/** 龙头：船头的三角装饰 */
export function dragonHeadMesh(gl: WebGL2RenderingContext): Mesh {
  return createMesh(gl, [0, 0, 0.12, 0.05, 0.12, -0.05]);
}

/** 鼓：圆形（三角扇近似） */
export function drumMesh(gl: WebGL2RenderingContext, segments = 16): Mesh {
  const verts: number[] = [];
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    verts.push(0, 0, Math.cos(a0) * 0.5, Math.sin(a0) * 0.5, Math.cos(a1) * 0.5, Math.sin(a1) * 0.5);
  }
  return createMesh(gl, verts);
}

/** 划手躯干：小菱形 */
export function paddlerBodyMesh(gl: WebGL2RenderingContext): Mesh {
  return createMesh(gl, [0, 0.09, 0.07, 0, 0, -0.09, -0.07, 0]);
}

/** 桨：细长矩形，局部原点在桨手位置 */
export function paddleMesh(gl: WebGL2RenderingContext): Mesh {
  return createMesh(gl, [-0.02, 0, 0.02, 0, 0.02, -0.5, -0.02, 0, 0.02, -0.5, -0.02, -0.5]);
}

/** 浮标：小方块 */
export function buoyMesh(gl: WebGL2RenderingContext): Mesh {
  return createMesh(gl, [-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5]);
}

/** 通用矩形（岸边、UI 背景条等） */
export function quadMesh(gl: WebGL2RenderingContext): Mesh {
  return createMesh(gl, [-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5]);
}

/** 单位长度竖线（局部坐标 ±0.5），绘制时用 uScale.y 缩放到实际长度、可旋转 */
export function lineMesh(gl: WebGL2RenderingContext): Mesh {
  return createMesh(gl, [0, -0.5, 0, 0.5], gl.LINES);
}
