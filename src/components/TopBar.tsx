import { Search, Settings } from "lucide-react";
import NavigationButton from "./ui/NavigationButton";
import { useStoreConfig } from "../context/StoreConfigContext";


interface TopBarProps {
  onHome: () => void;
  onSearchClick: () => void;
  onSettings: () => void;
  onLogout: () => void;
}

export function TopBar({
  onHome,
  onSearchClick,
  onSettings,
}: TopBarProps) {
  const { config } = useStoreConfig();

  return (
    <div className="sticky top-0 z-30 w-full material-app-bar backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-3 sm:px-6 py-3 sm:py-4 flex items-center gap-2 sm:gap-4">
        <NavigationButton
          onClick={onHome}
          targetUrl={`${window.location.origin}/`}
          className="text-xl font-bold tracking-wide flex-1 text-left cursor-pointer truncate min-w-0"
          tabIndex={-1}
        >
          <span className="hidden sm:inline">
            True Tickets{config.store_name ? ` - ${config.store_name}` : ""}
          </span>
          <span className="sm:hidden">True Tickets</span>
          <span className="ml-2 text-xs font-normal text-outline opacity-70">
            v{__APP_VERSION__}
          </span>
        </NavigationButton>
        <div className="flex items-center gap-1.5 sm:gap-3">
          <NavigationButton
            onClick={onSearchClick}
            targetUrl={`${window.location.origin}/`}
            title="Search"
            className="md-btn-surface elev-1 inline-flex items-center justify-center w-12 h-12 rounded-full touch-manipulation"
            tabIndex={-1}
          >
            <Search className="w-6 h-6" />
          </NavigationButton>

          <NavigationButton
            onClick={onSettings}
            targetUrl={`${window.location.origin}/settings`}
            title="Settings"
            className="md-btn-surface elev-1 inline-flex items-center justify-center w-12 h-12 rounded-full touch-manipulation"
            tabIndex={-1}
          >
            <Settings className="w-6 h-6" />
          </NavigationButton>
        </div>
      </div>
    </div>
  );
}
