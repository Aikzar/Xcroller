import { useEffect } from "react";
import { useAppStore } from "./lib/store";
import { Toolbar } from "./components/Toolbar";
import { MediaGrid } from "./components/MediaGrid";
import { FullscreenViewer } from "./components/FullscreenViewer";

function App() {
  const { loadFolders, loadFeeds } = useAppStore();

  useEffect(() => {
    const init = async () => {
      await loadFolders();
      await loadFeeds();
      // After folders and feeds are loaded, the store state is ready for the first fetch
      useAppStore.getState().fetchMedia(true);
    };
    init();
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen bg-xcroller-base text-xcroller-text selection:bg-xcroller-red selection:text-white overflow-hidden font-atkinson">
      <Toolbar />
      <FullscreenViewer />

      {/* Main Content Area */}
      <main className="flex-1 w-full relative min-h-0 overflow-hidden">
        <MediaGrid />
      </main>

      {/* Blur overlay for "Premium" feel at bottom edge if needed, mainly aesthetic */}
      <div className="fixed bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-xcroller-base to-transparent pointer-events-none z-10" />
    </div>
  );
}

export default App;
