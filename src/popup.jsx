import React, { useState, useEffect, useCallback, useRef } from 'react'
import { createRoot } from 'react-dom/client'

function App() {
  const [status, setStatus] = useState('Checking...')
  const [isMonitoring, setIsMonitoring] = useState(false)
  const [areaSet, setAreaSet] = useState(false)
  const [currentColor, setCurrentColor] = useState(null)
  const [changeDetected, setChangeDetected] = useState(false)
  const [timeAgo, setTimeAgo] = useState(null)
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState('')
  const [savedDiscordWebhook, setSavedDiscordWebhook] = useState('')
  const [telegramBotToken, setTelegramBotToken] = useState('')
  const [savedTelegramBotToken, setSavedTelegramBotToken] = useState('')
  const [telegramChatId, setTelegramChatId] = useState('')
  const [savedTelegramChatId, setSavedTelegramChatId] = useState('')
  const [destinationMode, setDestinationMode] = useState('discord')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [sendingScreenshot, setSendingScreenshot] = useState(false)
  const [notification, setNotification] = useState(null)
  const [tabs, setTabs] = useState([])
  const [selectedTabId, setSelectedTabId] = useState(null)
  const notifTimeout = useRef(null)

  useEffect(() => {
    chrome.storage.local.get(['destinationMode', 'discordWebhookUrl', 'telegramBotToken', 'telegramChatId'], (result) => {
      if (result.destinationMode) setDestinationMode(result.destinationMode)
      if (result.discordWebhookUrl) {
        setDiscordWebhookUrl(result.discordWebhookUrl)
        setSavedDiscordWebhook(result.discordWebhookUrl)
      }
      if (result.telegramBotToken) {
        setTelegramBotToken(result.telegramBotToken)
        setSavedTelegramBotToken(result.telegramBotToken)
      }
      if (result.telegramChatId) {
        setTelegramChatId(result.telegramChatId)
        setSavedTelegramChatId(result.telegramChatId)
      }
    })
    chrome.runtime.sendMessage({ action: 'getTabs' }, (response) => {
      if (response?.tabs) {
        setTabs(response.tabs)
        const active = response.tabs.find(t => t.active)
        if (active) setSelectedTabId(active.id)
      }
    })
  }, [])

  const showNotification = (type, message) => {
    if (notifTimeout.current) clearTimeout(notifTimeout.current)
    setNotification({ type, message })
    notifTimeout.current = setTimeout(() => setNotification(null), 4000)
  }

  const checkStatus = useCallback(() => {
    chrome.runtime.sendMessage({ action: 'checkCaptureArea' }, (response) => {
      if (response && response.area) {
        setAreaSet(true)
        chrome.runtime.sendMessage({ action: 'getLatestStatus' }, (statusResponse) => {
          const s = statusResponse.status
          if (s) {
            setIsMonitoring(true)
            setCurrentColor(s.color)
            setChangeDetected(s.changeDetected)
            setTimeAgo(Math.round((Date.now() - s.timestamp) / 1000))
            setStatus('Monitoring')
          } else {
            setIsMonitoring(true)
            setStatus('Monitoring (waiting for data)')
          }
        })
      } else {
        setAreaSet(false)
        setIsMonitoring(false)
        setCurrentColor(null)
        setChangeDetected(false)
        setTimeAgo(null)
        setStatus('Not monitoring')
      }
    })
  }, [])

  useEffect(() => {
    checkStatus()
    const interval = setInterval(checkStatus, 3000)
    return () => clearInterval(interval)
  }, [checkStatus])

  const startSelection = () => {
    if (!selectedTabId) {
      showNotification('error', 'No tab selected')
      return
    }
    const tab = tabs.find(t => t.id === selectedTabId)
    chrome.runtime.sendMessage({
      action: 'startSelection',
      tabId: selectedTabId,
      windowId: tab?.windowId
    }, (response) => {
      if (response && response.success) {
        showNotification('success', 'Click and drag on the selected tab to choose an area')
      } else {
        showNotification('error', response?.message || 'Failed to start selection')
      }
    })
  }

  const stopSelection = () => {
    chrome.runtime.sendMessage({ action: 'stopSelection' }, (response) => {
      if (response && response.success) {
        showNotification('success', 'Selection mode stopped')
      }
    })
  }

  const unlockArea = () => {
    chrome.runtime.sendMessage({ action: 'unlockArea' }, (response) => {
      if (response && response.success) {
        showNotification('success', 'Area unlocked')
      }
    })
  }

  const saveDiscordWebhook = () => {
    const trimmed = discordWebhookUrl.trim()
    if (!trimmed.startsWith('https://discord.com/api/webhooks/')) {
      showNotification('error', 'Please enter a valid Discord webhook URL')
      return
    }
    setSaving(true)
    chrome.storage.local.set({ discordWebhookUrl: trimmed }, () => {
      setSavedDiscordWebhook(trimmed)
      setSaving(false)
      showNotification('success', 'Discord webhook saved!')
    })
  }

  const saveTelegram = () => {
    const token = telegramBotToken.trim()
    const chat = telegramChatId.trim()
    if (!token || !chat) {
      showNotification('error', 'Enter both bot token and chat ID')
      return
    }
    setSaving(true)
    chrome.storage.local.set({ telegramBotToken: token, telegramChatId: chat }, () => {
      setSavedTelegramBotToken(token)
      setSavedTelegramChatId(chat)
      setSaving(false)
      showNotification('success', 'Telegram webhook saved!')
    })
  }

  const saveMode = (mode) => {
    setDestinationMode(mode)
    chrome.storage.local.set({ destinationMode: mode })
  }

  const testDiscord = () => {
    if (!savedDiscordWebhook) {
      showNotification('error', 'Save a Discord webhook URL first')
      return
    }
    setTesting(true)
    const testMessage = `🧪 **TEST MESSAGE**\n🕐 Time: ${new Date().toLocaleTimeString()}\n✅ Discord webhook is working!`
    chrome.runtime.sendMessage({
      action: 'testDiscord',
      message: testMessage,
      webhookUrl: savedDiscordWebhook
    }, (response) => {
      setTesting(false)
      showNotification('success', 'Test message sent to Discord!')
    })
  }

  const testTelegram = () => {
    if (!savedTelegramBotToken || !savedTelegramChatId) {
      showNotification('error', 'Save Telegram webhook first')
      return
    }
    setTesting(true)
    const testMessage = `*TEST MESSAGE*\nTime: ${new Date().toLocaleTimeString()}\n✅ Telegram webhook is working!`
    chrome.runtime.sendMessage({
      action: 'testTelegram',
      message: testMessage,
      botToken: savedTelegramBotToken,
      chatId: savedTelegramChatId
    }, (response) => {
      setTesting(false)
      if (response?.success) {
        showNotification('success', 'Test message sent to Telegram!')
      } else {
        showNotification('error', response?.error || 'Failed to send test message')
      }
    })
  }

  const sendScreenshot = () => {
    const hasDiscord = savedDiscordWebhook && (destinationMode === 'discord' || destinationMode === 'both')
    const hasTelegram = savedTelegramBotToken && savedTelegramChatId && (destinationMode === 'telegram' || destinationMode === 'both')
    if (!hasDiscord && !hasTelegram) {
      showNotification('error', 'Save a webhook URL first for the selected destination')
      return
    }
    if (!areaSet) {
      showNotification('error', 'No area selected. Pick a tab and click "Start Selection" first.')
      return
    }
    setSendingScreenshot(true)
    const msg = { action: 'captureScreenshot' }
    if (hasDiscord) msg.discordWebhookUrl = savedDiscordWebhook
    if (hasTelegram) {
      msg.telegramBotToken = savedTelegramBotToken
      msg.telegramChatId = savedTelegramChatId
    }
    chrome.runtime.sendMessage(msg, (response) => {
      setSendingScreenshot(false)
      if (response && response.success) {
        showNotification('success', 'Screenshot sent!')
      } else {
        showNotification('error', response?.error || 'Failed to send screenshot')
      }
    })
  }

  const colorPreview = currentColor
    ? `rgb(${currentColor.r}, ${currentColor.g}, ${currentColor.b})`
    : null

  const selectedTab = tabs.find(t => t.id === selectedTabId)
  const showDiscord = destinationMode === 'discord' || destinationMode === 'both'
  const showTelegram = destinationMode === 'telegram' || destinationMode === 'both'
  const hasAnyWebhook = (showDiscord && savedDiscordWebhook) || (showTelegram && savedTelegramBotToken && savedTelegramChatId)

  return (
    <div className="app">
      <header className="header">
        <div className="header-icon">🎯</div>
        <div>
          <h1>Screen Shotter</h1>
          <p className="header-sub">Monitor & capture screen areas</p>
        </div>
      </header>

      {notification && (
        <div className={`toast toast-${notification.type}`}>
          <span>{notification.type === 'success' ? '✓' : '✕'}</span>
          {notification.message}
        </div>
      )}

      <section className="card">
        <h2 className="card-title">Target Tab</h2>
        <select
          className="input tab-select"
          value={selectedTabId ?? ''}
          onChange={(e) => setSelectedTabId(Number(e.target.value))}
        >
          {tabs.length === 0 && <option value="">Loading tabs...</option>}
          {tabs.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title?.slice(0, 50) || 'Untitled'}
            </option>
          ))}
        </select>
        {selectedTab && (
          <p className="hint" style={{ marginTop: 4 }}>
            {selectedTab.title?.slice(0, 60)}
          </p>
        )}
      </section>

      <section className="card">
        <h2 className="card-title">Status</h2>
        <div className="status-grid">
          <div className="status-item">
            <div className={`status-dot ${isMonitoring ? (changeDetected ? 'changed' : 'active') : 'inactive'}`} />
            <div>
              <div className="status-label">Status</div>
              <div className="status-value">{status}</div>
            </div>
          </div>
          {currentColor && (
            <>
              <div className="status-item">
                <div className="color-swatch" style={{ backgroundColor: colorPreview }} />
                <div>
                  <div className="status-label">Color</div>
                  <div className="status-value mono">RGB({currentColor.r}, {currentColor.g}, {currentColor.b})</div>
                </div>
              </div>
              <div className="status-item">
                <div className={`change-badge ${changeDetected ? 'badge-yes' : 'badge-no'}`}>
                  {changeDetected ? '!' : '✓'}
                </div>
                <div>
                  <div className="status-label">Change</div>
                  <div className="status-value">{changeDetected ? 'YES' : 'NO'}</div>
                </div>
              </div>
              {timeAgo !== null && (
                <div className="status-item">
                  <div className="time-icon">🕐</div>
                  <div>
                    <div className="status-label">Last update</div>
                    <div className="status-value">{timeAgo}s ago</div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <section className="card">
        <h2 className="card-title">Actions</h2>
        <div className="btn-row">
          <button className="btn btn-primary" onClick={startSelection} disabled={areaSet || !selectedTabId}>
            <span>🔲</span> Start Selection
          </button>
          <button className="btn btn-outline" onClick={stopSelection}>
            <span>⏹</span> Stop
          </button>
          <button className="btn btn-outline btn-danger-outline" onClick={unlockArea} disabled={!areaSet}>
            <span>🔓</span> Unlock
          </button>
        </div>
      </section>

      <section className="card">
        <h2 className="card-title">Destination</h2>
        <select
          className="input tab-select"
          value={destinationMode}
          onChange={(e) => saveMode(e.target.value)}
        >
          <option value="discord">Discord</option>
          <option value="telegram">Telegram</option>
          <option value="both">Both</option>
        </select>
      </section>

      {showDiscord && (
        <section className="card">
          <h2 className="card-title">Discord Webhook</h2>
          <div className="webhook-form">
            <input
              type="url"
              className="input"
              placeholder="https://discord.com/api/webhooks/..."
              value={discordWebhookUrl}
              onChange={(e) => setDiscordWebhookUrl(e.target.value)}
            />
            <div className="btn-row">
              <button className="btn btn-primary" onClick={saveDiscordWebhook} disabled={saving || !discordWebhookUrl.trim()}>
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button className="btn btn-outline" onClick={testDiscord} disabled={testing || !savedDiscordWebhook}>
                {testing ? 'Sending...' : 'Test'}
              </button>
            </div>
            {savedDiscordWebhook && <p className="hint success-hint">✓ Discord webhook saved</p>}
          </div>
        </section>
      )}

      {showTelegram && (
        <section className="card">
          <h2 className="card-title">Telegram</h2>
          <div className="webhook-form">
            <input
              type="text"
              className="input"
              placeholder="Bot token (e.g. 1234567890:ABCdef...)"
              value={telegramBotToken}
              onChange={(e) => setTelegramBotToken(e.target.value)}
            />
            <input
              type="text"
              className="input"
              placeholder="Chat ID (e.g. -1001234567890)"
              value={telegramChatId}
              onChange={(e) => setTelegramChatId(e.target.value)}
              style={{ marginTop: 6 }}
            />
            <div className="btn-row" style={{ marginTop: 6 }}>
              <button className="btn btn-primary" onClick={saveTelegram} disabled={saving || !telegramBotToken.trim() || !telegramChatId.trim()}>
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button className="btn btn-outline" onClick={testTelegram} disabled={testing || !savedTelegramBotToken || !savedTelegramChatId}>
                {testing ? 'Sending...' : 'Test'}
              </button>
            </div>
            {savedTelegramBotToken && savedTelegramChatId && <p className="hint success-hint">✓ Telegram webhook saved</p>}
          </div>
        </section>
      )}

      <section className="card">
        <h2 className="card-title">Capture</h2>
        <button
          className="btn btn-discord"
          onClick={sendScreenshot}
          disabled={sendingScreenshot || !areaSet || !hasAnyWebhook}
        >
          {sendingScreenshot ? '📤 Sending...' : `📸 Send Screenshot to ${destinationMode === 'both' ? 'Discord & Telegram' : destinationMode === 'telegram' ? 'Telegram' : 'Discord'}`}
        </button>
        {(!areaSet || !hasAnyWebhook) && (
          <p className="hint">
            {!areaSet ? 'Select an area first' : ''}
            {!areaSet && !hasAnyWebhook ? ' & ' : ''}
            {!hasAnyWebhook ? 'Save a webhook URL above' : ''}
          </p>
        )}
      </section>

      <footer className="footer">
        Screen Shotter v2.0
      </footer>
    </div>
  )
}

const root = document.getElementById('root')
if (root) createRoot(root).render(<App />)
