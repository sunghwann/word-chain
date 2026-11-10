#!/bin/sh
# 배포 전에 실행: 버전 문자열을 한꺼번에 바꿔서 접속자 브라우저가 새 파일을 받게 함
set -e
cd "$(dirname "$0")/.."
NEW=$(date -u +%Y%m%d%H%M)
OLD=$(sed -n 's/.*"v": *"\([0-9]*\)".*/\1/p' version.json)
sed -i.bak "s/$OLD/$NEW/g" app.js index.html && rm -f app.js.bak index.html.bak
printf '{"v": "%s"}\n' "$NEW" > version.json
echo "version $OLD -> $NEW"
