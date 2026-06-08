/**
 * Analyst: 负责对比“用户习惯”和“转录文本”
 */

const fs = require('fs');
const path = require('path');

class Analyst {
  constructor() {
    this.fillerWords = this.loadPrinciples();
    this.preferences = this.loadPreferences();
  }

  loadPrinciples() {
    // 模拟从 config/principles 加载
    return ["嗯", "啊", "哦", "呃", "这个", "那个", "然后", "就是说"];
  }

  loadPreferences() {
    // 模拟从 config/preferences 加载
    return { pauseThreshold: 3.0 };
  }

  analyze(transcriptData) {
    console.log("正在分析转录文本...");
    const issues = [];
    
    transcriptData.utterances.forEach(utterance => {
      // 识别语气词
      this.fillerWords.forEach(word => {
        if (utterance.text.includes(word)) {
          issues.push({
            type: 'filler',
            word: word,
            start_time: utterance.start_time,
            end_time: utterance.end_time,
            suggestion: '删除语气词'
          });
        }
      });

      // 识别停顿 (基于 utterance 间隔，这里简化处理)
      if (utterance.duration > this.preferences.pauseThreshold) {
        issues.push({
          type: 'pause',
          word: '长停顿',
          start_time: utterance.start_time,
          end_time: utterance.end_time,
          suggestion: '缩短停顿'
        });
      }
    });

    return issues;
  }
}

module.exports = new Analyst();
