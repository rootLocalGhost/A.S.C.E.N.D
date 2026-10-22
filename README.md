<img src="./assets/img/Banner.png" alt="A.S.C.E.N.D. Application Screenshot"/>

<h1 style="text-align: center; width: 100%;">Android System Control & ENhanced Debloater</h1>

<div style="text-align: center; width: 100%;">

![GitHub release (latest by date)](https://img.shields.io/github/v/release/rootLocalGhost/A.S.C.E.N.D?style=for-the-badge)
![GitHub License](https://img.shields.io/github/license/rootLocalGhost/A.S.C.E.N.D?style=for-the-badge)

</div>

**A powerful, elegant desktop application built with Rust, Tauri v2, SolidJS, TypeScript, and Bun for taking complete control of your Android device.**

A.S.C.E.N.D. is a professional tool that wraps the power of ADB (Android Debug Bridge) and Scrcpy into a beautiful and intuitive graphical interface. Stop memorizing cryptic commands and start managing your device with the efficiency and style it deserves.

---

## ✨ Key Features

| Feature                            | Description                                                                                                                                                                                                                                         |
| :--------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **🚀 The Command Deck Debloater**  | A completely reimagined debloating experience. View all app details upfront in expandable cards, perform **batch uninstalls/disables** with a floating action bar, and use powerful integrated filters to pinpoint exactly what you want to remove. |
| **📈 At-a-Glance Dashboard**       | A clean, real-time overview of your device's most critical stats, including model info, Android version, battery status, CPU load, and RAM usage.                                                                                                   |
| **🖥️ Seamless Scrcpy Integration** | Mirror your device's screen with extensive options. Record, go fullscreen, show touches, or keep the device awake—all configurable from a simple, clean UI.                                                                                         |
| **📂 Integrated File Explorer**    | A full-featured file manager for your device. Browse, download, rename, and delete files and folders with a familiar, dual-pane (list/icon) view and full context menu support.                                                                     |
| **⚡ Power User Toolkit**          | Execute advanced functions with a single click. Reboot into recovery or bootloader, enable Wireless ADB, take screenshots, and toggle developer settings like GPU overdraw and layout bounds.                                                       |
| **🎮 Virtual Remote Control**      | A handy remote to control your device's media, navigation, and volume. Includes a D-Pad for TV boxes and a text input field for convenience.                                                                                                        |

---

## 📸 Application GUI

<img src="./assets/img/GUI.png" alt="A.S.C.E.N.D. GUI Screenshot"/>

---

## 🛠️ Development & Building from Source

### Requirements

- [Rust](https://www.rust-lang.org/)
- [Bun](https://bun.sh/)

### Steps

```bash
# 1. Clone the repository
git clone https://github.com/rootLocalGhost/A.S.C.E.N.D.git

# 2. Navigate into the project directory
cd A.S.C.E.N.D

# 3. Install dependencies
bun install

# 4. Run the app in development mode
bun tauri dev

# 5. Build the distributable executable and installer
bun tauri build
```

---

## 📜 License & Disclaimer

This project is licensed under the **MIT License**. See the `LICENSE.md` file for details.

**Disclaimer:** This is a powerful tool. Deleting or disabling the wrong system packages can lead to device instability or bootloops. The user assumes all risk. When in doubt, do not remove a package without researching it first.
