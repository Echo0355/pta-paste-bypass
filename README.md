# PTA Paste Bypass

> Pintia (PTA) 自动解题油猴脚本 — 突破粘贴限制，支持 AI 自动解题

![Version](https://img.shields.io/badge/version-1.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Tampermonkey](https://img.shields.io/badge/Tampermonkey-supported-orange)

## 功能

- **AI 自动解题** — 自动提取题目、调用 LLM 生成代码、输入编辑器、提交并跳转下一题
- **多题型支持** — 判断题、单选题、多选题、填空题、函数填空、编程题、代码补全
- **突破粘贴限制** — 模拟逐字符输入，绕过 Pintia 的粘贴屏蔽机制
- **浮动面板** — 可拖拽的浮动面板，实时状态显示，随时停止
- **配置持久化** — API 地址、Key、模型等设置保存在浏览器本地，刷新不丢失
- **批量模式** — 支持编程题批量解答，自动遍历所有题目
- **自动跳转** — 答完自动切换下一题型
- **题目背景** — 可添加背景知识，辅助 AI 答题

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 浏览器扩展
2. 点击 Tampermonkey 图标 → **创建新脚本**
3. 将 [`pta-paste-bypass.js`](./pta-paste-bypass.js) 的内容粘贴进去，保存
4. 访问 [pintia.cn](https://pintia.cn)，右上角出现浮动面板即安装成功

## 使用

### 基本设置

1. 点击面板中的 **「⚙️ API 配置」** 展开设置
2. 选择 API 类型（OpenAI / DeepSeek / 自定义）
3. 填写 API Key
4. 点击 **「💾 保存配置」**

### AI 自动解题

1. 在 PTA 考试页面，切换到要解答的题型标签
2. 点击 **「▶ 开始答题」**
3. 脚本将自动完成：提取题目 → 调用 AI → 填写答案 → 保存

### 支持的题型

| 题型 | 说明 |
|------|------|
| 判断题 | TRUEORFALSE |
| 单选题 | MULTIPLECHOICE |
| 多选题 | MULTIPLECHOICEMORETHANONEANSWER |
| 填空题 | FILLINTHEBLANK / FILLINTHEBLANKS |
| 函数填空 | FILLINTHEBLANKFORPROGRAMMING |
| 编程题 | PROGRAMMING / CODEPROGRAMMING |
| 代码补全 | CODECOMPLETION |

### API 配置

支持任何兼容 OpenAI Chat Completions 格式的 API：

| 平台 | API 地址 |
|------|----------|
| OpenAI | `https://api.openai.com/v1/chat/completions` |
| DeepSeek | `https://api.deepseek.com/chat/completions` |
| 火山引擎 | `https://ark.cn-beijing.volces.com/api/v3/chat/completions` |
| 其他兼容服务 | `https://your-service/v1/chat/completions` |

### PTA 专属设置

- **函数填空语言** — 选择函数填空题的编程语言（C / C++ / Java / Python）
- **编程题语言** — 选择编程题的编程语言
- **去除代码注释** — 自动移除 AI 生成代码中的注释
- **编程题批量模式** — 遍历并解答所有编程题
- **答完自动切换下一题型** — 完成当前题型后自动跳转到下一题型

### 题目背景

点击 **「📝 题目背景」** 展开，可添加本次作业的背景知识，AI 答题时会参考。

支持从剪贴板粘贴或手动输入。

## 常见问题

**浮动面板没有出现？**
确认你在 `pintia.cn` 域名下，Tampermonkey 已启用，尝试刷新页面。

**提示"未找到代码编辑器"？**
页面未完全加载，等待加载完成后刷新重试。

**AI 返回结果异常？**
检查 API 地址、Key、模型名称是否正确，API 额度是否充足。

**如何停止自动解题？**
点击「⏹ 停止」按钮。

**编程题填写失败？**
尝试切换编程语言，或手动选择语言后重试。

## 安全性

- 所有配置保存在本地浏览器，不会上传到任何服务器
- 仅与用户配置的 AI 服务端点通信
- 开源代码，可自行审计

## 免责声明

本项目仅供学习和研究使用。请遵守 Pintia 平台的使用条款、所在地区法律法规以及学校相关规定。不建议在涉及学术诚信的考试或竞赛中使用。

## 许可证

[MIT License](./LICENSE)
