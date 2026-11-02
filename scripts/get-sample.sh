#!/usr/bin/env bash
# Ten minutes of a real lecture to run Front Row on: MIT 18.06 Linear Algebra, lecture 3, Gilbert Strang
# (MIT OpenCourseWare, CC BY-NC-SA 4.0, AI-remastered upload on archive.org). ffmpeg reads only the part it needs.
#   scripts/get-sample.sh   ->  sample.mp4 (1:00 to 11:00, 1280x960, about 70 MB)
set -euo pipefail
URL="https://archive.org/download/mit-ocw-linear-algebra-gilbert-strang-ai-remastered/3._Multiplication_and_Inverse_Matrices_Remastered.mp4"
ffmpeg -v error -y -ss 60 -t 600 -i "$URL" -c copy sample.mp4
echo "sample.mp4 ready. Next: npm run notes -- sample.mp4 --course \"MIT 18.06\" --keywords \"matrix multiplication,inverse,Gauss-Jordan,row times column,identity matrix\""
