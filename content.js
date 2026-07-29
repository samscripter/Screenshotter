let captureArea = null
let lastImageData = null
let monitoringInterval = null
let visualIndicator = null
let lastStatusUpdate = 0
let changeDetectedInPeriod = false
let toolbarEl = null
let toolbarPosInterval = null

function isContextValid() {
  try { return !!chrome.runtime?.id } catch { return false }
}

function safeSendMessage(msg, cb) {
  try {
    if (!isContextValid()) {
      stopMonitoring()
      return
    }
    chrome.runtime.sendMessage(msg, (response) => {
      if (chrome.runtime.lastError) {
        if (chrome.runtime.lastError.message?.includes('context')) {
          stopMonitoring()
        }
        return
      }
      cb?.(response)
    })
  } catch { stopMonitoring() }
}

function createVisualIndicator() {
  if (visualIndicator) return
  visualIndicator = document.createElement('div')
  visualIndicator.style.position = 'fixed'
  visualIndicator.style.border = '2px solid blue'
  visualIndicator.style.background = 'rgba(0, 0, 255, 0.1)'
  visualIndicator.style.zIndex = '9998'
  visualIndicator.style.pointerEvents = 'none'
  visualIndicator.style.transition = 'border-color 0.5s'
  document.body.appendChild(visualIndicator)
}

function updateVisualIndicator() {
  if (!visualIndicator || !captureArea) return
  visualIndicator.style.left = captureArea.x + 'px'
  visualIndicator.style.top = captureArea.y + 'px'
  visualIndicator.style.width = captureArea.width + 'px'
  visualIndicator.style.height = captureArea.height + 'px'
}

function removeVisualIndicator() {
  if (visualIndicator && document.body.contains(visualIndicator)) {
    document.body.removeChild(visualIndicator)
    visualIndicator = null
  }
}

function getDominantColor(imageData) {
  const data = imageData.data
  let r = 0, g = 0, b = 0, count = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 128) {
      r += data[i]
      g += data[i + 1]
      b += data[i + 2]
      count++
    }
  }
  if (count === 0) return null
  return { r: Math.round(r / count), g: Math.round(g / count), b: Math.round(b / count) }
}

function colorsAreDifferent(color1, color2, threshold = 15) {
  if (!color1 || !color2) return false
  const maxDiff = Math.max(Math.abs(color1.r - color2.r), Math.abs(color1.g - color2.g), Math.abs(color1.b - color2.b))
  return maxDiff > threshold
}

function captureAreaAsDataUrl(scale) {
  if (!captureArea) return null
  const s = scale || 1
  try {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    canvas.width = Math.round(window.innerWidth * s)
    canvas.height = Math.round(window.innerHeight * s)
    ctx.scale(s, s)
    ctx.drawImage(document.documentElement, 0, 0)
    const areaCanvas = document.createElement('canvas')
    const areaCtx = areaCanvas.getContext('2d', { willReadFrequently: true })
    areaCanvas.width = Math.round(captureArea.width * s)
    areaCanvas.height = Math.round(captureArea.height * s)
    areaCtx.drawImage(canvas, Math.round(captureArea.x * s), Math.round(captureArea.y * s), Math.round(captureArea.width * s), Math.round(captureArea.height * s), 0, 0, areaCanvas.width, areaCanvas.height)
    return areaCanvas.toDataURL('image/png')
  } catch (e) {
    console.error('Capture failed:', e)
    return null
  }
}

function monitorSelectedArea() {
  if (!captureArea || !visualIndicator) return
  const now = Date.now()
  visualIndicator.style.borderColor = 'green'
  setTimeout(() => { if (visualIndicator) visualIndicator.style.borderColor = 'blue' }, 200)
  try {
    const dataUrl = captureAreaAsDataUrl(1)
    if (!dataUrl) return
    const img = new Image()
    img.onload = () => {
      try {
        const areaCanvas = document.createElement('canvas')
        areaCanvas.width = captureArea.width
        areaCanvas.height = captureArea.height
        const areaCtx = areaCanvas.getContext('2d', { willReadFrequently: true })
        areaCtx.drawImage(img, 0, 0)
        const imageData = areaCtx.getImageData(0, 0, areaCanvas.width, areaCanvas.height)
        const currentColor = getDominantColor(imageData)
        let changeDetected = false
        if (currentColor && lastImageData && colorsAreDifferent(currentColor, lastImageData)) {
          changeDetected = true
          changeDetectedInPeriod = true
          visualIndicator.style.borderColor = 'red'
          setTimeout(() => { if (visualIndicator) visualIndicator.style.borderColor = 'blue' }, 1000)
          safeSendMessage({ type: 'areaChange' })
        }
        lastImageData = currentColor
        if (now - lastStatusUpdate >= 5000) {
          safeSendMessage({
            type: 'statusUpdate',
            color: currentColor,
            changeDetected: changeDetectedInPeriod,
            timestamp: now
          })
          changeDetectedInPeriod = false
          lastStatusUpdate = now
        }
      } catch (e) { console.error('Monitor processing error:', e) }
    }
    img.onerror = () => { /* silent fail */ }
    img.src = dataUrl
  } catch (error) {
    console.error('Error capturing area:', error)
  }
}

function startMonitoring() {
  if (monitoringInterval) return
  createVisualIndicator()
  updateVisualIndicator()
  createToolbar()
  monitoringInterval = setInterval(monitorSelectedArea, 1000)
}

function stopMonitoring() {
  if (monitoringInterval) {
    clearInterval(monitoringInterval)
    monitoringInterval = null
  }
  removeVisualIndicator()
  removeToolbar()
  lastImageData = null
}

function checkCaptureArea() {
  if (!isContextValid()) {
    stopMonitoring()
    return
  }
  safeSendMessage({ action: 'checkCaptureArea' }, (response) => {
    if (!response) return
    const newArea = response.area
    if (newArea) {
      if (!captureArea || JSON.stringify(captureArea) !== JSON.stringify(newArea)) {
        captureArea = newArea
        startMonitoring()
      }
    } else {
      if (captureArea) {
        captureArea = null
        stopMonitoring()
      }
    }
  })
}

function dataUrlToBlob(dataUrl) {
  const parts = dataUrl.split(',')
  const mime = parts[0].split(':')[1].split(';')[0]
  const bytes = atob(parts[1])
  const ab = new ArrayBuffer(bytes.length)
  const ia = new Uint8Array(ab)
  for (let i = 0; i < bytes.length; i++) ia[i] = bytes.charCodeAt(i)
  return new Blob([ab], { type: mime })
}

function createToolbar() {
  removeToolbar()
  if (!captureArea) return
  toolbarEl = document.createElement('div')
  toolbarEl.id = '__sw_toolbar__'
  Object.assign(toolbarEl.style, {
    position: 'fixed',
    zIndex: '10000',
    display: 'flex',
    gap: '4px',
    padding: '6px 8px',
    background: '#1a1a2e',
    borderRadius: '8px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
    alignItems: 'center',
    fontFamily: '-apple-system, sans-serif'
  })
  const btnStyle = {
    border: 'none',
    padding: '7px 12px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '500',
    color: '#fff',
    whiteSpace: 'nowrap',
    transition: 'background 0.15s'
  }
  function makeBtn(text, bg, hoverBg, onClick) {
    const b = document.createElement('button')
    b.textContent = text
    Object.assign(b.style, { ...btnStyle, background: bg })
    b.addEventListener('mouseenter', () => { b.style.background = hoverBg })
    b.addEventListener('mouseleave', () => { b.style.background = bg })
    b.addEventListener('click', onClick)
    return b
  }
  toolbarEl.appendChild(makeBtn('📸 Send', '#5865f2', '#4752c4', captureToDiscord))
  toolbarEl.appendChild(makeBtn('📋 Copy', '#2d7d46', '#236836', copyToClipboard))
  toolbarEl.appendChild(makeBtn('❌ Cancel', '#b91c1c', '#991515', cancelSelection))
  document.body.appendChild(toolbarEl)
  positionToolbar()
  if (toolbarPosInterval) clearInterval(toolbarPosInterval)
  toolbarPosInterval = setInterval(positionToolbar, 500)
}

function removeToolbar() {
  if (toolbarPosInterval) { clearInterval(toolbarPosInterval); toolbarPosInterval = null }
  if (toolbarEl && document.body.contains(toolbarEl)) {
    document.body.removeChild(toolbarEl)
    toolbarEl = null
  }
}

function positionToolbar() {
  if (!toolbarEl || !captureArea) return
  requestAnimationFrame(() => {
    const tw = toolbarEl.offsetWidth || 280
    const cx = captureArea.x + captureArea.width / 2
    let left = cx - tw / 2
    left = Math.max(4, Math.min(left, window.innerWidth - tw - 4))
    let top = captureArea.y + captureArea.height + 8
    if (top + toolbarEl.offsetHeight + 8 > window.innerHeight) {
      top = captureArea.y - toolbarEl.offsetHeight - 8
    }
    toolbarEl.style.left = left + 'px'
    toolbarEl.style.top = Math.max(4, top) + 'px'
  })
}

function unlockAndCleanup() {
  chrome.runtime.sendMessage({ action: 'unlockArea' })
  stopMonitoring()
}

function setOverlaysVisible(visible) {
  const d = visible ? '' : 'none'
  if (visualIndicator) visualIndicator.style.display = d
  if (toolbarEl) toolbarEl.style.display = d
}

function afterPaint(fn) {
  requestAnimationFrame(() => requestAnimationFrame(fn))
}

function captureToDiscord() {
  setOverlaysVisible(false)
  afterPaint(() => {
    chrome.storage.local.get(['destinationMode', 'discordWebhookUrl', 'telegramBotToken', 'telegramChatId'], (result) => {
      const mode = result.destinationMode || 'discord'
      const msg = { action: 'captureScreenshot' }
      if (mode === 'discord' || mode === 'both') msg.discordWebhookUrl = result.discordWebhookUrl
      if (mode === 'telegram' || mode === 'both') {
        msg.telegramBotToken = result.telegramBotToken
        msg.telegramChatId = result.telegramChatId
      }
      if (!msg.discordWebhookUrl && !msg.telegramBotToken) { console.warn('No webhook URL set'); unlockAndCleanup(); return }
      chrome.runtime.sendMessage(msg, () => {
        unlockAndCleanup()
      })
    })
  })
}

function copyToClipboard() {
  setOverlaysVisible(false)
  afterPaint(() => {
    const dataUrl = captureAreaAsDataUrl(1)
    if (!dataUrl) { unlockAndCleanup(); return }
    const blob = dataUrlToBlob(dataUrl)
    navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]).then(() => {
      unlockAndCleanup()
    }).catch(() => unlockAndCleanup())
  })
}

function cancelSelection() {
  unlockAndCleanup()
}

setInterval(checkCaptureArea, 2000)
checkCaptureArea()
