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
  "use strict";

  // ===================== 默认配置 =====================
  const DEFAULT_API_URL = "https://ark.cn-beijing.volces.com/api/v3/chat/completions";  // 火山引擎 API
  const DEFAULT_MODEL = "ep-20260404230717-wczff";  // 你的模型端点 ID，可在火山引擎后台查看
  const DEFAULT_SYSTEM_PROMPT = "你是一个编程竞赛专家。严格用Python解答。生成完整、可直接运行的代码、要通过所有的测试用例。正确处理所有输入输出格式。包含必要的import、main函数等。考虑边界情况。只返回纯Python代码，不要任何解释、markdown标记或注释。";

  // 从存储加载配置，没有则使用默认值
  let config = {
    autoMode: GM_getValue("autoMode", false),
    apiUrl: GM_getValue("apiUrl", DEFAULT_API_URL),
    apiKey: GM_getValue("apiKey", ""),
    model: GM_getValue("model", DEFAULT_MODEL),
    systemPrompt: GM_getValue("systemPrompt", DEFAULT_SYSTEM_PROMPT),
  };

  // ===================== 状态变量 =====================
  let userCode = "";                // 手动输入模式下的代码
  let isTyping = false;
  let isAutoSolvingActive = false;  // 统一的自动解题活跃标志（替代autoSolveEnabled和shouldStop）
  let autoSolveRunning = false;     // 防止重复自动执行

  // UI 元素引用
  let container;
  let autoToggle;
  let settingsContent;
  let statusDiv;
  let textareaEl;
  let executeBtn;
  let stopBtn;

  // ===================== 基础工具 =====================
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function getEditor() {
    return document.querySelector('.cm-content[contenteditable="true"]');
  }

  // ===================== 手动输入相关(保留原功能) =====================
  function setTextareaLocked(locked) {
    if (!textareaEl) return;
    textareaEl.disabled = locked;
    textareaEl.style.opacity = locked ? "0.65" : "1";
    textareaEl.style.cursor = locked ? "not-allowed" : "text";
  }

  function restoreButtons() {
    isTyping = false;
    isAutoSolvingActive = false;
    if (executeBtn) {
      executeBtn.textContent = config.autoMode ? "AI 解题" : "填充代码";
      executeBtn.disabled = false;
      executeBtn.style.background = "#0078d7";
    }
    setTextareaLocked(false);
    autoSolveRunning = false;
  }

  // 清理中间状态（不重置自动解题标志，用于自动流程中）
  function cleanupTypingState() {
    isTyping = false;
    setTextareaLocked(false);
  }

  async function clearEditorContent(showMissingAlert = true) {
    const editor = getEditor();
    if (!editor) {
      if (showMissingAlert) alert("未找到代码编辑器！");
      return false;
    }
    editor.focus();
    document.execCommand("selectAll", false, null);
    await sleep(50);
    document.execCommand("delete", false, null);
    return true;
  }

  async function simulateTyping(element, text) {
    isTyping = true;
    isAutoSolvingActive = false;
    setTextareaLocked(true);
    element.focus();

    try {
      for (let index = 0; index < text.length; index += 1) {
        if (!isTyping) break;
        element.focus();
        document.execCommand("insertText", false, text[index]);
        await sleep(0);
      }
    } finally {
      restoreButtons();
    }
  }



  // ===================== AI 自动解题相关 =====================
  // 更新状态显示
  function setStatus(text) {
    if (statusDiv) statusDiv.textContent = text;
  }

  // 判断当前是否在题目页面
  function isProblemPage() {
    return /problem-sets\/\d+\/problems\/\d+/.test(location.href);
  }

  // 获取当前题号
  function getCurrentProblemNumber() {
    // 查找所有题号按钮（有href包含problemSetProblemId的a标签）
    const allProblemBtns = document.querySelectorAll('a[href*="problemSetProblemId"]');
    
    // 找有 active class 的按钮（当前题号）
    for (const btn of allProblemBtns) {
      if (btn.classList.contains('active')) {
        const numberSpan = btn.querySelector('span');
        if (numberSpan) {
          const num = parseInt(numberSpan.textContent.trim());
          if (!isNaN(num)) {
            return num;
          }
        }
      }
    }
    
    return 1;
  }

  // 提取题目文本 (可根据实际页面调整选择器)
  function extractProblem() {
    // 尝试多种常见选择器
    const selectors = [
      ".problem-detail",
      ".rendered-markdown",
      ".markdown-body",
      ".problem-body",
      "div[class*='problem-desc']",
      "div[class*='problem-content']",
      ".article-content"
    ];
    for (const sel of selectors) {
      const elem = document.querySelector(sel);
      if (elem && elem.innerText.trim().length > 10) {
        return elem.innerText.trim();
      }
    }
    // 如果都找不到，获取整个主体内容作为后备
    const main = document.querySelector("main") || document.querySelector(".ant-layout-content");
    return main ? main.innerText.trim() : "";
  }

  // 获取当前选择的语言
  function getLanguage() {
    // 常见选择器：可能是下拉按钮的文字
    const langBtn = document.querySelector(".language-selector .ant-select-selection-item") ||
                   document.querySelector(".lang-select") ||
                   document.querySelector("[data-language]");
    if (langBtn) return langBtn.textContent.trim();
    // 有时在编辑器属性里
    const editor = getEditor();
    if (editor && editor.getAttribute("data-language")) {
      return editor.getAttribute("data-language");
    }
    return "C++"; // 默认
  }

  // 调用 AI API
  async function callAI(problemText, language) {
    // 火山引擎 API 使用的请求格式
    const requestData = {
      model: config.model,
      messages: [
        { role: "system", content: config.systemPrompt },
        { role: "user", content: `题目：\n${problemText}\n\n使用语言：${language}\n请仅返回完整正确的代码。` }
      ],
      temperature: 0,
      stream: false
    };

    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "POST",
        url: config.apiUrl,
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${config.apiKey}`
        },
        data: JSON.stringify(requestData),
        timeout: 60000,
        onload: function (response) {
          try {
            // 检查响应是否为空
            if (!response.responseText || response.responseText.trim().length === 0) {
              reject(new Error(`API 返回空响应 (HTTP ${response.status})`));
              return;
            }

            // 检查 HTTP 状态
            if (response.status !== 200) {
              try {
                const errorData = JSON.parse(response.responseText);
                const errorMsg = errorData.error?.message || response.responseText;
                reject(new Error(`HTTP ${response.status}: ${errorMsg}`));
              } catch {
                reject(new Error(`HTTP ${response.status}: ${response.responseText.substring(0, 200)}`));
              }
              return;
            }

            const data = JSON.parse(response.responseText);

            // 尝试多种可能的响应格式
            let code = null;

            // 格式1: 标准 OpenAI chat/completions 格式
            if (data.choices && data.choices.length > 0 && data.choices[0].message) {
              code = data.choices[0].message.content;
            }
            // 格式2: 可能的其他格式
            else if (data.result && data.result.text) {
              code = data.result.text;
            }
            else if (data.text) {
              code = data.text;
            }
            else if (data.output && data.output.choices && data.output.choices.length > 0) {
              code = data.output.choices[0].message.content;
            }

            if (!code) {
              reject(new Error("AI 返回格式异常"));
              return;
            }

            // 移除可能的代码块标记
            code = code.replace(/^```[\w]*\n?/, "").replace(/```$/, "").trim();

            if (!code) {
              reject(new Error("提取的代码为空"));
              return;
            }

            resolve(code);
          } catch (e) {
            console.error("%c❌ 解析 API 响应失败", "color: red; font-weight: bold;", e.message);
            reject(new Error(`解析失败: ${e.message}`));
          }
        },
        onerror: function(error) {
          console.error("%c❌ 网络错误", "color: red; font-weight: bold;");
          reject(new Error(`网络错误`));
        },
        ontimeout: function() {
          console.error("%c❌ 请求超时", "color: red; font-weight: bold;");
          reject(new Error("请求超时（60秒）"));
        }
      });
    });
  }

  // 点击提交按钮
  async function submitCode() {
    // 查找提交按钮 - 多种策略
    let submitBtn = null;

    // 策略1: 按属性查找
    submitBtn = document.querySelector('button[title="提交"]') ||
               document.querySelector('.submit-btn') ||
               document.querySelector('button[type="submit"]');

    // 策略2: 遍历所有按钮，按文本内容查找
    if (!submitBtn) {
      const buttons = document.querySelectorAll('button');
      for (const btn of buttons) {
        if (btn.textContent.includes('提交')) {
          submitBtn = btn;
          break;
        }
      }
    }

    // 策略3: 查找包含特定文本的任何元素
    if (!submitBtn) {
      const allElements = document.querySelectorAll('[onclick*="submit"], [class*="submit"], [id*="submit"]');
      for (const elem of allElements) {
        if (elem.textContent.includes('提交')) {
          submitBtn = elem;
          break;
        }
      }
    }

    if (!submitBtn) {
      throw new Error("未找到提交按钮");
    }
    submitBtn.click();
    await sleep(1000); // 等待页面反应
  }

  // 等待评测结果，返回是否通过（答案正确）
  function waitForResult(timeout = 120000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const checkInterval = 1000;  // 改为1秒检查一次，更快响应
      let lastText = "";
      
      function check() {
        // 结果文本通常出现在特定区域
        const resultDiv =
          document.querySelector(".result-text") ||
          document.querySelector(".compile-result") ||
          document.querySelector("[class*='result']");
        const bodyText = document.body.innerText;

        // 判断通过
        if (bodyText.includes("答案正确") || bodyText.includes("Accepted")) {
          resolve(true);
          return;
        }
        
        // 判断失败 - 检测各种错误状态
        const failurePatterns = [
          "编译错误",
          "答案错误", 
          "部分正确",
          "运行超时",
          "格式错误",
          "Runtime Error",
          "非零返回",
          "Time Limit",
          "Memory Limit",
          "Wrong Answer",
          "Compilation Error",
          "Segmentation Fault"
        ];
        
        for (const pattern of failurePatterns) {
          if (bodyText.includes(pattern)) {
            resolve(false);
            return;
          }
        }
        
        // 如果长时间没有任何结果，超时
        if (Date.now() - start > timeout) {
          resolve(false);
          return;
        }
        
        // 避免重复输出相同的日志
        if (bodyText !== lastText) {
          lastText = bodyText;
        }
        
        setTimeout(check, checkInterval);
      }
      check();
    });
  }

  // 检查并跳转到下一题（合并两个函数，避免重复DOM查询）
  function tryGoToNextProblem() {
    const currentNum = getCurrentProblemNumber();
    const nextNum = currentNum + 1;
    
    // 一次性查询所有题号按钮
    const allProblemBtns = document.querySelectorAll('a[href*="problemSetProblemId"]');
    
    for (const btn of allProblemBtns) {
      const numberSpan = btn.querySelector('span');
      if (numberSpan) {
        const num = parseInt(numberSpan.textContent.trim());
        if (num === nextNum) {
          btn.click();
          return true;  // 成功找到并跳转
        }
      }
    }
    
    return false;  // 不存在下一题
  }

  // 整个自动流程
  async function autoSolveSequence() {
    if (autoSolveRunning) {
      console.warn("%c⚠️ 自动解题已在进行中，请勿重复点击", "color: orange; font-weight: bold;");
      return;
    }
    autoSolveRunning = true;
    isAutoSolvingActive = true;
    if (executeBtn) {
      executeBtn.disabled = true;
      executeBtn.style.background = "#555";
    }
    if (stopBtn) {
      stopBtn.style.display = "block";
    }
    setStatus("清空编辑器...");
    
    // 一开始就清空编辑器
    await clearEditorContent(false);
    
    setStatus("提取题目中...");

    try {
      const problemText = extractProblem();
      if (!problemText || problemText.length < 5) {
        alert("题目提取失败，请刷新页面或查看页面结构。");
        isAutoSolvingActive = false;
        restoreButtons();
        return;
      }

      const language = getLanguage();
      setStatus("调用 AI 生成代码...");
      const code = await callAI(problemText, language);
      if (!code) throw new Error("AI 未返回代码");

      const editor = getEditor();
      if (!editor) {
        alert("未找到代码编辑器，可能页面尚未加载完成。");
        isAutoSolvingActive = false;
        restoreButtons();
        return;
      }

      setStatus("清除旧代码并输入新代码...");
      await clearEditorContent(false);
      isTyping = true;
      setTextareaLocked(true);

      // 快速逐字输入（delay = 0）
      editor.focus();
      for (let i = 0; i < code.length; i++) {
        if (!isAutoSolvingActive) break;
        document.execCommand("insertText", false, code[i]);
        await sleep(0);
      }
      cleanupTypingState();

      setStatus("点击提交...");
      await submitCode();

      setStatus("等待评测结果...");
      const passed = await waitForResult();
      if (passed) {
        setStatus("通过！检查是否有下一题...");
        
        try {
          await sleep(1500);

          if (!isAutoSolvingActive) {
            console.log("%c🛑 用户已停止自动解题", "color: orange; font-weight: bold;");
            setStatus("已停止自动解题");
            restoreButtons();
            return;
          }

          const hasNext = tryGoToNextProblem();
          
          if (hasNext) {
            setStatus("有下一题，即将跳转...");
            await sleep(4000);

            if (isAutoSolvingActive) {
              // 继续自动解题下一题（重置标志以允许递归调用）
              autoSolveRunning = false;
              autoSolveSequence();
            } else {
              autoSolveRunning = false;
              if (stopBtn) stopBtn.style.display = "none";
            }
          } else {
            setStatus("✅ 所有题目已完成！");
            restoreButtons();
            isAutoSolvingActive = false;
            if (stopBtn) stopBtn.style.display = "none";
          }
        } catch (nextErr) {
          console.error("处理下一题时出错:", nextErr.message);
        }
      } else {
        console.log("%c❌ 答案错误", "color: red; font-weight: bold;");
        setStatus("未通过，停止自动流程。");
        alert("评测未通过，请检查题目或手动调试。");
        isAutoSolvingActive = false;
        restoreButtons();
        if (stopBtn) stopBtn.style.display = "none";
      }
    } catch (err) {
      console.error("%c❌ 自动解题错误", "color: red; font-weight: bold;", err.message);
      setStatus("发生错误：" + err.message);
      alert("自动解题出错: " + err.message);
      isAutoSolvingActive = false;
      restoreButtons();
      if (stopBtn) stopBtn.style.display = "none";
    }
  }

  // ===================== UI 构建 =====================
  function createUI() {
    container = document.createElement("div");
    container.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 99999;
      width: 320px;
      background: #fff;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      font-family: Arial, sans-serif;
      overflow: hidden;
    `;

    // 标题栏 (可拖动)
    const header = document.createElement("div");
    header.style.cssText = `
      padding: 10px 16px;
      background: #0078d7;
      color: white;
      font-weight: bold;
      cursor: move;
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;
    header.innerHTML = `<span>PTA AI 自动解题</span><span style="font-size:12px;opacity:0.8">v1.0</span>`;
    container.appendChild(header);

    // 拖动逻辑
    let isDragging = false, offsetX = 0, offsetY = 0;
    header.addEventListener("mousedown", (e) => {
      isDragging = true;
      const rect = container.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      header.style.background = "#005a9e";
    });
    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      container.style.left = e.clientX - offsetX + "px";
      container.style.top = e.clientY - offsetY + "px";
      container.style.bottom = "auto";
      container.style.right = "auto";
    });
    document.addEventListener("mouseup", () => {
      if (isDragging) {
        isDragging = false;
        header.style.background = "#0078d7";
      }
    });

    // 内容区
    const content = document.createElement("div");
    content.style.padding = "12px";

    // 设置面板 (默认根据 autoMode 显示/隐藏)
    settingsContent = document.createElement("div");
    settingsContent.style.display = config.autoMode ? "block" : "none";

    function addSetting(label, key, type = "text", placeholder = "") {
      const row = document.createElement("div");
      row.style.marginBottom = "8px";
      const lbl = document.createElement("div");
      lbl.textContent = label;
      lbl.style.fontSize = "12px";
      lbl.style.marginBottom = "2px";
      const input = document.createElement(type === "password" ? "input" : "input");
      input.type = type === "password" ? "password" : "text";
      input.value = config[key] || "";
      input.placeholder = placeholder;
      input.style.cssText = "width:100%;padding:4px;box-sizing:border-box;";
      input.addEventListener("input", () => {
        config[key] = input.value;
        GM_setValue(key, input.value);
      });
      row.appendChild(lbl);
      row.appendChild(input);
      return row;
    }

    settingsContent.appendChild(addSetting("API 地址", "apiUrl", "text", DEFAULT_API_URL));
    settingsContent.appendChild(addSetting("API Key", "apiKey", "text", "sk-..."));
    settingsContent.appendChild(addSetting("模型名称", "model", "text", DEFAULT_MODEL));
    settingsContent.appendChild(addSetting("系统提示词", "systemPrompt", "text", DEFAULT_SYSTEM_PROMPT));
    content.appendChild(settingsContent);

    // 代码输入框 (手动模式)
    textareaEl = document.createElement("textarea");
    textareaEl.placeholder = "在此输入代码（AI解题模式下隐藏）";
    textareaEl.style.cssText = `
      width: 100%;
      height: 100px;
      margin-bottom: 8px;
      padding: 6px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-family: monospace;
      resize: vertical;
      box-sizing: border-box;
      display: ${config.autoMode ? "none" : "block"};
    `;
    textareaEl.addEventListener("input", () => { userCode = textareaEl.value; });
    content.appendChild(textareaEl);

    // 状态栏
    statusDiv = document.createElement("div");
    statusDiv.style.cssText = "font-size:12px;color:#555;margin-bottom:6px;min-height:18px;";
    statusDiv.textContent = config.autoMode ? "AI 解题模式" : "手动输入模式";
    content.appendChild(statusDiv);

    // 按钮行
    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex;gap:6px;";

    executeBtn = document.createElement("button");
    executeBtn.textContent = config.autoMode ? "AI 解题" : "填充代码";
    executeBtn.style.cssText = `
      flex:1;
      background:#0078d7;
      color:white;
      border:none;
      padding:8px 0;
      border-radius:4px;
      cursor:pointer;
      font-weight:bold;
    `;
    executeBtn.addEventListener("click", () => {
      if (config.autoMode) {
        if (!config.apiKey) {
          alert("请先设置 API Key！");
          return;
        }
        autoSolveSequence();
      } else {
        // 原手动逻辑
        if (isTyping || autoSolveRunning) return;
        if (!userCode.trim()) {
          alert("请先输入代码！");
          return;
        }
        const editor = getEditor();
        if (editor) {
          simulateTyping(editor, userCode);
        } else {
          alert("未找到编辑器，请手动点击代码框后重试。");
        }
      }
    });

    // 自动模式开关按钮
    autoToggle = document.createElement("button");
    autoToggle.style.cssText = `
      flex:1;
      padding: 8px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-weight: bold;
      color: white;
      font-size: 13px;
    `;
    
    const updateToggleButton = () => {
      if (config.autoMode) {
        autoToggle.textContent = "切换手动输入";
        autoToggle.style.background = "#107c10";
      } else {
        autoToggle.textContent = "切换AI解题";
        autoToggle.style.background = "#0078d7";
      }
    };
    
    updateToggleButton();
    autoToggle.addEventListener("click", () => {
      config.autoMode = !config.autoMode;
      GM_setValue("autoMode", config.autoMode);
      updateToggleButton();
      if (config.autoMode) {
        executeBtn.textContent = "AI 解题";
        textareaEl.style.display = "none";
        settingsContent.style.display = "block"; // 显示设置
        statusDiv.textContent = "AI 解题模式";
      } else {
        executeBtn.textContent = "填充代码";
        textareaEl.style.display = "block";
        settingsContent.style.display = "none"; // 隐藏设置
        statusDiv.textContent = "手动输入模式";
      }
    });

    stopBtn = document.createElement("button");
    stopBtn.textContent = "停止";
    stopBtn.style.cssText = `
      flex:1;
      background:#ff4444;
      color:white;
      border:none;
      padding:8px 0;
      border-radius:4px;
      cursor:pointer;
      font-weight:bold;
      display:none;
    `;
    stopBtn.addEventListener("click", () => {
      console.log("%c🛑 用户点击停止按钮", "color: orange; font-weight: bold;");
      isAutoSolvingActive = false;
      setStatus("正在停止自动解题...");
      stopBtn.style.display = "none";
    });

    btnRow.appendChild(executeBtn);
    btnRow.appendChild(autoToggle);
    btnRow.appendChild(stopBtn);
    content.appendChild(btnRow);
    container.appendChild(content);
    document.body.appendChild(container);
  }

  // ===================== 页面加载自动启动 =====================
  function autoStartIfNeeded() {
    if (config.autoMode && isProblemPage() && !autoSolveRunning) {
      if (!config.apiKey) {
        console.warn("API Key 未设置，无法自动启动。");
        return;
      }
      // 延迟一下，等待编辑器完全加载
      setTimeout(() => {
        if (!autoSolveRunning) {
          autoSolveSequence();
        }
      }, 2000);
    }
  }

  // 初始化
  createUI();
  window.addEventListener("load", () => {
    // 确保页面完全加载后再尝试
    autoStartIfNeeded();
  });
  // 也监听 pushState 以适应 SPA 跳转
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      if (config.autoMode && isProblemPage()) {
        setTimeout(autoStartIfNeeded, 2000);
      }
    }
  }).observe(document, { subtree: true, childList: true });

})();