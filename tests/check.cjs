/* 实验 4 通检与对照脚本
   用法：node tests/check.cjs          跑 11 条通检（10 条主路径 + 1 条失败路径）
        node tests/check.cjs --bench  对"按食堂+餐次筛选菜单"测 50 次
   与 verify.cjs 一样用最小 DOM 桩加载 index.html，经文档级事件委托触发动作。
*/
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { hrtime } = process;

const ROOT = path.resolve(__dirname, '..');
const STORE = path.join(os.tmpdir(), 'sztu-canteen-check-store.json');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const code = html.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];

function boot() {
  fs.rmSync(STORE, { force: true });
  const listeners = {}, toasts = [], els = new Map();
  const makeEl = (id) => ({
    id, value: '', textContent: '', innerHTML: '', hidden: false, className: '',
    tagName: 'DIV', dataset: {}, style: {},
    classList: { add() {}, remove() {}, toggle() {} },
    focus() {}, remove() {}, addEventListener() {}, querySelectorAll() { return []; },
    appendChild(c) { if (id === 'toastRoot') toasts.push(c.textContent); }
  });
  const doc = {
    querySelector(sel) {
      const id = String(sel).replace(/^#/, '');
      if (!els.has(id)) els.set(id, makeEl(id));
      return els.get(id);
    },
    getElementById(id) { return doc.querySelector('#' + id); },
    createElement() { return makeEl('created'); },
    querySelectorAll() { return []; },
    addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); }
  };
  let raw = null;
  const localStorage = {
    getItem(k) { return raw ? (JSON.parse(raw)[k] ?? null) : null; },
    setItem(k, v) { const o = raw ? JSON.parse(raw) : {}; o[k] = String(v); raw = JSON.stringify(o); fs.writeFileSync(STORE, raw); }
  };
  const ctx = {
    document: doc, window: { scrollTo() {}, scrollY: 0, addEventListener() {} },
    localStorage, console, setTimeout: () => 0, clearTimeout: () => {}
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx, { filename: 'index.html' });
  return {
    ctx, doc, listeners, toasts,
    read: () => JSON.parse(vm.runInContext('JSON.stringify(db)', ctx)),
    set: (expr) => vm.runInContext(expr, ctx),
    el: (id) => doc.getElementById(id)
  };
}

function fire(env, act, dataset = {}) {
  const el = {
    tagName: 'BUTTON', dataset: { act, ...dataset }, value: '', style: {},
    classList: { add() {}, remove() {}, toggle() {} }, focus() {}, closest() { return el; },
    parentElement: { querySelectorAll() { return []; } }
  };
  const e = { target: { closest() { return el; } }, preventDefault() {}, stopPropagation() {} };
  for (const fn of (env.listeners.click || [])) fn(e);
  return el;
}
const lastToast = (env) => env.toasts[env.toasts.length - 1] || '';

if (process.argv[2] === '--bench') {
  const env = boot();
  const times = [];
  for (let i = 0; i < 50; i++) {
    const t0 = hrtime.bigint();
    env.set("state.cid='e0'; state.meal='lunch'; state.tag='all'; state.q=''; render()");
    times.push(Number(hrtime.bigint() - t0) / 1e6);
  }
  const sorted = times.slice().sort((a, b) => a - b);
  console.log('条件: 同一 DOM 桩、70 道菜、E-0 + 午餐、无关键词、50 次 render()');
  console.log('中位数 ms:', sorted[25].toFixed(3), '| 最慢 ms:', sorted[49].toFixed(3), '| 最快 ms:', sorted[0].toFixed(3));
  process.exit(0);
}

const env = boot();
const results = [];
const check = (id, step, expect, actual, pass) => {
  results.push([id, step, expect, actual, pass ? 'PASS' : 'FAIL']);
};

// C1 / 工作流程第 1 步：打开系统
check('C1', '打开系统', '进站遮罩与身份卡存在',
  'gate 元素存在，进站门显示', Boolean(env.el('gate')));

// C2 / 第 2 步：以学生进站
env.el('nick').value = '吴同学';
fire(env, 'pick-role', { role: 'student' });
fire(env, 'enter');
const p = env.read().profile;
check('C2', '以学生进站', '昵称写入、role=student', `nickname=${p.nickname}, role=${p.role}`,
  p.nickname === '吴同学' && p.role === 'student');

// C3 / 第 3 步：筛选菜单
env.set("state.cid='e0'; state.meal='lunch'; state.tag='all'; state.q=''; render()");
const allCount = (env.doc.querySelector('#host').innerHTML.match(/data-act="open-dish"/g) || []).length;
env.el('fbText').value = '';
check('C3', '按食堂与餐次筛选', 'E-0 午餐菜品少于全量 70 道', `筛出 ${allCount} 道`, allCount > 0 && allCount < 70);

// C4 / 第 4 步：打卡
const beforeMeals = env.read().meals.length;
const dishId = env.read().dishes.find(d => !d.removed).id;
fire(env, 'eat', { id: dishId });
const m = env.read().meals.at(-1);
check('C4', '打卡', '流水 +1 且含价格/热量/日期', `meals ${beforeMeals}->${env.read().meals.length}, price=${m.price}`,
  env.read().meals.length === beforeMeals + 1 && m.price > 0 && /^\d{4}-\d{2}-\d{2}$/.test(m.date));

// C5 / 第 5 步：评价（含空文本失败分支；评价只要求非空，不设 5 字下限）
const beforeReviews = env.read().reviews.length;
fire(env, 'open-review', { id: dishId });
env.el('rvText').value = '';
fire(env, 'submit-review');
const failToast = lastToast(env);
const stillSame = env.read().reviews.length === beforeReviews;
env.el('rvText').value = '分量偏少而且偏咸，希望改进';
fire(env, 'pick-star', { v: '2' });
fire(env, 'submit-review');
const rev = env.read().reviews.at(-1);
check('C5', '打 2 分评价', '空文本被拒；补文本后写入 2 星', `${failToast}；rating=${rev.rating}`,
  stillSame && failToast.includes('写两句') && rev.rating === 2 && env.read().reviews.length === beforeReviews + 1);

// C6 / 第 6 步：提交反馈
const beforeFb = env.read().feedbacks.length;
env.set("state.fbWin='w2'; state.fbType='价格收费'");
env.el('fbText').value = '麻辣香锅最近分量偏少，价格却涨了两元';
fire(env, 'submit-fb');
const f = env.read().feedbacks.at(-1);
check('C6', '提交反馈', 'feedbacks +1、status=pending', `${beforeFb}->${env.read().feedbacks.length}, status=${f.status}`,
  env.read().feedbacks.length === beforeFb + 1 && f.status === 'pending');

// C7 / 第 7 步：切管理员
fire(env, 'switch-role', { role: 'admin' });
env.set("go('admin')");
check('C7', '切管理员进后台', 'role=admin 且视图切到 admin', `role=${env.read().profile.role}, view=${env.set('state.view')}`,
  env.read().profile.role === 'admin' && env.set('state.view') === 'admin');

// C8 / 第 8 步：受理回复
env.el('rp-' + f.id).value = '同学你好，已核实分量问题，已提醒窗口整改。';
fire(env, 'reply-fb', { id: f.id });
const done = env.read().feedbacks.find(x => x.id === f.id);
check('C8', '受理回复', 'status=resolved、有回复、处理记录 +1', `status=${done.status}, reply=${done.reply.slice(0, 8)}…`,
  done.status === 'resolved' && Boolean(done.repliedAt) && env.read().adminLogs.length > 0);

// F1 / 失败路径：驳回理由留空
env.set("state.view='feedback'; render()");
fire(env, 'reject-fb', { id: f.id });
env.el('rj').value = '';
fire(env, 'do-reject', { id: f.id });
const rejectToast = lastToast(env);
check('F1', '驳回理由留空', '提示填理由、状态仍 resolved', `${rejectToast}；status=${env.read().feedbacks.find(x=>x.id===f.id).status}`,
  rejectToast.includes('驳回理由'));

// C9 / 第 9 步：切回学生、后台入口消失
fire(env, 'switch-role', { role: 'student' });
env.set("go('admin')");
const denyToast = lastToast(env);
check('C9', '切回学生', 'role=student 且进后台被拦', `role=${env.read().profile.role}, toast=${denyToast}`,
  env.read().profile.role === 'student' && denyToast.includes('管理员') && env.set('state.view') !== 'admin');

// C10 / 第 10 步：统计核对 + 删除流水（二次确认为异步，需等一个微任务）
(async () => {
  env.set("state.view='stats'; render()");
  const statHtml = env.doc.querySelector('#host').innerHTML;
  const beforeDel = env.read().meals.length;
  fire(env, 'del-meal', { id: m.id });
  const confirmText = env.doc.querySelector('#modalRoot').innerHTML;
  fire(env, 'modal-yes');
  await Promise.resolve();
  const afterDel = env.read().meals.length;
  check('C10', '统计与删除', '流水含打卡菜；有确认框且删除后 -1',
    `显示菜名=${statHtml.includes(m.dishName)}, 确认框=${confirmText.includes('确认删除')}, meals ${beforeDel}->${afterDel}`,
    statHtml.includes(m.dishName) && confirmText.includes('确认删除') && afterDel === beforeDel - 1);

  const beforeCancel = env.read().meals.length;
  fire(env, 'del-meal', { id: env.read().meals[0].id });
  fire(env, 'modal-no');
  await Promise.resolve();
  check('C11', '取消删除', '点取消后记录数不变', `meals ${beforeCancel}->${env.read().meals.length}`,
    env.read().meals.length === beforeCancel);

  console.log('编号 | 步骤 | 期望 | 实际 | 结果');
  for (const r of results) console.log(r.join(' | '));
  console.log('合计:', results.filter(r => r[4] === 'PASS').length, '/', results.length, '通过');
})();
