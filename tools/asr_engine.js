/**
 * ASR Engine: 火山引擎 ASR 封装
 */

const axios = require('axios');
const uuid = require('uuid');

class ASREngine {
  constructor(appid, token) {
    this.appid = appid;
    this.token = token;
    this.submitUrl = "https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit";
    this.queryUrl = "https://openspeech.bytedance.com/api/v3/auc/bigmodel/query";
  }

  async submitTask(audioUrl) {
    const taskId = uuid.v4();
    const headers = {
      "X-Api-App-Key": this.appid,
      "X-Api-Access-Key": this.token,
      "X-Api-Resource-Id": "volc.bigasr.auc",
      "X-Api-Request-Id": taskId,
      "X-Api-Sequence": "-1"
    };

    const body = {
      user: { uid: "fake_uid" },
      audio: { url: audioUrl, format: "wav", codec: "raw" },
      request: {
        model_name: "bigmodel",
        model_version: "400",
        enable_itn: true,
        enable_punc: true,
        show_utterances: true
      }
    };

    const response = await axios.post(this.submitUrl, body, { headers });
    return { taskId, logid: response.headers['x-tt-logid'] };
  }

  async queryResult(taskId, logid) {
    // 查询逻辑实现...
    console.log(`正在查询任务 ${taskId} 的结果...`);
    return { status: 'completed', text: '转录文本示例' };
  }
}

module.exports = ASREngine;
