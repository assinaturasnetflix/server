#!/usr/bin/env bash
apt-get update && apt-get install -y wget
wget https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -O /usr/local/bin/yt-dlp
chmod +x /usr/local/bin/yt-dlp
