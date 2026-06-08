#!/usr/bin/env node
/**
 * 视频审核页面生成器
 * 根据字幕时间码和分析结果生成交互式审核界面
 *
 * 使用方式: node build_review.js <timestamps.json> [selected.json] [video_file]
 * 输出: review_page.html, video.mp4（链接）
 */

const fs = require('fs');
const path = require('path');

// 命令行参数处理
const timestampsFile = process.argv[2] || 'subtitles_words.json';
const selectedFile = process.argv[3] || 'auto_selected.json';
const videoSource = process.argv[4] || 'video.mp4';

// 建立视频文件链接
const videoDestName = 'video.mp4';
if (videoSource !== videoDestName && fs.existsSync(videoSource)) {
  const absVideoPath = path.resolve(videoSource);
  if (fs.existsSync(videoDestName)) fs.unlinkSync(videoDestName);
  
  try {
    if (process.platform === 'win32') {
      try {
        fs.linkSync(absVideoPath, videoDestName);
        console.log('硬链接已创建:', videoDestName);
      } catch (e) {
        fs.symlinkSync(absVideoPath, videoDestName, 'file');
        console.log('符号链接已创建:', videoDestName);
      }
    } else {
      fs.symlinkSync(absVideoPath, videoDestName);
    }
  } catch (err) {
    console.error('警告: 无法创建视频链接:', err.message);
    console.log('提示: 请手动将视频复制到当前目录并重命名为 video.mp4');
  }
}

// 验证必要文件
if (!fs.existsSync(timestampsFile)) {
  console.error('错误: 时间码文件不存在:', timestampsFile);
  process.exit(1);
}

// 加载数据
const timeData = JSON.parse(fs.readFileSync(timestampsFile, 'utf8'));
let preselected = [];

if (fs.existsSync(selectedFile)) {
  preselected = JSON.parse(fs.readFileSync(selectedFile, 'utf8'));
  console.log('预选择项目数:', preselected.length);
}

// 加载模板并渲染
const templateLoc = path.join(__dirname, '..', 'templates', 'review.html');
if (!fs.existsSync(templateLoc)) {
  console.error('错误: 模板文件不存在:', templateLoc);
  process.exit(1);
}

let pageContent = fs.readFileSync(templateLoc, 'utf8');

// 模板变量替换
pageContent = pageContent.replace('{{videoFileName}}', path.basename(videoSource));
pageContent = pageContent.replace('{{videoBaseName}}', videoDestName);
pageContent = pageContent.replace('{{wordsJson}}', JSON.stringify(timeData));
pageContent = pageContent.replace('{{autoSelectedJson}}', JSON.stringify(preselected));

// 输出结果
fs.writeFileSync('review.html', pageContent);
console.log('审核页面生成完成');
console.log('请通过主应用服务访问');