# 口播视频智能剪辑 (Clip Announcement)

这是一个基于火山引擎 ASR 接口的智能视频剪辑工具，旨在帮助用户快速识别并定位口播视频中的语气词、错误信息及无效内容，实现高效的视频剪辑工作流。

## 🚀 项目结构

项目采用模块化架构设计，职责清晰，易于维护和扩展：

```
clipAnnouncement/
├── gui/                    # 图形用户界面模块
│   ├── index.html          # 前端主页面（剪辑流程控制）
│   ├── server.js           # 后端服务器（API 接口、流程调度）
│   ├── browse.py           # 文件选择脚本（跨平台文件对话框）
│   └── start_gui.bat       # Windows 快速启动脚本
├── scripts/                # 处理脚本模块
│   ├── generate_subtitles.js  # ASR 结果转换（字级别时间码生成）
│   └── generate_review.js     # 审核页面生成器
├── templates/              # HTML 模板
│   └── review.html         # 审核页面模板
├── tools/                  # 工具模块
│   └── asr_engine.js       # 火山引擎 ASR 接口封装
├── config/                 # 配置模块
│   ├── preferences/
│   │   └── user.json       # 用户偏好设置
│   └── principles/         # 剪辑原则文档
│       ├── 1-core.md       # 核心原则
│       ├── 2-fillers.md    # 语气词处理规则
│       ├── 3-pauses.md     # 停顿处理规则
│       ├── 4-corrections.md # 纠错判定规则
│       ├── 5-logic.md      # 重复检测规则
│       └── README.md       # 原则说明
├── FFmpeg/                 # 内置 FFmpeg 工具
├── output/                 # 输出目录（自动生成）
├── .env                    # 环境变量配置
├── .gitignore              # Git 忽略配置
├── package.json            # 项目依赖配置
└── README.md               # 项目说明文档
```

## 🛠️ 环境准备

### 前置依赖

| 依赖 | 要求 | 说明 |
|------|------|------|
| Node.js | >= 14.0.0 | JavaScript 运行环境 |
| Python | >= 3.6 | 文件选择对话框支持 |
| FFmpeg | 内置 | 音频提取和视频剪辑（已内置） |

### API 配置

在项目根目录的 `.env` 文件中配置火山引擎 API Key：

```env
VOLCENGINE_API_KEY=your_api_key_here
VOLCENGINE_API_SECRET=your_api_secret_here
PORT=3005
```

## 📖 使用方法

### 快速启动（推荐）

```bash
# Windows 用户直接双击
gui/start_gui.bat

# 或使用命令行
npm start
```

### 手动启动

1. **安装依赖**：
   ```bash
   npm install
   ```

2. **启动服务**：
   ```bash
   node gui/server.js
   ```

3. **访问应用**：
   - 打开浏览器访问 http://localhost:3005

4. **剪辑流程**：
   - **选择文件**：点击"浏览..."按钮选择本地视频文件
   - **开始处理**：点击"开始处理"执行完整流程（音频提取→转录→分析）
   - **跳过提取**：若已有音频文件，点击"跳过提取，直接转录"
   - **审核剪辑**：处理完成后点击"打开审核页面"进行人工审核和最终剪辑

## ⚖️ 剪辑原则

### 核心原则：语义完整性优先

剪辑决策始终以保持内容语义完整为首要目标：

| 原则 | 说明 |
|------|------|
| 删前保后 | 口播过程中后说的内容通常更完整准确，删除前面的口误/残句，保留后面的完整表述 |
| 最小干预 | 仅删除明确需要处理的内容，保持原始表达风格 |
| 上下文感知 | 考虑前后语境，避免孤立删除导致语义断裂 |
| 人工复核 | AI 自动选择仅作为建议，最终决策由人工审核确认 |

### 处理规则分类

1. **语气词处理**：识别并标记常见语气词（嗯、啊、呃、哦等）
2. **停顿处理**：检测静音间隔，支持批量选择删除
3. **纠错判定**：识别口误和自我纠正内容
4. **重复检测**：识别重复表述并建议删除冗余部分

详细规则请参考 `config/principles/` 目录下的文档。

## 📁 输出文件结构

处理完成后，输出目录结构如下：

```
output/日期_视频名/
└── 剪口播/
    ├── 1_转录/
    │   ├── audio.mp3              # 提取的音频文件
    │   ├── volcengine_result.json # 火山引擎原始转录结果
    │   └── subtitles_words.json   # 字级别时间码数据
    ├── 2_分析/
    │   └── auto_selected.json     # AI 自动选择的删除片段索引
    └── 3_审核/
        ├── review.html            # 交互式审核页面
        ├── video.mp4              # 视频文件链接
        └── saved_selection.json   # 用户保存的剪辑选择
```

## 🔧 命令行工具

### generate_subtitles.js

将 ASR 转录结果转换为字级别时间码：

```bash
node scripts/generate_subtitles.js <input.json> [exclude.json]
```

### generate_review.js

生成交互式审核页面：

```bash
node scripts/generate_review.js <timestamps.json> [selected.json] [video.mp4]
```

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

### 代码规范

- 使用 2 空格缩进
- 使用单引号（除非包含模板字符串）
- 变量命名采用 camelCase
- 函数命名采用 camelCase
- 文件命名采用 kebab-case

## 📄 声明

本项目仅供学习与交流使用。使用火山引擎 API 产生的费用由用户自行承担，请合理控制 API 调用量。

## 📝 更新日志

- **v1.0.0** - 初始版本，支持完整的视频剪辑流程
- **v1.1.0** - 新增"跳过提取，直接转录"功能
- **v1.2.0** - 优化审核页面，支持批量选择和快捷键操作

---

## 🔗 相关资源

更多实用的 AI 工具和教程，请访问：

- **AI 工具合集**: https://mowanyan.com
- **火山引擎文档**: https://www.volcengine.com/docs
- **FFmpeg 官方文档**: https://ffmpeg.org/documentation.html

---

*本项目基于火山引擎 ASR 服务构建，欢迎体验更多 AI 能力！*
- **v1.2.0** - 优化审核页面，支持批量选择和快捷键操作