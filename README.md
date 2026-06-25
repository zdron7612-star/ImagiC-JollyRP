<div align="center">
  <img src="public/logo.png" alt="JollyRP Logo" width="120" height="120">
  
  # JollyRP

  **A Premium, Fully Uncensored Local AI Roleplay Client.**

  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
  [![Node.js: 18+](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js)](https://nodejs.org/)
  [![Platform: Windows | Linux | macOS](https://img.shields.io/badge/Platform-Windows%20%7C%20Linux%20%7C%20macOS-blue)](#-getting-started)

  JollyRP is a stunning, high-performance local AI roleplay client designed for immersive, private, and uncensored interactions with AI characters. Built with a sleek glassmorphism UI and intelligent memory ledgers, it pushes the boundaries of AI text adventures.

  **Runs entirely on your machine — no cloud, no tracking, no filters.**

  <br />

</div>

<div align="center">
  <img src="screenshots/hero_showcase.png" alt="JollyRP Dashboard Showcase" width="100%">
</div>

---

## 🆕 What's New (v1.2.1)

- **🚫 Banned Words / Phrases Blacklist**: A global blacklist system that lets you specify words, corny expressions, or repetitive phrases you want the AI to strictly avoid. These are dynamically injected as system prompt rule constraints.
- **📱 Chat Space Optimization**: Compact icon-only character sub-navbar buttons (with descriptive hover tooltips) to maximize vertical space for chat text.
- **↕️ Collapsible Sub-Navbar**: A smooth, transition-animated toggler chevron button in the main header that rolls the character sub-navbar up or down on the fly, with synchronized panel positioning.
- **✨ Textarea Auto-Height Resizing Fix**: Corrected textarea height stickiness when sending messages. The input field now dynamically resets to single-line styling instantly after clearing text.
- **⚡ Instant Navigation Transition**: Reduced logo-click response lag by deferring heavy home-page list redraws using `requestAnimationFrame`.

---

## ✨ Features

- **🎭 Uncensored & Local**: Your data never leaves your machine. Full AES-256 encryption protects your API keys locally. No filters, no tracking.
- **☁️ Chub AI Community Integration**: Browse, search, filter, and 1-click import from Chub.ai's library of hundreds of thousands of community character cards directly within the app.
- **👥 Multi-Character Group Chats**: Add multiple characters to a single room with custom scenarios. Features an **Auto-Mode** that lets the AI decide who speaks next, powered by a dynamic relationship/tension compiler.
- **🧠 Memory Forge & Truth Ledger**: A visual memory manager with keyword-based RAG and automatic background summarization to keep context fresh.
- **🎛️ Dialogue Director Controls**: Sliders to control model **Verbosity** (0 to 100) and **Action/Speech Ratio** (0 to 100) on the fly.
- **🔞 NSFW Blur & Hover Reveal**: Smart blur coverage for sensitive cards and avatars that smoothly reveals on hover.
- **🎨 Sleek Glassmorphism UI**: High-fidelity dark mode with dynamic blur, responsive animations, and customizable themes.
- **📦 1-Click Backup**: Seamlessly export/import your entire application state (Characters, Chats, API Keys) via secure ZIP backups.
- **🖥️ Universal API Support**: Plug in OpenRouter, OpenAI, HuggingFace, or run locally using Ollama, LMStudio, or KoboldAI.

---

## 📸 Gallery

<div align="center">
  <table>
    <tr>
      <td align="center"><b>Character Studio</b><br><img src="screenshots/character_studio.png" width="400" /></td>
      <td align="center"><b>Chat Interface</b><br><img src="screenshots/chat_interface.png" width="400" /></td>
    </tr>
    <tr>
      <td align="center"><b>Memory Ledger</b><br><img src="screenshots/memory_ledger.png" width="400" /></td>
      <td align="center"><b>Data Management</b><br><img src="screenshots/settings_data.png" width="400" /></td>
    </tr>
  </table>
</div>

---

## 🚀 Getting Started

JollyRP runs as a local web app in your browser. There is nothing to install beyond Node.js — no Electron, no desktop app. Setup takes under 2 minutes.

### Prerequisites

- **[Node.js 18+](https://nodejs.org/)** — Download the LTS release. This is the only requirement.
- **Git** — To clone the repository.

---

### Step 1 — Clone the repository

```bash
git clone https://github.com/zdron7612-star/ImagiC-JollyRP.git
cd ImagiC-JollyRP
```

---

### Step 2 — Run Setup *(first time only)*

This installs dependencies and builds the frontend. You only need to do this once.

**Linux / macOS:**
```bash
chmod +x setup.sh start.sh update.sh
./setup.sh
```

**Windows:** Double-click `Setup.bat` or run it from a terminal:
```
Setup.bat
```

> **🖥️ Desktop Shortcut** — At the end of setup, you'll be asked if you want a desktop shortcut created automatically:
> - **Linux** — adds a `.desktop` entry to your app launcher and `~/Desktop`
> - **macOS** — creates a double-clickable `JollyRP.command` file on your Desktop
> - **Windows** — creates a `JollyRP.lnk` shortcut on your Desktop

---

### Step 3 — Start JollyRP

Every time you want to use JollyRP:

**Linux / macOS:**
```bash
./start.sh
```

**Windows:** Double-click `Start.bat`

Then open your browser and go to:

```
http://localhost:3001
```

> **Tip:** The start script will auto-open your browser on most systems.

---

## 🔄 Updating

To update to the latest version:

**Linux / macOS:**
```bash
./update.sh
```

**Windows:** Double-click `Update.bat`

This runs `git pull`, reinstalls dependencies, and rebuilds the frontend automatically.

---

## 🛠️ Development Mode

If you want to work on the source code and see live changes:

1. Start the backend server:
   ```bash
   node src/server.js
   ```
2. In a second terminal, start the Vite frontend with hot-reload:
   ```bash
   npm run dev
   ```
3. Navigate to `http://localhost:5173` in your browser.

---

## 💾 Your Data

All characters, chats, and settings are stored locally in the `data/` folder inside the repo directory. This folder is excluded from git — your data is private and never pushed to GitHub.

**To back up your data**, use the Export button inside JollyRP Settings → Data Management.

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/zdron7612-star/ImagiC-JollyRP/issues).

## 📝 License

This project is licensed under the MIT License - see the `LICENSE` file for details.
