/**
 * Planner: 负责拆解剪口播任务
 */

class Planner {
  constructor() {
    this.steps = [
      { id: 'extract_audio', desc: '从视频中提取音频' },
      { id: 'asr_transcription', desc: '调用火山引擎 ASR 进行语音转写' },
      { id: 'analyze_transcript', desc: '对比用户习惯与转录文本，识别语气词和错误' },
      { id: 'generate_report', desc: '生成剪辑建议报告' }
    ];
  }

  async plan(videoPath) {
    console.log(`正在为视频 ${videoPath} 规划剪辑任务...`);
    return this.steps;
  }
}

module.exports = new Planner();
