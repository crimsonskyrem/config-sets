#!/usr/bin/osascript -l JavaScript
// @raycast.title Swap Desktops
// @raycast.schemaVersion 1
// @raycast.mode silent
// @raycast.description Swap the visible contents (windows, incl. fullscreen apps) of the left and right displays
// @raycast.keywords swap desktop display monitor screen

/*
 * Swap Desktops — 交换左右两个显示器当前可见的内容（窗口，含全屏程序）。
 * 零第三方依赖：仅用 macOS 自带 osascript(JXA) + CoreGraphics + System Events。
 * 权限：仅需「辅助功能」（系统设置 → 隐私与安全性 → 辅助功能，勾选 Raycast；终端测试时勾选终端）。
 * 测试：osascript -l JavaScript swap-desktops.js --dry-run（只读预览）；--debug（详细日志，配合排障）
 */

ObjC.import('AppKit')
ObjC.import('CoreGraphics')
ObjC.import('ApplicationServices')

const ARGS = $.NSProcessInfo.processInfo.arguments.js.map(v => String(ObjC.unwrap(v)))
const DRY_RUN = ARGS.includes('--dry-run')
const DEBUG = ARGS.includes('--debug')

// JXA 桥接的 C 函数返回 CF 类型时是浅代理，需要递归解包
function deep(v) {
  if (v === null || v === undefined) return v
  const u = ObjC.unwrap(v)
  if (u === null || u === undefined) return u
  if (typeof u === 'object') {
    if (Array.isArray(u)) return u.map(deep)
    const out = {}
    for (const k of Object.keys(u)) out[k] = deep(u[k])
    return out
  }
  return u
}

function cgList(opt) {
  const ref = $.CGWindowListCopyWindowInfo(opt, $.kCGNullWindowID)
  return ObjC.castRefToObject(ref, 'NSArray').js.map(deep)
}
const ONS = $.kCGWindowListOptionOnScreenOnly

// ---- 显示器：NSScreen 精确 frame，按 x 排序定左右（不硬编码编号）----
const screenFrames = $.NSScreen.screens.js.map(s => {
  const f = s.frame
  return { x: f.origin.x, y: f.origin.y, w: f.size.width, h: f.size.height }
})
if (screenFrames.length !== 2) {
  throw new Error(`需要恰好 2 个显示器，当前 ${screenFrames.length} 个`)
}
const H = Math.max(...screenFrames.map(f => f.y + f.h)) // 全局顶边
// NSScreen 是左下原点，转成左上原点（与 CGWindowList/AX 同坐标系）
const tl = screenFrames.map(f => ({ x: f.x, y: H - (f.y + f.h), w: f.w, h: f.h }))
tl.sort((a, b) => a.x - b.x)
const [left, right] = tl

// ---- 当前可见窗口（OnScreenOnly = 仅当前 Space 上正在显示的窗口）----
const wins = cgList(ONS).filter(d => {
  if (Number(d.kCGWindowLayer) !== 0) return false // 排除菜单栏/系统层
  const b = d.kCGWindowBounds
  if (!b || !b.Width || !b.Height) return false
  const owner = String(d.kCGWindowOwnerName || '')
  if (!owner || owner === 'Window Server') return false
  return true
})

const centerIn = (b, f) => {
  const cx = b.X + b.Width / 2
  const cy = b.Y + b.Height / 2
  return cx >= f.x && cx < f.x + f.w && cy >= f.y && cy < f.y + f.h
}
const groups = { left: [], right: [] }
for (const d of wins) {
  const b = d.kCGWindowBounds
  if (centerIn(b, left)) groups.left.push(d)
  else if (centerIn(b, right)) groups.right.push(d)
}
// 左 → 右，右 → 左；全屏候选（尺寸等于显示器）排最后，避免其全屏 Space 盖住待处理窗口
const toRight = groups.left.map(d => ({ d, from: left, to: right }))
const toLeft = groups.right.map(d => ({ d, from: right, to: left }))
const sortMoves = (a, b) => {
  const bd = a.d.kCGWindowBounds
  const aDisp = Math.abs(bd.Width - a.from.w) <= 2 && Math.abs(bd.Height - a.from.h) <= 2 ? 1 : 0
  const bd2 = b.d.kCGWindowBounds
  const bDisp = Math.abs(bd2.Width - b.from.w) <= 2 && Math.abs(bd2.Height - b.from.h) <= 2 ? 1 : 0
  return bDisp - aDisp
}
const moves = [...toRight, ...toLeft].sort(sortMoves)

if (DRY_RUN) {
  console.log(`左屏 ${groups.left.length} 个窗口 → 右屏；右屏 ${groups.right.length} 个窗口 → 左屏`)
  for (const m of moves) {
    const b = m.d.kCGWindowBounds
    console.log(`  ${m.d.kCGWindowOwnerName} (${b.X},${b.Y} ${b.Width}x${b.Height}) → (${b.X - m.from.x + m.to.x},${b.Y - m.from.y + m.to.y})`)
  }
} else {
  moveWindows()
}

function moveWindows() {
  if (!$.AXIsProcessTrusted()) {
    throw new Error('缺少「辅助功能」权限：系统设置 → 隐私与安全性 → 辅助功能，勾选 Raycast/终端')
  }
  const se = Application('System Events')
  const procs = se.processes()

  // 激活名回退链：CG 显示名 / System Events 进程名，逐个尝试
  function namesFor(pid, owner) {
    const names = [owner]
    for (const p of procs) {
      try { if (p.unixId() === pid) { names.push(String(p.name())); break } } catch (e) {}
    }
    return names
  }
  function activateByName(names, pid) {
    // 首选：System Events frontmost（实测可靠）；回退：Application(名称)
    if (pid) {
      for (const p of procs) {
        try { if (p.unixId() === pid) { p.frontmost = true; return true } } catch (e) {}
      }
    }
    for (const n of names) {
      try { Application(n).activate(); return true } catch (e) {}
    }
    return false
  }

  // 按 CG bounds 就近匹配 AX 窗口（容差 20pt，兼容阴影/圆角度量差异）
  function findAxWindow(d, used) {
    const b = d.kCGWindowBounds
    const pid = Number(d.kCGWindowOwnerPID)
    let proc
    for (const p of procs) {
      try { if (p.unixId() === pid) { proc = p; break } } catch (e) {}
    }
    if (!proc) return null
    let axs
    try { axs = proc.windows() } catch (e) { axs = null }
    if (!axs || axs.length === 0) {
      // 全屏或非活动 Space 的窗口对 AX 不可见（windows() 为空）：all 列表有该 pid 窗口则激活后重试
      const inAll = cgList(0).some(x =>
        Number(x.kCGWindowOwnerPID) === pid && Number(x.kCGWindowLayer) === 0)
      if (inAll) {
        activateByName(namesFor(pid, String(d.kCGWindowOwnerName)), pid)
        // 空间切换有动画，轮询等待窗口列表出现
        for (let i = 0; i < 6; i++) {
          delay(0.3)
          try { axs = proc.windows() } catch (e) { return null }
          if (axs && axs.length > 0) break
        }
      }
    }
    if (!axs) return null
    const cx = b.X + b.Width / 2
    const cy = b.Y + b.Height / 2
    let best = null
    let bestDist = Infinity
    for (const w of axs) {
      if (used.has(w)) continue
      try {
        const p = w.position()
        const s = w.size()
        const d = Math.abs(p[0] + s[0] / 2 - cx) + Math.abs(p[1] + s[1] / 2 - cy) +
              Math.abs(s[0] - b.Width) / 10 + Math.abs(s[1] - b.Height) / 10
        if (d < bestDist) { bestDist = d; best = w }
      } catch (e) {}
    }
    return bestDist <= 30 ? best : null
  }

  // 空间切换会使 AX 引用失效：按 pid 取当前 onscreen 面积最大的窗口，重取引用
  function findAxWindowByPid(pid, used) {
    let best = null
    let bestArea = 0
    for (const d of cgList(ONS)) {
      if (Number(d.kCGWindowOwnerPID) !== pid || Number(d.kCGWindowLayer) !== 0) continue
      const b = d.kCGWindowBounds
      if (!b) continue
      const area = b.Width * b.Height
      if (area > bestArea) { bestArea = area; best = b }
    }
    if (!best) return null
    return findAxWindow({ kCGWindowBounds: best, kCGWindowOwnerPID: pid }, used)
  }

  // 该进程是否有「面积 ≈ area」的窗口在目标显示器上（排除悬浮条等附属窗口）
  // all=false: 仅当前可见；all=true: 所有 Space（被全屏 Space 盖住也算已移动）
  function pidOnDisplay(pid, disp, area, all, relaxed) {
    for (const d of cgList(all ? 0 : ONS)) {
      if (Number(d.kCGWindowOwnerPID) !== pid || Number(d.kCGWindowLayer) !== 0) continue
      const b = d.kCGWindowBounds
      if (!b || !centerIn(b, disp)) continue
      // 全屏候选退全屏后尺寸会变回原窗口大小，放宽为「真实窗口」尺寸（排除悬浮条）
      if (relaxed) { if (b.Width > 300 && b.Height > 300) return true }
      else if (Math.abs(b.Width * b.Height - area) < area * 0.15) return true
    }
    return false
  }

  let moved = 0
  let failed = 0
  let skipped = 0
  const used = new Set()
  const movedList = []
  const fsApps = []
  function tryMove(m) {
    const b = m.d.kCGWindowBounds
    const pid = Number(m.d.kCGWindowOwnerPID)
    const owner = String(m.d.kCGWindowOwnerName)
    const tx = b.X - m.from.x + m.to.x
    const ty = b.Y - m.from.y + m.to.y
    const area = b.Width * b.Height
    const dispSized = Math.abs(b.Width - m.from.w) <= 2 && Math.abs(b.Height - m.from.h) <= 2

    let ax = findAxWindow(m.d, used)
    if (!ax) {
      // AX 不可见的窗口（自定义标题栏/悬浮层的独立 CG 条目）无法移动，跳过而非失败
      if (DEBUG) console.log(`  [debug] 跳过(AX 不可见): ${owner} (${b.X},${b.Y} ${b.Width}x${b.Height})`)
      skipped++
      return 'skipped'
    }
    used.add(ax)
    let wasFullscreen = false
    let ok = false
    try {
      if (dispSized) {
        // 全屏候选：直接移动会被全屏窗口的位置锁定无视
        ax.position = [tx, ty]
        delay(0.4)
        ok = pidOnDisplay(pid, m.to, area, false, dispSized)
        if (!ok) {
          wasFullscreen = true
          ax.attributes.byName('AXFullScreen').value = false
          delay(0.8)
          // 激活应用，把退全屏后的窗口所在 Space 带到前台，再跨显示器定位
          activateByName(namesFor(pid, owner), pid)
          delay(0.5)
          const ax2 = findAxWindowByPid(pid, used)
          if (ax2) {
            ax2.position = [tx, ty]
            delay(0.4)
            ok = pidOnDisplay(pid, m.to, area, false, dispSized)
          }
        }
      } else {
        ax.position = [tx, ty]
        delay(0.4)
        ok = pidOnDisplay(pid, m.to, area, false, dispSized)
      }
      if (!ok) {
        // 落到目标显示器非活动 Space：激活应用，把窗口所在 Space 带到前台
        if (DEBUG) console.log(`  [debug] 激活救援: ${owner}`)
        activateByName(namesFor(pid, owner), pid)
        delay(0.6)
        ok = pidOnDisplay(pid, m.to, area, false, dispSized)
      }
      if (ok && wasFullscreen) {
        // 重新进全屏（空间切换后引用失效，重取）
        const ax3 = findAxWindowByPid(pid, used)
        if (ax3) {
          ax3.attributes.byName('AXFullScreen').value = true
          delay(0.8)
        }
      }
      if (ok) {
        moved++
        movedList.push({ pid, to: m.to, name: owner, area, relaxed: dispSized })
        if (wasFullscreen) fsApps.push({ pid, owner })
        if (DEBUG) console.log(`  [debug] 已移动: ${owner} → (${tx},${ty})`)
        return 'moved'
      } else {
        if (DEBUG) console.log(`  [debug] 移动失败: ${owner} 未到达目标显示器`)
        failed++
        return 'failed'
      }
    } catch (e) {
      if (DEBUG) console.log(`  [debug] 移动异常: ${owner}: ${e.message}`)
      failed++
      return 'failed'
    }
  }

  const skippedMoves = []
  for (const m of moves) {
    if (tryMove(m) === 'skipped') skippedMoves.push(m)
  }
  // 循环结束后重新激活经过全屏流程的应用，让各显示器显示换过来的全屏程序
  for (const fs of fsApps) {
    activateByName(namesFor(fs.pid, fs.owner), fs.pid)
    delay(0.5)
  }
  // 第二轮：重试被跳过的窗口（全屏应用的 Space 已重新激活，空间布局趋于稳定）
  for (const m of skippedMoves) {
    if (tryMove(m) === 'skipped' && DEBUG) console.log(`  [debug] 第二轮仍跳过: ${m.d.kCGWindowOwnerName}`)
  }

  // ---- 事后验证（all 列表：被全屏 Space 盖住但已换到目标显示器的窗口也算成功）----
  let verified = 0
  for (const mv of movedList) {
    const ok = pidOnDisplay(mv.pid, mv.to, mv.area, true, mv.relaxed)
    if (ok) verified++
    else if (DEBUG) console.log(`  [debug] 验证失败: ${mv.name} 不在目标显示器`)
  }
  if (verified < moved) throw new Error(`交换未生效：${moved - verified} 个窗口未到达目标显示器（--debug 查看详情）`)
  if (failed > 0) throw new Error(`完成：移动 ${moved} 个窗口，失败 ${failed} 个（--debug 查看详情）`)
  if (DEBUG && skipped > 0) console.log(`完成：移动 ${moved} 个窗口，跳过 ${skipped} 个（AX 不可见）`)
  console.log(`已交换：移动 ${moved} 个窗口，跳过 ${skipped} 个`)
}
