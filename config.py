# -*- coding: utf-8 -*-
"""
口播剪辑工具配置
"""

import os

# ============ 火山引擎配置 ============

# 从环境变量读取
VOLCENGINE_APP_ID = os.getenv("VOLCENGINE_APP_ID", "")
VOLCENGINE_ACCESS_TOKEN = os.getenv("VOLCENGINE_ACCESS_TOKEN", "")

# API 端点
VOLCENGINE_ASR_SUBMIT_URL = "https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit"
VOLCENGINE_ASR_QUERY_URL = "https://openspeech.bytedance.com/api/v3/auc/bigmodel/query"


# ============ 语气词配置 ============

# 常用语气词列表
FILLER_WORDS = [
    # 单字语气词
    "嗯", "啊", "哦", "呃", "呀", "嘛", "呐", "哈", "哎", "嗨",
    # 双字语气词
    "这个", "那个", "然后", "就是说", "其实", "基本上",
    "大概", "可能", "应该", "感觉", "你知道", "对吧", "是吧",
    "好吗", "好不好", "行不行", "那个啥", "啥意思",
    # 重复类
    "呃呃", "啊啊啊", "嗯嗯", "哦哦", "对对", "对对对",
    # 口语词
    "咋", "咋样", "啥", "所以说", "就比如说", "反正",
    "然后呢", "然后就是", "那什么", "你知道吗", "我跟你说"
]


# ============ 分析参数 ============

# 停顿阈值（秒），超过此值视为过长停顿
PAUSE_THRESHOLD = 3.0

# 重复字符检测（连续相同字符超过此值视为重复）
REPEAT_MIN_LENGTH = 3


# ============ 输出配置 ============

# 报告默认输出格式
REPORT_FORMAT = "markdown"

# FFmpeg 输出质量 (CRF 值，0-51，越低越好)
FFMPEG_CRF = 23

# 输出视频编码
FFMPEG_CODEC = "libx264"


# ============ 辅助函数 ============

def load_env_if_exists(env_file: str = ".env") -> None:
    """从 .env 文件加载环境变量"""
    if not os.path.exists(env_file):
        return
    
    with open(env_file, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            
            if "=" in line:
                key, value = line.split("=", 1)
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                
                if key and not os.getenv(key):
                    os.environ[key] = value
