/**
 * Analyst: 核心分析引擎
 * 实现基于语气词过滤、停顿缩减、重复识别、残句检测等逻辑
 */

const fs = require('fs');
const path = require('path');

class Analyst {
  constructor(preferences) {
    this.preferences = preferences || this.loadDefaultPreferences();
    this.mustRemoveFillers = ['嗯', '啊', '哦', '呃', '额', '唉', '噢', '呀', '欸', '唔'];
    this.stutterPatterns = ['那个那个', '这个这个', '就是就是', '然后然后', '所以所以'];
  }

  loadDefaultPreferences() {
    return {
      pauses: { keepThreshold: 0.8, shrinkThreshold: 2.0, maxSilenceAllowed: 3.0 },
      fillers: { aggressiveMode: true, keepEmotionalWords: true },
      logic: { preferLaterVersion: true }
    };
  }

  analyzeSubtitles(subtitlesWords) {
    console.log('正在根据剪辑原则分析字幕...');
    const selected = new Set();

    // 1. 标记静音
    this.markSilences(subtitlesWords, selected);

    // 2. 分句
    const sentences = this.splitIntoSentences(subtitlesWords);

    // 3. 标记重复句（删前保后）
    this.markRepeatedSentences(sentences, selected);

    // 4. 标记残句
    this.markIncompleteSentences(sentences, selected);

    // 5. 标记卡顿词
    this.markStutters(subtitlesWords, selected);

    // 6. 标记语气词
    this.markFillers(subtitlesWords, selected);

    // 转换为排序后的数组
    return Array.from(selected).sort((a, b) => a - b);
  }

  markSilences(words, selected) {
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      if (word.isGap) {
        const duration = word.end - word.start;
        // > 0.2s 的静音预选删除
        if (duration > 0.2) {
          selected.add(i);
        }
      }
    }
  }

  splitIntoSentences(words) {
    const sentences = [];
    let current = { startIdx: -1, endIdx: -1, words: [], text: '' };

    for (let i = 0; i < words.length; i++) {
      const word = words[i];

      if (!word.isGap) {
        if (current.startIdx === -1) {
          current.startIdx = i;
        }
        current.endIdx = i;
        current.words.push(word);
        current.text += word.text;
      }

      // 遇到较长静音或句子结束标点，切分句子
      const isSentenceEnd = word.isGap && (word.end - word.start) >= 0.5;
      const hasEndPunctuation = !word.isGap && /[。！？!?]$/.test(word.text);

      if ((isSentenceEnd || hasEndPunctuation) && current.text.length > 0) {
        sentences.push({ ...current });
        current = { startIdx: -1, endIdx: -1, words: [], text: '' };
      }
    }

    // 最后一个句子
    if (current.text.length > 0) {
      sentences.push(current);
    }

    return sentences;
  }

  markRepeatedSentences(sentences, selected) {
    if (sentences.length < 2) return;

    for (let i = 0; i < sentences.length - 1; i++) {
      const curr = sentences[i];
      for (let j = i + 1; j < sentences.length; j++) {
        const next = sentences[j];

        // 检查开头相同 >= 5 字
        const minLen = Math.min(curr.text.length, next.text.length);
        if (minLen >= 5) {
          const commonLen = this.getCommonPrefixLength(curr.text, next.text);
          if (commonLen >= 5) {
            // 删前保后
            this.markSentenceForDeletion(curr, selected);
            break;
          }
        }

        // 检查残句在中间（前面句子短，后面句子长且包含前面内容）
        if (curr.text.length < next.text.length && next.text.includes(curr.text)) {
          this.markSentenceForDeletion(curr, selected);
          break;
        }
      }
    }
  }

  getCommonPrefixLength(a, b) {
    let len = 0;
    while (len < a.length && len < b.length && a[len] === b[len]) {
      len++;
    }
    return len;
  }

  markIncompleteSentences(sentences, selected) {
    for (let i = 0; i < sentences.length - 1; i++) {
      const curr = sentences[i];
      const next = sentences[i + 1];

      // 检查句子是否完整的启发式规则
      const isShort = curr.text.length <= 5;
      const endsWithParticle = /[呢吧啊哦嗯]$/.test(curr.text);
      const nextIsLonger = next.text.length > curr.text.length;
      const nextStartsSimilar = this.getCommonPrefixLength(curr.text, next.text) >= 2;

      // 如果是短句子 + 后面有更长句子且开头相似，标记为残句
      if (isShort && (endsWithParticle || nextStartsSimilar) && nextIsLonger) {
        this.markSentenceForDeletion(curr, selected);
      }

      // 检查句子是否以非结束标点结尾
      if (!/[。！？!?]$/.test(curr.text) && curr.text.length >= 3 && nextStartsSimilar) {
        this.markSentenceForDeletion(curr, selected);
      }
    }
  }

  markStutters(words, selected) {
    // 先构建全文
    let fullText = '';
    const wordIndices = []; // 记录每个字符对应的 word index

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      if (!word.isGap) {
        const chars = word.text.split('');
        chars.forEach(c => {
          fullText += c;
          wordIndices.push(i);
        });
      }
    }

    // 检查卡顿词模式
    this.stutterPatterns.forEach(pattern => {
      let pos = 0;
      while ((pos = fullText.indexOf(pattern, pos)) !== -1) {
        // 标记前面重复的部分（只删前面一半）
        const halfLen = pattern.length / 2;
        for (let i = pos; i < pos + halfLen; i++) {
          if (wordIndices[i] !== undefined) {
            selected.add(wordIndices[i]);
          }
        }
        pos += pattern.length;
      }
    });
  }

  markFillers(words, selected) {
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      if (!word.isGap) {
        const text = word.text.trim();
        if (this.mustRemoveFillers.includes(text)) {
          selected.add(i);
        }
      }
    }
  }

  markSentenceForDeletion(sentence, selected) {
    // 标记句子从 startIdx 到 endIdx 的所有元素（包括中间的 gap）
    for (let i = sentence.startIdx; i <= sentence.endIdx; i++) {
      selected.add(i);
    }
  }

  // 保留旧的兼容接口
  analyze(asrResult) {
    console.warn('analyst.analyze() 已废弃，请使用 analyzeSubtitles()');
    const issues = [];
    const utterances = asrResult.utterances || [];

    utterances.forEach((utt, index) => {
      this.mustRemoveFillers.forEach(filler => {
        if (utt.text && utt.text.includes(filler)) {
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
    });

    return issues;
  }
}

module.exports = Analyst;
