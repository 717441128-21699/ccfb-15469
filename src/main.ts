import './ui/styles.css';
import { DT, RACE_BOAT_COUNT } from './physics/constants.js';
import { applyTraining, buildAllTeams } from './physics/teams.js';
import { RIVERS } from './physics/rivers.js';
import { RaceWorld } from './physics/race.js';
import type { BoatConfig, RaceResult, TeamSpec } from './physics/types.js';
import { RaceRenderer } from './render/RaceRenderer.js';
import { GameLoop, type RaceHud } from './game/loop.js';
import { InputController } from './game/input.js';
import { DrumAudio } from './game/audio.js';
import { addTraining, loadSave, recordRaceResult, type SaveData } from './game/storage.js';
import { el, clear, rgb } from './ui/dom.js';
import { renderMenu, renderTeamScreen, type MenuChoices } from './ui/menu.js';
import { renderTraining } from './ui/training.js';
import { Hud } from './ui/hud.js';
import { renderAnalysis } from './ui/analysis.js';

type Screen = 'menu' | 'team' | 'train' | 'race' | 'analysis';

class App {
  private app: HTMLElement;
  private canvas: HTMLCanvasElement;
  private save: SaveData;
  private choices: MenuChoices;
  private screen: Screen = 'menu';
  private renderer: RaceRenderer | null = null;
  private loop: GameLoop | null = null;
  private input: InputController | null = null;
  private hud: Hud | null = null;
  private audio = new DrumAudio();
  private lastResult: RaceResult | null = null;
  private aiBeatTrack = new Map<string, number>();

  constructor() {
    this.app = document.getElementById('app')!;
    this.canvas = document.getElementById('gl-canvas') as HTMLCanvasElement;
    this.save = loadSave();
    const teams = buildAllTeams();
    this.choices = {
      teamId: this.save.selectedTeamId ?? teams[0].id,
      riverId: RIVERS[0].id,
    };
    this.showMenu();
  }

  private mountScreen(screen: Screen): HTMLElement {
    this.screen = screen;
    this.teardownRace();
    clear(this.app);
    const node = el('div', { class: `screen overlay screen-${screen}` });
    this.app.append(node);
    this.canvas.hidden = screen !== 'race';
    return node;
  }

  private showMenu(): void {
    const node = this.mountScreen('menu');
    renderMenu(node, this.save, this.choices, (target) => {
      if (target === 'team') this.showTeam();
      else if (target === 'train') this.showTraining();
      else this.showRaceSetup();
    });
  }

  private showTeam(): void {
    const node = this.mountScreen('team');
    renderTeamScreen(
      node,
      this.save,
      this.choices,
      (teamId) => {
        this.choices.teamId = teamId;
        this.save = { ...this.save, selectedTeamId: teamId };
        this.showTeam();
      },
      () => this.showMenu(),
    );
  }

  private showTraining(): void {
    const node = this.mountScreen('train');
    renderTraining(
      node,
      this.save,
      this.choices.teamId,
      (gain) => {
        this.save = addTraining(this.save, this.choices.teamId, gain);
        this.showTraining();
      },
      () => this.showMenu(),
    );
  }

  /** 赛道选择 + 开始 */
  private showRaceSetup(): void {
    const node = this.mountScreen('menu');
    const riverGroup = el('div', { class: 'radio-group', style: 'justify-content:center' },
      RIVERS.map((r) => el('button', { class: `btn ${r.id === this.choices.riverId ? 'active' : ''}`, text: r.name })),
    );
    riverGroup.querySelectorAll('button').forEach((b, i) => {
      b.onclick = () => {
        this.choices.riverId = RIVERS[i].id;
        riverGroup.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
      };
    });
    const team = buildAllTeams().find((t) => t.id === this.choices.teamId)!;
    node.append(
      el('div', { class: 'topbar' }, [el('h2', { text: '赛前准备' }), el('button', { class: 'btn ghost', text: '← 返回' }, [])]),
      el('div', { class: 'card', style: 'max-width:720px;margin:0 auto;width:100%' }, [
        el('div', { class: 'stat-row' }, [el('span', { text: '你的队伍' }), el('b', {}, [
          el('span', { class: 'swatch', style: `background:${rgb(team.colors.hull)}` }),
          team.name,
        ])]),
        el('div', { class: 'section-title center-text', text: '选择河道' }),
        riverGroup,
        el('div', { class: 'muted mt', id: 'river-desc' }),
        el('div', { style: 'display:flex;gap:12px;justify-content:center;margin-top:22px' }, [
          el('button', { class: 'btn primary', id: 'go-race', text: '登船开赛 →' }, []),
        ]),
        el('div', { class: 'muted center-text mt', text: '操作：空格/鼠标/触屏 = 敲鼓定节奏；A D 或 ← → = 打舵；↑ ↓ = 微调桨频' }),
      ]),
    );
    const desc = node.querySelector('#river-desc') as HTMLElement;
    const updateDesc = () => {
      const r = RIVERS.find((x) => x.id === this.choices.riverId)!;
      desc.innerHTML = `${r.name}：全长 ${r.length}m，基础流速 ${r.baseFlow}m/s，湍流强度 ${r.turbulence}，${r.adverseZones.length} 处逆流回水段。`;
    };
    updateDesc();
    riverGroup.querySelectorAll('button').forEach((b) => (b.onclick = (() => { const old = b.onclick; return (e) => { old?.call(b, e); updateDesc(); }; })()));
    (node.querySelector('.ghost') as HTMLElement).onclick = () => this.showMenu();
    (node.querySelector('#go-race') as HTMLElement).onclick = () => this.startRace();
  }

  private buildRaceTeams(): TeamSpec[] {
    const intensity = this.save.training[this.choices.teamId] ?? 0;
    return buildAllTeams().map((t) => (t.id === this.choices.teamId ? applyTraining(t, intensity) : t));
  }

  private startRace(): void {
    this.screen = 'race';
    clear(this.app);
    this.canvas.hidden = false;
    const river = RIVERS.find((r) => r.id === this.choices.riverId) ?? RIVERS[0];
    const teams = this.buildRaceTeams();
    const configs: BoatConfig[] = teams.slice(0, RACE_BOAT_COUNT).map((team, i) => ({
      team,
      lane: i,
      isPlayer: team.id === this.choices.teamId,
      seed: 0x7a5 + i * 101,
    }));
    const world = new RaceWorld(configs, river);
    world.setHelmInput(0);

    if (!this.renderer) this.renderer = new RaceRenderer(this.canvas);
    this.resize();
    const hudNode = el('div', { id: 'hud' });
    this.app.append(hudNode);
    this.hud = new Hud(hudNode, world.boats, river);

    this.loop = new GameLoop(world, this.renderer, {
      onHud: (hud) => this.onHud(hud, world),
      onFinish: (result) => this.onFinish(result),
    });
    this.input = new InputController(world, this.canvas, () => this.audio.beat());

    // 触屏/鼠标敲鼓按钮
    this.hud.beatButton.onpointerdown = (e) => {
      e.preventDefault();
      if (world.playerBeat()) this.audio.beat();
    };
    const { left, right } = this.hud.helmButtons();
    const hold = (btn: HTMLElement, dir: number) => {
      btn.onpointerdown = (e) => { e.preventDefault(); world.setHelmInput(dir); };
      btn.onpointerup = () => world.setHelmInput(0);
      btn.onpointerleave = () => world.setHelmInput(0);
    };
    hold(left, -1);
    hold(right, 1);

    this.loop.start();
  }

  private onHud(hud: RaceHud, world: RaceWorld): void {
    const player = world.boats.find((b) => b.config.isPlayer);
    this.hud?.update(hud, player?.drummer.beats ?? 0);
    // AI 船鼓点环境音（轻音，仅最近的对手）
    for (const b of world.boats) {
      if (b.config.isPlayer) continue;
      const seen = this.aiBeatTrack.get(b.config.team.id) ?? 0;
      if (b.drummer.beats > seen) {
        this.aiBeatTrack.set(b.config.team.id, b.drummer.beats);
        if (Math.abs(b.x - (world.boats.find((x) => x.config.isPlayer)?.x ?? 0)) < 30) this.audio.softBeat();
      }
    }
  }

  private onFinish(result: RaceResult): void {
    this.save = recordRaceResult(this.save, result);
    this.lastResult = result;
    setTimeout(() => this.showAnalysis(), 800);
  }

  private showAnalysis(): void {
    if (!this.lastResult) return this.showMenu();
    const node = this.mountScreen('analysis');
    renderAnalysis(node, this.lastResult, () => this.startRace(), () => this.showMenu());
  }

  private teardownRace(): void {
    this.loop?.stop();
    this.input?.dispose();
    this.loop = null;
    this.input = null;
    this.hud = null;
    this.aiBeatTrack.clear();
  }

  resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.renderer?.resize(window.innerWidth, window.innerHeight, dpr);
  }
}

const app = new App();
window.addEventListener('resize', () => app.resize());
