import tkinter as tk
from tkinter import filedialog
import sys

root = tk.Tk()
root.withdraw()
root.attributes("-topmost", True)
file_path = filedialog.askopenfilename(
    title="请选择要剪辑的视频文件",
    filetypes=[("MP4 files", "*.mp4"), ("All files", "*.*")]
)
if file_path:
    print(file_path.replace('/', '\\'))
root.destroy()
