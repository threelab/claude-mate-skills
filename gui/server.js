const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec, execSync, spawnSync } = require('child_process');
const url = require('url');

const PORT = 3005;
const SKILL_DIR = path.resolve(__dirname, '..');             // 指向 clipAnnouncement
const ENV_PATH = path.join(SKILL_DIR, '.env');

// 加载环境变量
const env = {};
if (fs.existsSync(ENV_PATH)) {
    const content = fs.readFileSync(ENV_PATH, 'utf-8');
    content.split('\n').forEach(line => {
        const [key, ...val] = line.split('=');
        if (key) env[key.trim()] = val.join('=').trim();
    });
}

let currentProjectDir = '';
let currentVideoPath = '';

const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
};

const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // API: AI 对话 (类似 Claude Code 的简化版)
    if (req.method === 'POST' && pathname === '/api/chat') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const { message, videoPath } = JSON.parse(body);
                const msg = message.toLowerCase();

                let reply = '';
                let action = null;

                // 简单的关键词匹配模拟 AI 决策逻辑
                if (msg.includes('剪') || msg.includes('处理') || msg.includes('开始')) {
                    if (!videoPath) {
                        reply = '好滴！请先在上面选择一个视频文件，然后我就能帮你处理了。';
                    } else {
                        reply = '没问题，我读了项目里的 SKILL.md，现在就开始为你跑全套剪辑流程！请看上方的进度条。';
                        action = 'run_workflow';
                    }
                } else if (msg.includes('你好') || msg.includes('谁')) {
                    reply = '你好！我是你的 Claude Mate 视频剪辑助手。我不仅能执行脚本，还能读懂 SKILL.md 里的指令。你想剪辑哪段视频？';
                } else if (msg.includes('原理')) {
                    reply = '我的原理是：1. 读 SKILL.md 获取技能；2. 调 FFmpeg 提音频；3. 调火山 API 转录文字；4. 分析文字找出废话；5. 让你审核后一键剪辑。';
                } else {
                    reply = `收到指令："${message}"。虽然我还没接入真正的 LLM API，但我已经理解你的意思了。如果你想剪辑视频，直接对我说“帮我剪这个视频”即可。`;
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, reply, action }));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        });
        return;
    }

    // API: 浏览文件
    if (req.method === 'POST' && pathname === '/api/browse') {
        try {
            console.log('⏳ 正在弹出文件选择框...');
            const browseScript = path.join(__dirname, 'browse.py');
            const browseResult = spawnSync('py', [browseScript], { 
                encoding: 'utf-8',
                windowsHide: true
            });
            const filePath = browseResult.stdout.trim();
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            if (filePath) {
                console.log(`📂 用户选择了文件: ${filePath}`);
                res.end(JSON.stringify({ success: true, path: filePath }));
            } else {
                res.end(JSON.stringify({ success: true, path: null }));
            }
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: err.message }));
        }
        return;
    }

    // API: 提取音频
    if (req.method === 'POST' && pathname === '/api/extract') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const videoPath = data.videoPath;
                currentVideoPath = videoPath;
                const videoName = path.basename(videoPath, '.mp4');
                const date = new Date().toISOString().split('T')[0];
                currentProjectDir = path.join(SKILL_DIR, 'output', `${date}_${videoName}`, '剪口播');

                const targetAudioPath = path.join(currentProjectDir, '1_转录', 'audio.mp3');
                fs.mkdirSync(path.join(currentProjectDir, '1_转录'), { recursive: true });
                fs.mkdirSync(path.join(currentProjectDir, '2_分析'), { recursive: true });
                fs.mkdirSync(path.join(currentProjectDir, '3_审核'), { recursive: true });

                if (fs.existsSync(targetAudioPath)) {
                    console.log(`ℹ️ 音频已存在，跳过提取: ${targetAudioPath}`);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ success: true, skipped: true }));
                }

                // 自动寻找 FFmpeg 路径
                let ffmpeg = env.FFMPEG_PATH || 'ffmpeg';
                const bundledFfmpeg = path.join(SKILL_DIR, 'FFmpeg', 'Windows', 'ffmpeg', 'bin', 'ffmpeg.exe');
                const bundledFfprobe = path.join(SKILL_DIR, 'FFmpeg', 'Windows', 'ffmpeg', 'bin', 'ffprobe.exe');
                
                if (ffmpeg === 'ffmpeg' && fs.existsSync(bundledFfmpeg)) {
                    ffmpeg = bundledFfmpeg;
                    console.log(`✅ 使用项目内置 FFmpeg: ${ffmpeg}`);
                } else {
                    console.log(`ℹ️ 使用系统 FFmpeg: ${ffmpeg}`);
                }
                
                // 验证可执行文件是否存在
                if (ffmpeg !== 'ffmpeg' && !fs.existsSync(ffmpeg)) {
                    throw new Error(`找不到 FFmpeg 可执行文件: ${ffmpeg}`);
                }

                if (!fs.existsSync(videoPath)) throw new Error(`视频文件不存在: ${videoPath}`);

                console.log(`🎬 提取音频: ${videoPath} -> ${targetAudioPath}`);
                
                // 使用数组形式调用 spawnSync，不使用 shell: true 以避免 Windows 命令解析问题
                // Node.js 会自动处理参数中的空格
                const args = ['-i', videoPath, '-vn', '-acodec', 'libmp3lame', '-y', targetAudioPath];
                console.log(`🚀 执行命令: "${ffmpeg}" ${args.join(' ')}`);

                const ffmpegResult = spawnSync(ffmpeg, args, { 
                    encoding: 'utf-8',
                    windowsHide: true
                });
                
                if (ffmpegResult.error) {
                    throw new Error(`FFmpeg 启动失败: ${ffmpegResult.error.message}.`);
                }
                if (ffmpegResult.status !== 0) {
                    throw new Error(`FFmpeg 提取失败 (Exit Code ${ffmpegResult.status}): ${ffmpegResult.stderr || '可能是路径包含特殊字符或权限问题'}`);
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } catch (err) {
                console.error('❌ Extract error:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        });
        return;
    }

    // API: 转录
    if (req.method === 'POST' && pathname === '/api/transcribe') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                if (!body) throw new Error('Request body is empty');
                const data = JSON.parse(body);
                
                if (!currentProjectDir) {
                    const videoPath = data.videoPath;
                    const videoName = path.basename(videoPath, '.mp4');
                    const date = new Date().toISOString().split('T')[0];
                    currentProjectDir = path.join(SKILL_DIR, 'output', `${date}_${videoName}`, '剪口播');
                    currentVideoPath = videoPath;
                }
                
                const resultPath = path.join(currentProjectDir, '1_转录', 'volcengine_result.json');
                const subPath = path.join(currentProjectDir, '1_转录', 'subtitles_words.json');
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                if (fs.existsSync(resultPath) && fs.existsSync(subPath)) {
                    console.log(`ℹ️ 转录结果已存在，跳过 API 调用`);
                    return res.end(JSON.stringify({ success: true, skipped: true }));
                }

                const audioPath = path.join(currentProjectDir, '1_转录', 'audio.mp3');
                if (!fs.existsSync(audioPath)) {
                    console.log('🔊 音频文件不存在，自动从视频提取...');
                    if (!currentVideoPath) {
                        throw new Error(`音频文件不存在: ${audioPath}\n请先执行音频提取步骤，或手动将音频文件放置到该目录`);
                    }
                    // 自动提取音频
                    let ffmpeg = env.FFMPEG_PATH || 'ffmpeg';
                    const bundledFfmpeg = path.join(SKILL_DIR, 'FFmpeg', 'Windows', 'ffmpeg', 'bin', 'ffmpeg.exe');
                    if (ffmpeg === 'ffmpeg' && fs.existsSync(bundledFfmpeg)) {
                        ffmpeg = bundledFfmpeg;
                    }
                    const extractArgs = [
                        '-i', currentVideoPath,
                        '-q:a', '0',
                        '-map', 'a',
                        audioPath
                    ];
                    console.log(`🚀 执行命令: ${ffmpeg} ${extractArgs.join(' ')}`);
                    const extractResult = spawnSync(ffmpeg, extractArgs, { 
                        encoding: 'utf-8', 
                        windowsHide: true 
                    });
                    if (extractResult.status !== 0) throw new Error('音频提取失败: ' + (extractResult.stderr || '未知错误'));
                    console.log('✅ 音频提取完成');
                }
                
                const apiKey = env.VOLCENGINE_API_KEY;
                if (!apiKey || apiKey === 'your_api_key_here') throw new Error('API Key 缺失');

                console.log('🎤 正在上传音频...');
                const uploadArgs = ['-s', '-F', `files[]=@${audioPath}`, 'https://uguu.se/upload'];
                console.log(`🚀 执行命令: curl.exe ${uploadArgs.join(' ')}`);
                const uploadResult = spawnSync('curl.exe', uploadArgs, { 
                    encoding: 'utf-8', 
                    windowsHide: true 
                });
                if (uploadResult.status !== 0 || !uploadResult.stdout.trim()) throw new Error('音频上传失败: ' + (uploadResult.stderr || '网络错误'));
                
                let uploadRes;
                try {
                    uploadRes = JSON.parse(uploadResult.stdout);
                } catch (e) {
                    throw new Error('上传返回解析失败: ' + uploadResult.stdout);
                }
                const audioUrl = uploadRes.files[0].url;

                console.log('🎤 提交转录任务...');
                const submitArgs = [
                    '-s', '-L', '-X', 'POST', 
                    'https://openspeech.bytedance.com/api/v1/vc/submit?language=zh-CN&use_itn=True', 
                    '-H', `x-api-key: ${apiKey}`, 
                    '-H', 'content-type: application/json', 
                    '-d', JSON.stringify({ url: audioUrl })
                ];
                console.log(`🚀 执行命令: curl.exe ${submitArgs.slice(0, 8).join(' ')} ...`);
                const submitResult = spawnSync('curl.exe', submitArgs, { 
                    encoding: 'utf-8', 
                    windowsHide: true 
                });
                if (submitResult.status !== 0) throw new Error('任务提交失败: ' + submitResult.stderr);
                
                const submitRes = JSON.parse(submitResult.stdout);
                if (submitRes.code && submitRes.code !== 0) throw new Error('API 提交失败: ' + JSON.stringify(submitRes));
                
                const taskId = submitRes.id;
                console.log(`⏳ 任务 ID: ${taskId}，等待中...`);

                let result = null;
                for (let i = 0; i < 120; i++) {
                    const queryArgs = ['-s', '-L', '-X', 'GET', `https://openspeech.bytedance.com/api/v1/vc/query?id=${taskId}`, '-H', `x-api-key: ${apiKey}`];
                    const queryResult = spawnSync('curl.exe', queryArgs, { 
                        encoding: 'utf-8', 
                        windowsHide: true 
                    });
                    if (queryResult.status === 0) {
                        const queryRes = JSON.parse(queryResult.stdout);
                        if (queryRes.code === 0) { result = queryRes; break; }
                        if (queryRes.code !== 1000 && queryRes.code !== 0) throw new Error('转录查询出错: ' + JSON.stringify(queryRes));
                    }
                    await new Promise(r => setTimeout(r, 3000));
                }
                if (!result) throw new Error('转录超时');

                fs.writeFileSync(resultPath, JSON.stringify(result));
                const genSubScript = path.join(SKILL_DIR, 'scripts', 'generate_subtitles.js');
                console.log(`🚀 执行命令: node "${genSubScript}" volcengine_result.json`);
                spawnSync('node', [genSubScript, 'volcengine_result.json'], { 
                    cwd: path.join(currentProjectDir, '1_转录'),
                    windowsHide: true
                });

                res.end(JSON.stringify({ success: true }));
            } catch (err) {
                console.error('❌ Transcribe error:', err);
                if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        });
        return;
    }

    // API: 分析
    if (req.method === 'POST' && pathname === '/api/analyze') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                if (!body) throw new Error('Request body is empty');
                const data = JSON.parse(body);
                if (!currentProjectDir) {
                    const videoPath = data.videoPath;
                    const videoName = path.basename(videoPath, '.mp4');
                    const date = new Date().toISOString().split('T')[0];
                    currentProjectDir = path.join(SKILL_DIR, 'output', `${date}_${videoName}`, '剪口播');
                    currentVideoPath = videoPath;
                }
                
                const subPath = path.join(currentProjectDir, '1_转录', 'subtitles_words.json');
                if (!fs.existsSync(subPath)) throw new Error('找不到转录结果文件，请先进行转录。');
                
                const words = JSON.parse(fs.readFileSync(subPath, 'utf-8'));
                const autoSelected = [];
                words.forEach((w, i) => { if (w.isGap) autoSelected.push(i); });
                fs.writeFileSync(path.join(currentProjectDir, '2_分析', 'auto_selected.json'), JSON.stringify(autoSelected));

                const genReviewScript = path.join(SKILL_DIR, 'scripts', 'generate_review.js');
                const genReviewArgs = [genReviewScript, subPath, path.join(currentProjectDir, '2_分析', 'auto_selected.json'), currentVideoPath];
                console.log(`🚀 执行命令: node "${genReviewScript}" ...`);
                const genReviewResult = spawnSync('node', genReviewArgs, { 
                    cwd: path.join(currentProjectDir, '3_审核'), 
                    encoding: 'utf-8',
                    windowsHide: true
                });
                if (genReviewResult.status !== 0) throw new Error('生成审核页面失败: ' + genReviewResult.stderr);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, reviewUrl: '/review/review.html' }));
            } catch (err) {
                console.error('❌ Analyze error:', err);
                if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        });
        return;
    }

    // API: 审核相关
    if (pathname === '/api/save-selection' || pathname === '/api/load-selection' || pathname === '/api/cut') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            if (!currentProjectDir) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ error: 'Project dir not initialized' }));
            }
            const filePath = path.join(currentProjectDir, '3_审核', pathname.split('/').pop() + '.json');
            if (req.method === 'POST') {
                if (pathname === '/api/cut') {
                    const deleteList = JSON.parse(body);
                    const segmentsPath = path.join(currentProjectDir, '3_审核', 'delete_segments.json');
                    fs.writeFileSync(segmentsPath, JSON.stringify(deleteList, null, 2));
                    
                    console.log('🎬 开始物理剪辑...');
                    const outputVideo = path.join(currentProjectDir, '3_审核', 'output_cut.mp4');
                    
                    // 自动寻找 FFmpeg/FFprobe 路径
                    let ffmpeg = env.FFMPEG_PATH || 'ffmpeg';
                    let ffprobe = 'ffprobe';
                    const bundledFfmpeg = path.join(SKILL_DIR, 'FFmpeg', 'Windows', 'ffmpeg', 'bin', 'ffmpeg.exe');
                    const bundledFfprobe = path.join(SKILL_DIR, 'FFmpeg', 'Windows', 'ffmpeg', 'bin', 'ffprobe.exe');
                    
                    if (ffmpeg === 'ffmpeg' && fs.existsSync(bundledFfmpeg)) {
                        ffmpeg = bundledFfmpeg;
                        ffprobe = bundledFfprobe;
                    }

                    // 1. 获取视频总时长
                    const probeArgs = ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', currentVideoPath];
                    console.log(`🚀 执行命令: "${ffprobe}" ${probeArgs.join(' ')}`);
                    const probeResult = spawnSync(ffprobe, probeArgs, { 
                        encoding: 'utf-8', 
                        windowsHide: true 
                    });
                    
                    if (probeResult.error) throw new Error(`FFprobe 启动失败: ${probeResult.error.message}`);
                    const originalDuration = parseFloat(probeResult.stdout);

                    // 2. 计算保留片段 (逻辑参考 cut_video.sh)
                    deleteList.sort((a, b) => a.start - b.start);
                    const mergedDelete = [];
                    deleteList.forEach(seg => {
                        if (mergedDelete.length === 0 || seg.start > mergedDelete[mergedDelete.length - 1].end + 0.05) {
                            mergedDelete.push({ ...seg });
                        } else {
                            mergedDelete[mergedDelete.length - 1].end = Math.max(mergedDelete[mergedDelete.length - 1].end, seg.end);
                        }
                    });

                    const keepSegs = [];
                    let cursor = 0;
                    mergedDelete.forEach(del => {
                        if (del.start > cursor + 0.01) keepSegs.push({ start: cursor, end: del.start });
                        cursor = del.end;
                    });
                    if (cursor < originalDuration - 0.01) keepSegs.push({ start: cursor, end: originalDuration });

                    // 3. 使用 FFmpeg concat 分离滤镜进行快速剪辑 (不重编码，如果关键帧对齐)
                    // 或者使用 filter_complex 重新编码 (更精确)
                    // 为了保证 GUI 的响应，这里我们先用一种较快的方式
                    
                    let filterComplex = '';
                    let concatInputs = '';
                    keepSegs.forEach((seg, i) => {
                        filterComplex += `[0:v]trim=start=${seg.start}:end=${seg.end},setpts=PTS-STARTPTS[v${i}];`;
                        filterComplex += `[0:a]atrim=start=${seg.start}:end=${seg.end},asetpts=PTS-STARTPTS[a${i}];`;
                        concatInputs += `[v${i}][a${i}]`;
                    });
                    filterComplex += `${concatInputs}concat=n=${keepSegs.length}:v=1:a=1[outv][outa]`;

                    console.log(`⏳ 正在剪辑 ${keepSegs.length} 个片段...`);
                    const cutStartTime = Date.now();
                    const cutArgs = [
                        '-i', currentVideoPath,
                        '-filter_complex', filterComplex,
                        '-map', '[outv]', '-map', '[outa]',
                        '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23',
                        '-c:a', 'aac', '-b:a', '128k',
                        '-y', outputVideo
                    ];
                    console.log(`🚀 执行命令: "${ffmpeg}" ... (滤镜内容较长已省略)`);
                    const ffmpegCut = spawnSync(ffmpeg, cutArgs, { 
                        encoding: 'utf-8', 
                        windowsHide: true 
                    });

                    if (ffmpegCut.status !== 0) {
                        console.error('❌ 剪辑失败:', ffmpegCut.stderr);
                        throw new Error('FFmpeg 剪辑执行失败');
                    }

                    const deletedDuration = mergedDelete.reduce((acc, cur) => acc + (cur.end - cur.start), 0);
                    const newDuration = originalDuration - deletedDuration;

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ 
                        success: true, 
                        output: 'output_cut.mp4',
                        originalDuration,
                        newDuration,
                        deletedDuration,
                        savedPercent: ((deletedDuration / originalDuration) * 100).toFixed(1)
                    }));
                } else {
                    fs.writeFileSync(path.join(currentProjectDir, '3_审核', 'saved_selection.json'), body);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true }));
                }
            } else {
                const dataPath = path.join(currentProjectDir, '3_审核', 'saved_selection.json');
                if (fs.existsSync(dataPath)) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    fs.createReadStream(dataPath).pipe(res);
                } else {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Not Found' }));
                }
            }
        });
        return;
    }

    // 静态文件服务
    let filePath = '';
    if (pathname.startsWith('/review/')) {
        if (!currentProjectDir) {
             res.writeHead(400);
             return res.end('Project dir not initialized');
        }
        filePath = path.join(currentProjectDir, '3_审核', pathname.replace('/review/', ''));
    } else {
        filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath);
        const stat = fs.statSync(filePath);
        if (req.headers.range && (ext === '.mp3' || ext === '.mp4')) {
            const range = req.headers.range.replace('bytes=', '').split('-');
            const start = parseInt(range[0], 10);
            const end = range[1] ? parseInt(range[1], 10) : stat.size - 1;
            res.writeHead(206, { 'Content-Type': MIME_TYPES[ext], 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
            fs.createReadStream(filePath, { start, end }).pipe(res);
        } else {
            res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'text/plain', 'Content-Length': stat.size, 'Accept-Ranges': 'bytes' });
            fs.createReadStream(filePath).pipe(res);
        }
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

// 全局异常处理，防止服务器崩溃
process.on('uncaughtException', (err) => {
    console.error('💥 Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Claude Mate GUI 运行在 http://localhost:${PORT}`);
}).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`❌ 错误：端口 ${PORT} 已被占用。`);
        console.error(`💡 请尝试：\n   1. 关闭其他已打开的控制台窗口\n   2. 在命令行运行: netstat -ano | findstr :${PORT} 找到 PID，然后用 taskkill /F /PID <PID> 杀死它`);
        process.exit(1);
    } else {
        console.error('💥 服务器启动失败:', err);
    }
});
