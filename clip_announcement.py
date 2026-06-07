# -*- coding: utf-8 -*-
"""
口播视频智能剪辑工具
调用火山引擎 ASR 接口转写音频，识别语气词、错误信息等无效内容
"""

import os
import re
import json
import uuid
import argparse
import subprocess
from datetime import datetime
from typing import List, Dict, Optional
from dataclasses import dataclass

import requests


# ============ 配置 ============

# 语气词列表
FILLER_WORDS = [
    "嗯", "啊", "哦", "呃", "呀", "嘛", "呐", "哈", "哎",
    "这个", "那个", "然后", "就是说", "其实", "基本上",
    "大概", "可能", "应该", "感觉", "我觉得", "你知道",
    "对吧", "是吧", "好吗", "好不好", "行不行", "那个啥",
    "呃呃", "啊啊啊", "嗯嗯", "哦哦", "对对", "对对对",
    "啥", "咋", "咋样", "啥意思", "所以说", "就比如说"
]

# 重复模式（连续相同字符）
REPEAT_PATTERN = re.compile(r'(.)\1{2,}')

# 停顿阈值（秒），超过此值视为过长停顿
PAUSE_THRESHOLD = 3.0


# ============ 数据结构 ============

@dataclass
class IssueSegment:
    """问题片段"""
    type: str           # 类型：语气词、重复、停顿、错误
    word: str           # 关键词
    start_time: float   # 开始时间（秒）
    end_time: float     # 结束时间（秒）
    suggestion: str     # 建议

    def to_dict(self) -> dict:
        return {
            "type": self.type,
            "word": self.word,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "suggestion": self.suggestion
        }


@dataclass
class AnalysisResult:
    """分析结果"""
    video_path: str
    total_duration: float
    issues: List[IssueSegment]
    transcript: str
    full_data: dict

    @property
    def total_issue_count(self) -> int:
        return len(self.issues)

    @property
    def total_remove_duration(self) -> float:
        if not self.issues:
            return 0.0
        return sum(i.end_time - i.start_time for i in self.issues)


# ============ 工具函数 ============

def format_time(seconds: float) -> str:
    """将秒数转换为 MM:SS 格式"""
    minutes = int(seconds // 60)
    secs = int(seconds % 60)
    return f"{minutes:02d}:{secs:02d}"


def format_time_ms(ms: int) -> str:
    """将毫秒转换为 MM:SS 格式"""
    return format_time(ms / 1000)


def get_video_duration(video_path: str) -> float:
    """获取视频时长（秒）"""
    cmd = [
        'ffprobe', '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        video_path
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return float(result.stdout.strip())
    except Exception as e:
        print(f"获取视频时长失败: {e}")
        return 0.0


def extract_audio(video_path: str, output_path: str = None) -> Optional[str]:
    """
    使用 FFmpeg 提取音频
    
    Args:
        video_path: 视频文件路径
        output_path: 输出音频路径，None 则自动生成
    
    Returns:
        音频文件路径
    """
    if output_path is None:
        output_path = video_path.rsplit('.', 1)[0] + '_audio.wav'
    
    cmd = [
        'ffmpeg', '-y', '-i', video_path,
        '-ar', '16000',          # 采样率 16kHz
        '-ac', '1',              # 单声道
        '-acodec', 'pcm_s16le', # PCM 格式
        output_path
    ]
    
    print(f"正在提取音频到: {output_path}")
    try:
        subprocess.run(cmd, check=True, capture_output=True)
        print("音频提取完成")
        return output_path
    except subprocess.CalledProcessError as e:
        print(f"音频提取失败: {e.stderr.decode() if e.stderr else str(e)}")
        return None


# ============ 火山引擎 ASR API ============

class VolcEngineASR:
    """火山引擎大模型语音识别客户端"""
    
    SUBMIT_URL = "https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit"
    QUERY_URL = "https://openspeech.bytedance.com/api/v3/auc/bigmodel/query"
    
    def __init__(self, app_id: str, access_token: str):
        self.app_id = app_id
        self.access_token = access_token
    
    def submit_task(self, audio_url: str) -> tuple:
        """
        提交 ASR 任务
        
        Args:
            audio_url: 音频文件 URL（需公网可访问）
        
        Returns:
            (task_id, x_tt_logid)
        """
        task_id = str(uuid.uuid4())
        
        headers = {
            "X-Api-App-Key": self.app_id,
            "X-Api-Access-Key": self.access_token,
            "X-Api-Resource-Id": "volc.bigasr.auc",
            "X-Api-Request-Id": task_id,
            "X-Api-Sequence": "-1",
            "Content-Type": "application/json"
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
                "enable_itn": True,
                "enable_punc": True,
                "enable_ddc": True,
                "show_utterances": True,
                "enable_channel_split": False,
                "enable_speaker_info": False
            }
        }
        
        print(f"提交 ASR 任务: {task_id}")
        response = requests.post(
            self.SUBMIT_URL,
            headers=headers,
            json=request_body,
            timeout=30
        )
        
        if response.status_code != 200:
            raise Exception(f"提交任务失败: {response.status_code} {response.text}")
        
        x_tt_logid = response.headers.get("X-Tt-Logid", "")
        print(f"任务提交成功，logid: {x_tt_logid}")
        return task_id, x_tt_logid
    
    def query_result(self, task_id: str, x_tt_logid: str) -> dict:
        """
        查询 ASR 结果
        
        Args:
            task_id: 任务 ID
            x_tt_logid: 日志 ID
        
        Returns:
            识别结果字典
        """
        headers = {
            "X-Api-App-Key": self.app_id,
            "X-Api-Access-Key": self.access_token,
            "X-Api-Resource-Id": "volc.bigasr.auc",
            "X-Api-Request-Id": task_id,
            "X-Tt-Logid": x_tt_logid,
            "Content-Type": "application/json"
        }
        
        response = requests.post(
            self.QUERY_URL,
            headers=headers,
            data="{}",
            timeout=30
        )
        
        if response.status_code != 200:
            raise Exception(f"查询失败: {response.status_code} {response.text}")
        
        return response.json()
    
    def wait_for_result(self, task_id: str, x_tt_logid: str, 
                        max_wait: int = 300, interval: int = 5) -> dict:
        """
        轮询等待 ASR 结果
        
        Args:
            task_id: 任务 ID
            x_tt_logid: 日志 ID
            max_wait: 最大等待时间（秒）
            interval: 轮询间隔（秒）
        
        Returns:
            识别结果字典
        """
        import time
        
        start_time = time.time()
        print(f"开始轮询 ASR 结果，最长等待 {max_wait} 秒...")
        
        while time.time() - start_time < max_wait:
            result = self.query_result(task_id, x_tt_logid)
            
            # 检查状态
            # 0: 进行中, 1: 完成, 2: 失败
            resp_code = result.get("resp_code", 0)
            
            if resp_code == 1:
                print("ASR 识别完成")
                return result
            
            if resp_code == 2:
                raise Exception(f"ASR 识别失败: {result.get('resp_message', 'unknown')}")
            
            print(f"任务进行中，已等待 {int(time.time() - start_time)} 秒...")
            time.sleep(interval)
        
        raise Exception(f"等待超时，已等待 {max_wait} 秒")


# ============ 分析引擎 ============

class TranscriptAnalyzer:
    """转写结果分析器"""
    
    def __init__(self, filler_words: List[str] = None):
        self.filler_words = filler_words or FILLER_WORDS
        self.repeat_pattern = REPEAT_PATTERN
    
    def analyze(self, transcript_data: dict) -> tuple:
        """
        分析转写结果
        
        Args:
            transcript_data: 火山引擎返回的转写数据
        
        Returns:
            (问题列表, 完整转写文本)
        """
        issues = []
        transcript_parts = []
        
        utterances = transcript_data.get("utterances", [])
        
        for utt in utterances:
            text = utt.get("text", "").strip()
            start_time = utt.get("start_time", 0) / 1000  # 毫秒转秒
            end_time = utt.get("end_time", 0) / 1000
            
            if not text:
                continue
            
            transcript_parts.append(text)
            
            # 1. 检测语气词
            self._detect_filler_words(text, start_time, end_time, issues)
            
            # 2. 检测重复内容
            self._detect_repeats(text, start_time, end_time, issues)
            
            # 3. 检测停顿（通过时间戳间隔）
            self._detect_pause(utt, issues)
        
        # 按时间排序
        issues.sort(key=lambda x: x.start_time)
        
        full_transcript = " ".join(transcript_parts)
        return issues, full_transcript
    
    def _detect_filler_words(self, text: str, start: float, end: float, 
                            issues: List[IssueSegment]):
        """检测语气词"""
        for filler in self.filler_words:
            if filler in text:
                # 找到语气词在文本中的位置，计算相对时间
                idx = text.index(filler)
                # 简化处理：假设均匀分布
                ratio = idx / len(text) if len(text) > 0 else 0
                issue_start = start + ratio * (end - start)
                
                issues.append(IssueSegment(
                    type="语气词",
                    word=filler,
                    start_time=issue_start,
                    end_time=issue_start + 0.5,  # 简化估计
                    suggestion=f"建议删除或替换 '{filler}'"
                ))
    
    def _detect_repeats(self, text: str, start: float, end: float,
                       issues: List[IssueSegment]):
        """检测重复内容"""
        repeats = self.repeat_pattern.findall(text)
        for repeat in repeats:
            issues.append(IssueSegment(
                type="重复",
                word=repeat * 3,
                start_time=start,
                end_time=end,
                suggestion="检测到重复字符，建议删除"
            ))
    
    def _detect_pause(self, utterance: dict, issues: List[IssueSegment]):
        """检测过长停顿"""
        # 停顿通常在转写结果中表现为较长的空白
        # 这里可以根据 silence_duration 字段来判断（如果有的话）
        pass  # 简化处理


# ============ 报告生成 ============

class ReportGenerator:
    """分析报告生成器"""
    
    def __init__(self, result: AnalysisResult):
        self.result = result
    
    def generate_markdown(self) -> str:
        """生成 Markdown 格式报告"""
        r = self.result
        
        lines = [
            f"# 口播分析报告",
            "",
            f"**视频文件**: {os.path.basename(r.video_path)}",
            f"**总时长**: {format_time(r.total_duration)}",
            f"**分析时间**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
            f"**问题总数**: {r.total_issue_count} 处",
            f"**预计可删除**: {r.total_remove_duration:.1f} 秒",
            "",
            "---",
            "",
            "## 问题片段汇总",
            "",
            "| 序号 | 类型 | 时间范围 | 内容 | 建议 |",
            "|------|------|----------|------|------|",
        ]
        
        for i, issue in enumerate(r.issues, 1):
            time_range = f"{format_time(issue.start_time)} - {format_time(issue.end_time)}"
            lines.append(f"| {i} | {issue.type} | {time_range} | {issue.word} | {issue.suggestion} |")
        
        lines.extend([
            "",
            "---",
            "",
            "## 剪辑点建议",
            "",
            "### 需要删除的时间段：",
        ])
        
        if r.issues:
            for issue in r.issues:
                lines.append(f"- {format_time(issue.start_time)} - {format_time(issue.end_time)}")
        else:
            lines.append("- 无")
        
        lines.extend([
            "",
            f"**总计**: 发现 {r.total_issue_count} 个问题片段，建议删除约 {r.total_remove_duration:.1f} 秒",
            "",
            "---",
            "",
            "## 完整转写文本",
            "",
            r.transcript or "（无）",
            "",
            "---",
            "",
            "## FFmpeg 剪切命令",
            "",
            "```bash",
            self._generate_ffmpeg_command(),
            "```",
            "",
            "---",
            "",
            "## 原始数据（JSON）",
            "",
            "```json",
            json.dumps(r.full_data, ensure_ascii=False, indent=2),
            "```",
        ])
        
        return "\n".join(lines)
    
    def _generate_ffmpeg_command(self) -> str:
        """生成 FFmpeg 剪切命令"""
        r = self.result
        
        if not r.issues:
            return f"# 无问题片段，直接复制原视频\ncp \"{r.video_path}\" output.mp4"
        
        # 构建保留表达式
        # 简化版本：生成一个删除问题片段的命令
        delete_ranges = []
        for issue in r.issues:
            start = issue.start_time
            end = issue.end_time
            # 留一点余量
            delete_ranges.append(f"between(t,{start - 0.1},{end + 0.1})")
        
        delete_expr = "+".join(delete_ranges)
        keep_expr = f"not({delete_expr})"
        
        cmd = (
            f'ffmpeg -i "{r.video_path}" '
            f'-vf "select=\'{keep_expr}\',setpts=N/FRAME_RATE/TB" '
            f'-af "aselect=\'{keep_expr}\',asetpts=N/SR/TB" '
            f'output.mp4'
        )
        
        return cmd
    
    def save_report(self, output_path: str = None) -> str:
        """保存报告到文件"""
        if output_path is None:
            base = os.path.splitext(self.result.video_path)[0]
            output_path = f"{base}_analysis_report.md"
        
        content = self.generate_markdown()
        
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(content)
        
        print(f"报告已保存到: {output_path}")
        return output_path


# ============ 主流程 ============

class ClipAnnouncementTool:
    """口播剪辑工具主类"""
    
    def __init__(self, app_id: str = None, access_token: str = None):
        """
        初始化
        
        Args:
            app_id: 火山引擎 App ID（也可通过环境变量 VOLCENGINE_APP_ID 设置）
            access_token: 访问令牌（也可通过环境变量 VOLCENGINE_ACCESS_TOKEN 设置）
        """
        self.app_id = app_id or os.getenv("VOLCENGINE_APP_ID")
        self.access_token = access_token or os.getenv("VOLCENGINE_ACCESS_TOKEN")
        
        if not self.app_id or not self.access_token:
            raise ValueError(
                "请设置火山引擎 API 凭证：\n"
                "  - app_id: VOLCENGINE_APP_ID\n"
                "  - access_token: VOLCENGINE_ACCESS_TOKEN"
            )
        
        self.asr_client = VolcEngineASR(self.app_id, self.access_token)
        self.analyzer = TranscriptAnalyzer()
    
    def analyze_video(self, video_path: str, audio_url: str = None,
                     wait_for_result: bool = True) -> AnalysisResult:
        """
        分析视频
        
        Args:
            video_path: 视频文件路径
            audio_url: 音频文件 URL（公网可访问），如果为 None 则需要先提取音频
            wait_for_result: 是否等待 ASR 结果
        
        Returns:
            分析结果
        """
        if not os.path.exists(video_path):
            raise FileNotFoundError(f"视频文件不存在: {video_path}")
        
        print(f"\n{'='*50}")
        print(f"开始分析视频: {video_path}")
        print(f"{'='*50}\n")
        
        # 1. 获取视频时长
        duration = get_video_duration(video_path)
        print(f"视频时长: {format_time(duration)}")
        
        # 2. 提取音频（如果需要）
        audio_path = None
        if audio_url is None:
            audio_path = extract_audio(video_path)
            if audio_path is None:
                raise Exception("音频提取失败，无法继续")
            # 注意：这里需要将本地音频上传到可访问的 URL
            # 简化处理：假设用户已自行上传
            print("请将音频上传到公网可访问的地址，并在 audio_url 参数中提供")
            raise NotImplementedError(
                "需要将音频上传到公网可访问的 URL，并传入 audio_url 参数\n"
                "或使用火山引擎 VOD 服务上传视频获取 Vid"
            )
        
        # 3. 提交 ASR 任务
        task_id, x_tt_logid = self.asr_client.submit_task(audio_url)
        
        # 4. 等待结果
        if wait_for_result:
            transcript_data = self.asr_client.wait_for_result(task_id, x_tt_logid)
        else:
            # 返回任务 ID，稍后查询
            return None
        
        # 5. 分析转写结果
        print("正在分析转写内容...")
        issues, transcript = self.analyzer.analyze(transcript_data)
        
        # 6. 构建结果
        result = AnalysisResult(
            video_path=video_path,
            total_duration=duration,
            issues=issues,
            transcript=transcript,
            full_data=transcript_data
        )
        
        print(f"\n分析完成！")
        print(f"  - 发现问题: {result.total_issue_count} 处")
        print(f"  - 预计可删除: {result.total_remove_duration:.1f} 秒")
        
        return result
    
    def analyze_with_uploaded_audio(self, video_path: str, audio_path: str) -> AnalysisResult:
        """
        使用本地音频文件分析（需要先上传音频到火山引擎）
        
        Args:
            video_path: 视频文件路径
            audio_path: 本地音频文件路径（提取后）
        
        Returns:
            分析结果
        """
        print("使用火山引擎 VOD API 上传音频...")
        # 这里应该调用 VOD API 上传音频
        # 简化处理，提示用户手动上传
        raise NotImplementedError(
            "请先将音频上传到火山引擎 VOD 服务，"
            "然后使用 analyze_video 方法并传入音频的 Vid 或 URL"
        )


# ============ CLI 入口 ============

def main():
    parser = argparse.ArgumentParser(
        description="口播视频智能剪辑工具",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  # 设置环境变量
  export VOLCENGINE_APP_ID=your_app_id
  export VOLCENGINE_ACCESS_TOKEN=your_token
  
  # 分析视频（需要提供音频 URL）
  python clip_announcement.py analyze -i video.mp4 --audio-url https://example.com/audio.wav
  
  # 生成报告
  python clip_announcement.py report -i video.mp4 -o report.md
        """
    )
    
    subparsers = parser.add_subparsers(dest="command", help="子命令")
    
    # analyze 子命令
    analyze_parser = subparsers.add_parser("analyze", help="分析视频")
    analyze_parser.add_argument("-i", "--input", required=True, help="输入视频文件路径")
    analyze_parser.add_argument("--audio-url", required=True, help="音频文件 URL（公网可访问）")
    analyze_parser.add_argument("--no-wait", action="store_true", help="不等待 ASR 结果，立即返回")
    
    # report 子命令
    report_parser = subparsers.add_parser("report", help="生成报告")
    report_parser.add_argument("-i", "--input", required=True, help="输入视频文件路径")
    report_parser.add_argument("-o", "--output", help="输出报告路径")
    report_parser.add_argument("--transcript", help="转写结果 JSON 文件路径")
    
    args = parser.parse_args()
    
    if args.command == "analyze":
        tool = ClipAnnouncementTool()
        result = tool.analyze_video(
            args.input,
            audio_url=args.audio_url,
            wait_for_result=not args.no_wait
        )
        
        if result:
            # 生成报告
            generator = ReportGenerator(result)
            report_path = generator.save_report()
            print(f"\n报告已生成: {report_path}")
    
    elif args.command == "report":
        # 从已有转写结果生成报告
        if not args.transcript:
            print("错误: report 命令需要 --transcript 参数")
            return
        
        with open(args.transcript, 'r', encoding='utf-8') as f:
            transcript_data = json.load(f)
        
        duration = get_video_duration(args.input)
        analyzer = TranscriptAnalyzer()
        issues, transcript = analyzer.analyze(transcript_data)
        
        result = AnalysisResult(
            video_path=args.input,
            total_duration=duration,
            issues=issues,
            transcript=transcript,
            full_data=transcript_data
        )
        
        generator = ReportGenerator(result)
        report_path = generator.save_report(args.output)
        print(f"报告已生成: {report_path}")
    
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
