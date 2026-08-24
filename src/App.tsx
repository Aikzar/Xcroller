import { useEffect } from "react";
import { useAppStore } from "./lib/store";
import { Toolbar } from "./components/Toolbar";
import { MediaGrid } from "./components/MediaGrid";
import { FullscreenViewer } from "./components/FullscreenViewer";
import { ActivityIndicator } from "./components/ActivityIndicator";
import { useShallow } from "zustand/react/shallow";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

function App() {
  const { loadFolders, loadFeeds, loadPreferences, beginActivity, finishActivity } = useAppStore(useShallow((state) => ({
    loadFolders: state.loadFolders,
    loadFeeds: state.loadFeeds,
    loadPreferences: state.loadPreferences,
    beginActivity: state.beginActivity,
    finishActivity: state.finishActivity
  })));

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    const init = async () => {
      const activityId = beginActivity("Loading your library…");
      try {
        unlisten = await listen("metadata-backfill-complete", () => {
          const { filters, fetchMedia } = useAppStore.getState();
          if (filters.min_duration != null || filters.max_duration != null) {
            void fetchMedia(true);
          }
        });

        // Loading folders also repairs a changed external-drive letter and
        // rewrites saved feeds, so feeds must be read afterwards.
        await loadFolders();
        await loadFeeds();
        await loadPreferences();
        // After folders and feeds are loaded, the store state is ready for the first fetch.
        await useAppStore.getState().fetchMedia(true);
      } finally {
        await finishActivity(activityId);
      }
    };
    init();
    return () => unlisten?.();
  }, [beginActivity, finishActivity, loadFolders, loadFeeds, loadPreferences]);

  return (
    <div className="flex flex-col h-screen w-screen bg-xcroller-base text-xcroller-text selection:bg-xcroller-red selection:text-xcroller-on-accent overflow-hidden font-atkinson">
      <Toolbar />
      <ActivityIndicator />
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
