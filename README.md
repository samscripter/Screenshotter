# Screen Shotter

A Chrome extension that monitors selected areas on web pages for color changes and captures screenshots to send to Discord and/or Telegram via webhooks.

## Features

- **Area Selection**: Click and drag to select any area on a web page
- **Color Monitoring**: Continuously monitors the dominant color in the selected area (1s interval)
- **Change Detection**: Detects when colors change significantly (threshold: 15 RGB units)
- **Screenshot Capture**: Captures and sends cropped screenshots of the selected area to Discord/Telegram
- **Discord Integration**: Send status updates, alerts, and screenshots to Discord via webhook
- **Telegram Integration**: Send status updates, alerts, and screenshots to Telegram via bot
- **Dual Destination**: Send to Discord, Telegram, or both simultaneously
- **Browser Notifications**: Chrome notifications when color changes are detected
- **Status Updates**: Periodic status reports sent to configured webhooks every 5 seconds

## How to Use

1. **Install the Extension**:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked" and select this folder

2. **Configure Webhook**:
   - Click the extension icon in the toolbar
   - Select destination mode: Discord, Telegram, or Both
   - Enter your Discord webhook URL and/or Telegram bot token + chat ID
   - Click "Save" and use "Test" to verify

3. **Select an Area**:
   - Pick a target tab from the dropdown
   - Click "Start Selection"
   - Click and drag on the page to select an area (red dashed overlay)
   - Monitoring begins automatically

4. **Send Screenshot**:
   - Click "Send Screenshot to Discord/Telegram" to capture and send the selected area

5. **Stop/Change Selection**:
   - Use "Stop" to cancel an in-progress selection
   - Use "Unlock" to remove the current selection and select a new area

## Files

- `manifest.json` - Extension configuration (Manifest V3)
- `background.js` - Service worker: area management, Discord/Telegram messaging, screenshot capture
- `content.js` - Content script injected into pages for area monitoring
- `popup.html` - Extension popup shell
- `popup.js` - Bundled popup UI (React)
- `src/popup.jsx` - React source for the popup
- `icon16.png`, `icon32.png`, `icon48.png`, `icon128.png` - Extension icons
- `privacy.html` - Privacy policy
- `test.html` - Test page with color-changing element

## Privacy

See `privacy.html`. All processing is done locally. No images or data are sent to any server except the Discord/Telegram webhooks you explicitly configure.
