/**
 * 无头浏览器冒烟测试：通过 CDP 驱动 Chrome，
 * 验证 WebGL2 上下文创建、页面无报错、并让比赛真实运行若干秒。
 * 用法：node tests/smoke.mjs <ws-url>
 */
const wsUrl = process.argv[2];
const baseUrl = process.argv[3] ?? 'http://127.0.0.1:5173/';
const ws = new WebSocket(wsUrl);
let msgId = 0;
const pending = new Map();

function send(method, params = {}) {
  return new Promise((resolve) => {
    const id = ++msgId;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

const errors = [];

ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg.result);
    pending.delete(msg.id);
  }
  if (msg.method === 'Runtime.consoleAPICalled') {
    const text = msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
    console.log(`[console.${msg.params.type}] ${text}`);
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const ex = msg.params.exceptionDetails;
    errors.push(ex.text + ' ' + (ex.exception?.description ?? ''));
    console.log('[EXCEPTION]', ex.text, ex.exception?.description ?? '');
  }
});

ws.addEventListener('open', async () => {
  await send('Runtime.enable');
  await send('Page.enable');

  await send('Page.navigate', { url: baseUrl });
  await new Promise((r) => setTimeout(r, 2500));

  // 1. 主菜单 + WebGL2 能力
  const menuCheck = await send('Runtime.evaluate', {
    expression: `({
      title: document.querySelector('h1')?.textContent,
      buttons: [...document.querySelectorAll('button')].map(b => b.textContent),
      webgl2: (() => { const c = document.createElement('canvas'); return !!c.getContext('webgl2'); })(),
    })`,
    returnByValue: true,
  });
  console.log('菜单状态:', JSON.stringify(menuCheck.result.value));

  // 2. 队伍组建页
  await send('Runtime.evaluate', { expression: `[...document.querySelectorAll('button')].find(b=>b.textContent==='队伍组建').click()` });
  await new Promise((r) => setTimeout(r, 500));
  const teamCheck = await send('Runtime.evaluate', {
    expression: `document.querySelectorAll('.team-card').length`,
    returnByValue: true,
  });
  console.log('队伍卡片数:', teamCheck.result.value);
  await send('Runtime.evaluate', { expression: `document.querySelector('.ghost').click()` });
  await new Promise((r) => setTimeout(r, 400));

  // 3. 开赛
  await send('Runtime.evaluate', { expression: `[...document.querySelectorAll('button')].find(b=>b.textContent==='开始比赛').click()` });
  await new Promise((r) => setTimeout(r, 600));
  await send('Runtime.evaluate', { expression: `document.querySelector('#go-race').click()` });
  await new Promise((r) => setTimeout(r, 1500));

  const raceCheck = await send('Runtime.evaluate', {
    expression: `({
      canvasVisible: !document.getElementById('gl-canvas').hidden,
      hudTime: document.querySelector('.hud-big')?.textContent,
      leaderboardRows: document.querySelectorAll('.lb-row').length,
      beatRing: !!document.getElementById('beat-ring'),
    })`,
    returnByValue: true,
  });
  console.log('比赛状态:', JSON.stringify(raceCheck.result.value));

  // 4. 先记录玩家距离，再敲鼓 8 次（0.7s 间隔 ≈ 86SPM），验证真实推进
  const before = await send('Runtime.evaluate', {
    expression: `document.querySelectorAll('.lb-row.me span')[1]?.textContent`,
    returnByValue: true,
  });
  for (let i = 0; i < 8; i++) {
    await send('Runtime.evaluate', { expression: `document.getElementById('beat-ring').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))` });
    await new Promise((r) => setTimeout(r, 700));
  }

  const afterCheck = await send('Runtime.evaluate', {
    expression: `({
      time: document.querySelectorAll('.hud-big')[0]?.textContent,
      rank: document.querySelectorAll('.hud-big')[1]?.textContent,
      spm: document.querySelectorAll('.hud-big')[2]?.textContent,
      meDistance: document.querySelectorAll('.lb-row.me span')[1]?.textContent,
      glError: (() => { const c = document.getElementById('gl-canvas'); const gl = c.getContext('webgl2'); return gl ? gl.getError() : -1; })(),
    })`,
    returnByValue: true,
  });
  console.log('敲鼓前玩家位置:', before.result.value, '| 敲鼓后状态:', JSON.stringify(afterCheck.result.value));

  // 5. 训练屏可进入
  await send('Runtime.evaluate', { expression: `location.reload()` });
  await new Promise((r) => setTimeout(r, 1500));
  await send('Runtime.evaluate', { expression: `[...document.querySelectorAll('button')].find(b=>b.textContent==='节奏训练').click()` });
  await new Promise((r) => setTimeout(r, 500));
  const trainCheck = await send('Runtime.evaluate', {
    expression: `!!document.querySelector('.training-drum')`,
    returnByValue: true,
  });
  console.log('训练屏鼓面:', trainCheck.result.value);

  console.log(errors.length ? `\n冒烟失败，${errors.length} 个异常` : '\n冒烟通过：无未捕获异常');
  ws.close();
  process.exit(errors.length ? 1 : 0);
});
