# PTA Paste Bypass

> Pintia (PTA) 自动解题油猴脚本 — 突破粘贴限制，支持 AI 自动解题

![Version](https://img.shields.io/badge/version-1.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Tampermonkey](https://img.shields.io/badge/Tampermonkey-supported-orange)

## ✨ 功能特性

- 🤖 **AI 自动解题** — 自动提取题目、调用 AI 生成答案、填写并保存
- 📝 **多题型支持** — 判断题、单选题、多选题、填空题、函数填空、编程题、代码补全
- 🚫 **突破粘贴限制** — 绕过 PTA 的复制粘贴屏蔽机制
- 🖱️ **浮动面板** — 可拖拽的浮动面板，实时显示状态和答题记录
- 💾 **配置持久化** — API 配置保存在浏览器本地，刷新不丢失
- 📦 **批量模式** — 编程题支持批量解答，自动遍历所有题目
- ⏭️ **自动跳转** — 答完当前题型后自动切换到下一题型
- 📚 **题目背景** — 可添加背景知识，辅助 AI 更好地答题

## 📦 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 浏览器扩展
2. 点击 Tampermonkey 图标 → **创建新脚本**
3. 将 [`pta-paste-bypass.js`](./pta-paste-bypass.js) 的内容粘贴进去，保存
4. 访问 [pintia.cn](https://pintia.cn) 的考试页面，右上角出现浮动面板即安装成功

## 🚀 使用方法

### 基本配置

1. 打开 PTA 考试页面，右上角会出现浮动面板
2. 点击 **「⚙️ API 配置」** 展开设置区域
3. 选择 API 类型并填写配置：

| API 类型 | 需要填写 |
|----------|----------|
| OpenAI | API Key |
| DeepSeek | API Key |
| 自定义 | API URL、API Key、模型名称 |

4. 点击 **「💾 保存配置」**

### 自动解题

1. 在 PTA 考试页面切换到要解答的题型标签（判断题/单选题/编程题等）
2. 点击 **「▶ 开始答题」**
3. 等待 AI 分析题目并自动填写答案
4. 完成后会显示答题记录

### 停止解题

- 点击 **「⏹ 停止」** 按钮即可中断当前解题流程

## 📋 支持的题型

| 题型 | URL 标识 | 说明 |
|------|----------|------|
| 判断题 | `type=1` | TRUEORFALSE |
| 单选题 | `type=2` | MULTIPLECHOICE |
| 多选题 | `type=3` | MULTIPLECHOICEMORETHANONEANSWER |
| 填空题 | `type=4,5` | FILLINTHEBLANK / FILLINTHEBLANKS |
| 函数填空 | `type=6` | FILLINTHEBLANKFORPROGRAMMING |
| 编程题 | `type=7,9` | PROGRAMMING / CODEPROGRAMMING |
| 代码补全 | `type=8` | CODECOMPLETION |

## ⚙️ 配置说明

### API 配置

| 配置项 | 说明 |
|--------|------|
| API 类型 | OpenAI / DeepSeek / 自定义 |
| API Key | API 密钥 |
| API URL | 自定义 API 地址（仅自定义类型） |
| 模型名称 | 自定义模型名称（仅自定义类型） |

### PTA 专属配置

| 配置项 | 说明 |
|--------|------|
| 函数填空语言 | C / C++ / Java / Python |
| 编程题语言 | C / C++ / Java / Python |
| 去除代码注释 | 自动移除 AI 生成代码中的注释 |
| 编程题批量模式 | 遍历并解答所有编程题 |
| 答完自动切换下一题型 | 完成当前题型后自动跳转 |

### 题目背景

点击 **「📝 题目背景」** 展开，可以：
- 📋 从剪贴板粘贴背景知识
- ✏️ 手动输入背景信息
- 🗑️ 清空已输入的内容

AI 答题时会参考这些背景知识，提高答题准确率。

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
A: 确认你在 `pintia.cn` 域名下的考试页面，Tampermonkey 已启用，尝试刷新页面。

**Q: 提示"未找到代码编辑器"？**
A: 页面未完全加载，等待加载完成后刷新重试。

**Q: AI 返回结果异常？**
A: 检查 API 地址、Key、模型名称是否正确，API 额度是否充足。

**Q: 如何停止自动解题？**
A: 点击面板上的「⏹ 停止」按钮。

**Q: 编程题填写失败？**
A: 尝试在 PTA 页面手动选择编程语言，或在配置中切换语言后重试。

**Q: 支持哪些编程语言？**
A: 支持 C、C++、Java、Python，可在配置中选择。

## 🔒 安全性

- ✅ 所有配置保存在本地浏览器，不会上传到任何服务器
- ✅ 仅与用户配置的 AI 服务端点通信
- ✅ 开源代码，可自行审计

## ⚠️ 免责声明

本项目仅供学习和研究使用。请遵守：
- Pintia 平台的使用条款
- 所在地区法律法规
- 学校相关规定

**不建议在涉及学术诚信的考试或竞赛中使用。**

## 📄 许可证

[MIT License](./LICENSE)
