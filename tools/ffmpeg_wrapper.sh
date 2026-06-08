#!/bin/bash

# FFmpeg 封装脚本：用于提取音频
# 用法: ./ffmpeg_wrapper.sh input.mp4 output.wav

INPUT=$1
OUTPUT=$2

if [ -z "$INPUT" ] || [ -z "$OUTPUT" ]; then
    echo "Usage: $0 <input_video> <output_audio>"
    exit 1
fi

ffmpeg -i "$INPUT" -ar 16000 -ac 1 -acodec pcm_s16le "$OUTPUT" -y
