# Raycast Script Commands

## Swap Desktops (`swap-desktops.js`)

交换左右两个显示器当前可见的内容（窗口，含全屏程序）。零第三方依赖，仅用 macOS 自带 JXA。

### 安装

1. 打开 Raycast → Settings → Extensions → **Scripts** → **Add Directory**，选择本目录（`MacOS/raycast-scripts`）。
2. 系统设置 → 隐私与安全性：
   - **辅助功能**：勾选 Raycast（终端测试时勾选终端）
3. 在 Raycast 搜索 "Swap Desktops"，可为其绑定全局热键。

### 测试（只读预览，不移动任何窗口）

```sh
osascript -l JavaScript swap-desktops.js --dry-run
```

### 行为与边界

- 左右判定按显示器实际位置（NSScreen frame 的 x 排序），不依赖显示器编号。
- 只搬**当前 Space 上可见**的窗口；隐藏/最小化/其他 Space 的窗口不碰。
- 全屏程序：退全屏 → 搬到对面显示器 → 重新进全屏。
- 空桌面（没有窗口的 Space）不搬——交换的是内容不是 Space 本体。
- 显示器数量不是 2 时报错退出。
- 终端测试时，权限需授予终端（而非 Raycast）。
- 每次触发 = 完整交换一次；连续触发两次 = 换回原位。
- 已知限制：**Ghostty 显示自定义标题栏/标签条时，其窗口会拒绝一切 AX 位置写入**（连显示器内移动都无效，实测为应用自身行为）。此类窗口会被记为失败并报错，非脚本问题。
- 排障：`osascript -l JavaScript swap-desktops.js --debug` 逐窗口显示匹配/移动/验证结果。
