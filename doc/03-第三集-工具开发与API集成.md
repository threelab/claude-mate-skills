# 第3步：让工具干活 - 招聘语音识别和视频处理"员工"

**上一集**：[第2步：定规则和配置](./02-第二集-配置文件与原则系统.md) | **下一集**：[第4步：做一个好用的界面](./04-第四集-前后端交互与流程控制.md)

---

## 讲个故事：开一家餐厅

想象你要开一家餐厅。

你已经：
- ✅ 想好了要卖什么（口播剪辑工具）
- ✅ 定好了菜单和规则（配置文件）

现在你需要**招聘员工**来帮你干活。

你需要两个核心员工：

| 员工 | 职位 | 做什么 | 现实中的类比 |
|------|------|--------|-------------|
| 🎙️ 小音 | 速记员 | 听音频，把每句话写下来，还要标上是第几秒说的 | 火山引擎/阿里云/腾讯云语音识别服务 |
| 🎬 小影 | 剪辑师 | 从视频里提取音频，按要求剪辑 | FFmpeg（免费的视频处理工具） |

**这两个员工就是我们这一步要"招聘"的工具。**

---

## 第一个员工：语音识别（把声音变成文字）

### 语音识别能做什么？

你给它一段音频，它返回给你：

```
时间 00:00 → "嗯"
时间 00:01 → "那个"
时间 00:02 → "大家好"
时间 00:04 → "今天"
时间 00:05 → "想跟大家分享"
...
```

不仅告诉你**说什么**，还告诉你**什么时候说的**。

这个"时间信息"至关重要——因为我们需要知道每个字在视频的哪个位置，这样才能精准剪辑。

### 怎么"雇佣"语音识别？

你需要：

1. **去一家公司注册账号**（比如火山引擎、阿里云、腾讯云都有语音识别服务）
2. **拿到"工牌"**（API Key 和 API Secret）
3. **告诉程序怎么联系这个员工**（写代码调用）

**现实操作：**

1. 打开火山引擎官网 → 注册账号 → 开通"语音识别"服务
2. 创建应用 → 获取 Access Key ID 和 Access Key Secret
3. 把这两个信息配置到项目的 `.env` 文件里

```env
# .env 文件内容（放在项目根目录）
VOLCENGINE_API_KEY=你的KeyID
VOLCENGINE_API_SECRET=你的SecretKey
```

⚠️ **重要：** 这个 Key 就像你家门钥匙，**不要上传到公开的代码仓库**，否则别人可以用你的账号花钱。

---

## 实际例子：看看调用是什么样的

（以下是简化的代码示例，帮助你理解逻辑）

```javascript
// 你告诉程序：去联系"语音识别"员工
const result = await speechEngine.transcribe('我的音频文件.mp3');

// 它会返回类似这样的数据：
{
  utterances: [
    {
      text: "嗯那个大家好",
      start_time: 0,      // 开始时间（秒）
      end_time: 2.5,       // 结束时间（秒）
      words: [
        { text: "嗯", start_time: 0, end_time: 0.3 },
        { text: "那", start_time: 0.3, end_time: 0.5 },
        { text: "个", start_time: 0.5, end_time: 0.7 },
        { text: "大", start_time: 0.8, end_time: 1.0 },
        { text: "家", start_time: 1.0, end_time: 1.2 },
        { text: "好", start_time: 1.2, end_time: 1.5 }
      ]
    }
  ]
}
```

看到了吗？每个字都有精确的开始时间和结束时间。

---
版权声明：[https://mowanyan.com](https://mowanyan.com)

有了这个信息，我们就能：
1. 知道每个字在第几秒
2. 判断哪些字是语气词（"嗯"、"那个"）
3. 标记哪些时间段可以删除

---

## 第二个员工：FFmpeg（视频处理）

### FFmpeg 是什么？

FFmpeg 是一个**免费的视频处理工具**，全世界的视频软件都在用它。它就像一个全能的剪辑师。

**你可以让它做：**
- 📤 从视频里提取音频 → "把声音文件给我"
- ✂️ 剪切视频片段 → "从第5秒到第10秒剪出来"
- 🔗 拼接多个视频 → "把这几个视频连起来"
- ⚡ 转换视频格式 → "MP4 转成 AVI"
- 🎚️ 调整音量、速度 → "声音调大一点"

### FFmpeg 怎么用？

FFmpeg 是一个命令行工具，你在终端（cmd 或终端）输入命令，它就干活。

**常用命令例子：**

```bash
# 1. 从视频提取音频
ffmpeg -i video.mp4 -vn -acodec libmp3lame audio.mp3

# 解读：
# ffmpeg → 调用工具
# -i video.mp4 → 输入文件是 video.mp4
# -vn → 不要视频流（video no）
# -acodec libmp3lame → 用 MP3 编码器
# audio.mp3 → 输出成 audio.mp3
```

```bash
# 2. 从视频剪掉一段（比如第10-15秒不要）
ffmpeg -i video.mp4 -vf "select='not(between(t,10,15))'" -c copy output.mp4
```

```bash
# 3. 获取视频信息
ffmpeg -i video.mp4
```

### 在我们的项目里怎么用？

程序可以自动调用 FFmpeg，不需要你手动输入命令。

**简化的代码逻辑：**

```javascript
const { execSync } = require('child_process');

// 定义工具函数
function extractAudio(videoPath, outputPath) {
  // 构造命令
  const command = `ffmpeg -i "${videoPath}" -vn -acodec libmp3lame "${outputPath}"`;

  // 执行命令
  execSync(command);

  console.log('✅ 音频提取完成');
}

// 使用
extractAudio('我的视频.mp4', '提取的音频.mp3');
```

**实际效果：**

你调用 `extractAudio()` → 程序自动执行 FFmpeg 命令 → 在文件夹里生成音频文件。

---

## 把两个员工连起来工作

现在我们有两个员工了，怎么让他们配合？

### 工作流程

```
用户给视频文件
    ↓
小影（FFmpeg）提取音频
    ↓
生成 audio.mp3
    ↓
小音（语音识别）听音频，写文字
    ↓
生成识别结果（每个字的时间戳）
    ↓
应用规则，标记要删除的片段
    ↓
生成报告给用户
```

### 在代码里怎么实现？

```javascript
// 步骤1：提取音频
const ffmpeg = new FFmpegHelper();
ffmpeg.extractAudio('视频.mp4', 'audio.mp3');

// 步骤2：语音识别
const asr = new ASREngine({
  apiKey: process.env.VOLCENGINE_API_KEY,
  apiSecret: process.env.VOLCENGINE_API_SECRET
});

const result = await asr.transcribe('audio.mp3');

// 步骤3：保存结果
fs.writeFileSync('识别结果.json', JSON.stringify(result));

console.log('✅ 识别完成');
```

---

## 可能出问题的地方

### 问题1：网络请求失败

**情况：** 调用语音识别时，网络断了或者服务器超时。

**怎么办？**

```javascript
// 加一个重试机制
async function transcribeWithRetry(audioPath, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await asr.transcribe(audioPath);
    } catch (error) {
      console.log(`第 ${i + 1} 次失败，重试中...`);
      // 等 1 秒再试
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  throw new Error('多次重试都失败了');
}
```

### 问题2：音频格式不支持

**情况：** 语音识别只支持特定格式（比如 WAV、16kHz采样）。

**怎么办？** 用 FFmpeg 先转换格式：

```bash
# 转成语音识别需要的格式
ffmpeg -i input.mp3 -ar 16000 -ac 1 -c:a pcm_s16le output.wav
```

### 问题3：文件不存在

**情况：** 用户给的视频文件找不到。

**怎么办？** 做个检查：

```javascript
if (!fs.existsSync(videoPath)) {
  console.error('❌ 找不到视频文件:', videoPath);
  process.exit(1); // 退出程序
}
```

---

## 把工具封装起来

为了方便使用，我们把这些工具封装在 `tools/` 目录下：

```
tools/
├── asr_engine.js      ← 语音识别工具（"小音"）
├── ffmpeg_helper.js   ← 视频处理工具（"小影"）
└── preferences.js     ← 用户偏好管理
```

这样，其他地方想用这些工具，只要引入就行。

**使用示例：**

```javascript
const ASREngine = require('./tools/asr_engine');
const FFmpegHelper = require('./tools/ffmpeg_helper');

// 初始化
const asr = new ASREngine({
  apiKey: '你的key',
  apiSecret: '你的secret'
});

const ffmpeg = new FFmpegHelper();

// 工作
ffmpeg.extractAudio(videoPath, audioPath);
const result = await asr.transcribe(audioPath);
```

---

## 实际场景：处理一段视频

我们来完整演练一遍：

### 输入

用户有个视频：`2026年学习计划.mp4`（时长5分钟，有口播内容）

### 处理过程

**步骤1：提取音频**
```
ffmpeg -i "2026年学习计划.mp4" -vn -acodec libmp3lame audio.mp3
```
→ 生成 `audio.mp3`

**步骤2：语音识别**
```
发送 audio.mp3 → 火山引擎语音识别服务
```
→ 返回识别结果（假设500个字，每个字都有时间戳）

**步骤3：应用规则**
```
遍历识别结果
    → 语气词？ → 标记为"可删除"
    → 停顿超过1.5秒？ → 标记为"可删除"
    → 其他？ → 保留
```

**步骤4：生成报告**
```
分析完成！
原始时长：5分30秒
建议删除：45秒
删除后预计时长：4分45秒
节省约：14%
```

---

## 小结：这一步我们做了什么？

**核心成果：**

1. ✅ "招聘"了语音识别员工（火山引擎 ASR）
2. ✅ "招聘"了视频处理员工（FFmpeg）
3. ✅ 写代码让他们配合工作（提取音频 → 识别 → 分析）
4. ✅ 加上错误处理（重试、检查文件...）

**关键点：**

- API Key 是你的"钥匙"，不要泄露
- FFmpeg 是本地工具，免费但要学会命令
- 两个工具配合才能完成完整流程
- 一定要加错误处理（网络会断、文件会坏）

---

## 你可能会问的问题

**Q: 语音识别要钱吗？**
A: 大部分云服务商提供免费额度（比如每个月2小时免费），超出后按用量收费。口播剪辑工具用得不多的话基本不花钱。

**Q: 一定要用火山引擎吗？**
A: 不一定。阿里云、腾讯云、百度都有语音识别服务，哪个便宜好用用哪个。核心逻辑是一样的。

**Q: FFmpeg 怎么安装？**
A: Windows 用户可以直接下载 FFmpeg 的可执行文件，放到项目目录里。我们的项目已经内置了 FFmpeg。

**Q: 处理一段5分钟视频需要多久？**
A: 提取音频几秒钟，语音识别取决于网络速度，一般几分钟内完成。

---

## 下一步

现在工具都准备好了，但还缺一个**用户界面**。

用户怎么选择视频文件？
怎么看到处理进度？
怎么确认要删除的内容？

这些就是下一步要做的——做一个用户能看懂、能操作的界面。

👉 **[继续第4步：做一个好用的界面](./04-第四集-前后端交互与流程控制.md)**
