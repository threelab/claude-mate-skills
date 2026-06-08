/**
 * Planner: 任务调度中心
 * 负责串联：音频提取 -> 上传 -> ASR 转写 -> 字幕生成 -> 智能分析 -> 报告生成
 */

const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const FormData = require('form-data');
const axios = require('axios');

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

    // 创建输出目录结构
    const baseOutputDir = path.resolve(process.cwd(), 'output');
    const dateStr = new Date().toISOString().split('T')[0];
    const videoName = path.basename(videoAbsPath, path.extname(videoAbsPath));
    const outputDir = path.join(baseOutputDir, `${dateStr}_${videoName}`, '剪口播');
    const transcribeDir = path.join(outputDir, '1_转录');
    const analysisDir = path.join(outputDir, '2_分析');
    const reviewDir = path.join(outputDir, '3_审核');

    [outputDir, transcribeDir, analysisDir, reviewDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });

    try {
      // 步骤 1: 提取音频
      console.log('步骤 1: 正在从视频中提取音频...');
      const audioPath = path.join(transcribeDir, 'audio.mp3');
      this.extractAudio(videoAbsPath, audioPath);
      console.log('✅ 音频提取完成');

      // 步骤 2: 上传音频获取公网 URL
      console.log('步骤 2: 正在上传音频...');
      const audioUrl = await this.uploadAudio(audioPath);
      console.log('✅ 音频上传完成:', audioUrl);

      // 步骤 3: 火山引擎 ASR 转写
      console.log('步骤 3: 正在调用火山引擎进行 ASR 转写...');
      const { taskId, logid } = await this.asrEngine.submitTask(audioUrl);
      const asrResult = await this.asrEngine.queryResult(taskId, logid);
      const asrResultPath = path.join(transcribeDir, 'volcengine_result.json');
      fs.writeFileSync(asrResultPath, JSON.stringify(asrResult, null, 2));
      console.log('✅ ASR 转写完成');

      // 步骤 4: 生成字幕
      console.log('步骤 4: 正在生成字幕...');
      const subtitlesWords = this.generateSubtitlesWords(asrResult);
      const subtitlesPath = path.join(transcribeDir, 'subtitles_words.json');
      fs.writeFileSync(subtitlesPath, JSON.stringify(subtitlesWords, null, 2));
      console.log('✅ 字幕生成完成');

      // 步骤 5: 智能分析
      console.log('步骤 5: 正在根据剪辑原则进行智能分析...');
      const autoSelected = this.analyst.analyzeSubtitles(subtitlesWords);
      const autoSelectedPath = path.join(analysisDir, 'auto_selected.json');
      fs.writeFileSync(autoSelectedPath, JSON.stringify(autoSelected, null, 2));
      console.log('✅ 智能分析完成');

      // 步骤 6: 生成审核页面
      console.log('步骤 6: 正在生成审核页面...');
      this.generateReviewPage(subtitlesWords, autoSelected, videoAbsPath, reviewDir);
      console.log('✅ 审核页面生成完成');

      // 创建符号链接或复制视频到审核目录
      const reviewVideoPath = path.join(reviewDir, 'video.mp4');
      if (process.platform === 'win32') {
        // Windows 上尝试硬链接，失败则复制
        try {
          fs.linkSync(videoAbsPath, reviewVideoPath);
        } catch (e) {
          fs.copyFileSync(videoAbsPath, reviewVideoPath);
        }
      } else {
        fs.symlinkSync(videoAbsPath, reviewVideoPath);
      }

      return {
        success: true,
        outputDir,
        transcribeDir,
        analysisDir,
        reviewDir,
        subtitlesWords,
        autoSelected,
        summary: `分析完成！审核页面已生成在: ${reviewDir}`
      };

    } catch (error) {
      console.error('❌ 处理流程失败:', error.message);
      throw error;
    }
  }

  extractAudio(input, output) {
    const cmd = `ffmpeg -i "${input}" -vn -acodec libmp3lame -ab 128k -ar 44100 -ac 1 "${output}" -y`;
    execSync(cmd, { stdio: 'inherit' });
  }

  async uploadAudio(audioPath) {
    const form = new FormData();
    form.append('files[]', fs.createReadStream(audioPath));

    try {
      const response = await axios.post('https://uguu.se/upload', form, {
        headers: form.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      });

      if (response.data.success && response.data.files && response.data.files.length > 0) {
        return response.data.files[0].url;
      }
      throw new Error('上传失败: ' + JSON.stringify(response.data));
    } catch (error) {
      console.error('上传失败:', error.message);
      throw new Error('音频上传失败: ' + error.message);
    }
  }

  generateSubtitlesWords(asrResult) {
    const words = [];
    const utterances = asrResult.result?.utterances || [];

    let lastEnd = 0;

    utterances.forEach((utt, uttIndex) => {
      // 检查句首静音
      const uttStart = utt.start_time / 1000;
      if (uttStart > lastEnd + 0.01) {
        const gapDuration = uttStart - lastEnd;
        // 按 1 秒拆分长静音
        let gapStart = lastEnd;
        while (gapStart < uttStart) {
          const gapEnd = Math.min(gapStart + 1, uttStart);
          words.push({
            text: '',
            start: gapStart,
            end: gapEnd,
            isGap: true
          });
          gapStart = gapEnd;
        }
      }

      // 处理每个词
      if (utt.words) {
        utt.words.forEach((word) => {
          const wordStart = word.start_time / 1000;
          const wordEnd = word.end_time / 1000;

          // 词间静音
          if (wordStart > lastEnd + 0.01) {
            words.push({
              text: '',
              start: lastEnd,
              end: wordStart,
              isGap: true
            });
          }

          words.push({
            text: word.word || word.text,
            start: wordStart,
            end: wordEnd,
            isGap: false
          });

          lastEnd = wordEnd;
        });
      } else if (utt.text) {
        // 备用：如果没有词级信息，用整句
        const uttEnd = utt.end_time / 1000;
        // 简单的逐字拆分
        const chars = utt.text.split('');
        const charDuration = (uttEnd - uttStart) / chars.length;

        chars.forEach((char, i) => {
          const charStart = uttStart + i * charDuration;
          const charEnd = charStart + charDuration;

          words.push({
            text: char,
            start: charStart,
            end: charEnd,
            isGap: false
          });
        });

        lastEnd = uttEnd;
      }
    });

    return words;
  }

  generateReviewPage(subtitlesWords, autoSelected, videoPath, outputDir) {
    // 使用模板文件
    const templatePath = path.join(__dirname, '../templates/review.html');
    let htmlContent;

    if (fs.existsSync(templatePath)) {
      htmlContent = fs.readFileSync(templatePath, 'utf8');
    } else {
      // 内联基础模板
      htmlContent = this.getReviewHtmlTemplate();
    }

    // 替换模板变量
    htmlContent = htmlContent.replace(/\${words}/g, JSON.stringify(subtitlesWords));
    htmlContent = htmlContent.replace(/\${autoSelected}/g, JSON.stringify(autoSelected));
    htmlContent = htmlContent.replace(/\${videoName}/g, path.basename(videoPath));

    const reviewPath = path.join(outputDir, 'review.html');
    fs.writeFileSync(reviewPath, htmlContent);
  }

  getReviewHtmlTemplate() {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>剪口播 · 审核稿</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 20px; background: #f5f5f5; }
    .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    h1 { color: #333; margin-bottom: 20px; }
    .word { display: inline; padding: 2px 4px; border-radius: 3px; cursor: pointer; margin: 1px; }
    .word:hover { background: #eee; }
    .word.selected { background: #ffcccc; text-decoration: line-through; color: #999; }
    .gap { display: inline-block; background: #f0f0f0; color: #666; padding: 2px 8px; margin: 2px; border-radius: 10px; font-size: 12px; cursor: pointer; }
    .gap.selected { background: #ffcccc; text-decoration: line-through; color: #999; }
    .btn { padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer; margin: 5px; }
    .btn:hover { background: #0056b3; }
    .btn.danger { background: #dc3545; }
    .btn.danger:hover { background: #c82333; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎬 剪口播审核</h1>
    <div style="margin-bottom: 20px;">
      <button class="btn" onclick="saveSelection()">💾 保存选择</button>
      <button class="btn danger" onclick="clearSelection()">🗑️ 清除选择</button>
    </div>
    <div id="content"></div>
  </div>
  <script>
    const words = \${words};
    const autoSelected = new Set(\${autoSelected});
    let selected = new Set(autoSelected);
    
    function render() {
      const content = document.getElementById('content');
      content.innerHTML = '';
      
      words.forEach((word, i) => {
        const el = document.createElement(word.isGap ? 'span' : 'span');
        el.className = word.isGap ? 'gap' : 'word';
        if (selected.has(i)) el.classList.add('selected');
        el.textContent = word.isGap ? (word.end - word.start).toFixed(1) + 's' : word.text;
        el.onclick = () => {
          if (selected.has(i)) { selected.delete(i); el.classList.remove('selected'); }
          else { selected.add(i); el.classList.add('selected'); }
        };
        content.appendChild(el);
        if (!word.isGap) content.appendChild(document.createTextNode(' '));
      });
    }
    
    function saveSelection() {
      const data = Array.from(selected).sort((a, b) => a - b);
      localStorage.setItem('clip_selection', JSON.stringify(data));
      alert('已保存！共选中 ' + data.length + ' 项');
    }
    
    function clearSelection() {
      selected.clear();
      render();
    }
    
    const saved = localStorage.getItem('clip_selection');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        selected = new Set(data);
      } catch (e) {}
    }
    
    render();
  </script>
</body>
</html>`;
  }
}

module.exports = Planner;
