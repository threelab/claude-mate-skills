# -*- coding: utf-8 -*-
"""
口播剪辑后端 API 服务
Flask API 服务器，提供视频上传和分析接口
"""

import os
import json
import tempfile
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

import clip_announcement as ca

app = Flask(__name__, static_folder='.')
CORS(app)

# 上传文件保存目录
UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER


@app.route('/')
def index():
    """返回前端页面"""
    return send_from_directory('.', 'index.html')


@app.route('/api/upload', methods=['POST'])
def upload_video():
    """上传视频文件"""
    if 'video' not in request.files:
        return jsonify({'error': '没有文件'}), 400
    
    file = request.files['video']
    if file.filename == '':
        return jsonify({'error': '文件名为空'}), 400
    
    # 保存文件
    filename = file.filename
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(filepath)
    
    return jsonify({
        'success': True,
        'path': filepath,
        'filename': filename
    })


@app.route('/api/analyze', methods=['POST'])
def analyze_video():
    """分析视频"""
    data = request.get_json()
    
    if not data or 'video_path' not in data:
        return jsonify({'error': '缺少 video_path 参数'}), 400
    
    video_path = data['video_path']
    
    # 检查文件是否存在
    if not os.path.exists(video_path):
        return jsonify({'error': f'文件不存在: {video_path}'}), 404
    
    try:
        # 初始化工具
        tool = ca.ClipAnnouncementTool()
        
        # 获取视频时长
        duration = ca.get_video_duration(video_path)
        
        # 提取音频
        audio_path = video_path.rsplit('.', 1)[0] + '_audio.wav'
        audio_path = ca.extract_audio(video_path, audio_path)
        
        if audio_path is None:
            return jsonify({'error': '音频提取失败'}), 500
        
        # 注意：这里需要将音频上传到火山引擎获取 URL
        # 简化处理：使用本地文件路径（如果火山引擎支持）
        audio_url = f"file://{os.path.abspath(audio_path)}"
        
        # 提交 ASR 任务
        task_id, x_tt_logid = tool.asr_client.submit_task(audio_url)
        
        # 等待结果
        transcript_data = tool.asr_client.wait_for_result(task_id, x_tt_logid)
        
        # 分析转写结果
        issues, transcript = tool.analyzer.analyze(transcript_data)
        
        # 构建问题列表
        issue_list = []
        filler_count = 0
        repeat_count = 0
        
        for issue in issues:
            issue_list.append(issue.to_dict())
            if issue.type == '语气词':
                filler_count += 1
            elif issue.type == '重复':
                repeat_count += 1
        
        # 生成 FFmpeg 命令
        ffcmd = _generate_ffmpeg_cmd(video_path, issues)
        
        result = {
            'success': True,
            'total_duration': duration,
            'total_issue_count': len(issue_list),
            'filler_count': filler_count,
            'repeat_count': repeat_count,
            'total_remove_duration': sum(i.end_time - i.start_time for i in issues),
            'issues': issue_list,
            'transcript': transcript,
            'ffmpeg_cmd': ffcmd
        }
        
        # 清理临时音频文件
        try:
            if os.path.exists(audio_path):
                os.remove(audio_path)
        except:
            pass
        
        return jsonify(result)
        
    except Exception as e:
        import traceback
        return jsonify({
            'error': str(e),
            'traceback': traceback.format_exc()
        }), 500


def _generate_ffmpeg_cmd(video_path: str, issues: list) -> str:
    """生成 FFmpeg 剪切命令"""
    if not issues:
        return f'ffmpeg -i "{video_path}" -c copy output.mp4'
    
    # 构建保留表达式
    delete_ranges = []
    for issue in issues:
        start = issue.start_time
        end = issue.end_time
        delete_ranges.append(f"between(t,{start - 0.1},{end + 0.1})")
    
    delete_expr = "+".join(delete_ranges)
    keep_expr = f"not({delete_expr})"
    
    cmd = (
        f'ffmpeg -i "{video_path}" '
        f'-vf "select=\'{keep_expr}\',setpts=N/FRAME_RATE/TB" '
        f'-af "aselect=\'{keep_expr}\',asetpts=N/SR/TB" '
        f'-crf 23 output.mp4'
    )
    
    return cmd


@app.route('/api/status', methods=['GET'])
def status():
    """健康检查"""
    return jsonify({
        'status': 'ok',
        'service': 'clip-announcement-api'
    })


if __name__ == '__main__':
    print("=" * 50)
    print("口播视频智能剪辑 API 服务")
    print("=" * 50)
    print("前端地址: http://localhost:5000/")
    print("API 地址: http://localhost:5000/api/analyze")
    print("=" * 50)
    
    app.run(
        host='0.0.0.0',
        port=5000,
        debug=True
    )
