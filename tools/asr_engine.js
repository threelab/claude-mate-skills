/**
 * ASR Engine: 火山引擎 ASR 封装
 */

const axios = require('axios');
const uuid = require('uuid');

class ASREngine {
  constructor(appid, token) {
    if (!appid || !token) {
      throw new Error("火山引擎 AppID 或 Token 未配置");
    }
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
      user: { uid: "clip_mate_user" },
      audio: { url: audioUrl, format: "wav", codec: "raw" },
      request: {
        model_name: "bigmodel",
        model_version: "400",
        enable_itn: true,
        enable_punc: true,
        show_utterances: true,
        result_type: "full" // 获取详细的分词结果
      }
    };

    try {
      const response = await axios.post(this.submitUrl, body, { headers });
      if (response.data.resp_status !== 0) {
        throw new Error(`ASR 任务提交失败: ${response.data.resp_msg}`);
      }
      return { taskId, logid: response.headers['x-tt-logid'] };
    } catch (error) {
      console.error("ASR 提交异常:", error.message);
      throw error;
    }
  }

  async queryResult(taskId, logid) {
    const headers = {
      "X-Api-App-Key": this.appid,
      "X-Api-Access-Key": this.token,
      "X-Api-Resource-Id": "volc.bigasr.auc",
      "X-Api-Request-Id": taskId,
      "X-Api-Sequence": "-1"
    };

    const body = {
      request: { task_id: taskId }
    };

    const maxRetries = 30;
    let retries = 0;

    while (retries < maxRetries) {
      try {
        const response = await axios.post(this.queryUrl, body, { headers });
        const data = response.data;

        if (data.resp_status !== 0) {
          throw new Error(`ASR 查询失败: ${data.resp_msg}`);
        }

        const status = data.task_status;
        if (status === 'completed') {
          return data.result;
        } else if (status === 'failed') {
          throw new Error("ASR 任务处理失败");
        }

        console.log(`ASR 任务处理中... (${retries + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        retries++;
      } catch (error) {
        console.error("ASR 查询异常:", error.message);
        throw error;
      }
    }

    throw new Error("ASR 查询超时");
  }
}

module.exports = ASREngine;
