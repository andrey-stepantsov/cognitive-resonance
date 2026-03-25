---
name: ffmpeg_youtube_shorts
description: Optimal FFmpeg parameters and video filters for generating YouTube Shorts
---
# FFmpeg YouTube Shorts Generation Guide

When generating or formatting video content specifically for YouTube Shorts, the following architectural rules and filters MUST be applied strictly by the Coder and verified by the Auditor.

## 1. Resolution & Aspect Ratio
YouTube Shorts strictly require a 9:16 vertical aspect ratio. The optimal rendering resolution is `1080x1920`.

## 2. Smart Cropping / Padding (Video Filter)
Input images or videos rarely match the exactly 9:16 ratio. You MUST inject the following `vf` (video filter) graph to scale the content to fit within 1080x1920, and then pad any remaining background space with black bars to prevent stretching:
`-vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black"`

## 3. Video Codec
Use `-c:v libx264` with a pixel format of `-pix_fmt yuv420p` for maximum web compatibility. If rendering from a single image, use `-tune stillimage` and `-loop 1` with a specific framerate target like `-r 25`.

## 4. Audio Quality Profile
YouTube demands high-quality audio formats. You MUST include these explicit flags:
- `-c:a aac`
- `-b:a 384k`
- `-ar 48000`

## 5. Auditor Check
The Auditor MUST explicitly reject any bash script that is missing the `-vf` filter required to properly scale/pad the video to 1080x1920.
