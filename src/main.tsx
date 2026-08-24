import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { applyAppearanceTheme, DEFAULT_ACCENT_COLOR, getStoredAppearanceTheme } from "./lib/theme";
import { FeedSwitcher } from "./components/FeedSwitcher";

const toolbarPreviewFeeds = Array.from({ length: 14 }, (_, index) => ({
  id: index + 1,
  name: `Custom view ${index + 1}`,
  folder_paths: '[]',
  filter_config: '{}'
}));

function ToolbarPreview() {
  const [activeFeed, setActiveFeed] = React.useState<number | 'home' | 'favorites'>('home');
  return (
    <div className="min-h-screen bg-xcroller-base text-xcroller-text">
      <header className="xcroller-toolbar theme-surface-context fixed inset-x-0 top-0 border-b border-white/5 bg-xcroller-base/95 shadow-2xl">
        <div className="xcroller-toolbar__leading flex gap-4"><button>Add</button><button>Refresh</button></div>
        <FeedSwitcher feeds={toolbarPreviewFeeds} activeFeedId={activeFeed} setActiveFeed={setActiveFeed} className="xcroller-toolbar__feeds w-full max-w-3xl justify-self-center" />
        <div className="xcroller-toolbar__actions flex items-center gap-6">
          <div className="xcroller-toolbar__volume">Volume</div><div className="xcroller-toolbar__grid">Grid</div>
          <button>Play</button><button>Filter</button><button data-toolbar-fullscreen>Fullscreen</button><button>Settings</button>
        </div>
      </header>
      <main className="xcroller-media-grid p-8">
        <button aria-label="Preview favorite hover" className="theme-accent-hover rounded-full bg-black/40 p-3 text-white/70">★</button>
      </main>
    </div>
  );
}

const isToolbarPreview = new URLSearchParams(window.location.search).has('toolbar-preview');

applyAppearanceTheme(getStoredAppearanceTheme(), DEFAULT_ACCENT_COLOR);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isToolbarPreview ? <ToolbarPreview /> : <App />}
  </React.StrictMode>,
);
