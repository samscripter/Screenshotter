let captureArea = null
let lockedWindowId = null
let selectionTabId = null
let latestStatus = null

function getWebhookUrl() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['discordWebhookUrl'], (result) => {
      resolve(result.discordWebhookUrl || null)
    })
  })
}

function getTelegramBotToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['telegramBotToken'], (result) => {
      resolve(result.telegramBotToken || null)
    })
  })
}

function getTelegramChatId() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['telegramChatId'], (result) => {
      resolve(result.telegramChatId || null)
    })
  })
}

function getDestinationMode() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['destinationMode'], (result) => {
      resolve(result.destinationMode || 'discord')
    })
  })
}

function sendDiscordMessage(webhookUrl, message) {
  if (!webhookUrl) return Promise.resolve()
  return fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: message,
      username: 'Screen Shotter Bot',
      avatar_url: 'https://via.placeholder.com/128/5865f2/ffffff?text=SW'
    })
  }).then(r => {
    if (!r.ok) console.error('Discord send failed:', r.status)
  }).catch(e => console.error('Discord error:', e))
}

function sendTelegramMessage(botToken, chatId, message) {
  if (!botToken || !chatId) return Promise.resolve()
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'Markdown' })
  }).then(r => {
    if (!r.ok) console.error('Telegram send failed:', r.status)
  }).catch(e => console.error('Telegram error:', e))
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

async function captureAndSendScreenshot(tabId, area, destinations) {
  const dataUrl = await chrome.tabs.captureVisibleTab(lockedWindowId, { format: 'png' })
  const blob = dataUrlToBlob(dataUrl)
  const bitmap = await createImageBitmap(blob, { colorSpaceConversion: 'none' })
  const dpr = area.scaleFactor || 1
  const cw = Math.round(area.width * dpr)
  const ch = Math.round(area.height * dpr)
  const sx = Math.round(area.x * dpr)
  const sy = Math.round(area.y * dpr)
  const sw = Math.round(area.width * dpr)
  const sh = Math.round(area.height * dpr)
  const canvas = new OffscreenCanvas(cw, ch)
  const ctx = canvas.getContext('2d', { alpha: false })
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, cw, ch)
  const croppedBlob = await canvas.convertToBlob({ type: 'image/png' })
  const caption = `📸 Screenshot captured at ${new Date().toLocaleTimeString()}`
  const errors = []
  if (destinations.discord) {
    const formData = new FormData()
    formData.append('file', croppedBlob, `screenshot_${Date.now()}.png`)
    formData.append('payload_json', JSON.stringify({
      content: caption,
      username: 'Screen Shotter Bot'
    }))
    const res = await fetch(destinations.discord, { method: 'POST', body: formData })
    if (!res.ok) {
      const text = await res.text()
      errors.push(`Discord: ${res.status} ${text.slice(0, 100)}`)
    }
  }
  if (destinations.telegramBotToken && destinations.telegramChatId) {
    const formData = new FormData()
    formData.append('chat_id', destinations.telegramChatId)
    formData.append('photo', croppedBlob, `screenshot_${Date.now()}.png`)
    formData.append('caption', caption)
    const url = `https://api.telegram.org/bot${destinations.telegramBotToken}/sendPhoto`
    const res = await fetch(url, { method: 'POST', body: formData })
    if (!res.ok) {
      const text = await res.text()
      errors.push(`Telegram: ${res.status} ${text.slice(0, 100)}`)
    }
  }
  if (errors.length) throw new Error(errors.join('; '))
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'setCaptureArea') {
    captureArea = message.area
    lockedWindowId = sender.tab.windowId
    selectionTabId = sender.tab.id
    sendResponse({ success: true })
  } else if (message.action === 'isAreaLocked') {
    sendResponse({ locked: !!captureArea })
  } else if (message.action === 'unlockArea') {
    captureArea = null
    lockedWindowId = null
    selectionTabId = null
    sendResponse({ success: true })
  } else if (message.action === 'checkCaptureArea') {
    const isTarget = !sender.tab || sender.tab.id === selectionTabId
    sendResponse({ area: isTarget ? captureArea : null })
  } else if (message.action === 'getLatestStatus') {
    sendResponse({ status: latestStatus })
  } else if (message.action === 'getTabs') {
    chrome.tabs.query({}, (tabs) => {
      const list = tabs.map(t => ({ id: t.id, title: t.title || 'Untitled', url: t.url, windowId: t.windowId, active: t.active }))
      sendResponse({ tabs: list })
    })
    return true
  } else if (message.action === 'activateTab') {
    chrome.tabs.update(message.tabId, { active: true }, () => {
      chrome.windows.update(message.windowId, { focused: true }, () => {
        sendResponse({ success: true })
      })
    })
    return true
  } else if (message.action === 'testDiscord') {
    sendDiscordMessage(message.webhookUrl, message.message)
    sendResponse({ success: true })
  } else if (message.action === 'testTelegram') {
    if (message.botToken && message.chatId) {
      sendTelegramMessage(message.botToken, message.chatId, message.message)
      sendResponse({ success: true })
    } else {
      sendResponse({ success: false, error: 'Bot token or chat ID missing' })
    }
  } else if (message.type === 'areaChange') {
    if (selectionTabId) {
      chrome.scripting.executeScript({
        target: { tabId: selectionTabId },
        function: () => {
          const event = new CustomEvent('stopSelection')
          window.dispatchEvent(event)
        }
      }, () => {
        if (chrome.runtime.lastError) {
          sendResponse({ success: false })
        } else {
          selectionTabId = null
          sendResponse({ success: true })
        }
      })
      return true
    }
    sendResponse({ success: true })
  } else if (message.action === 'startSelection') {
    if (captureArea) {
      sendResponse({ success: false, message: 'Area already set. Unlock to select a new area.' })
      return
    }
    if (selectionTabId) {
      sendResponse({ success: false, message: 'Selection already active on another tab' })
      return
    }
    const tabId = message.tabId
    const activateAndInject = (targetTabId) => {
      chrome.tabs.update(targetTabId, { active: true }, () => {
        chrome.scripting.executeScript({
          target: { tabId: targetTabId },
          function: injectSelectionLogic
        }, () => {
          if (chrome.runtime.lastError) {
            sendResponse({ success: false, message: 'Cannot inject on this page' })
          } else {
            selectionTabId = targetTabId
            chrome.tabs.get(targetTabId, (t) => { lockedWindowId = t.windowId })
            sendResponse({ success: true })
          }
        })
      })
    }
    if (tabId) {
      activateAndInject(tabId)
    } else {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs[0]) { sendResponse({ success: false }); return }
        activateAndInject(tabs[0].id)
      })
    }
    return true
  } else if (message.action === 'captureScreenshot') {
    const tabId = selectionTabId
    if (!tabId) {
      sendResponse({ success: false, error: 'No tab with an active area selection' })
      return
    }
    if (!captureArea) {
      sendResponse({ success: false, error: 'No area selected' })
      return
    }
    const destinations = {}
    if (message.discordWebhookUrl) destinations.discord = message.discordWebhookUrl
    if (message.telegramBotToken) destinations.telegramBotToken = message.telegramBotToken
    if (message.telegramChatId) destinations.telegramChatId = message.telegramChatId
    if (!destinations.discord && !destinations.telegramBotToken) {
      sendResponse({ success: false, error: 'No webhook URL configured' })
      return
    }
    captureAndSendScreenshot(tabId, captureArea, destinations)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }))
    return true
  } else if (message.type === 'areaChange') {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'https://via.placeholder.com/128',
      title: 'Color Change Alert',
      message: 'Selected area color changed!',
      priority: 2
    })
  } else if (message.type === 'statusUpdate') {
    latestStatus = message
    const color = message.color
    const changeDetected = message.changeDetected
    const timestamp = new Date(message.timestamp).toLocaleTimeString()
    const statusText = `**Screen Shotter Status Update**\n🕐 Time: ${timestamp}\n🎨 Color: RGB(${color.r}, ${color.g}, ${color.b})\n🔄 Change: ${changeDetected ? '✅ YES' : '❌ NO'}\n${changeDetected ? '🚨 **ALERT: Color change detected!**' : ''}`
    getDestinationMode().then((mode) => {
      if (mode === 'discord' || mode === 'both') {
        getWebhookUrl().then((url) => {
          if (url) sendDiscordMessage(url, statusText)
        })
      }
      if (mode === 'telegram' || mode === 'both') {
        Promise.all([getTelegramBotToken(), getTelegramChatId()]).then(([botToken, chatId]) => {
          if (botToken && chatId) sendTelegramMessage(botToken, chatId, statusText)
        })
      }
    })
  }
  return true
})

function injectSelectionLogic() {
  let startX, startY, endX, endY, overlay = null, shadowHost = null
  let mousedownListener = null

  function updateOverlay(x, y, width, height) {
    if (!overlay) {
      shadowHost = document.createElement('div')
      document.body.appendChild(shadowHost)
      const shadow = shadowHost.attachShadow({ mode: 'open' })
      overlay = document.createElement('div')
      overlay.style.position = 'fixed'
      overlay.style.border = '2px dashed red'
      overlay.style.background = 'rgba(255, 0, 0, 0.2)'
      overlay.style.zIndex = '9999'
      overlay.style.pointerEvents = 'none'
      shadow.appendChild(overlay)
    }
    overlay.style.left = x + 'px'
    overlay.style.top = y + 'px'
    overlay.style.width = width + 'px'
    overlay.style.height = height + 'px'
  }

  function startSelection(e) {
    e.preventDefault()
    e.stopPropagation()
    startX = e.clientX
    startY = e.clientY
    updateOverlay(startX, startY, 0, 0)
    document.addEventListener('mousemove', onMouseMove, { capture: true, passive: false })
    document.addEventListener('mouseup', onMouseUp, { capture: true, passive: false })
  }

  function onMouseMove(e) {
    e.preventDefault()
    e.stopPropagation()
    endX = e.clientX
    endY = e.clientY
    updateOverlay(Math.min(startX, endX), Math.min(startY, endY), Math.abs(endX - startX), Math.abs(endY - startY))
  }

  function onMouseUp(e) {
    e.preventDefault()
    e.stopPropagation()
    document.removeEventListener('mousemove', onMouseMove, { capture: true })
    document.removeEventListener('mouseup', onMouseUp, { capture: true })
    endX = endX !== undefined ? endX : startX
    endY = endY !== undefined ? endY : startY
    const area = {
      x: Math.min(startX, endX),
      y: Math.min(startY, endY),
      width: Math.abs(endX - startX),
      height: Math.abs(endY - startY),
      scaleFactor: window.devicePixelRatio || 1
    }
    if (area.width >= 1 && area.height >= 1) {
      chrome.runtime.sendMessage({ action: 'setCaptureArea', area }, () => {
        if (overlay && shadowHost && document.body.contains(shadowHost)) {
          document.body.removeChild(shadowHost)
          overlay = null
          shadowHost = null
        }
        if (mousedownListener) {
          window.removeEventListener('mousedown', mousedownListener, { capture: true })
        }
      })
    } else {
      if (overlay && shadowHost && document.body.contains(shadowHost)) {
        document.body.removeChild(shadowHost)
        overlay = null
        shadowHost = null
      }
    }
  }

  mousedownListener = startSelection
  window.addEventListener('mousedown', mousedownListener, { capture: true, passive: false })
}
