/**
 * Analyst: 核心分析引擎
 * 实现基于语气词过滤、停顿缩减和重说识别的逻辑
 */

const fs = require('fs');
const path = require('path');

class Analyst {
  constructor(preferences) {
    this.preferences = preferences || this.loadDefaultPreferences();
    this.mustRemoveFillers = ["嗯", "啊", "哦", "呃", "额", "这个", "那个", "就是说"];
  }

  loadDefaultPreferences() {
    return {
      pauses: { keepThreshold: 0.8, shrinkThreshold: 2.0, maxSilenceAllowed: 3.0 },
      fillers: { aggressiveMode: true, keepEmotionalWords: true },
      logic: { preferLaterVersion: true }
    };
  }

  analyze(asrResult) {
    console.log("正在根据剪辑原则分析转录文本...");
    const issues = [];
    const utterances = asrResult.utterances || [];

    // 1. 处理语气词和长停顿
    utterances.forEach((utt, index) => {
      // 检查语气词 (A类必删)
      this.mustRemoveFillers.forEach(filler => {
        if (utt.text.includes(filler)) {
          issues.push({
            type: 'filler',
            word: filler,
            start_time: utt.start_time / 1000,
            end_time: utt.end_time / 1000,
            suggestion: '删除语气词',
            priority: 'high'
          });
        }
      });

      // 检查长停顿 (无效静音)
      if (index < utterances.length - 1) {
        const nextUtt = utterances[index + 1];
        const pauseDuration = (nextUtt.start_time - utt.end_time) / 1000;
        
        if (pauseDuration > this.preferences.pauses.maxSilenceAllowed) {
          issues.push({
            type: 'pause',
            word: '长静音',
            start_time: utt.end_time / 1000,
            end_time: nextUtt.start_time / 1000,
            suggestion: '切除无效静音',
            priority: 'high'
          });
        } else if (pauseDuration > this.preferences.pauses.keepThreshold) {
          issues.push({
            type: 'pause',
            word: '思考性停顿',
            start_time: utt.end_time / 1000,
            end_time: nextUtt.start_time / 1000,
            suggestion: '缩短停顿至 0.5s',
            priority: 'medium'
          });
        }
      }
    });

    // 2. 识别重说 (递进优化原则)
    this.detectCorrections(utterances, issues);

    return issues;
  }

  detectCorrections(utterances, issues) {
    for (let i = 0; i < utterances.length - 1; i++) {
      const current = utterances[i].text.trim();
      const next = utterances[i+1].text.trim();

      // 简单的重说识别：如果下一句的前几个字和当前句相同
      const commonPrefixLen = 4;
      if (current.length >= commonPrefixLen && next.length >= commonPrefixLen) {
        if (current.substring(0, commonPrefixLen) === next.substring(0, commonPrefixLen)) {
          issues.push({
            type: 'correction',
            word: current,
            start_time: utterances[i].start_time / 1000,
            end_time: utterances[i].end_time / 1000,
            suggestion: '检测到重说，建议保留后句，删除前句',
            priority: 'high'
          });
        }
      }

      // 关键词触发修正
      const correctionKeywords = ["不对", "说错了", "应该是"];
      correctionKeywords.forEach(kw => {
        if (current.includes(kw)) {
          issues.push({
            type: 'correction',
            word: kw,
            start_time: utterances[i].start_time / 1000,
            end_time: utterances[i].end_time / 1000,
            suggestion: '检测到修正词，建议删除错误片段',
            priority: 'high'
          });
        }
      });
    }
  }
}

module.exports = Analyst;
