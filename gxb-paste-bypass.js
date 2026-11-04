// ==UserScript==
// @name         高校邦 粘贴解锁 + AI 答题助手
// @namespace    http://tampermonkey.net/
// @version      1.1.0
// @description  解除高校邦（gaoxiaobang）的粘贴/复制/右键/选中限制，并支持测验题的单选题、多选题、判断题、填空题 AI 自动作答
// @author       xiaole
// @match        *://*.gaoxiaobang.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      *
// @run-at       document-start
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  const TAG = '[高校邦助手]';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const W = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;   // 页面真实 window

  /* ============================================================
     1. 配置
     ============================================================ */
  const DEFAULT_CFG = {
    apiType: 'deepseek',      // openai | deepseek | custom
    apiKey: '',
    apiUrl: '',
    apiModel: '',
    extraContext: ''
  };

  function loadCfg() {
    const c = Object.assign({}, DEFAULT_CFG, GM_getValue('gxbConfig', {}) || {});
    // 首次使用：沿用同作者 PTA 脚本里已填好的 API 配置（只读，不写回）
    if (!c.apiKey) {
      const old = GM_getValue('aiConfig', {}) || {};
      if (old.apiKey) {
        c.apiType = old.apiType || c.apiType;
        c.apiKey = old.apiKey;
        c.apiUrl = old.apiUrl || '';
        c.apiModel = old.apiModel || '';
      }
    }
    return c;
  }
  let cfg = loadCfg();
  const saveCfg = () => GM_setValue('gxbConfig', cfg);

  /* ============================================================
     2. 解除粘贴 / 复制 / 右键 / 选中限制
     ============================================================ */
  const BLOCK_ATTRS = ['onpaste', 'oncopy', 'oncut', 'oncontextmenu', 'onselectstart', 'onkeydown', 'onbeforeinput', 'ondragstart'];

  function isEditable(t) {
    if (!t || t.nodeType !== 1) return false;
    if (t.isContentEditable) return true;
    const tag = t.tagName.toLowerCase();
    if (tag === 'textarea') return true;
    if (tag === 'input') {
      const tp = (t.getAttribute('type') || 'text').toLowerCase();
      return !['button', 'submit', 'reset', 'checkbox', 'radio', 'file', 'image', 'color', 'range', 'hidden'].includes(tp);
    }
    return !!t.closest('textarea, input, [contenteditable="true"], [contenteditable=""]');
  }
  const inOwnPanel = t => !!(t && t.closest && t.closest('#gxbQuizPanel'));

  let unlockInstalled = false;
  let lastScrub = 0;

  // 清掉内联的 onpaste / oncontextmenu 等拦截
  function scrubInlineBlockers() {
    const now = Date.now();
    if (now - lastScrub < 600) return;
    lastScrub = now;
    [document, document.body, document.documentElement, window, W].forEach(el => {
      if (!el) return;
      BLOCK_ATTRS.forEach(p => { try { if (el[p]) el[p] = null; } catch (e) {} });
    });
    try {
      document.querySelectorAll('[onpaste],[oncopy],[oncut],[oncontextmenu],[onselectstart],[onbeforeinput],[onkeydown]').forEach(el => {
        BLOCK_ATTRS.forEach(p => { try { el.removeAttribute(p); } catch (e) {} });
      });
    } catch (e) {}
  }

  function addStyle(id, css) {
    if (document.getElementById(id)) return;
    const s = document.createElement('style');
    s.id = id;
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }

  function installPasteUnlock() {
    if (unlockInstalled) return;
    unlockInstalled = true;

    const stopBubble = e => {
      if (inOwnPanel(e.target)) return;
      if (!isEditable(e.target)) return;
      // 只切断站点自己的拦截逻辑，不阻止浏览器默认粘贴
      e.stopImmediatePropagation();
    };
    const onKeyDown = e => {
      if (inOwnPanel(e.target)) return;
      if (!isEditable(e.target)) return;
      const k = String(e.key || '').toLowerCase();
      if ((e.ctrlKey || e.metaKey) && ['v', 'c', 'x', 'a'].includes(k)) e.stopImmediatePropagation();
    };

    ['paste', 'copy', 'cut', 'beforeinput', 'selectstart', 'contextmenu', 'dragstart'].forEach(t =>
      window.addEventListener(t, stopBubble, true)
    );
    window.addEventListener('keydown', onKeyDown, true);

    addStyle('gxbUnlockStyle', `
      body, input, textarea, [contenteditable], #quizPaper, .quiz-content, .gxb-panel { user-select: text !important; -webkit-user-select: text !important; }
      #gxbQuizPanel, #gxbQuizPanel * { user-select: none !important; -webkit-user-select: none !important; }
    `);

    scrubInlineBlockers();
    setInterval(scrubInlineBlockers, 1500);
    try {
      new MutationObserver(scrubInlineBlockers).observe(document.documentElement, {
        subtree: true, attributes: true,
        attributeFilter: ['onpaste', 'oncopy', 'oncut', 'oncontextmenu', 'onselectstart', 'onbeforeinput']
      });
    } catch (e) {}
    console.log(TAG, '粘贴限制已解除');
  }

  installPasteUnlock();   // 进页面立即解锁，不需要任何开关

  /* ── 2.2 讨论区 UEditor：站点拦的是 beforepaste 里的 data.html，不是 paste 事件 ──
     站点在 controller/student/topic.js 里注册：
       ed.addListener("beforepaste", (type, data) => { data.html = ""; gxb.tips.warn("只能录入不能粘贴啦~") })
     所以在 window 捕获阶段 stopImmediatePropagation 没用（会把整条粘贴流程掐掉）。
     正确做法：把拦截函数从 ed.__allListeners.beforepaste 里摘掉，保留 UEditor 自带的粘贴逻辑。*/
  const UE_BLOCK_RE = /只能录入不能粘贴|不能粘贴啦/;
  const UE_EMPTY_RE = /\b\w+\.html\s*=\s*(""|'')/;

  function ueStripBlocker(ed) {
    const list = ed && ed.__allListeners && ed.__allListeners.beforepaste;
    if (!Array.isArray(list) || !list.length) return false;
    const keep = list.filter(fn => {
      let src = '';
      try { src = Function.prototype.toString.call(fn); } catch (e) {}
      return !(UE_BLOCK_RE.test(src) || UE_EMPTY_RE.test(src));
    });
    if (keep.length === list.length) return false;
    ed.__allListeners.beforepaste = keep;
    return true;
  }

  function ueWrapFireEvent(ed) {
    if (!ed || ed.__gxbUeWrapped || typeof ed.fireEvent !== 'function') return;
    ed.__gxbUeWrapped = true;
    const orig = ed.fireEvent;
    ed.fireEvent = function (type, data) {
      let snap = null;
      if (type === 'beforepaste' && data && typeof data.html === 'string') snap = data.html;
      const ret = orig.apply(this, arguments);
      if (snap !== null && data && typeof data === 'object' && !data.html) data.html = snap;  // 被清空就还原
      return ret;
    };
  }

  let ueTimer = null;
  function installUEditorUnlock() {
    const UE = W.UE;
    if (!UE || !UE.instants) return false;
    Object.keys(UE.instants).forEach(k => {
      const ed = UE.instants[k];
      if (!ed || !ed.body) return;
      try {
        const stripped = ueStripBlocker(ed);
        ueWrapFireEvent(ed);
        if (stripped) console.log(TAG, '讨论区编辑器粘贴拦截已移除');
      } catch (e) {}
    });
    return true;
  }

  installUEditorUnlock();
  ueTimer = setInterval(installUEditorUnlock, 600);   // 切章节会重建编辑器，需要反复摘
  document.addEventListener('visibilitychange', () => {
    clearInterval(ueTimer);
    if (!document.hidden) {
      installUEditorUnlock();
      ueTimer = setInterval(installUEditorUnlock, 600);
    }
  });

  /* ============================================================
     3. 高校邦题目适配（真实模板见 view/student/quiz/type/*.js）
        · 单选 / 判断：.answer > i.gxb-icon-radio[answer_id]
        · 多选：      .answer > i.gxb-icon-check[answer_id]
        · 填空：      .answer > input.quiz-input
        站点在 #quizPaper 上做事件委托，必须点 <i> 图标本身
     ============================================================ */
  const SEL = {
    question: '.question-item',
    title: '.quiz-title',
    type: '.quiz-type',
    option: '.answer',
    icon: 'i.gxb-icon-radio, i.gxb-icon-check, i[answer_id]',
    blank: 'input.quiz-input, input[type="text"], textarea'
  };

  function qTypeText(item) {
    return (item.querySelector(SEL.type)?.textContent || '').replace(/\s+/g, '');
  }

  function detectType(item) {
    const t = qTypeText(item);
    if (/填空|简答|问答/.test(t)) return 'blank';
    if (/多选|多项|不定选/.test(t)) return 'multi';
    if (/单选|单项|判断|对错/.test(t)) return 'single';
    // 题型文字缺失时按 DOM 兜底
    const hasIcon = !!item.querySelector(SEL.icon);
    if (!hasIcon && item.querySelector(SEL.blank)) return 'blank';
    if (item.querySelector('i.gxb-icon-check, input[type="checkbox"]')) return 'multi';
    return 'single';
  }

  function qTitle(item) {
    const el = item.querySelector(SEL.title);
    if (!el) return '';
    const clone = el.cloneNode(true);
    clone.querySelectorAll(SEL.type).forEach(e => e.remove());
    return clone.textContent.replace(/\s+/g, ' ').trim();
  }

  const qOptions = item => Array.from(item.querySelectorAll(SEL.option));

  function optionText(opt, i) {
    const c = opt.cloneNode(true);
    c.querySelectorAll('i, input').forEach(e => e.remove());
    return `${String.fromCharCode(65 + i)}.${(c.textContent || '').replace(/\s+/g, ' ').trim()}`;
  }

  function buildPrompt(item, idx, type) {
    const title = qTitle(item);
    if (type === 'blank') {
      const n = item.querySelectorAll(SEL.blank).length || 1;
      return `Q${idx}【填空】${title}\n（共${n}空，按顺序，多空用+分隔）`;
    }
    const opts = qOptions(item).map(optionText).join(' ');
    return `Q${idx}【${type === 'multi' ? '多选' : '单选/判断'}】${title}\n${opts}`;
  }

  /* ── 答案解析：兼容 "A+C" / "AC" / "1+3" / "A,C" / "（1）（3）" ── */
  function parseChoiceIndexes(answer, isMulti, optCount) {
    const raw = String(answer == null ? '' : answer).trim();
    if (!raw) return [];
    const out = [];
    const push = n => {
      const i = n - 1;
      if (!(i >= 0)) return;
      if (optCount && i >= optCount) return;
      if (!out.includes(i)) out.push(i);
    };
    raw.split(/[\s,，、;；/|+]+/).filter(Boolean).forEach(tk => {
      const nums = tk.match(/\d+/g);
      if (nums) { nums.forEach(s => push(parseInt(s, 10))); return; }
      const letters = tk.replace(/[^A-Za-z]/g, '').toUpperCase();
      if (!letters) return;
      (isMulti ? letters.split('') : [letters[0]]).forEach(ch => push(ch.charCodeAt(0) - 64));
    });
    return out;
  }

  /* ── 判断题兜底：AI 返回 T/F、对/错、正确/错误 ── */
  function matchJudgement(item, raw) {
    const s = String(raw == null ? '' : raw).trim();
    if (!s || s.length > 6) return [];
    const isT = /^(T|TRUE|Y|YES|√|✓|正确|对|是)$/i.test(s);
    const isF = /^(F|FALSE|N|NO|×|X|✗|错误|错|否)$/i.test(s);
    if (!isT && !isF) return [];
    const kw = isT ? ['正确', '对', '√', '✓', 'TRUE', 'T', '是'] : ['错误', '错', '×', '✗', 'FALSE', 'F', '否'];
    const opts = qOptions(item);
    const i = opts.findIndex(o => {
      const tx = (o.textContent || '').replace(/\s+/g, '').toUpperCase();
      return kw.some(k => tx.includes(k.toUpperCase()));
    });
    return i >= 0 ? [i] : [];
  }

  /* ── 填写：本页已点过的图标不再点（站点是 toggle，点两次会取消） ── */
  const clickedIcons = new WeakSet();

  function isChecked(icon) {
    return !!icon && icon.classList.contains('checked');
  }

  function fillChoice(item, indexes) {
    const opts = qOptions(item);
    let hit = 0;
    indexes.forEach(i => {
      const opt = opts[i];
      if (!opt) return;
      const icon = opt.querySelector(SEL.icon) || opt.querySelector('i');
      if (!icon) return;
      if (isChecked(icon)) { hit++; return; }
      if (clickedIcons.has(icon)) { hit++; return; }
      icon.click();                 // 原生 click，触发 #quizPaper 上的委托 handler
      clickedIcons.add(icon);
      hit++;
    });
    return hit;
  }

  function fillBlanks(item, values) {
    const inputs = Array.from(item.querySelectorAll(SEL.blank));
    let n = 0;
    inputs.forEach((el, i) => {
      const v = values[i];
      if (v == null || String(v).trim() === '') return;
      try {
        el.focus();
        el.value = String(v);
        if (el._valueTracker) el._valueTracker.setValue('');
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.blur();
        n++;
      } catch (e) {}
    });
    return n;
  }

  /* ============================================================
     4. AI 客户端
     ============================================================ */
  function apiAsk(prompt) {
    return new Promise((resolve, reject) => {
      let apiUrl, model;
      if (cfg.apiType === 'custom') {
        apiUrl = (cfg.apiUrl || '').trim();
        model = (cfg.apiModel || '').trim();
        if (!apiUrl) return reject(new Error('自定义 API：请填写 API URL'));
        if (!model) return reject(new Error('自定义 API：请填写模型名称'));
      } else if (cfg.apiType === 'deepseek') {
        apiUrl = 'https://api.deepseek.com/chat/completions';
        model = 'deepseek-chat';
      } else {
        apiUrl = 'https://api.openai.com/v1/chat/completions';
        model = 'gpt-4o-mini';
      }
      const isCompletions = /\/completions\/?(\?|#|$)/.test(apiUrl) && !/\/chat\//.test(apiUrl);
      const isResponses = /\/responses\/?(\?|#|$)/.test(apiUrl);
      const body = isCompletions
        ? { model, prompt, max_tokens: 2000, temperature: 0.1 }
        : isResponses
          ? { model, input: prompt }
          : { model, messages: [{ role: 'user', content: prompt }], temperature: 0.1, max_tokens: 2000 };

      GM_xmlhttpRequest({
        method: 'POST',
        url: apiUrl,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.apiKey}` },
        data: JSON.stringify(body),
        onload(res) {
          try {
            const d = JSON.parse(res.responseText);
            if (d.error) return reject(new Error(`API错误(${res.status}): ${d.error.message || JSON.stringify(d.error)}`));
            const txt = (d.choices?.[0]?.text
              || d.choices?.[0]?.message?.content
              || d.output?.[0]?.content?.find?.(c => c.type === 'output_text')?.text
              || d.output?.[0]?.content?.[0]?.text
              || d.output_text || '').trim();
            if (!txt) return reject(new Error(`API 返回为空(${res.status}): ${(res.responseText || '').slice(0, 150)}`));
            resolve(txt);
          } catch (e) {
            reject(new Error(`解析失败(${res.status}): ${(res.responseText || '').slice(0, 150)}`));
          }
        },
        onerror() { reject(new Error('网络请求失败：' + apiUrl)); },
        ontimeout() { reject(new Error('请求超时：' + apiUrl)); }
      });
    });
  }

  function parseAnswers(reply) {
    try {
      const s = (String(reply).match(/\{[\s\S]*\}/) || [String(reply)])[0];
      const d = JSON.parse(s);
      if (Array.isArray(d.answers)) return d.answers;
      if (d.answers && typeof d.answers === 'object') return Object.values(d.answers);
      return [];
    } catch (e) {
      return String(reply).split(/[\n,]/).map(s => s.trim()).filter(Boolean);
    }
  }

  /* ============================================================
     5. 答题引擎
     ============================================================ */
  let running = false;

  function applyOne(plan, raw) {
    const title = qTitle(plan.el).slice(0, 40) || `第${plan.idx}题`;
    const rawStr = String(raw == null ? '' : raw).trim();
    if (!rawStr) return { title, answer: '无答案', type: plan.type };

    if (plan.type === 'blank') {
      const vals = rawStr.split(/[+＋]/).map(s => s.trim()).filter(Boolean);
      const n = fillBlanks(plan.el, vals);
      return { title, answer: `${vals.join(' + ')}${n ? '' : '(未填入)'}`, type: 'blank' };
    }

    const optCount = qOptions(plan.el).length;
    let idxs = parseChoiceIndexes(rawStr, plan.type === 'multi', optCount);
    if (!idxs.length && plan.type === 'single') idxs = matchJudgement(plan.el, rawStr);
    if (!idxs.length) return { title, answer: `${rawStr}(未解析)`, type: plan.type };

    const hit = fillChoice(plan.el, idxs);
    const disp = idxs.map(i => String.fromCharCode(65 + i)).join('+');
    if (!hit) return { title, answer: `${disp}(未选中)`, type: plan.type };
    if (hit < idxs.length) return { title, answer: `${disp}(仅中${hit})`, type: plan.type };
    return { title, answer: disp, type: plan.type };
  }

  async function runEngine(setStatus, onRecord) {
    if (!cfg.apiKey) throw new Error('请先在「API 配置」里填写 API Key');
    const items = Array.from(document.querySelectorAll(SEL.question));
    if (!items.length) throw new Error('未找到题目（.question-item）—— 请确认已进入测验/作业答题页，且题目已加载完成');

    const plan = items.map((el, i) => ({ el, idx: i + 1, type: detectType(el) }));
    const stat = plan.reduce((a, p) => { a[p.type] = (a[p.type] || 0) + 1; return a; }, {});
    setStatus(`🔍 共 ${plan.length} 题：单选 ${stat.single || 0} · 多选 ${stat.multi || 0} · 填空 ${stat.blank || 0}`, 'loading');

    const records = [];

    /* 一次性把所有题目发给 AI；如果一次塞太多导致 JSON 截断/漏题，
       自动对半拆分重试，直到成功（不设开关，用户无感） */
    const askPrompt = chunk => `你是专业考试助手，请按顺序回答以下 ${chunk.length} 道题。
返回 JSON：{"answers":["答案1","答案2",...]}
规则：
1) 单选题、判断题只返回一个选项字母（A/B/C/D…）；
2) 多选题返回连写的多个字母（如 AC）；
3) 填空题返回答案文字，多个空用 + 分隔；
4) 答案数量必须正好 ${chunk.length} 个，按题目顺序排列；
5) 只返回 JSON，不要解释。${cfg.extraContext ? `\n\n【背景知识/提示】\n${cfg.extraContext}` : ''}

${chunk.map(p => buildPrompt(p.el, p.idx, p.type)).join('\n\n')}`;

    async function solve(chunk) {
      if (!running || !chunk.length) return;
      const from = chunk[0].idx, to = chunk[chunk.length - 1].idx;
      setStatus(`⏳ AI 分析第 ${from}-${to} 题（共 ${plan.length}）...`, 'loading');
      let answers = [];
      try {
        answers = parseAnswers(await apiAsk(askPrompt(chunk)));
        if (!answers.length) throw new Error('未返回可用答案');
        if (answers.length < chunk.length) throw new Error(`只返回 ${answers.length}/${chunk.length} 个答案`);
      } catch (e) {
        if (!running) return;
        if (chunk.length > 1) {
          // 一次全发失败（题多/JSON 被截断/模型漏题）→ 对半拆开重试
          const mid = Math.ceil(chunk.length / 2);
          setStatus(`⚠️ 一次发送失败（${e.message || e}），自动拆成两批重试`, 'loading');
          await solve(chunk.slice(0, mid));
          await sleep(300);
          await solve(chunk.slice(mid));
          return;
        }
        records.push({ title: qTitle(chunk[0].el).slice(0, 40) || `第${from}题`, answer: `❌ ${e.message || e}`, type: chunk[0].type });
        onRecord([...records]);
        return;
      }

      for (let k = 0; k < chunk.length; k++) {
        if (!running) break;
        records.push(applyOne(chunk[k], answers[k]));
        onRecord([...records]);
        await sleep(120);
      }
      await sleep(200);
    }

    await solve(plan);
    return records;
  }

  /* ── 检查未答（提交前自查，这个测验通常只有 1 次提交机会） ── */
  function checkUnanswered() {
    const items = Array.from(document.querySelectorAll(SEL.question));
    const detail = [];
    items.forEach((item, i) => {
      const type = detectType(item);
      if (type === 'blank') {
        const empty = Array.from(item.querySelectorAll(SEL.blank)).filter(el => !String(el.value || '').trim()).length;
        if (empty) detail.push(`第 ${i + 1} 题（填空）还有 ${empty} 个空未填`);
      } else {
        const done = qOptions(item).some(o => isChecked(o.querySelector(SEL.icon) || o.querySelector('i')));
        if (!done) detail.push(`第 ${i + 1} 题（${type === 'multi' ? '多选' : '单选'}）未选`);
      }
    });
    return { total: items.length, bad: detail.length, detail };
  }

  /* ============================================================
     6. UI
     ============================================================ */
  const CSS = `
    #gxbQuizPanel{position:fixed;top:20px;right:20px;width:300px;background:#f8f9ff;border-radius:14px;color:#333;font-family:-apple-system,"Microsoft YaHei",sans-serif;font-size:13px;display:flex;flex-direction:column;overflow:hidden;border:1px solid #e0e3f0;z-index:2147483000;box-shadow:0 10px 40px rgba(0,0,0,.18);line-height:1.5;}
    #gxbQuizPanel *{box-sizing:border-box;}
    #gxbPanelHandle{padding:10px 14px;background:linear-gradient(135deg,#667eea,#764ba2);cursor:move;display:flex;justify-content:space-between;align-items:center;font-weight:bold;font-size:13px;color:#fff;}
    #gxbQuizPanel .gq-sec{border-bottom:1px solid #e8eaf0;}
    #gxbQuizPanel .gq-hdr{padding:9px 14px;display:flex;align-items:center;cursor:pointer;font-size:12px;font-weight:bold;color:#555;background:#f0f2fa;}
    #gxbQuizPanel .gq-hdr .arr{margin-left:5px;font-size:10px;transition:transform .25s;}
    #gxbQuizPanel .gq-hdr.open .arr{transform:rotate(180deg);}
    #gxbQuizPanel .gq-body{padding:10px 14px;background:#fff;display:none;}
    #gxbQuizPanel .gq-body.open{display:block;}
    #gxbQuizPanel select,#gxbQuizPanel input[type=text],#gxbQuizPanel input[type=password],#gxbQuizPanel input[type=number],#gxbQuizPanel textarea{width:100%;padding:7px 9px;margin:3px 0;border:1px solid #d0d5e8;border-radius:7px;background:#f8f9ff;color:#333;font-size:12px;font-family:inherit;}
    #gxbQuizPanel button{width:100%;padding:9px;margin:4px 0;border:none;border-radius:8px;font-weight:bold;cursor:pointer;font-size:13px;}
    #gxbQuizPanel .btn-green{background:linear-gradient(135deg,#4ade80,#22c55e);color:#fff;}
    #gxbQuizPanel .btn-green:disabled{background:#c8d0dc;color:#888;cursor:not-allowed;}
    #gxbQuizPanel .btn-outline{background:#fff;color:#667eea;border:1px solid #667eea;}
    #gxbQuizPanel .btn-gray{background:#eef0f8;color:#555;}
    #gxbQuizStatus{text-align:center;padding:7px 10px;margin:2px 0 4px;border-radius:7px;font-size:12px;min-height:30px;}
    .gq-loading{background:#eff6ff;color:#2563eb;}
    .gq-success{background:#f0fdf4;color:#16a34a;}
    .gq-error{background:#fef2f2;color:#dc2626;}
    #gxbQuizPanel .rec-title{font-size:11px;color:#888;margin:2px 0 6px;display:flex;justify-content:space-between;font-weight:bold;}
    #gxbRecordList{max-height:150px;overflow-y:auto;}
    #gxbQuizPanel .rec-row{display:flex;align-items:center;padding:5px 8px;background:#fff;border-radius:6px;margin:4px 0;border:1px solid #eef0f8;}
    #gxbQuizPanel .rec-row .rt{font-size:10px;color:#aaa;margin-right:6px;flex-shrink:0;}
    #gxbQuizPanel .rec-row .rq{flex:1;min-width:0;color:#444;margin-right:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    #gxbQuizPanel .rec-row .ra{flex-shrink:0;max-width:44%;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;border-radius:4px;padding:0 7px;font-weight:bold;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    #gxbQuizPanel .rec-row .ra.m{background:linear-gradient(135deg,#f59e0b,#d97706);}
    #gxbQuizPanel .rec-row .ra.f{background:linear-gradient(135deg,#06b6d4,#0891b2);}
  `;

  const PANEL_HTML = `
    <div id="gxbPanelHandle"><span>🎓 高校邦助手</span><span style="font-size:11px;opacity:.75">v1.1.0</span></div>
    <div class="gq-sec">
      <div class="gq-hdr" id="gxbCfgHdr">⚙️ API 配置 <span class="arr">▼</span></div>
      <div class="gq-body" id="gxbCfgBody">
        <select id="gxbApiType">
          <option value="deepseek">DeepSeek (deepseek-chat)</option>
          <option value="openai">OpenAI (gpt-4o-mini)</option>
          <option value="custom">自定义</option>
        </select>
        <input id="gxbApiKey" type="password" placeholder="API Key" autocomplete="off"/>
        <div id="gxbCustomFields" style="display:none">
          <input id="gxbApiUrl" type="text" placeholder="API URL（…/chat/completions）"/>
          <input id="gxbApiModel" type="text" placeholder="模型名称"/>
        </div>
        <textarea id="gxbExtra" rows="3" placeholder="可选：背景知识，答题时给 AI 参考"></textarea>
        <button class="btn-green" id="gxbSaveCfg">💾 保存配置</button>
      </div>
    </div>
    <div class="gq-sec">
      <div class="gq-hdr" id="gxbToolHdr">🧰 工具 <span class="arr">▼</span></div>
      <div class="gq-body" id="gxbToolBody">
        <button class="btn-gray" id="gxbCheck">🔍 检查未答题</button>
      </div>
    </div>
    <div style="padding:10px 14px 4px;background:#fff;border-bottom:1px solid #e8eaf0;">
      <div id="gxbQuizStatus" class="gq-loading">进入测验页后点「开始答题」</div>
      <button class="btn-green" id="gxbStart">▶ 开始答题</button>
    </div>
    <div style="padding:8px 14px 12px;background:#f8f9ff;">
      <div class="rec-title"><span>📋 答题记录</span><span id="gxbRecCount">0 题</span></div>
      <div id="gxbRecordList"></div>
    </div>`;

  function mountPanel() {
    if (!document.body) return setTimeout(mountPanel, 120);
    if (document.getElementById('gxbQuizPanel')) return;

    addStyle('gxbQuizStyle', CSS);

    const panel = document.createElement('div');
    panel.id = 'gxbQuizPanel';
    panel.innerHTML = PANEL_HTML;
    document.body.appendChild(panel);

    const $ = id => document.getElementById(id);

    /* 恢复配置 */
    $('gxbApiType').value = cfg.apiType || 'deepseek';
    $('gxbApiKey').value = cfg.apiKey || '';
    $('gxbApiUrl').value = cfg.apiUrl || '';
    $('gxbApiModel').value = cfg.apiModel || '';
    $('gxbExtra').value = cfg.extraContext || '';
    $('gxbCustomFields').style.display = cfg.apiType === 'custom' ? 'block' : 'none';

    /* 折叠 */
    const bindFold = (hdr, body, startOpen) => {
      if (startOpen) { $(hdr).classList.add('open'); $(body).classList.add('open'); }
      $(hdr).onclick = () => { $(hdr).classList.toggle('open'); $(body).classList.toggle('open'); };
    };
    bindFold('gxbCfgHdr', 'gxbCfgBody', !cfg.apiKey);
    bindFold('gxbToolHdr', 'gxbToolBody', false);

    $('gxbApiType').onchange = () => {
      $('gxbCustomFields').style.display = $('gxbApiType').value === 'custom' ? 'block' : 'none';
    };

    /* 拖拽 */
    let dragging = false, off = { x: 0, y: 0 };
    $('gxbPanelHandle').addEventListener('mousedown', e => {
      dragging = true;
      const r = panel.getBoundingClientRect();
      off = { x: e.clientX - r.left, y: e.clientY - r.top };
    });
    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      panel.style.left = `${e.clientX - off.x}px`;
      panel.style.top = `${e.clientY - off.y}px`;
      panel.style.right = 'auto';
    });
    document.addEventListener('mouseup', () => { dragging = false; });

    const setStatus = (msg, type = 'loading') => {
      const el = $('gxbQuizStatus');
      if (el) { el.className = `gq-${type}`; el.textContent = msg; }
    };

    const onRecord = records => {
      $('gxbRecCount').textContent = `${records.length} 题`;
      $('gxbRecordList').innerHTML = records.slice(-20).reverse().map(r => {
        const cls = r.type === 'multi' ? 'm' : r.type === 'blank' ? 'f' : '';
        const tl = r.type === 'multi' ? '多选' : r.type === 'blank' ? '填空' : '单选';
        return `<div class="rec-row"><span class="rt">${tl}</span><span class="rq">${escapeHtml(r.title)}</span><span class="ra ${cls}">${escapeHtml(r.answer)}</span></div>`;
      }).join('');
    };

    $('gxbSaveCfg').onclick = () => {
      cfg = Object.assign(cfg, {
        apiType: $('gxbApiType').value,
        apiKey: $('gxbApiKey').value.trim(),
        apiUrl: $('gxbApiUrl').value.trim(),
        apiModel: $('gxbApiModel').value.trim(),
        extraContext: $('gxbExtra').value.trim()
      });
      saveCfg();
      $('gxbSaveCfg').textContent = '✅ 已保存';
      setTimeout(() => { $('gxbSaveCfg').textContent = '💾 保存配置'; }, 1500);
    };

    $('gxbCheck').onclick = () => {
      const r = checkUnanswered();
      if (!r.total) return setStatus('❌ 当前页没找到题目', 'error');
      if (!r.bad) return setStatus(`✅ ${r.total} 题全部已作答`, 'success');
      setStatus(`⚠️ ${r.total} 题中有 ${r.bad} 题未完成：${r.detail.slice(0, 3).join('；')}${r.bad > 3 ? ' …' : ''}`, 'error');
      console.log(TAG, '未答明细', r.detail);
    };

    $('gxbStart').onclick = async () => {
      const btn = $('gxbStart');
      if (running) {
        running = false;
        btn.textContent = '▶ 开始答题';
        btn.className = 'btn-green';
        return;
      }
      // 用面板里的最新值，避免忘了点保存
      cfg.apiType = $('gxbApiType').value;
      cfg.apiKey = $('gxbApiKey').value.trim() || cfg.apiKey;
      cfg.apiUrl = $('gxbApiUrl').value.trim();
      cfg.apiModel = $('gxbApiModel').value.trim();
      cfg.extraContext = $('gxbExtra').value.trim();

      running = true;
      btn.textContent = '⏹ 停止';
      btn.className = 'btn-outline';
      setStatus('🚀 启动中...', 'loading');
      try {
        const records = await runEngine(setStatus, onRecord);
        const chk = checkUnanswered();
        setStatus(chk.bad
          ? `✅ 已答 ${records.length} 题，仍有 ${chk.bad} 题未完成，请手工检查`
          : `✅ 完成！共答 ${records.length} 题，全部已填`, chk.bad ? 'error' : 'success');
      } catch (e) {
        setStatus(`❌ ${e.message || e}`, 'error');
        console.error(TAG, e);
      } finally {
        running = false;
        btn.textContent = '▶ 开始答题';
        btn.className = 'btn-green';
      }
    };
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* 控制台调试：打印每题被判成什么题型、选项 DOM */
  window.__gxbDebug = function (n) {
    const rows = Array.from(document.querySelectorAll(SEL.question)).slice(0, n || 3).map((q, i) => {
      const opts = qOptions(q);
      return {
        题号: i + 1,
        题型文字: qTypeText(q) || '(无)',
        识别为: detectType(q),
        选项数: opts.length,
        已选: opts.map(o => (isChecked(o.querySelector(SEL.icon) || o.querySelector('i')) ? '●' : '○')).join(''),
        首项DOM: opts[0] ? opts[0].outerHTML.replace(/\s+/g, ' ').slice(0, 180) : ''
      };
    });
    try { console.table(rows); } catch (e) { console.log(rows); }
    return rows;
  };

  /* ============================================================
     7. 启动
     ============================================================ */
  const isTopFrame = (() => { try { return window.top === window.self; } catch (e) { return true; } })();

  function boot() {
    if (!isTopFrame) return;          // 子 iframe（如富文本编辑器）只解锁粘贴，不挂面板
    if (document.body) mountPanel();
    else setTimeout(boot, 120);
  }
  if (isTopFrame) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    boot();   // body 已就绪（脚本被延迟注入 / bfcache 返回）时立刻挂载
  }
  console.log(TAG, 'v1.1.0 已加载');
})();
