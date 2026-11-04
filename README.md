# PTA / 高校邦 答题助手脚本集

> 一组 Tampermonkey 用户脚本：突破粘贴限制 + AI 自动作答，覆盖 PTA（拼题A）、高校邦等在线作业/测验平台。

![License](https://img.shields.io/badge/license-MIT-green)
![Tampermonkey](https://img.shields.io/badge/Tampermonkey-supported-orange)

## 📜 脚本一览

| 文件 | 适用站点 | 主要能力 |
|------|----------|----------|
| [`pta-paste-bypass.js`](./pta-paste-bypass.js) | `pintia.cn`（PTA 拼题A） | 突破粘贴限制 + AI 解题（判断/单选/多选/填空/函数填空/编程/代码补全）+ 批量模式 + 自动跳转 |
| [`gxb-paste-bypass.js`](./gxb-paste-bypass.js) | `*.gaoxiaobang.com`（高校邦） | 粘贴解锁（含讨论区 UEditor）+ 测验题 AI 作答（单选/多选/判断/填空）+ 未答自查 |
| [`ai-quiz-helper.js`](./ai-quiz-helper.js) | 高校邦 / 学习通 / 智慧树 / U课 / PTA | 通用 AI 自动答题面板（**第三方脚本**，见下方说明） |

> 三个脚本互相独立，按你使用的平台安装其一即可。高校邦用户推荐 **`gxb-paste-bypass.js`**（解锁更彻底、面板更轻）。

## 📦 安装

所有脚本的安装方式相同：

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 浏览器扩展
2. 点击 Tampermonkey 图标 → **添加新脚本**
3. 把对应 `.js` 文件的全部内容粘贴进去，`Ctrl+S` 保存
4. 打开目标平台的作业/测验页面，页面角落出现浮动面板即安装成功

---

## 一、pta-paste-bypass.js（PTA 专用）

### ✨ 功能特性

- 🤖 **AI 自动解题** — 自动提取题目、调用 AI 生成答案、填写并保存
- 📝 **多题型支持** — 判断题、单选题、多选题、填空题、函数填空、编程题、代码补全
- 🚫 **突破粘贴限制** — 绕过 PTA 的复制粘贴屏蔽机制
- 🖱️ **浮动面板** — 可拖拽的浮动面板，实时显示状态和答题记录
- 💾 **配置持久化** — API 配置保存在浏览器本地，刷新不丢失
- 📦 **批量模式** — 编程题支持批量解答，自动遍历所有题目
- ⏭️ **自动跳转** — 答完当前题型后自动切换到下一题型
- 📚 **题目背景** — 可添加背景知识，辅助 AI 更好地答题

### 🚀 使用方法

1. 打开 PTA 考试页面，右上角出现浮动面板
2. 点击 **「⚙️ API 配置」**，选择 API 类型并填写 Key：

| API 类型 | 需要填写 |
|----------|----------|
| OpenAI | API Key |
| DeepSeek | API Key |
| 自定义 | API URL、API Key、模型名称 |

3. 点击 **「💾 保存配置」**
4. 切换到要解答的题型标签 → 点击 **「▶ 开始答题」** → 等待 AI 填写
5. 需要中断时点击 **「⏹ 停止」**

### 📋 支持的题型

| 题型 | URL 标识 | 说明 |
|------|----------|------|
| 判断题 | `type=1` | TRUEORFALSE |
| 单选题 | `type=2` | MULTIPLECHOICE |
| 多选题 | `type=3` | MULTIPLECHOICEMORETHANONEANSWER |
| 填空题 | `type=4,5` | FILLINTHEBLANK / FILLINTHEBLANKS |
| 函数填空 | `type=6` | FILLINTHEBLANKFORPROGRAMMING |
| 编程题 | `type=7,9` | PROGRAMMING / CODEPROGRAMMING |
| 代码补全 | `type=8` | CODECOMPLETION |

### ⚙️ PTA 专属配置

| 配置项 | 说明 |
|--------|------|
| 函数填空语言 | C / C++ / Java / Python |
| 编程题语言 | C / C++ / Java / Python |
| 去除代码注释 | 自动移除 AI 生成代码中的注释 |
| 编程题批量模式 | 遍历并解答所有编程题 |
| 答完自动切换下一题型 | 完成当前题型后自动跳转 |

### 📝 题目背景

点击 **「📝 题目背景」** 展开后，可从剪贴板粘贴、手动输入或清空背景知识，AI 答题时会参考这些内容以提高准确率。

---

## 二、gxb-paste-bypass.js（高校邦专用）

### ✨ 功能特性

- 🔓 **进页面自动解锁** — `document-start` 阶段即在捕获层截断站点的粘贴/复制/右键/选中限制，**只切断拦截、不阻止浏览器默认粘贴**，无需任何开关
- 💬 **讨论区也能粘** — 高校邦讨论区用 UEditor 的 `beforepaste` 清空内容拦截，脚本直接摘掉该拦截器，并在 `fireEvent` 层兜底还原
- 🤖 **测验/作业自动作答** — 单选、多选、判断、填空四种题型
- 📤 **一次发全部题** — 不再分批，整页题目一次性交给 AI；若返回数量不足或请求失败，**自动对半拆分重试**，无需手动调整
- 🔍 **提交前自查** — 「检查未答题」逐题列出漏答项，避免只有一次提交机会的测验翻车
- 📋 **答题记录** — 面板实时显示每题填了什么，多选（橙）/ 填空（蓝）分色标记
- 💾 **独立配置** — API 配置存在 `gxbConfig`，首次使用会自动沿用 `pta-paste-bypass.js` 里已填好的 `aiConfig`，无需重复输入

### 🚀 使用方法

1. 进入高校邦测验/作业页（`*.gaoxiaobang.com`），右上角出现 **「🎓 高校邦助手」** 面板（可拖动）
2. **「⚙️ API 配置」** 里选类型、填 API Key → **「💾 保存配置」**
3. 点 **「▶ 开始答题」**，等待状态栏显示 `✅ 完成！共答 N 题`
4. 展开 **「🧰 工具」** → 点 **「🔍 检查未答题」** 二次确认
5. **手动**点页面上的「提交」（脚本不会自动提交）

### 📋 支持的题型

| 题型 | 识别依据 | 填写方式 |
|------|----------|----------|
| 单选题 | `.quiz-type` 含“单选” | 点 `i.gxb-icon-radio` 图标 |
| 多选题 | 含“多选/多项/不定项”或存在 `i.gxb-icon-check` | 点 `i.gxb-icon-check` 图标 |
| 判断题 | 含“判断” | 点对应图标，支持 `T/F/对/错/正确/错误` |
| 填空题 | 含“填空”，或存在 `input.quiz-input` | 按空顺序写入并派发 `input`/`change` |

答案兼容 `AC`、`A+C`、`1+3`、`A,C`、`（1）（3）` 等写法；多选题点击前会判断选中态，**不会把已选项再点掉**。

### 🩺 控制台调试

在页面控制台执行：

```js
__gxbDebug()        // 列表打印每题：题型文字 / 识别结果 / 选项数 / 已选状态 / 首项 DOM
```

若某题没被填，把这行信息发出来即可定位选择器问题。

---

## 三、ai-quiz-helper.js（第三方通用答题助手）

### ⚠️ 来源说明

该脚本**非本项目原创**，作者为 **huangch**（当前版本 3.10.5），原始分发地址：

```
https://ai-quiz-helper.pages.dev/ai-quiz-helper.js
```

仓库内这份副本是本地修改版，仅修正了高校邦多选题填充失效的问题（字母转序号越界、多选图标选择器不匹配）。版权归原作者所有，**如需最新版请从上面的 `@updateURL` 获取**；若原作者有异议，可随时从本仓库移除。

### 🌐 支持的平台

| 平台 | 匹配规则 |
|------|----------|
| 高校邦 | `*.gaoxiaobang.com` |
| 学习通 / 超星章节作业 | `*.chaoxing.com/work/doHomeWorkNew*` |
| 智慧树 | `*.zhihuishu.com` |
| U课 | `*.uooc.net.cn` |
| PTA 拼题A | `*.pintia.cn/problem-sets/*/exam/*` |

### 💡 怎么选

| 场景 | 建议 |
|------|------|
| 只考高校邦 | 用 `gxb-paste-bypass.js`（面板更轻、解锁更彻底） |
| 同时用学习通 / 智慧树 / U课 | 用 `ai-quiz-helper.js`（一个脚本覆盖多平台） |
| 用 PTA | 用 `pta-paste-bypass.js`（题型支持最全，含编程题） |

> 两个高校邦脚本**不要同时装**，否则可能重复点击导致多选被取消。

---

## 🔧 API 兼容性

支持任何兼容 OpenAI Chat Completions 格式的 API：

```
POST /v1/chat/completions
{
  "model": "模型名称",
  "messages": [{"role": "user", "content": "题目内容"}],
  "temperature": 0.1,
  "max_tokens": 2000
}
```

推荐的 API 服务：

- [OpenAI](https://platform.openai.com/)
- [DeepSeek](https://platform.deepseek.com/)
- [火山引擎](https://www.volcengine.com/)

## ❓ 常见问题

**Q: 浮动面板没有出现？**
A: 确认域名匹配（PTA 为 `pintia.cn`，高校邦为 `*.gaoxiaobang.com`），Tampermonkey 已启用，然后刷新页面。

**Q: 高校邦的输入框还是粘不进去？**
A: 先确认脚本已启用并刷新页面。讨论区的编辑器是 UEditor，若切换章节后重建了编辑器，刷新一次即可重新摘除拦截。

**Q: 多选题一个都没选上？**
A: 高校邦已修复（v3.10.5 / v1.1.0）。若仍失败，控制台执行 `__gxbDebug()` 查看该题被识别成什么题型、选项 DOM 长什么样。

**Q: 提示“未找到代码编辑器”？**
A: 页面未完全加载，等待加载完成后刷新重试。

**Q: AI 返回结果异常？**
A: 检查 API 地址、Key、模型名称是否正确，API 额度是否充足。

**Q: 如何停止自动解题？**
A: 点击面板上的「⏹ 停止」按钮。

**Q: 编程题填写失败？**
A: 尝试在 PTA 页面手动选择编程语言，或在配置中切换语言后重试。

**Q: 支持哪些编程语言？**
A: 支持 C、C++、Java、Python，可在 PTA 脚本的配置中选择。

## 🔒 安全性

- ✅ 所有配置保存在本地浏览器，不会上传到任何服务器
- ✅ 仅与用户配置的 AI 服务端点通信
- ✅ 开源代码，可自行审计

## ⚠️ 免责声明

本项目仅供学习和研究使用。请遵守：

- Pintia / 高校邦等平台的使用条款
- 所在地区法律法规
- 学校相关规定

**不建议在涉及学术诚信的考试或竞赛中使用。**

## 📄 许可证

本项目原创脚本（`pta-paste-bypass.js`、`gxb-paste-bypass.js`）使用 [MIT License](./LICENSE)。

`ai-quiz-helper.js` 为第三方脚本，版权归原作者 **huangch** 所有。
