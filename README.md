# Xcroller ✨

[![Release](https://img.shields.io/github/v/release/Aikzar/Xcroller?style=flat-square)](https://github.com/Aikzar/Xcroller/releases)
[![License](https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-green?style=flat-square)](LICENSE)

**Xcroller** is a high-performance, aesthetically pleasing media gallery and feed viewer built for the desktop. It's designed to handle massive libraries of images and videos with a focus on speed, immersion, and ease of discovery.

<p align="center">
  <img src="docs/screenshots/Main_Feed.png" alt="Xcroller Main Feed" width="800">
</p>

## 🚀 Detailed Features

### ⭐ Favorites & Curation
- **One-Click Starring**: Instantly mark any media as a favorite from the grid view or the immersive viewer.
- **Dedicated Favorites Feed**: A separate workspace to view and manage your curated collection without distractions.
- **Bulk Export**: Select a folder and export all your favorited files at once. The app preserves original filenames for easy identification.
- **Database Reset**: Safely clear all favorites when starting a new project.

### 🖼️ Immersive Media Viewer
- **Fluid Zoom & Pan**: Zoom into high-resolution content (up to 2.5x) and pan effortlessly by moving your mouse.
- **Dynamic Controls**: Video controls (seek bar, volume, play/pause) appear only when needed, ensuring 100% focus on your media.
- **Live Background Backfilling**: Dimensions and metadata are processed in the background, ensuring the grid always remains perfectly aligned.

### 🔄 Advanced Automation
- **Smooth Autoscroll**: Browse hands-free with adjustable speeds. The system automatically detects when you're hovering over an item to pause and play audio previews.
- **Smart Scanning**: Recursive folder scanning allows you to point Xcroller at a high-level directory and let it discover every image and video within.
- **Optimized Data Layer**: Built on SQLite with custom indexing for instant loading of libraries containing 10,000+ items.

## 📸 Screenshots

| High-Speed Browsing | Precision Filtering |
| :---: | :---: |
| ![Media Hover](docs/screenshots/Media_Hover.png) | ![Filtering](docs/screenshots/Filtering.png) |
| *Hover previews with instant audio* | *Granular control over your view* |

| Favorites Management | Immersive Viewer |
| :---: | :---: |
| ![Favourite Feed](docs/screenshots/Favourite_Feed.png) | ![Media Click](docs/screenshots/Media_Click.png) |
| *Your curated collection* | *Deep-dive with zoom and pan* |

## 🛠️ Installation

Xcroller is currently in beta. You can download the latest installer from the [Releases](https://github.com/Aikzar/Xcroller/releases) page.

1. Download `Xcroller_x64_en-US.msi` (or the `.exe` bundle).
2. Run the installer.
3. Add your media folders and start scrawling!

## 💻 Tech Stack

- **Frontend**: [React](https://reactjs.org/) + [Vite](https://vitejs.dev/) + [Zustand](https://docs.pmnd.rs/zustand/)
- **Backend**: [Rust](https://www.rust-lang.org/) + [Tauri](https://tauri.app/)
- **Database**: [SQLite](https://sqlite.org/) (High-speed local indexing)
- **Styling**: Vanilla CSS with a focus on glassmorphism and modern UI.

---

Vibecoded with ❤️ for media enthusiasts.
