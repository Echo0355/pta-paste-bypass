# PTA Paste Bypass

> Pintia (PTA) 自动解题油猴脚本 — 突破粘贴限制，支持 AI 自动解题

![Version](https://img.shields.io/badge/version-1.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Tampermonkey](https://img.shields.io/badge/Tampermonkey-supported-orange)

## 功能

- **AI 自动解题** — 自动提取题目、调用 LLM 生成代码、输入编辑器、提交并跳转下一题，全程无需手动干预
- **突破粘贴限制** — 模拟逐字符输入，绕过 Pintia 的粘贴屏蔽机制
- **手动输入模式** — 粘贴代码到浮窗文本框，脚本自动输入到编辑器
- **可拖拽浮窗面板** — 实时状态显示，一键切换模式，随时停止
- **配置持久化** — API 地址、Key、模型等设置保存在浏览器本地，刷新不丢失

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 浏览器扩展
2. 点击 Tampermonkey 图标 → **创建新脚本**
3. 将 [`pta-paste-bypass.js`](./pta-paste-bypass.js) 的内容粘贴进去，保存
4. 访问 [pintia.cn](https://pintia.cn)，右下角出现浮窗即安装成功

## 使用

### AI 自动模式

1. 点击浮窗中的 **「切换AI解题」**
2. 填写 AI 接口配置（API 地址、Key、模型名称）
3. 点击 **「AI 解题」**，脚本将自动完成：提取题目 → 调用 AI → 输入代码 → 提交 → 跳转下一题

支持任何兼容 OpenAI Chat Completions 格式的 API，默认适配：

| 平台 | API 地址 |
|------|----------|
| 火山引擎（推荐） | `https://ark.cn-beijing.volces.com/api/v3/chat/completions` |
| OpenAI | `https://api.openai.com/v1/chat/completions` |
| 其他兼容服务 | `https://your-service/v1/chat/completions` |

### 手动输入模式

1. 点击 **「切换手动输入」**
2. 在文本框中粘贴你的代码
3. 点击 **「填充代码」**

### 自定义提示词

在设置面板中修改「系统提示词」字段，可调整编程语言（Python/C++/Java 等）或自定义 AI 行为。

## 常见问题

**浮窗没有出现？**
确认你在 `pintia.cn` 域名下，Tampermonkey 已启用，尝试刷新页面。

**提示"未找到代码编辑器"？**
页面未完全加载，等待加载完成后刷新重试。

**AI 返回结果异常？**
检查 API 地址、Key、模型名称是否正确，API 额度是否充足。

**如何停止自动解题？**
点击「停止」按钮，或直接关闭浮窗/切换页面。

## 安全性

- 所有配置保存在本地浏览器，不会上传到任何服务器
- 仅与用户配置的 AI 服务端点通信
- 开源代码，可自行审计

## 免责声明

本项目仅供学习和研究使用。请遵守 Pintia 平台的使用条款、所在地区法律法规以及学校相关规定。不建议在涉及学术诚信的考试或竞赛中使用。

## 许可证

[MIT License](./LICENSE)
