/* 实验 3 实测脚本：在 Node 中用最小 DOM 桩加载 index.html，
   通过文档级事件委托触发页面动作，并用一个文件模拟 localStorage，
   以便跨进程（重启）验证数据是否仍在。
   用法：node tests/verify.cjs        跑全部场景
        node tests/verify.cjs --restart <id>   子进程：重启后读回（内部使用）
*/
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const STORE = process.env.SZTU_STORE || path.join(os.tmpdir(), 'sztu-canteen-verify-store.json');
const KEY = 'sztu_canteen_db_v1';
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const code = html.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];

function boot(fresh) {
  if (fresh) fs.rmSync(STORE, { force: true });
  const listeners = {};
  const toasts = [];
  const els = new Map();
  const makeEl = (id) => ({
    id, value: '', textContent: '', innerHTML: '', hidden: false, className: '',
    tagName: 'DIV', dataset: {}, style: {},
    classList: { add() {}, remove() {}, toggle() {} },
    focus() {}, remove() {}, addEventListener() {}, querySelectorAll() { return []; },
    appendChild(child) { if (id === 'toastRoot') toasts.push(child.textContent); }
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
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); }
  };
  let raw = null;
  try { raw = fs.readFileSync(STORE, 'utf8'); } catch (e) { /* 首次启动 */ }
  const localStorage = {
    getItem(k) {
      if (!raw) return null;
      const o = JSON.parse(raw);
      return Object.prototype.hasOwnProperty.call(o, k) ? o[k] : null;
    },
    setItem(k, v) {
      const o = raw ? JSON.parse(raw) : {};
      o[k] = String(v);
      raw = JSON.stringify(o);
      fs.writeFileSync(STORE, raw);
    }
  };
  const ctx = {
    document: doc,
    window: { scrollTo() {}, scrollY: 0, addEventListener() {} },
    localStorage, console,
    setTimeout: () => 0, clearTimeout: () => {}
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
    tagName: 'BUTTON', dataset: { act, ...dataset }, value: '',
    style: {}, classList: { add() {}, remove() {}, toggle() {} },
    focus() {}, closest() { return el; }
  };
  const e = { target: { closest() { return el; } }, preventDefault() {}, stopPropagation() {} };
  for (const fn of (env.listeners.click || [])) fn(e);
  return el;
}

const lastToast = (env) => env.toasts[env.toasts.length - 1];
const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, o[k]]));

if (process.argv[2] === '--restart') {
  const id = process.argv[3];
  const env = boot(false);
  const f = env.read().feedbacks.find(x => x.id === id);
  console.log('[5] 重启程序（新进程，重新读取本地存储）');
  console.log('    found:', Boolean(f));
  if (f) console.log('    record:', JSON.stringify(pick(f, ['id', 'type', 'text', 'status', 'reply'])));
  process.exit(0);
}

const env = boot(true);
env.el('nick').value = '吴同学';
fire(env, 'pick-role', { role: 'student' });
fire(env, 'enter');
env.set("state.fbWin='w2'; state.fbType='价格收费';");

const before = env.read().feedbacks.length;

console.log('[1] 成功：提交反馈（windowId=w2, type=价格收费, text=18 字）');
env.el('fbText').value = '麻辣香锅最近分量偏少，价格却涨了两元';
fire(env, 'submit-fb');
const ok = env.read().feedbacks.at(-1);
console.log('    record:', JSON.stringify(ok));
console.log('    页面提示:', lastToast(env));
console.log('    feedbacks:', before, '->', env.read().feedbacks.length);

console.log('[2] 失败：描述 3 字，触发 E_TEXT_TOO_SHORT');
env.el('fbText').value = '太贵了';
fire(env, 'submit-fb');
console.log('    页面提示:', lastToast(env));
console.log('    feedbacks 数量:', env.read().feedbacks.length, '（未写库）');

console.log('[3] 页面触发失败：点「驳回」但理由留空，触发 E_REJECT_REASON_EMPTY');
fire(env, 'reject-fb', { id: ok.id });
fire(env, 'do-reject', { id: ok.id });
console.log('    页面提示:', lastToast(env));
console.log('    status:', env.read().feedbacks.find(x => x.id === ok.id).status);

console.log('[4] 违反字段规则：回复内容为空，触发 E_REPLY_EMPTY');
fire(env, 'reply-fb', { id: ok.id });
console.log('    页面提示:', lastToast(env));
console.log('    status:', env.read().feedbacks.find(x => x.id === ok.id).status);

console.log('[4b] 成功受理回复（闭环终点）');
env.el('rp-' + ok.id).value = '同学你好，已核实分量问题，已提醒窗口整改。';
fire(env, 'reply-fb', { id: ok.id });
const done = env.read().feedbacks.find(x => x.id === ok.id);
console.log('    status:', done.status, '| repliedAt 非空:', done.repliedAt !== null);
console.log('    页面提示:', lastToast(env));

const child = spawnSync(process.execPath, [__filename, '--restart', ok.id], { encoding: 'utf8' });
process.stdout.write(child.stdout || '');
if (child.status !== 0) { console.error(child.stderr); process.exit(1); }
console.log('store:', KEY, '| file:', STORE);
