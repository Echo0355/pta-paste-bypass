# PTA AI 自动解题脚本

> **Pintia AI Auto Solver** - 一个强大的浏览器脚本，可以自动提取题目、调用 AI 生成代码、提交并跳转下一题

![Version](https://img.shields.io/badge/version-1.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## 📋 功能特性

✅ **自动解题流程**
- 自动提取题目内容
- 调用 AI 接口生成代码（支持多种 API 格式）
- 自动输入代码到编辑器
- 自动点击提交按钮
- 等待评测结果
- 成功后自动跳转到下一题，循环进行

✅ **灵活的工作模式**
- **AI 自动模式**：一键解决多道题目
- **手动输入模式**：用户提供代码，脚本代为输入

✅ **完整的错误处理**
- 网络错误捕获和提示
- API 超时控制（60秒）
- 题目提取失败检测
- 评测结果多种状态识别

✅ **用户友好的界面**
- 可拖动的浮窗面板
- 实时状态显示
- 一键切换工作模式
- 随时停止自动解题

## 🚀 快速开始

### 安装

1. 安装 Tampermonkey 浏览器扩展
   - [Chrome - Tampermonkey](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobp55f)
   - [Firefox - Tampermonkey](https://addons.mozilla.org/firefox/addon/tampermonkey/)
   - [Edge - Tampermonkey](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfohd)

2. 添加脚本
   - 点击 Tampermonkey 菜单 → "创建新脚本"
   - 复制本脚本全部内容到编辑框
   - 保存（Ctrl+S）

3. 访问 [Pintia](https://pintia.cn) 网站

### 快速配置

1. 打开任意题目页面，右下角会出现 **"PTA AI 自动解题"** 浮窗

2. 点击 **"切换AI解题"** 按钮进入 AI 模式

3. 在设置面板中填写 AI 接口信息：
   - **API 地址**：你的 AI 服务接口地址
   - **API Key**：认证密钥
   - **模型名称**：模型端点 ID
   - **系统提示词**：AI 的行为指引

4. 点击 **"AI 解题"** 开始自动解题

## 📖 详细使用说明

### 工作模式

#### 🤖 AI 自动模式

适用于想要全自动解题的场景。

```
点击 "切换AI解题" → 配置API信息 → 点击 "AI 解题"
          ↓
   自动提取题目 → 调用AI生成代码 → 输入代码
          ↓
    点击提交 → 等待评测结果 → 检查是否通过
          ↓
    通过？是 → 跳转下一题 → 循环执行
     ↓ 否
   停止流程，提示调试
```

**支持的 AI 云平台：**
- 🔥 火山引擎 ByteDance（推荐）
- 🤖 OpenAI API
- ☁️ 其他兼容 OpenAI 格式的 API

#### ✍️ 手动输入模式

适用于有现成代码想快速输入的场景。

1. 点击 **"切换手动输入"** 进入手动模式
2. 在文本框中粘贴代码
3. 点击 **"填充代码"** 脚本会自动输入到编辑器

### 配置详解

#### API 地址配置

**火山引擎（推荐）：**
```
https://ark.cn-beijing.volces.com/api/v3/chat/completions
```

**OpenAI：**
```
https://api.openai.com/v1/chat/completions
```

**其他兼容服务：**
```
https://your-service/v1/chat/completions
```

#### 模型名称配置

- **火山引擎**：格式为 `ep-xxxxxxxxxxxxxxxxxxxxxxxx`
  - 登录火山引擎控制台 → 推理服务 → 查看端点 ID

- **OpenAI**：使用 `gpt-3.5-turbo` 或 `gpt-4`

#### 系统提示词

默认提示词用于编程竞赛：
```
你是一个编程竞赛专家。严格用Python解答。生成完整、可直接运行的代码、要通过所有的测试用例。
正确处理所有输入输出格式。包含必要的import、main函数等。考虑边界情况。
只返回纯Python代码，不要任何解释、markdown标记或注释。
```

**自定义示例：**
- 改为 C++：将 "Python" 改为 "C++"
- 改为 Java：将 "Python" 改为 "Java"

## 🎮 按钮功能

| 按钮 | 模式 | 功能 |
|------|------|------|
| **AI 解题** | AI模式 | 开始自动解题流程 |
| **填充代码** | 手动模式 | 输入文本框中的代码 |
| **切换AI解题** | 手动→AI | 切换到 AI 自动模式 |
| **切换手动输入** | AI→手动 | 切换到手动输入模式 |
| **停止** | AI模式中 | 立即停止自动解题 |

## ⚠️ 常见问题

### Q1: 脚本加载后没有看到浮窗
**A:** 脚本仅在 `https://pintia.cn/` 网站上运行，确保：
- 你在 Pintia 网站
- Tampermonkey 已启用
- 刷新页面（F5）

### Q2: "未找到代码编辑器" 错误
**A:** 通常是页面加载不完全导致。解决方案：
- 等待页面完全加载
- 重新加载页面
- 确认是题目详情页面

### Q3: AI 返回格式异常
**A:** 检查：
- API 地址是否正确
- API Key 是否有效和未过期
- 模型名称是否正确
- API 配额是否充足

### Q4: 评测超时
**A:** 脚本默认等待最多 120 秒。如果评测系统响应慢：
- 手动刷新页面检查结果
- 增加等待时间（修改代码第 400 行的 `timeout` 参数）

### Q5: 怎样停止自动解题？
**A:** 
- 点击 **"停止"** 按钮（会显示在 AI 解题运行时）
- 直接关闭浮窗
- 切换页面

### Q6: 代码输入不完整
**A:** 这通常是网络延迟导致。尝试：
- 网络网速不稳定时，增加输入延迟
- 修改代码第 467 行 `await sleep(0)` 改为 `await sleep(1)` 或更大值

## 🔧 高级配置

### 修改输入延迟

在代码输入循环处（约第 467 行）：
```javascript
await sleep(0);  // 改为 await sleep(10); 增加延迟
```

### 修改评测等待超时

在 `waitForResult()` 函数（约第 365 行）：
```javascript
function waitForResult(timeout = 120000) {  // 改成需要的毫秒数
```

### 自定义 AI 提示词

在配置面板中修改 **"系统提示词"** 字段，或直接修改代码第 29 行：
```javascript
const DEFAULT_SYSTEM_PROMPT = "你的自定义提示词...";
```

## 📊 性能说明

- **代码提取速度**：< 100ms
- **AI 响应时间**：取决于 API（通常 3-30 秒）
- **代码输入速度**：< 1 秒（取决于代码长度）
- **评测结果检测**：每秒扫描一次

## 🔒 安全性与隐私

- ✅ 所有配置信息保存在本地浏览器
- ✅ 仅与指定的 AI 服务通信
- ✅ 开源代码，可审计
- ⚠️ 请妥善保管 API Key，勿分享他人

## 📝 脚本更新日志

### v1.0 (2026-04-26)
- ✨ 初版发布
- 自动解题核心功能
- 手动输入模式
- 错误处理和恢复机制
- 代码优化：合并冗余函数，统一状态管理

## 📜 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## ⚖️ 免责声明

本脚本仅供学习和研究使用。用户应遵守：
- Pintia 网站的使用条款
- 所在地区的法律法规
- 学校或组织的相关规定

**不建议在以下场景使用：**
- 学术诚实性受限的竞赛或考试
- 收费课程或认证考试
- 需要原创代码的项目

## 📞 技术支持

- 💬 提交 GitHub Issue
- 📧 联系开发者

---

**祝你使用愉快！** 🎉

