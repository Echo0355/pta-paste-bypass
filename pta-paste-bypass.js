// ==UserScript==
// @name         Pintia AI Auto Solver
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Pintia 自动提取题目、调用AI生成代码、提交并跳转下一题，保留手动输入功能
// @author       xiaole
// @match        https://pintia.cn/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @connect      ark.cn-beijing.volces.com
// @connect      api.openai.com
// @connect      *
// @run-at       document-end
// @license      MIT
// @copyright    2026 xiaole
// ==/UserScript==

(function () {
  'use strict';

  // 干扰元素选择器
  const PTA_TRASH = ['.ln','.lnBorder','.ln-border','.function_HJSmz','.foldIcon_V3Ad2','button','.cm-gutters','.cm-panels','.cm-announced','.language_E7263','.languageName_cZYHa','.toolbar_SkQeK','.pc-button','.select-none.bd-left-1','.action_ZO2qN','.cm-panel','.pc-icon','span[class*="rounded-r-sm"]','span.select-none'];
  // 编程语言映射
  const PTA_LANG_MAP = {'C':'C (gcc)','C++':'C++ (g++)','Java':'Java (javac)','Python':'Python (python3)'};
  let ptaAntiBlockInstalled = false;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // 解析 JSON 答案
  function parseJsonAnswers(reply) {
    try { return JSON.parse((reply.match(/\{[\s\S]*\}/)?.[0]||reply)).answers||[]; }
    catch { return reply.split(',').map(s=>s.trim()); }
  }

  // 获取清理后的文本
  function ptaGetCleanText(element) {
    if (!element) return '';
    const clone = (element.nodeType === 1) ? element.cloneNode(true) : element;
    PTA_TRASH.forEach(s => clone.querySelectorAll(s).forEach(el => el.remove()));
    clone.querySelectorAll('img').forEach(img => {
      if (img.alt) { const s = document.createElement('span'); s.innerText = img.alt; img.parentNode.replaceChild(s, img); }
    });
    const processedBlocks = new Set();
    clone.querySelectorAll('[data-code], .codeEditorCHvdZ, .cm-editor').forEach(cb => {
      if (processedBlocks.has(cb)) return;
      const cm = cb.querySelector('.cm-content');
      if (cm) {
        let lines = Array.from(cm.querySelectorAll('.cm-line')).map(l => l.innerText).join('\n');
        if (!lines) lines = cm.innerText;
        const lang = cb.getAttribute('data-lang') || '';
        const pre = document.createElement('pre');
        pre.innerText = (lang ? `[${lang}]\n` : '') + lines;
        cb.querySelectorAll('*').forEach(c => processedBlocks.add(c));
        cb.parentNode.replaceChild(pre, cb);
        processedBlocks.add(cb);
      }
    });
    clone.querySelectorAll('table').forEach(table => {
      let t = '';
      table.querySelectorAll('tr').forEach(tr => {
        t += Array.from(tr.querySelectorAll('td,th')).map(c => c.innerText.trim()).join('\t') + '\n';
      });
      const pre = document.createElement('pre'); pre.innerText = t;
      table.parentNode.replaceChild(pre, table);
    });
    clone.querySelectorAll('.katex-html').forEach(el => el.remove());
    return clone.innerText.replace(/​/g, '').trim();
  }

  // 查找填空位置
  function ptaFindBlanks(root) {
    const blanks = [];
    root.querySelectorAll('[data-blank-index]').forEach(el => blanks.push(el));
    root.querySelectorAll('.cm-content span[contenteditable=false]').forEach(el => {
      if (!el.querySelector('input,textarea') && !blanks.includes(el)) blanks.push(el);
    });
    root.querySelectorAll('input,textarea').forEach(input => {
      let p = input.parentElement;
      while (p && p !== root) {
        if (blanks.includes(p)) return;
        if (p.classList.contains('inline-flex') || p.tagName === 'SPAN' || p.classList.contains('cm-widgetBuffer')) { blanks.push(p); return; }
        p = p.parentElement;
      }
      if (!blanks.some(b => b.contains(input))) blanks.push(input);
    });
    return blanks;
  }

  // 查找 CodeMirror 实例
  function ptaFindCM(editor) {
    let node = editor;
    while (node) {
      if (node.CodeMirror && typeof node.CodeMirror.setValue === 'function') return {type:'cm5', instance:node.CodeMirror};
      const cv = node.cmView;
      if (cv?.view?.state?.doc && typeof cv.view.dispatch === 'function') return {type:'cm6', instance:cv.view};
      if (cv?.rootView?.view?.state?.doc && typeof cv.rootView.view.dispatch === 'function') return {type:'cm6', instance:cv.rootView.view};
      if (node.view?.state?.doc && typeof node.view.dispatch === 'function') return {type:'cm6', instance:node.view};
      node = node.parentElement;
    }
    return null;
  }

  function ptaNorm(text) { return String(text).replace(/\r\n/g,'\n').replace(/ /g,' ').trim(); }

  // 触发编辑器事件
  function ptaTrigger(editor, text) {
    try { editor.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true})); } catch {}
    try { editor.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertText',data:text})); } catch {}
    try { editor.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text})); } catch {}
    editor.dispatchEvent(new Event('input',{bubbles:true}));
    editor.dispatchEvent(new Event('change',{bubbles:true}));
    try { editor.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true})); } catch {}
  }

  // 通过 CodeMirror API 填充代码
  function ptaFillCMApi(editor, code) {
    const f = ptaFindCM(editor); if (!f) return false;
    try {
      if (f.type === 'cm6') {
        f.instance.dispatch({changes:{from:0,to:f.instance.state.doc.length,insert:code}, selection:{anchor:Math.max(0,code.length)}});
        if (typeof f.instance.focus==='function') f.instance.focus();
        return true;
      }
      if (f.type === 'cm5') { f.instance.setValue(code); if (typeof f.instance.focus==='function') f.instance.focus(); return true; }
    } catch {}
    return false;
  }

  // 清除事件阻止程序
  function ptaClearBlockers(scope) {
    try {
      const root = (scope?.querySelectorAll) ? scope : document;
      const targets = [document, window];
      if (document.body) targets.push(document.body);
      root.querySelectorAll('input,textarea,[contenteditable],.cm-editor,.cm-content').forEach(el => targets.push(el));
      const props = ['oncopy','oncut','onpaste','oncontextmenu','onselectstart','onkeydown','onbeforeinput'];
      for (const el of targets) {
        for (const p of props) { try { el[p] = null; } catch {} }
        if (el?.style && (el.classList?.contains('cm-editor') || el.classList?.contains('cm-content') || el.isContentEditable)) {
          try { el.style.userSelect = 'text'; } catch {}
          try { el.style.webkitUserSelect = 'text'; } catch {}
        }
      }
    } catch {}
  }

  // 安装绕过机制
  function ptaInstallBypass() {
    if (ptaAntiBlockInstalled) return; ptaAntiBlockInstalled = true;
    const isEd = t => { if (!t || !(t instanceof Element)) return false; if (t.isContentEditable) return true; const tag=t.tagName.toLowerCase(); if(tag==='textarea') return true; if(tag==='input'){const tp=(t.getAttribute('type')||'text').toLowerCase();return!['button','submit','checkbox','radio','file','image','reset','color'].includes(tp);} return Boolean(t.closest('textarea,input,[contenteditable=true],.cm-editor,.cm-content')); };
    const g = e => { if (!isEd(e.target)) return; e.stopImmediatePropagation(); };
    const kg = e => { if (!isEd(e.target)) return; if ((e.ctrlKey||e.metaKey)&&['v','c','x','a'].includes(String(e.key).toLowerCase())) e.stopImmediatePropagation(); };
    ['copy','cut','paste','beforeinput','selectstart','contextmenu'].forEach(t => window.addEventListener(t,g,true));
    window.addEventListener('keydown',kg,true);
    ptaClearBlockers(document);
    setInterval(() => ptaClearBlockers(document), 1500);
  }

  // 填充代码到编辑器
  async function ptaFillCodeEditor(code) {
    ptaInstallBypass();
    const container = document.querySelector('[data-e2e="code-editor-input"]');
    let editors = container
      ? Array.from(container.querySelectorAll('.cm-content[contenteditable=true]'))
      : Array.from(document.querySelectorAll('.cm-content[contenteditable=true]'));
    if (!editors.length) { const any = document.querySelector('.cm-content'); if(any) editors = [any]; }
    if (!editors.length) return false;
    const editor = editors[editors.length-1];
    const cmRoot = editor.closest('.cm-editor');
    if (cmRoot) ptaClearBlockers(cmRoot);
    editor.focus();
    const finalCode = String(code).replace(/\r\n/g,'\n');
    try {
      const isFilled = () => { const c = ptaNorm(editor.innerText||editor.textContent); return c.length > 0 && /\S/.test(c); };
      // 策略0: CodeMirror API
      if (ptaFillCMApi(editor, finalCode)) { await sleep(80); if (isFilled()) return true; }
      // 策略1: execCommand
      document.execCommand('selectAll',false,null); document.execCommand('delete',false,null);
      await sleep(100);
      document.execCommand('insertText',false,finalCode);
      await sleep(120); if (isFilled()) return true;
      // 策略2: 逐行插入
      document.execCommand('selectAll',false,null); document.execCommand('delete',false,null);
      await sleep(60);
      const lines = finalCode.split('\n');
      for (let i=0; i<lines.length; i++) {
        document.execCommand('insertText',false,lines[i]);
        if (i<lines.length-1) document.execCommand('insertLineBreak',false,null);
        await sleep(20);
      }
      await sleep(120); if (isFilled()) return true;
      // 策略3: textContent + 事件
      editor.textContent = finalCode; ptaTrigger(editor, finalCode);
      await sleep(60);
      // 策略4: 再试 CM API
      ptaFillCMApi(editor, finalCode); await sleep(80);
      return isFilled();
    } catch (e) { console.error('[PTA] fillCodeEditor:', e); return false; }
  }

  // 切换编程语言
  async function ptaSwitchLang(targetLang) {
    const ptaName = PTA_LANG_MAP[targetLang]; if (!ptaName) return false;
    const cur = document.querySelector('.select__single-value .pc-text-raw');
    if (cur) {
      if (targetLang==='Python' && cur.innerText.includes('Python')) return true;
      if (cur.innerText.includes(targetLang)) return true;
    }
    const triggers = [
      document.querySelector('.select__dropdown-indicator'),
      document.querySelector('.select__control'),
      document.querySelector('input[id*="react-select"][role="combobox"]')
    ].filter(Boolean);
    let opened = false;
    for (const el of triggers) {
      try { el.dispatchEvent(new MouseEvent('mousedown',{bubbles:true})); el.click(); await sleep(600); } catch {}
      if (document.querySelectorAll('.select__option').length > 0) { opened=true; break; }
    }
    if (!opened) return false;
    await sleep(1000);
    const options = Array.from(document.querySelectorAll('.select__option'));
    let target = null;
    if (targetLang==='Python') {
      for (const p of ['Python (python3)','Python (python2)','Python']) {
        target = options.find(o => (o.getAttribute('aria-label')||o.innerText).includes(p)); if (target) break;
      }
    } else { target = options.find(o => (o.getAttribute('aria-label')||o.innerText).includes(targetLang)); }
    if (target) {
      target.scrollIntoView({block:'nearest'});
      target.dispatchEvent(new MouseEvent('mousedown',{bubbles:true})); target.click();
      await sleep(1000); return true;
    }
    document.body.dispatchEvent(new MouseEvent('mousedown',{bubbles:true})); return false;
  }

  // 移除代码注释
  function ptaRemoveComments(code, lang) {
    if (!code) return code;
    const stripLine = (line, isC) => {
      let inStr=false, q='';
      for (let i=0; i<line.length; i++) {
        if ((line[i]==='"'||line[i]==="'") && (i===0||line[i-1]!=='\\')) { if(!inStr){inStr=true;q=line[i];}else if(line[i]===q)inStr=false; }
        if (!inStr && (isC ? (line[i]==='/'&&line[i+1]==='/') : line[i]==='#')) return line.substring(0,i).trimEnd();
      }
      return line;
    };
    if (lang==='Python') {
      return code.split('\n').map(l=>stripLine(l,false)).filter(l=>l.trim()!=='').join('\n').trim();
    } else {
      return code.replace(/\/\*[\s\S]*?\*\//g,'').split('\n').map(l=>stripLine(l,true)).filter(l=>l.trim()!=='').join('\n').trim();
    }
  }

  // 保存并跳转下一题
  async function ptaSaveAndNext() {
    const submitFinal = Array.from(document.querySelectorAll('button')).find(b=>b.innerText.includes('提交考试')||b.innerText.includes('Submit For This Problem'));
    if (submitFinal) return false;
    const saveBtn = document.querySelector('button[data-e2e="problem-set-bottom-submit-btn"]');
    if (saveBtn) { saveBtn.click(); await sleep(1500); }
    const config = GM_getValue('aiConfig',{});
    if (!config.ptaAutoNext) return false;
    const navIds = ['TRUEORFALSE','MULTIPLECHOICE','MULTIPLECHOICEMORETHANONEANSWER','FILLINTHEBLANK','FILLINTHEBLANKS','FILLINTHEBLANKFORPROGRAMMING','CODECOMPLETION','PROGRAMMING','CODEPROGRAMMING'];
    const activeTab = document.querySelector('a.active-anchor, a.active');
    if (activeTab) {
      const ci = navIds.indexOf(activeTab.id);
      if (ci !== -1) { for (let i=ci+1; i<navIds.length; i++) { const next=document.getElementById(navIds[i]); if(next){next.click();return true;} } }
    }
    return false;
  }

  // AI 客户端
  const APIClient = {
    ask(prompt, config) {
      return new Promise((resolve, reject) => {
        let apiUrl, model;
        if (config.apiType==='custom') {
          apiUrl=(config.apiUrl||'').trim(); model=(config.apiModel||'').trim();
          if (!apiUrl) return reject('❌ 自定义API：请在配置中填写 API URL');
          if (!model)  return reject('❌ 自定义API：请在配置中填写 模型名称');
        }
        else if (config.apiType==='deepseek') { apiUrl='https://api.deepseek.com/chat/completions'; model='deepseek-chat'; }
        else { apiUrl='https://api.openai.com/v1/chat/completions'; model='gpt-4o-mini'; }
        if (!prompt || !prompt.trim()) return reject('❌ 题目内容为空，请刷新页面重试');
        const isCompletionsAPI = /\/completions\/?(\?|#|$)/.test(apiUrl) && !/\/chat\//.test(apiUrl);
        const isResponsesAPI   = /\/responses\/?(\?|#|$)/.test(apiUrl);
        function parseResp(d) {
          const txt = d.choices?.[0]?.text
                    || d.choices?.[0]?.message?.content
                    || d.choices?.[0]?.message?.reasoning_content
                    || d.output?.[0]?.content?.find?.(c=>c.type==='output_text')?.text
                    || d.output?.[0]?.content?.[0]?.text
                    || d.output_text
                    || '';
          return txt.trim();
        }
        const reqBody = isCompletionsAPI
          ? {model, prompt, max_tokens:2000, temperature:0.1}
          : isResponsesAPI
            ? {model, input:prompt}
            : {model, messages:[{role:'user',content:prompt}], temperature:0.1, max_tokens:2000};
        console.log('[PTA助手]', apiUrl, 'model='+model, isCompletionsAPI?'completions':isResponsesAPI?'responses':'chat');
        GM_xmlhttpRequest({
          method:'POST', url:apiUrl,
          headers:{'Content-Type':'application/json','Authorization':`Bearer ${config.apiKey}`},
          data: JSON.stringify(reqBody),
          onload(res) {
            console.log('[PTA助手] ←', res.status, res.responseText?.slice(0,200));
            try {
              const d = JSON.parse(res.responseText);
              if (d.error) { reject('API错误('+res.status+'): '+(d.error.message||JSON.stringify(d.error))); return; }
              const txt = parseResp(d);
              if (!txt) { reject('API返回内容为空: '+res.responseText.slice(0,150)); return; }
              resolve(txt);
            } catch(e) { reject('解析失败('+res.status+'): '+(res.responseText||'').slice(0,150)); }
          },
          onerror() { reject('网络请求失败: '+apiUrl); }
        });
      });
    }
  };

  // 全局中断标志
  let isRunning = false;

  // 判断题解答
  async function solvePTATrueFalse(config, records, onProgress, onRecord) {
    const questions = Array.from(document.querySelectorAll('div.pc-x[id]'));
    if (!questions.length) throw new Error('未找到判断题容器（div.pc-x[id]），请确认在判断题标签页');
    onProgress(`⏳ 分析 ${questions.length} 道判断题...`, 'loading');
    const parts = questions.map((qBlock, i) => {
      const qClone = qBlock.cloneNode(true);
      const optArea = qClone.querySelector("span.flex.flex-wrap[class*='-m-0.5']") || qClone.querySelector('.flex.flex-wrap.mt-4') || qClone.querySelector('.flex.flex-wrap');
      if (optArea) optArea.remove();
      const hdr = qClone.querySelector('.flex.flex-wrap.gap-2') || qClone.querySelector('.flex.flex-wrap.gap-x-5') || qClone.querySelector('.flex.flex-wrap.gap-2.grow');
      if (hdr) hdr.remove();
      return `Q${i+1}【判断】${ptaGetCleanText(qClone)}`;
    });
    const prompt = `你是专业考试助手，请按顺序回答以下${questions.length}道判断题。\n返回JSON：{"answers":["T","F",...]}\nT=正确，F=错误，只返回JSON！\n\n${parts.join('\n\n')}`;
    const reply = await APIClient.ask(prompt, config);
    const answers = parseJsonAnswers(reply);
    questions.forEach((qBlock, i) => {
      const answer = String(answers[i]||'').toUpperCase().trim();
      const labels = Array.from(qBlock.querySelectorAll('label'));
      let found = false;
      for (const label of labels) {
        const t = label.innerText.trim().toUpperCase();
        if ((answer==='T' && (t.startsWith('T') || t.includes('正确') || t.includes('对'))) ||
            (answer==='F' && (t.startsWith('F') || t.includes('错误') || t.includes('错')))) {
          const inp = label.querySelector('input'); if (inp) inp.focus();
          label.click(); found = true; break;
        }
      }
      records.push({title:ptaGetCleanText(qBlock).slice(0,50), answer:found?answer:`${answer}(未匹配)`, type:'single'});
      onRecord([...records]);
    });
  }

  // 单选题解答
  async function solvePTAMultipleChoice(config, records, onProgress, onRecord) {
    const questions = Array.from(document.querySelectorAll('div.pc-x[id]'));
    if (!questions.length) throw new Error('未找到单选题容器（div.pc-x[id]）');
    onProgress(`⏳ 分析 ${questions.length} 道单选题...`, 'loading');
    const parts = questions.map((qBlock, i) => {
      const qClone = qBlock.cloneNode(true);
      const optArea = qClone.querySelector("span.flex.flex-wrap[class*='-m-0.5']") || qClone.querySelector('.flex.flex-wrap.mt-4') || qClone.querySelector('.flex.flex-wrap');
      if (optArea) optArea.remove();
      const hdr = qClone.querySelector('.flex.flex-wrap.gap-2') || qClone.querySelector('.flex.flex-wrap.gap-x-5');
      if (hdr) hdr.remove();
      const titleText = ptaGetCleanText(qClone);
      let optText = '';
      Array.from(qBlock.querySelectorAll('label')).forEach(label => {
        const ind = label.querySelector('span')?.innerText.trim() || '';
        const oc = label.cloneNode(true); const sp = oc.querySelector('span'); if(sp) sp.remove();
        optText += `${ind} ${ptaGetCleanText(oc)}  `;
      });
      return `Q${i+1}【单选】${titleText}\n${optText.trim()}`;
    });
    const prompt = `你是专业考试助手，按顺序回答以下${questions.length}道单选题。\n返回JSON：{"answers":["A","B",...]}\n返回选项字母，只返回JSON！\n\n${parts.join('\n\n')}`;
    const reply = await APIClient.ask(prompt, config);
    const answers = parseJsonAnswers(reply);
    questions.forEach((qBlock, i) => {
      const answer = String(answers[i]||'').toUpperCase().trim();
      let found = false;
      for (const label of Array.from(qBlock.querySelectorAll('label'))) {
        const ind = (label.querySelector('span')?.innerText.trim() || label.innerText.trim()).toUpperCase();
        if (ind.startsWith(answer)) { label.click(); found=true; break; }
      }
      records.push({title:ptaGetCleanText(qBlock).slice(0,50), answer:found?answer:`${answer}(未匹配)`, type:'single'});
      onRecord([...records]);
    });
  }

  // 多选题解答
  async function solvePTAMultipleChoiceMore(config, records, onProgress, onRecord) {
    const questions = Array.from(document.querySelectorAll('div.pc-x[id]'));
    if (!questions.length) throw new Error('未找到多选题容器（div.pc-x[id]）');
    onProgress(`⏳ 分析 ${questions.length} 道多选题...`, 'loading');
    const parts = questions.map((qBlock, i) => {
      const qClone = qBlock.cloneNode(true);
      const optArea = qClone.querySelector("span.flex.flex-wrap[class*='-m-0.5']") || qClone.querySelector('.flex.flex-wrap.mt-4') || qClone.querySelector('.flex.flex-wrap');
      if (optArea) optArea.remove();
      const hdr = qClone.querySelector('.flex.flex-wrap.gap-2') || qClone.querySelector('.flex.flex-wrap.gap-x-5');
      if (hdr) hdr.remove();
      const titleText = ptaGetCleanText(qClone);
      let optText = '';
      Array.from(qBlock.querySelectorAll('label')).forEach(label => {
        const ind = label.querySelector('span')?.innerText.trim() || '';
        const oc = label.cloneNode(true); const sp = oc.querySelector('span'); if(sp) sp.remove();
        optText += `${ind} ${ptaGetCleanText(oc)}  `;
      });
      return `Q${i+1}【多选】${titleText}\n${optText.trim()}`;
    });
    const prompt = `你是专业考试助手，按顺序回答以下${questions.length}道多选题。\n返回JSON：{"answers":["AB","ACD",...]}\n多选字母连写，只返回JSON！\n\n${parts.join('\n\n')}`;
    const reply = await APIClient.ask(prompt, config);
    const answers = parseJsonAnswers(reply);
    questions.forEach((qBlock, i) => {
      const answer = String(answers[i]||'').toUpperCase().replace(/[^A-Z]/g,'');
      Array.from(qBlock.querySelectorAll('label')).forEach(label => {
        const ind = (label.querySelector('span')?.innerText.trim() || label.innerText.trim()).toUpperCase();
        const firstChar = ind[0];
        const cb = label.querySelector('input[type="checkbox"]');
        if (answer.includes(firstChar)) { if(cb && !cb.checked) label.click(); }
        else { if(cb && cb.checked) label.click(); }
      });
      records.push({title:ptaGetCleanText(qBlock).slice(0,50), answer, type:'multiple'});
      onRecord([...records]);
    });
  }

  // 填空题解答
  async function solvePTAFillInBlank(config, records, onProgress, onRecord, isProg) {
    const typeName = isProg ? '函数填空' : '填空';
    const questions = Array.from(document.querySelectorAll('div.pc-x[id]'));
    if (!questions.length) throw new Error(`未找到${typeName}题容器（div.pc-x[id]）`);
    onProgress(`⏳ 分析 ${questions.length} 道${typeName}题...`, 'loading');
    for (let i=0; i<questions.length; i++) {
      const qBlock = questions[i];
      const textEl = qBlock.querySelector('.rendered-markdown') || qBlock.querySelector('.generalProblemBodyWIhdN') || qBlock.querySelector('.generalProblemBody_WIhdN') || qBlock;
      const clone = textEl.cloneNode(true);
      const realBlanks = ptaFindBlanks(qBlock);
      if (!realBlanks.length) continue;
      ptaFindBlanks(clone).forEach((b, idx) => {
        const m = document.createTextNode(`【空${idx+1}】`);
        if (b.parentNode) b.parentNode.replaceChild(m, b);
      });
      PTA_TRASH.forEach(s => clone.querySelectorAll(s).forEach(el => el.remove()));
      clone.querySelectorAll('[data-code]').forEach(cb => {
        const cm = cb.querySelector('.cm-content');
        if (cm) { const lang=cb.getAttribute('data-lang')||''; let content=Array.from(cm.querySelectorAll('.cm-line')).map(l=>l.innerText).join('\n');if(!content)content=cm.innerText; const pre=document.createElement('pre');pre.innerText=(lang?`[${lang}]\n`:'')+content;cb.parentNode.replaceChild(pre,cb); }
      });
      const questionText = clone.innerText.trim();
      onProgress(`⏳ AI分析第${i+1}/${questions.length}道${typeName}题（${realBlanks.length}空）...`, 'loading');
      const prompt = `你是专业考试助手，回答以下${isProg?'函数填空（编程）':'填空'}题。\n【空N】=第N个空，共${realBlanks.length}空。\n返回JSON：{"answers":["第1空","第2空",...]}\n代码空直接给代码片段，只返回JSON！\n\n${questionText}`;
      const reply = await APIClient.ask(prompt, config);
      const aiAnswers = parseJsonAnswers(reply);
      for (let j=0; j<realBlanks.length; j++) {
        if (!aiAnswers[j]) continue;
        const bp = realBlanks[j];
        const el = (bp.tagName==='INPUT'||bp.tagName==='TEXTAREA') ? bp : bp.querySelector('input,textarea');
        if (el) {
          const v=String(aiAnswers[j]), last=el.value;
          el.value = v;
          const tracker = el._valueTracker; if(tracker) tracker.setValue(last);
          el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true}));
        }
      }
      records.push({title:questionText.slice(0,50), answer:aiAnswers.join(' | '), type:'fill'});
      onRecord([...records]);
      await sleep(500);
    }
  }

  // 当前编程题解答
  async function solvePTACurrentCode(config, records, onProgress, onRecord, tabId) {
    const isFunc = tabId==='CODECOMPLETION';
    const targetLang = isFunc ? (config.ptaFuncLang||'C') : (config.ptaProgLang||'C');
    onProgress(`⏳ 切换语言: ${targetLang}...`, 'loading');
    await ptaSwitchLang(targetLang);
    let editorExists = false;
    for (let j=0; j<8; j++) { if(document.querySelector('.cm-content')){editorExists=true;break;} await sleep(600); }
    if (!editorExists) throw new Error('未找到代码编辑器');
    const contentArea = document.querySelector('.rendered-markdown') || document.querySelector('.generalProblemBody_WIhdN') || document.querySelector('.problem-body') || document.querySelector('.problemBody_SNqD');
    const infoList = document.querySelector('.problemInfo_HVczC');
    const infoText = infoList ? infoList.innerText.replace(/\n/g,' ').trim() : '';
    const titleEl = document.querySelector('.text-darkest.font-bold.text-lg') || document.querySelector('.problem-title');
    const title = titleEl ? titleEl.innerText.trim() : '当前编程题';
    const questionText = contentArea ? ptaGetCleanText(contentArea) : '';
    onProgress(`⏳ AI生成代码（${title.slice(0,15)}）...`, 'loading');
    const prompt = `你是编程专家，回答以下${isFunc?'函数填空':'编程'}题。\n语言：${targetLang}\n返回JSON：{"answers":["完整代码"]}\nanswers[0]放完整代码，不要Markdown代码块，只返回JSON！\n\n题目：${title}\n${infoText?`限制：${infoText}\n`:''}${questionText}`;
    const reply = await APIClient.ask(prompt, config);
    const answers = parseJsonAnswers(reply);
    let code = String(answers[0]||reply).trim();
    code = code.replace(/^```[\w]*\n?/,'').replace(/\n?```$/,'').trim();
    if (config.ptaRemoveComments !== false) code = ptaRemoveComments(code, targetLang);
    const filled = await ptaFillCodeEditor(code);
    records.push({title:title.slice(0,50), answer:filled?'已填写✓':'填写失败✗', type:'fill'});
    onRecord([...records]);
    if (filled) { await sleep(800); const s=document.querySelector('button[data-e2e="problem-set-bottom-submit-btn"]'); if(s){s.click();onProgress('💾 已保存','success');} }
  }

  // 批量编程题解答
  async function solvePTAAllCode(config, records, onProgress, onRecord, tabId) {
    const isFunc = tabId==='CODECOMPLETION';
    const targetLang = isFunc ? (config.ptaFuncLang||'C') : (config.ptaProgLang||'C');
    const problemBtns = Array.from(document.querySelectorAll('a[href*="problemSetProblemId"]'));
    if (!problemBtns.length) throw new Error('未找到编程题列表，请先切换到编程题标签页');
    onProgress(`⏳ 共${problemBtns.length}道${isFunc?'函数题':'编程题'}，语言：${targetLang}`, 'loading');
    for (let i=0; i<problemBtns.length; i++) {
      onProgress(`⏳ 处理第${i+1}/${problemBtns.length}题...`, 'loading');
      problemBtns[i].click();
      await sleep(2500);
      await ptaSwitchLang(targetLang);
      let editorExists = false;
      for (let j=0; j<10; j++) { if(document.querySelector('.cm-content')){editorExists=true;break;} await sleep(1000); }
      if (!editorExists) { records.push({title:`第${i+1}题`,answer:'编辑器未找到',type:'fill'}); onRecord([...records]); continue; }
      const contentArea = document.querySelector('.rendered-markdown') || document.querySelector('.generalProblemBody_WIhdN') || document.querySelector('.problem-body') || document.querySelector('.problemBody_SNqD');
      const infoList = document.querySelector('.problemInfo_HVczC');
      const infoText = infoList ? infoList.innerText.replace(/\n/g,' ').trim() : '';
      const titleEl = document.querySelector('.text-darkest.font-bold.text-lg') || document.querySelector('.problem-title');
      const title = titleEl ? titleEl.innerText.trim() : `第${i+1}题`;
      const questionText = contentArea ? ptaGetCleanText(contentArea) : '';
      onProgress(`⏳ AI生成第${i+1}题代码...`, 'loading');
      const prompt = `你是编程专家，回答以下${isFunc?'函数填空':'编程'}题。\n语言：${targetLang}\n返回JSON：{"answers":["完整代码"]}\nanswers[0]放完整代码，不要Markdown代码块，只返回JSON！\n\n题目：${title}\n${infoText?`限制：${infoText}\n`:''}${questionText}`;
      const reply = await APIClient.ask(prompt, config);
      const answers = parseJsonAnswers(reply);
      let code = String(answers[0]||reply).trim();
      code = code.replace(/^```[\w]*\n?/,'').replace(/\n?```$/,'').trim();
      if (config.ptaRemoveComments !== false) code = ptaRemoveComments(code, targetLang);
      const filled = await ptaFillCodeEditor(code);
      if (filled) {
        await sleep(800);
        const subBtn = Array.from(document.querySelectorAll('button')).find(b=>b.innerText.includes('提交')||b.querySelector('.pc-text-raw')?.innerText.includes('提交'));
        if (subBtn) {
          subBtn.scrollIntoView({behavior:'smooth',block:'center'}); subBtn.click();
          for (let a=0; a<15; a++) { await sleep(1000); const cb=document.querySelector('button[data-e2e="modal-close-btn"]'); if(cb){cb.click();break;} }
        }
      }
      records.push({title, answer:filled?'已填写✓':'填写失败✗', type:'fill'});
      onRecord([...records]);
      await sleep(1500);
    }
  }

  // PTA Tab 检测
  function ptaGetActiveTabId() {
    const pathMatch = location.pathname.match(/\/type\/(\d+)/);
    const urlType = pathMatch?.[1] || new URLSearchParams(location.search).get('type');
    const urlMap = {'1':'TRUEORFALSE','2':'MULTIPLECHOICE','3':'MULTIPLECHOICEMORETHANONEANSWER','4':'FILLINTHEBLANK','5':'FILLINTHEBLANKS','6':'FILLINTHEBLANKFORPROGRAMMING','7':'PROGRAMMING','8':'CODECOMPLETION','9':'CODEPROGRAMMING'};
    if (urlType && urlMap[urlType]) return {id:urlMap[urlType], method:`URL(type=${urlType})`};
    const VALID = ['TRUEORFALSE','MULTIPLECHOICE','MULTIPLECHOICEMORETHANONEANSWER','FILLINTHEBLANK','FILLINTHEBLANKS','FILLINTHEBLANKFORPROGRAMMING','CODECOMPLETION','PROGRAMMING','CODEPROGRAMMING'];
    const aa = document.querySelector('a.active-anchor[id]') || document.querySelector('a.active[id]');
    if (aa && VALID.includes(aa.id)) return {id:aa.id, method:'active-anchor'};
    for (const id of VALID) {
      const el = document.getElementById(id);
      if (!el) continue;
      if (el.classList.contains('active') || el.classList.contains('active-anchor')) return {id, method:`classList(${id})`};
      if (el.getAttribute('aria-selected')==='true') return {id, method:`aria-selected(${id})`};
      if (el.style.getPropertyValue('--color')?.includes('primary') || getComputedStyle(el).getPropertyValue('--color')?.includes('primary')) return {id, method:`cssVar(${id})`};
    }
    return {id:null, method:'failed'};
  }

  // PTA 主引擎
  async function runPTAEngine(onProgress, onRecord) {
    const config = GM_getValue('aiConfig',{});
    if (!config.apiKey) throw new Error('请先配置 API Key');
    const records = [];
    const {id:activeTabId, method:detectMethod} = ptaGetActiveTabId();
    const activeTabEl = activeTabId ? document.getElementById(activeTabId) : null;
    const activeTabText = activeTabEl?.innerText?.trim() || activeTabId || '';
    onProgress(`🔍 检测题型：${activeTabId||'未知'}（${detectMethod}）`, 'loading');
    await sleep(300);
    if (!activeTabId) throw new Error(`未识别题型！当前 URL type=${new URLSearchParams(location.search).get('type')||'无'}，请切换到题型标签后重试`);
    switch (activeTabId) {
      case 'TRUEORFALSE': await solvePTATrueFalse(config, records, onProgress, onRecord); break;
      case 'MULTIPLECHOICE': await solvePTAMultipleChoice(config, records, onProgress, onRecord); break;
      case 'MULTIPLECHOICEMORETHANONEANSWER': await solvePTAMultipleChoiceMore(config, records, onProgress, onRecord); break;
      case 'FILLINTHEBLANK': case 'FILLINTHEBLANKS': await solvePTAFillInBlank(config, records, onProgress, onRecord, false); break;
      case 'FILLINTHEBLANKFORPROGRAMMING': await solvePTAFillInBlank(config, records, onProgress, onRecord, true); break;
      case 'CODECOMPLETION':
        if (config.ptaBatchCode) await solvePTAAllCode(config, records, onProgress, onRecord, 'CODECOMPLETION');
        else await solvePTACurrentCode(config, records, onProgress, onRecord, 'CODECOMPLETION');
        break;
      case 'PROGRAMMING': case 'CODEPROGRAMMING':
        if (config.ptaBatchCode) await solvePTAAllCode(config, records, onProgress, onRecord, 'PROGRAMMING');
        else await solvePTACurrentCode(config, records, onProgress, onRecord, 'PROGRAMMING');
        break;
      default: throw new Error(`未知题型 ID：${activeTabId}`);
    }
    await ptaSaveAndNext();
    return records;
  }

  // 清除已存在的 UI 元素
  ['aiQuizPanel','aiQuizStyle'].forEach(id=>{document.getElementById(id)?.remove();});

  // 创建样式
  const styleEl = document.createElement('style'); styleEl.id='aiQuizStyle';
  styleEl.textContent = `
    #aiQuizPanel{position:fixed;top:20px;right:20px;width:295px;background:#f8f9ff;border-radius:14px;color:#333;font-family:-apple-system,sans-serif;font-size:13px;display:flex;flex-direction:column;user-select:none;overflow:hidden;border:1px solid #e0e3f0;z-index:99999;box-shadow:0 10px 40px rgba(0,0,0,.15);}
    #panelHandle{padding:10px 14px;background:linear-gradient(135deg,#667eea,#764ba2);cursor:move;display:flex;justify-content:space-between;align-items:center;font-weight:bold;font-size:13px;color:#fff;}
    .ai-sec{border-bottom:1px solid #e8eaf0;}
    .ai-sec-hdr{padding:9px 14px;display:flex;align-items:center;cursor:pointer;font-size:12px;font-weight:bold;color:#555;background:#f0f2fa;}
    .ai-sec-hdr .arr{margin-left:5px;font-size:10px;transition:transform .25s;}
    .ai-sec-hdr.open .arr{transform:rotate(180deg);}
    .ai-sec-body{padding:10px 14px;background:#fff;display:none;}
    .ai-sec-body.open{display:block;}
    #aiQuizPanel select,#aiQuizPanel input[type=text],#aiQuizPanel input[type=password]{width:100%;padding:7px 9px;margin:3px 0;border:1px solid #d0d5e8;border-radius:7px;background:#f8f9ff;color:#333;box-sizing:border-box;font-size:12px;}
    #aiQuizPanel button{width:100%;padding:9px;margin:4px 0;border:none;border-radius:8px;font-weight:bold;cursor:pointer;font-size:13px;transition:all .2s;}
    .btn-green{background:linear-gradient(135deg,#4ade80,#22c55e);color:#fff;}
    .btn-green:disabled{background:#c8d0dc;cursor:not-allowed;color:#888;}
    .btn-outline{background:#fff;color:#667eea;border:1px solid #667eea!important;}
    #aiActionBox{padding:10px 14px 6px;background:#fff;border-bottom:1px solid #e8eaf0;}
    #aiProgressTip{text-align:center;padding:6px 10px;border-radius:7px;margin:4px 0;font-size:12px;min-height:28px;}
    .s-success{background:#f0fdf4;color:#16a34a;}.s-error{background:#fef2f2;color:#dc2626;}.s-loading{background:#eff6ff;color:#2563eb;}
    #aiRecordBox{padding:10px 14px 12px;background:#f8f9ff;}
    .rec-title{font-size:11px;color:#888;margin-bottom:6px;display:flex;justify-content:space-between;font-weight:bold;}
    #aiRecordList{max-height:140px;overflow-y:auto;}
    .rec-row{display:flex;align-items:center;padding:5px 8px;background:#fff;border-radius:6px;margin:4px 0;font-size:12px;border:1px solid #eef0f8;height:30px;overflow:hidden;}
    .rec-row .rt{font-size:10px;color:#aaa;margin-right:6px;flex-shrink:0;}
    .rec-row .rq{flex:1;min-width:0;color:#444;margin-right:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .rec-row .ra{flex-shrink:0;max-width:42%;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;border-radius:4px;padding:0 7px;font-weight:bold;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;height:18px;line-height:18px;display:inline-block;}
    .rec-row .ra.m{background:linear-gradient(135deg,#f59e0b,#d97706)!important;}
    .rec-row .ra.f{background:linear-gradient(135deg,#06b6d4,#0891b2)!important;}
    .ck-row{display:flex;align-items:center;gap:8px;margin:4px 0;font-size:12px;cursor:pointer;}
    .ck-row input{width:auto!important;margin:0!important;}
  `;
  document.head.appendChild(styleEl);

  // 创建面板
  const panel = document.createElement('div'); panel.id='aiQuizPanel';
  panel.innerHTML = `
    <div id="panelHandle"><span>🤖 PTA 答题助手</span><span style="font-size:11px;opacity:.7">v1.0.0</span></div>
    <div class="ai-sec">
      <div class="ai-sec-hdr" id="cfgHdr">⚙️ API 配置 <span class="arr">▼</span></div>
      <div class="ai-sec-body" id="cfgBody">
        <select id="apiTypeSelect"><option value="openai">OpenAI (gpt-4o-mini)</option><option value="deepseek">DeepSeek</option><option value="custom">自定义</option></select>
        <input id="apiKeyInput" type="password" placeholder="API Key" />
        <div id="customFields" style="display:none"><input id="apiUrlInput" type="text" placeholder="API URL"/><input id="apiModelInput" type="text" placeholder="模型名称"/></div>
        <div style="margin-top:8px;padding-top:6px;font-size:11px;color:#888;font-weight:bold;border-top:1px dashed #e0e3f0;">── PTA 专属 ──</div>
        <label style="font-size:11px;color:#555;display:block;margin:4px 0 2px">函数填空语言</label>
        <select id="ptaFuncLang"><option value="C">C</option><option value="C++">C++</option><option value="Java">Java</option><option value="Python">Python</option></select>
        <label style="font-size:11px;color:#555;display:block;margin:6px 0 2px">编程题语言</label>
        <select id="ptaProgLang"><option value="C">C</option><option value="C++">C++</option><option value="Java">Java</option><option value="Python">Python</option></select>
        <label class="ck-row"><input type="checkbox" id="ptaRmCmt"/>去除代码注释</label>
        <label class="ck-row"><input type="checkbox" id="ptaBatch"/>编程题批量模式（遍历全部）</label>
        <label class="ck-row"><input type="checkbox" id="ptaAutoNext"/>答完自动切换下一题型</label>
        <button class="btn-green" id="saveCfgBtn">💾 保存配置</button>
      </div>
    </div>
    <div class="ai-sec">
      <div class="ai-sec-hdr" id="ctxHdr">📝 题目背景 <span class="arr">▼</span></div>
      <div class="ai-sec-body" id="ctxBody" style="display:none;">
        <textarea id="extraContextInput" rows="4" placeholder="可选：本次作业的背景知识，AI答题时参考。&#10;例如：Ⅰ=重要且紧急→立即做&#10;Ⅱ=重要不紧急→计划做&#10;Ⅲ=紧急不重要→授权做&#10;Ⅳ=不重要不紧急→减少做" style="width:100%;resize:vertical;font-size:12px;padding:6px 8px;border:1px solid #d0d5e8;border-radius:6px;background:#f8f9ff;color:#333;line-height:1.5;"></textarea>
        <div style="display:flex;gap:6px;margin-top:6px;">
          <button id="pasteCtxBtn" style="flex:1;font-size:11px;padding:4px 0;border:1px solid #d0d5e8;border-radius:6px;background:#f8f9ff;color:#333;cursor:pointer;" title="从剪贴板粘贴内容">📋 粘贴</button>
          <button id="clearCtxBtn" style="flex:1;font-size:11px;padding:4px 0;border:1px solid #d0d5e8;border-radius:6px;background:#f8f9ff;color:#333;cursor:pointer;">🗑 清空</button>
        </div>
      </div>
    </div>
    <div id="aiActionBox">
      <div id="aiProgressTip" class="s-loading">点击题型标签后再点开始</div>
      <button class="btn-green" id="startBtn">▶ 开始答题</button>
    </div>
    <div id="aiRecordBox">
      <div class="rec-title"><span>📋 答题记录</span><span id="recCount">0 题</span></div>
      <div id="aiRecordList"></div>
    </div>`;

  // 等待 body 准备好后插入面板
  function insertPanel() {
    if (document.body) {
      document.body.appendChild(panel);
      // 面板拖拽
      let pd=false, pOff={x:0,y:0};
      const panelHandle = document.getElementById('panelHandle');
      panelHandle.addEventListener('mousedown', e=>{pd=true;pOff.x=e.clientX-panel.getBoundingClientRect().left;pOff.y=e.clientY-panel.getBoundingClientRect().top;});
      document.addEventListener('mousemove', e=>{if(!pd)return;panel.style.left=`${e.clientX-pOff.x}px`;panel.style.top=`${e.clientY-pOff.y}px`;panel.style.right='auto';});
      document.addEventListener('mouseup', ()=>{pd=false});
    } else {
      setTimeout(insertPanel, 100);
    }
  }
  insertPanel();

  // 恢复配置
  const cfg = GM_getValue('aiConfig',{});
  const $id = id => document.getElementById(id);
  const apiTypeSelect=$id('apiTypeSelect'), apiKeyInput=$id('apiKeyInput'), apiUrlInput=$id('apiUrlInput'), apiModelInput=$id('apiModelInput'), customFields=$id('customFields');
  if (cfg.apiType) apiTypeSelect.value=cfg.apiType;
  if (cfg.apiKey) apiKeyInput.value=cfg.apiKey;
  if (cfg.apiUrl&&apiUrlInput) apiUrlInput.value=cfg.apiUrl;
  if (cfg.apiModel&&apiModelInput) apiModelInput.value=cfg.apiModel;
  if (cfg.extraContext) { const ec=$id('extraContextInput'); if(ec) ec.value=cfg.extraContext; }
  customFields.style.display = apiTypeSelect.value==='custom'?'block':'none';
  if (cfg.ptaFuncLang) $id('ptaFuncLang').value=cfg.ptaFuncLang;
  if (cfg.ptaProgLang) $id('ptaProgLang').value=cfg.ptaProgLang;
  if ($id('ptaRmCmt')) $id('ptaRmCmt').checked = cfg.ptaRemoveComments!==false;
  if ($id('ptaBatch')) $id('ptaBatch').checked = !!cfg.ptaBatchCode;
  if ($id('ptaAutoNext')) $id('ptaAutoNext').checked = !!cfg.ptaAutoNext;

  // 事件绑定
  apiTypeSelect.onchange = () => { customFields.style.display=apiTypeSelect.value==='custom'?'block':'none'; };
  $id('cfgHdr').onclick = () => { $id('cfgHdr').classList.toggle('open'); $id('cfgBody').classList.toggle('open'); };
  $id('ctxHdr').onclick = () => { const b=$id('ctxBody'); const open=b.style.display!=='none'; b.style.display=open?'none':'block'; $id('ctxHdr').querySelector('.arr').textContent=open?'▼':'▲'; };
  $id('pasteCtxBtn').onclick = async () => {
    try {
      let text = '';
      if (typeof GM_getClipboard === 'function') { text = GM_getClipboard() || ''; }
      else { text = await navigator.clipboard.readText(); }
      if (!text.trim()) { setStatus('⚠️ 剪贴板为空，请先复制内容', 'error'); return; }
      const ta = $id('extraContextInput');
      ta.value = text.trim().slice(0, 2000);
      ta.focus();
      $id('ctxBody').style.display = 'block';
      $id('ctxHdr').querySelector('.arr').textContent = '▲';
      setStatus('✅ 已从剪贴板粘贴', 'ok');
    } catch(e) {
      const ta = $id('extraContextInput');
      ta.focus(); ta.select();
      setStatus('⚠️ 请直接在输入框内按 Ctrl+V 粘贴', 'error');
    }
  };
  $id('clearCtxBtn').onclick = () => { $id('extraContextInput').value=''; };
  $id('saveCfgBtn').onclick = () => {
    const c = {apiType:apiTypeSelect.value, apiKey:apiKeyInput.value.trim(), apiUrl:(apiUrlInput?.value||'').trim()||undefined, apiModel:(apiModelInput?.value||'').trim()||undefined, extraContext:($id('extraContextInput')?.value||'').trim()||undefined, ptaFuncLang:$id('ptaFuncLang')?.value||'C', ptaProgLang:$id('ptaProgLang')?.value||'C', ptaRemoveComments:$id('ptaRmCmt')?.checked!==false, ptaBatchCode:!!$id('ptaBatch')?.checked, ptaAutoNext:!!$id('ptaAutoNext')?.checked};
    GM_setValue('aiConfig',c);
    $id('saveCfgBtn').textContent='✅ 已保存'; setTimeout(()=>$id('saveCfgBtn').textContent='💾 保存配置',1500);
  };

  function updateRecords(records) {
    const rc=$id('recCount'), rl=$id('aiRecordList');
    if (rc) rc.textContent=`${records.length} 题`;
    if (!rl) return;
    rl.innerHTML = records.slice(-20).reverse().map(r=>{
      const tc=r.type==='multiple'?'m':r.type==='fill'?'f':'', tl=r.type==='multiple'?'多选':r.type==='fill'?'填空':'单选';
      return `<div class="rec-row"><span class="rt">${tl}</span><span class="rq">${r.title}</span><span class="ra ${tc}">${r.answer}</span></div>`;
    }).join('');
  }

  function setStatus(msg, type='loading') { const el=$id('aiProgressTip'); if(el){el.className=`s-${type}`;el.textContent=msg;} }

  $id('startBtn').onclick = async () => {
    const btn = $id('startBtn');
    if (isRunning) { isRunning=false; btn.textContent='▶ 开始答题'; btn.className='btn-green'; setStatus('⏹️ 已停止','error'); return; }
    isRunning=true; btn.textContent='⏹ 停止'; btn.className='btn-outline'; setStatus('🚀 启动中...','loading');
    try { const records=await runPTAEngine(setStatus,updateRecords); setStatus(`✅ 完成！共答${records.length}题`,'success'); }
    catch(e) { setStatus(`❌ ${e.message||e}`,'error'); }
    finally { isRunning=false; btn.textContent='▶ 开始答题'; btn.className='btn-green'; }
  };

})();
