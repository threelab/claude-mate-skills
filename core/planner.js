/**
 * Planner: 任务调度中心
 * 负责串联：音频提取 -> ASR 转写 -> 智能分析 -> 报告生成
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

class Planner {
  constructor(asrEngine, analyst) {
    this.asrEngine = asrEngine;
    this.analyst = analyst;
  }

  async processVideo(videoPath) {
    const videoAbsPath = path.resolve(videoPath);
    if (!fs.existsSync(videoAbsPath)) {
      throw new Error(`视频文件不存在: ${videoAbsPath}`);
    }

    const outputDir = path.join(path.dirname(videoAbsPath), 'clip_output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir);
    }

    const audioPath = path.join(outputDir, `${path.basename(videoAbsPath, path.extname(videoAbsPath))}.wav`);

    try {
      // 1. 提取音频
      console.log("步骤 1: 正在从视频中提取音频...");
      this.extractAudio(videoAbsPath, audioPath);

      // 2. ASR 转写 (假设音频已上传或可直接访问，这里模拟流程)
      // 注意：实际火山引擎需要公网 URL 或上传，这里仅展示逻辑
      console.log("步骤 2: 正在调用火山引擎进行 ASR 转写...");
      // const { taskId, logid } = await this.asrEngine.submitTask(audioUrl);
      // const asrResult = await this.asrEngine.queryResult(taskId, logid);
      
      // 模拟 ASR 结果进行演示
      const asrResult = this.getMockAsrResult();

      // 3. 智能分析
      console.log("步骤 3: 正在根据剪辑原则进行智能分析...");
      const issues = this.analyst.analyze(asrResult);

      // 4. 生成报告
      console.log("步骤 4: 正在生成剪辑建议报告...");
      const reportPath = path.join(outputDir, 'clip_report.json');
      fs.writeFileSync(reportPath, JSON.stringify({
        video: videoAbsPath,
        timestamp: new Date().toISOString(),
        issues: issues
      }, null, 2));

      return {
        success: true,
        reportPath,
        issueCount: issues.length,
        summary: `分析完成。共识别出 ${issues.length} 处剪辑建议（语气词、长停顿、重说等）。`
      };

    } catch (error) {
      console.error("处理流程失败:", error.message);
      throw error;
    }
  }

  extractAudio(input, output) {
    const wrapperPath = path.join(__dirname, '../tools/ffmpeg_wrapper.sh');
    try {
      // 在 Windows 下可能需要通过 bash 运行或直接调用 ffmpeg
      const cmd = `ffmpeg -i "${input}" -ar 16000 -ac 1 -acodec pcm_s16le "${output}" -y`;
      execSync(cmd, { stdio: 'inherit' });
    } catch (e) {
      throw new Error(`FFmpeg 提取音频失败: ${e.message}`);
    }
  }

  getMockAsrResult() {
    // 返回模拟数据以供测试
    return {
      utterances: [
        { text: "大家好，嗯，欢迎收看。", start_time: 0, end_time: 3000 },
        { text: "今天我们要讲，呃，我们要讲的是 AI 剪辑。", start_time: 4000, end_time: 8000 },
        { text: "其实这个... 那个数据不对，应该是 120GB。", start_time: 12000, end_time: 18000 }
      ]
    };
  }
}

module.exports = Planner;
