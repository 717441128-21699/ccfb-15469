import { createProgram, makeUniforms } from './gl.js';
import { LINE_FS, LINE_VS, SHAPE_FS, SHAPE_VS, WATER_FS, WATER_VS } from './shaders.js';
import {
  buoyMesh,
  createMesh,
  dragonHeadMesh,
  drumMesh,
  hullMesh,
  lineMesh,
  paddlerBodyMesh,
  paddleMesh,
  quadMesh,
  type Mesh,
} from './mesh.js';
import { BOAT_LENGTH, PADDLER_COUNT, PADDLE_LATERAL_OFFSET, SEAT_SPACING } from '../physics/constants.js';
import type { BoatRuntime, RiverSpec } from '../physics/types.js';

interface Programs {
  water: WebGLProgram;
  shape: WebGLProgram;
  line: WebGLProgram;
}

/** 俯视 2D 渲染器：相机跟随玩家船，世界坐标米 → 裁剪空间 */
export class RaceRenderer {
  private gl: WebGL2RenderingContext;
  private prog: Programs;
  private meshes: {
    water: Mesh;
    hull: Mesh;
    head: Mesh;
    drum: Mesh;
    body: Mesh;
    paddle: Mesh;
    buoy: Mesh;
    quad: Mesh;
    laneLine: Mesh;
  };
  private viewHeight = 52; // 画面纵向可见米数
  private camX = 10;
  private camY = 0;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
    if (!gl) throw new Error('当前浏览器不支持 WebGL2');
    this.gl = gl;
    this.prog = {
      water: createProgram(gl, WATER_VS, WATER_FS),
      shape: createProgram(gl, SHAPE_VS, SHAPE_FS),
      line: createProgram(gl, LINE_VS, LINE_FS),
    };
    this.meshes = {
      water: this.buildWaterGrid(),
      hull: hullMesh(gl),
      head: dragonHeadMesh(gl),
      drum: drumMesh(gl),
      body: paddlerBodyMesh(gl),
      paddle: paddleMesh(gl),
      buoy: buoyMesh(gl),
      quad: quadMesh(gl),
      laneLine: lineMesh(gl),
    };
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  private buildWaterGrid(): Mesh {
    // 以相机为中心的网格瓦片，x 方向随相机滚动
    const verts: number[] = [];
    const rows = 40;
    const cols = 24;
    const sx = 8;
    const sy = 4;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x0 = (c - cols / 2) * sx;
        const x1 = x0 + sx;
        const y0 = (r - rows / 2) * sy;
        const y1 = y0 + sy;
        verts.push(x0, y0, x1, y0, x1, y1);
        verts.push(x0, y0, x1, y1, x0, y1);
      }
    }
    return createMesh(this.gl, verts);
  }

  resize(w: number, h: number, dpr: number): void {
    const gl = this.gl;
    gl.canvas.width = Math.floor(w * dpr);
    gl.canvas.height = Math.floor(h * dpr);
    this.viewHeight = 52;
  }

  /** 正交投影 + 相机平移 */
  private vpMatrix(): Float32Array {
    const gl = this.gl;
    const aspect = (gl.canvas.width as number) / (gl.canvas.height as number);
    const vw = this.viewHeight * aspect;
    const vh = this.viewHeight;
    const left = this.camX - vw / 2;
    const right = this.camX + vw / 2;
    const bottom = this.camY - vh / 2;
    const top = this.camY + vh / 2;
    // 正交矩阵（列主序）
    return new Float32Array([
      2 / (right - left), 0, 0, 0,
      0, 2 / (top - bottom), 0, 0,
      0, 0, 1, 0,
      -(right + left) / (right - left), -(top + bottom) / (top - bottom), 0, 1,
    ]);
  }

  private drawShape(
    mesh: Mesh,
    x: number,
    y: number,
    angle: number,
    sx: number,
    sy: number,
    color: [number, number, number, number],
  ): void {
    const gl = this.gl;
    gl.useProgram(this.prog.shape);
    const u = makeUniforms(gl, this.prog.shape);
    gl.uniformMatrix4fv(u.uVP, false, this.vpMatrix());
    gl.uniform2f(u.uOffset, x, y);
    gl.uniform1f(u.uAngle, angle);
    gl.uniform2f(u.uScale, sx, sy);
    gl.uniform4f(u.uColor, color[0], color[1], color[2], color[3]);
    gl.bindVertexArray(mesh.vao);
    gl.drawArrays(mesh.mode, 0, mesh.vertexCount);
  }

  private drawLine(x: number, y: number, length: number, color: [number, number, number, number]): void {
    const gl = this.gl;
    gl.useProgram(this.prog.line);
    const u = makeUniforms(gl, this.prog.line);
    gl.uniformMatrix4fv(u.uVP, false, this.vpMatrix());
    gl.uniform2f(u.uOffset, x, y);
    gl.uniform1f(u.uAngle, 0);
    // lineMesh 顶点已按单位长度 ±0.5 建模，这里按实际长度缩放一次
    gl.uniform2f(u.uScale, 1, length);
    gl.uniform4f(u.uColor, color[0], color[1], color[2], color[3]);
    gl.bindVertexArray(this.meshes.laneLine.vao);
    gl.drawArrays(gl.LINES, 0, 2);
  }

  /** 横向线（起点/终点线）：把单位竖线旋转 90° 后沿长度缩放 */
  private drawCrossLine(x: number, y: number, length: number, color: [number, number, number, number]): void {
    const gl = this.gl;
    gl.useProgram(this.prog.line);
    const u = makeUniforms(gl, this.prog.line);
    gl.uniformMatrix4fv(u.uVP, false, this.vpMatrix());
    gl.uniform2f(u.uOffset, x, y);
    gl.uniform1f(u.uAngle, Math.PI / 2);
    gl.uniform2f(u.uScale, 1, length);
    gl.uniform4f(u.uColor, color[0], color[1], color[2], color[3]);
    gl.bindVertexArray(this.meshes.laneLine.vao);
    gl.drawArrays(gl.LINES, 0, 2);
  }

  render(boats: BoatRuntime[], river: RiverSpec, time: number, player: BoatRuntime | undefined): void {
    const gl = this.gl;
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(0.03, 0.1, 0.14, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // 相机平滑跟随玩家船
    const targetX = player ? player.x + 6 : 10;
    const targetY = player ? player.y : 0;
    this.camX += (targetX - this.camX) * 0.08;
    this.camY += (targetY - this.camY) * 0.05;

    this.renderWater(time);
    this.renderCourse(river);
    for (const boat of boats) this.renderBoat(boat, time);
  }

  private renderWater(time: number): void {
    const gl = this.gl;
    gl.useProgram(this.prog.water);
    const u = makeUniforms(gl, this.prog.water);
    gl.uniformMatrix4fv(u.uVP, false, this.vpMatrix());
    gl.uniform1f(u.uTime, time);
    gl.uniform1f(u.uCamX, this.camX);
    gl.bindVertexArray(this.meshes.water.vao);
    gl.drawArrays(gl.TRIANGLES, 0, this.meshes.water.vertexCount);
  }

  private renderCourse(river: RiverSpec): void {
    const laneCount = river.laneCount;
    const span = river.laneWidth * laneCount;
    // 纵向航道分隔线与浮标（沿相机视口铺满，线随镜头滚动）
    const viewLen = this.viewHeight * 2.2;
    for (let i = 0; i <= laneCount; i++) {
      const y = (i - laneCount / 2) * river.laneWidth;
      this.drawLine(this.camX, y, viewLen, [1, 1, 1, 0.18]);
      // 浮标每 50m 一个，只画相机附近的
      for (let x = 0; x <= river.length; x += 50) {
        if (Math.abs(x - this.camX) > 40) continue;
        this.drawShape(this.meshes.buoy, x, y, 0, 0.9, 0.9, [1, 0.5, 0.1, 0.85]);
      }
    }
    // 起点（金）/终点（绿）横线，横跨全部航道
    this.drawCrossLine(0, 0, span, [1, 0.9, 0.4, 0.9]);
    this.drawCrossLine(river.length, 0, span, [0.4, 1, 0.6, 0.9]);
    // 两岸
    this.drawShape(this.meshes.quad, this.camX, -span / 2 - 6, 0, 200, 8, [0.15, 0.3, 0.18, 1]);
    this.drawShape(this.meshes.quad, this.camX, span / 2 + 6, 0, 200, 8, [0.15, 0.3, 0.18, 1]);
  }

  private renderBoat(boat: BoatRuntime, time: number): void {
    const { hull, head, drum, body, paddle } = this.meshes;
    const [r, g, b] = boat.config.team.colors.hull;
    const [ar, ag, ab] = boat.config.team.colors.accent;
    const cosH = Math.cos(boat.heading);
    const sinH = Math.sin(boat.heading);

    // 世界坐标 → 船体系偏移的辅助：直接在世界系按 heading 旋转绘制
    const toWorld = (lx: number, ly: number): [number, number] => [
      boat.x + lx * cosH - ly * sinH,
      boat.y + lx * sinH + ly * cosH,
    ];

    // 船体
    const [hx, hy] = toWorld(0, 0);
    this.drawShape(hull, hx, hy, boat.heading, BOAT_LENGTH, 1.4, [r, g, b, 1]);
    // 船头龙饰
    const [headX, headY] = toWorld(BOAT_LENGTH * 0.5, 0);
    this.drawShape(head, headX, headY, boat.heading, 3.2, 3.2, [ar, ag, ab, 1]);

    // 鼓手与鼓（船头位置）
    const [drumX, drumY] = toWorld(BOAT_LENGTH * 0.36, 0);
    this.drawShape(drum, drumX, drumY, time * 2, 1.1, 1.1, [0.9, 0.75, 0.35, 1]);
    const [drummerX, drummerY] = toWorld(BOAT_LENGTH * 0.4, 0);
    this.drawShape(body, drummerX, drummerY, boat.heading, 1.2, 1.2, [ar, ag, ab, 1]);

    // 20 名划手 + 桨（实例化的轻量替代：同 VAO 多次绘制，120 次 drawcall 仍远低于预算）
    for (let i = 0; i < PADDLER_COUNT; i++) {
      const p = boat.paddlers[i];
      const side = p.spec.side === 'port' ? 1 : -1;
      const lx = BOAT_LENGTH * 0.22 - i * SEAT_SPACING * 0.85;
      const ly = side * PADDLE_LATERAL_OFFSET;
      const [bx, by] = toWorld(lx, ly);
      this.drawShape(body, bx, by, boat.heading, 0.9, 0.9, [0.95, 0.9, 0.8, 1]);

      // 桨角度由划桨状态驱动：drive 阶段大幅划动，recover 回桨
      const paddleAngle = this.paddleAngle(p.phase, p.cycleTime, p.strokePeriod, p.pullDuration, side);
      const worldAngle = boat.heading + side * paddleAngle;
      this.drawShape(paddle, bx, by, worldAngle, 0.5, 2.4, [0.5, 0.32, 0.15, 1]);
    }

    // 舵手（船尾）
    const [helmX, helmY] = toWorld(-BOAT_LENGTH * 0.44, 0);
    this.drawShape(body, helmX, helmY, boat.heading + boat.rudder, 1.1, 1.1, [0.8, 0.85, 0.9, 1]);
  }

  /** 由划手状态机相位映射出桨的可视化角度（弧度） */
  private paddleAngle(
    phase: string,
    cycleTime: number,
    period: number,
    pull: number,
    side: number,
  ): number {
    if (phase === 'wait') return side * 0.9;
    if (phase === 'drive') {
      const t = Math.min(1, Math.max(0, cycleTime / pull));
      // 入水前伸 → 拉到身后
      return side * (1.1 - 1.7 * t);
    }
    // recover：出水回桨
    const t = Math.min(1, Math.max(0, (cycleTime - pull) / (period - pull)));
    return side * (-0.6 + 1.5 * t);
  }
}
