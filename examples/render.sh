#!/bin/sh
set -eu
: "${API_KEY:?Set API_KEY}"
BASE_URL=${BASE_URL:-http://localhost:3000}
MARKDOWN_FILE=${1:?Usage: render.sh markdown-file}
node -e 'const fs=require("fs"); process.stdout.write(JSON.stringify({markdown:fs.readFileSync(process.argv[1],"utf8"),theme:process.argv[2] || "default"}))' "$MARKDOWN_FILE" "${THEME:-default}" | curl -fsS "$BASE_URL/v1/render" -H "Authorization: Bearer $API_KEY" -H 'Content-Type: application/json' --data-binary @-
