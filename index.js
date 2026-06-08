/**
 * Clip Announcement: 主入口
 */

const Planner = require('./core/planner');
const Analyst = require('./core/analyst');
const ASREngine = require('./tools/asr_engine');
const fs = require('fs');
const path = require('path');

// 加载 .env 文件
function loadEnvFile() {
  const rootEnvPath = path.join(__dirname, '../../.env');
  const localEnvPath = path.join(__dirname, '.env');
  
  let envPath = null;
  if (fs.existsSync(rootEnvPath)) {
    envPath = rootEnvPath;
  } else if (fs.existsSync(localEnvPath)) {
    envPath = localEnvPath;
  }
  
  if (envPath) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const lines = envContent.split('\n');
    lines.forEach(line => {
      const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)\s*$/);
      if (match) {
        process.env[match[1]] = match[2];
      }
    });
  }
}

// 加载配置
function loadConfig() {
  loadEnvFile();
  
  const prefPath = path.join(__dirname, 'config/preferences/user.json');
  const preferences = JSON.parse(fs.readFileSync(prefPath, 'utf8'));
  
  // 从环境变量加载 API Key
  const appid = process.env.VOLC_APPID || "mock_appid";
  const token = process.env.VOLC_TOKEN || process.env.VOLCENGINE_API_KEY || "mock_token";
  
  return { preferences, appid, token };
}

async function main() {
  const { preferences, appid, token } = loadConfig();
  
  const asrEngine = new ASREngine(appid, token);
  const analyst = new Analyst(preferences);
  const planner = new Planner(asrEngine, analyst);

  const args = process.argv.slice(2);
  const videoPath = args[0];

  if (!videoPath) {
    console.log("用法: node index.js <video_path>");
    return;
  }

  try {
    const result = await planner.processVideo(videoPath);
    console.log("------------------------------------");
    console.log(result.summary);
    console.log(`详细报告已保存至: ${result.reportPath}`);
    console.log("------------------------------------");
  } catch (error) {
    console.error("执行出错:", error.message);
  }
}

main();
