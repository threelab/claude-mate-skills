---
name: "clipAnnouncement"
description: "智能剪辑口播视频，识别错误信息、语气词和无效内容。调用火山引擎 ASR 接口转写音频并分析，输出需剪辑片段的时间戳。适用于用户说'剪口播'、'智能剪辑'或需要分析视频脚本时。"
---

# 口播视频智能剪辑

本 Skill 通过火山引擎 ASR 接口对口播视频进行智能分析，识别并标记：
- **语气词**：嗯、啊、哦、这个、那个、然后、就是说等
- **错误信息**：口误、表达错误、逻辑不通等
- **无效内容**：重复、停顿过长、口水话等

## 使用场景

- 用户说"剪口播"、"智能剪辑"
- 用户需要分析视频中的问题片段
- 用户想要快速定位需要删除的部分

## 工作流程

### 1. 接收视频文件

接收用户提供的视频文件路径，支持格式：MP4、MOV、AVI、MKV

### 2. 提取音频

使用 FFmpeg 将视频中的音频提取为 WAV 格式（16kHz，单声道）

```bash
ffmpeg -i input.mp4 -ar 16000 -ac 1 -acodec pcm_s16le audio.wav
```

### 3. 调用火山引擎 ASR 接口

使用火山引擎大模型语音识别 API 进行音频转写：

**接口地址**: `https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit`

**请求示例**:
```python
import requests
import json

def submit_asr_task(audio_url: str, appid: str, token: str) -> dict:
    """
    提交 ASR 任务到火山引擎
    
    Args:
        audio_url: 音频文件URL（需公网可访问或上传到火山引擎存储）
        appid: 火山引擎 App ID
        token: 访问令牌
    
    Returns:
        包含 task_id 和 x_tt_logid 的字典
    """
    submit_url = "https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit"
    task_id = str(uuid.uuid4())
    
    headers = {
        "X-Api-App-Key": appid,
        "X-Api-Access-Key": token,
        "X-Api-Resource-Id": "volc.bigasr.auc",
        "X-Api-Request-Id": task_id,
        "X-Api-Sequence": "-1"
    }
    
    request_body = {
        "user": {"uid": "fake_uid"},
        "audio": {
            "url": audio_url,
            "format": "wav",
            "codec": "raw"
        },
        "request": {
            "model_name": "bigmodel",
            "model_version": "400",
            "enable_itn": True,      # 启用逆文本归一化
            "enable_punc": True,     # 启用标点
            "enable_ddc": True,      # 启用数字转换
            "show_utterances": True, # 显示分句结果
            "enable_channel_split": False,
            "enable_speaker_info": False
        }
    }
    
    response = requests.post(submit_url, json=request_body, headers=headers)
    return {
        "task_id": task_id,
        "x_tt_logid": response.headers.get("X-Tt-Logid", "")
    }
```

### 4. 查询识别结果

**接口地址**: `https://openspeech.bytedance.com/api/v3/auc/bigmodel/query`

```python
def query_asr_result(task_id: str, x_tt_logid: str, appid: str, token: str) -> dict:
    """
    查询 ASR 识别结果
    
    Args:
        task_id: 提交任务时返回的任务ID
        x_tt_logid: 提交任务时返回的日志ID
        appid: 火山引擎 App ID
        token: 访问令牌
    
    Returns:
        包含识别结果的字典
    """
    query_url = "https://openspeech.bytedance.com/api/v3/auc/bigmodel/query"
    
    headers = {
        "X-Api-App-Key": appid,
        "X-Api-Access-Key": token,
        "X-Api-Resource-Id": "volc.bigasr.auc",
        "X-Api-Request-Id": task_id,
        "X-Tt-Logid": x_tt_logid
    }
    
    response = requests.post(query_url, data="{}", headers=headers)
    return response.json()
```

### 5. 分析并标记问题片段

根据转写结果，使用NLP规则识别问题内容：

```python
# 语气词列表（可配置）
FILLER_WORDS = [
    "嗯", "啊", "哦", "呃", "呀", "嘛", "呐", "哈", "哎",
    "这个", "那个", "然后", "就是说", "其实", "基本上",
    "大概", "可能", "应该", "感觉", "我觉得", "你知道",
    "对吧", "是吧", "好吗", "好不好", "行不行"
]

# 停顿类问题标记
PAUSE_THRESHOLD = 3.0  # 超过3秒的静音视为停顿

def analyze_transcript(transcript_data: dict) -> list:
    """
    分析转写结果，标记问题片段
    
    Returns:
        问题片段列表，每项包含: type, word, start_time, end_time, suggestion
    """
    issues = []
    
    for utterance in transcript_data.get("utterances", []):
        text = utterance.get("text", "")
        start_time = utterance.get("start_time", 0) / 1000  # 转换为秒
        end_time = utterance.get("end_time", 0) / 1000
        
        # 检测语气词
        for filler in FILLER_WORDS:
            if filler in text:
                issues.append({
                    "type": "语气词",
                    "word": filler,
                    "start_time": start_time,
                    "end_time": end_time,
                    "suggestion": f"建议删除或替换'{filler}'"
                })
        
        # 检测重复（简单规则：连续相同字符超过3次）
        import re
        repeats = re.findall(r'(.)\1{2,}', text)
        for repeat in repeats:
            issues.append({
                "type": "重复",
                "word": repeat * 3,
                "start_time": start_time,
                "end_time": end_time,
                "suggestion": "检测到重复字符，建议删除"
            })
    
    # 按时间排序
    issues.sort(key=lambda x: x["start_time"])
    return issues
```

### 6. 输出剪辑建议

以结构化格式输出分析结果和剪辑建议：

```markdown
## 口播分析报告

**视频文件**: example.mp4
**总时长**: 05:32
**分析时间**: 2024-01-15 14:30:00

---

### 问题片段汇总

| 序号 | 类型 | 时间范围 | 内容 | 建议 |
|------|------|----------|------|------|
| 1 | 语气词 | 00:12 - 00:14 | "嗯...嗯...那个" | 删除 |
| 2 | 停顿 | 00:45 - 00:49 | 4秒停顿 | 删除或保留背景音乐 |
| 3 | 语气词 | 01:23 - 01:25 | "就是说" | 删除 |
| 4 | 重复 | 02:15 - 02:18 | "对对对" | 删除 |
| ... | ... | ... | ... | ... |

---

### 剪辑点建议

需要删除的时间段：
- 00:12 - 00:14
- 00:45 - 00:49  
- 01:23 - 01:25
- 02:15 - 02:18
- ...

**总计**: 发现 N 个问题片段，建议删除约 M 秒

---

### 完整转写文本

[转写文本内容...]

---

### FFmpeg 剪切命令

```bash
# 删除问题片段（保留正常部分）
ffmpeg -i input.mp4 -vf "select='not(between(t,0.2,0.24)+between(t,0.75,0.82))',setpts=N/FRAME_RATE/TB" -af "aselect='not(between(t,0.2,0.24)+between(t,0.75,0.82))',asetpts=N/SR/TB' " output.mp4
```
```

## 环境配置

### 必需环境变量

```bash
# 火山引擎配置
VOLCENGINE_APP_ID=your_app_id
VOLCENGINE_ACCESS_TOKEN=your_access_token
```

### 必需工具

- **FFmpeg**: 用于音视频处理
  - Windows: 下载 ffmpeg 并添加到 PATH
  - 或使用 `winget install ffmpeg`

### Python 依赖

```bash
pip install volcengine-python-sdk requests
```

## 注意事项

1. **音频格式**: 确保提取的音频为 16kHz、WAV 格式
2. **API 配额**: 注意火山引擎 ASR 的 QPS 限制（默认 50次/秒）
3. **长视频处理**: 超过 3 小时的音频需分段处理
4. **语气词配置**: 可根据实际需求增删语气词列表

## 错误处理

| 错误类型 | 处理方式 |
|----------|----------|
| API 超时 | 等待后重试，最多 3 次 |
| 音频格式不支持 | 自动转换后再处理 |
| 网络错误 | 检查网络连接，验证 API 配置 |
| 配额超限 | 降级处理或提示用户稍后再试 |
