#!/bin/bash

# FFmpeg 封装脚本：提供音频提取和时长获取功能
# 用法: 
#   提取音频: ./ffmpeg_wrapper.sh extract <input_video> <output_audio>
#   获取时长: ./ffmpeg_wrapper.sh duration <input_video>

COMMAND=$1
INPUT=$2
OUTPUT=$3

case $COMMAND in
  extract)
    if [ -z "$INPUT" ] || [ -z "$OUTPUT" ]; then
      echo "Usage: $0 extract <input_video> <output_audio>"
      exit 1
    fi
    ffmpeg -i "$INPUT" -ar 16000 -ac 1 -acodec pcm_s16le "$OUTPUT" -y
    ;;
  
  duration)
    if [ -z "$INPUT" ]; then
      echo "Usage: $0 duration <input_video>"
      exit 1
    fi
    ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$INPUT"
    ;;

  *)
    echo "Unknown command: $COMMAND"
    echo "Available: extract, duration"
    exit 1
    ;;
esac
