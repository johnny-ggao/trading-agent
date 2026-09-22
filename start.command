#!/bin/bash
# macOS 双击入口：调用同目录的 start.sh；失败时保留窗口，便于看报错。
DIR="$(cd "$(dirname "${0}")" && pwd)"
"${DIR}/start.sh" "$@"
status="$?"
if [ "${status}" -ne 0 ]; then
  printf '%s\n' ""
  printf '%s\n' "启动失败（退出码 ${status}）。按回车关闭窗口。"
  read -r _
fi
exit "${status}"
