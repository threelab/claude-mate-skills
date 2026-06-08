#!/usr/bin/env node
/**
 * 音频转写结果处理工具
 * 将ASR服务返回的转录数据转换为精细的字级别时间码序列
 *
 * 使用方式: node process_asr.js <input_data.json> [exclude_segments.json]
 * 输出文件: word_timestamps.json
 */

const fs = require('fs');

// 参数解析
const inputFile = process.argv[2] || 'asr_result.json';
const excludeFile = process.argv[3];

// 文件验证
if (!fs.existsSync(inputFile)) {
  console.error('错误: 输入文件不存在:', inputFile);
  process.exit(1);
}

// 加载原始数据
const rawData = JSON.parse(fs.readFileSync(inputFile, 'utf8'));

// 提取字词时间信息
const characterList = [];
for (const segment of rawData.utterances) {
  if (segment.words && Array.isArray(segment.words)) {
    for (const char of segment.words) {
      characterList.push({
        content: char.text,
        begin: char.start_time / 1000,
        finish: char.end_time / 1000
      });
    }
  }
}

console.log('已解析字符数:', characterList.length);

// 处理排除片段的时间映射
let processedChars = [...characterList];

if (excludeFile && fs.existsSync(excludeFile)) {
  const excludeData = JSON.parse(fs.readFileSync(excludeFile, 'utf8'));
  console.log('排除片段数量:', excludeData.length);

  // 计算某时间点前已删除的总时长
  function calculateExcludedBefore(targetTime) {
    let total = 0;
    for (const seg of excludeData) {
      if (seg.end <= targetTime) {
        total += seg.end - seg.start;
      } else if (seg.start < targetTime) {
        total += targetTime - seg.start;
      }
    }
    return total;
  }

  // 判断时间段是否被排除
  function isInExcludedRange(start, end) {
    for (const seg of excludeData) {
      if (start < seg.end && end > seg.start) return true;
    }
    return false;
  }

  // 过滤并重新映射时间
  processedChars = [];
  for (const char of characterList) {
    if (!isInExcludedRange(char.begin, char.finish)) {
      const offset = calculateExcludedBefore(char.begin);
      processedChars.push({
        content: char.content,
        begin: Math.round((char.begin - offset) * 100) / 100,
        finish: Math.round((char.finish - offset) * 100) / 100
      });
    }
  }
  console.log('映射后字符数:', processedChars.length);
}

// 插入静音间隔标记
const finalSequence = [];
let lastTime = 0;

for (const char of processedChars) {
  const gapLength = char.begin - lastTime;

  if (gapLength > 0.1) {
    if (gapLength > 0.5) {
      // 长静音分段处理
      let currentGapStart = lastTime;
      while (currentGapStart < char.begin) {
        const gapEnd = Math.min(currentGapStart + 1, char.begin);
        finalSequence.push({
          content: '',
          begin: Math.round(currentGapStart * 100) / 100,
          finish: Math.round(gapEnd * 100) / 100,
          isSilence: true
        });
        currentGapStart = gapEnd;
      }
    } else {
      // 短静音保持完整
      finalSequence.push({
        content: '',
        begin: Math.round(lastTime * 100) / 100,
        finish: Math.round(char.begin * 100) / 100,
        isSilence: true
      });
    }
  }

  finalSequence.push({
    content: char.content,
    begin: char.begin,
    finish: char.finish,
    isSilence: false
  });
  lastTime = char.finish;
}

const silenceCount = finalSequence.filter(item => item.isSilence).length;
console.log('输出总数:', finalSequence.length);
console.log('静音片段数:', silenceCount);

// 写入结果文件
fs.writeFileSync('word_timestamps.json', JSON.stringify(finalSequence, null, 2));
console.log('处理完成，结果已保存至 word_timestamps.json');