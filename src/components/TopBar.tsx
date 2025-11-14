import React from "react";
import { motion } from "framer-motion";
import { Search, UserPlus, User, LogOut } from "lucide-react";
import NavigationButton from "./ui/NavigationButton";

interface TopBarProps {
  onHome: () => void;
  onSearchClick: () => void;
  onNewCustomer: () => void;
  showUserMenu: boolean;
  setShowUserMenu: (show: boolean) => void;
  canInviteUsers: boolean;
  canManageUsers: boolean;
  onInviteUser: () => void;
  onManageUsers: () => void;
  onLogout: () => void;
  userName: string | null;
}

export function TopBar({
  onHome,
  onSearchClick,
  onNewCustomer,
  showUserMenu,
  setShowUserMenu,
  canInviteUsers,
  canManageUsers,
  onInviteUser,
  onManageUsers,
  onLogout,
  userName,
}: TopBarProps) {
  return (
    <div className="sticky top-0 z-30 w-full material-app-bar backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-3 sm:px-6 py-3 sm:py-4 flex items-center gap-2 sm:gap-4">
        <NavigationButton
          onClick={onHome}
          targetUrl={`${window.location.origin}/`}
          className="text-base sm:text-xl font-bold tracking-wide flex-1 text-left cursor-pointer truncate min-w-0"
          tabIndex={-1}
        >
          <span className="hidden sm:inline">
            True Tickets - Computer and Cellphone Inc
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
            className="md-btn-surface elev-1 inline-flex items-center justify-center w-12 h-12 sm:w-11 sm:h-11 rounded-full touch-manipulation"
            tabIndex={-1}
          >
            <Search className="w-6 h-6 sm:w-5.5 sm:h-5.5" />
          </NavigationButton>
          <NavigationButton
            onClick={onNewCustomer}
            targetUrl={`${window.location.origin}/newcustomer`}
            title="New Customer"
            className="md-btn-primary elev-2 inline-flex items-center justify-center w-12 h-12 sm:w-11 sm:h-11 rounded-full touch-manipulation"
            tabIndex={-1}
          >
            <UserPlus className="w-6 h-6 sm:w-5.5 sm:h-5.5" />
          </NavigationButton>

          {/* User menu dropdown */}
          <div className="relative">
            <motion.button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="md-btn-surface elev-1 inline-flex items-center justify-center w-12 h-12 sm:w-11 sm:h-11 rounded-full touch-manipulation"
              whileTap={{ scale: 0.95 }}
              tabIndex={-1}
            >
              <User className="w-6 h-6 sm:w-5.5 sm:h-5.5" />
            </motion.button>

            {showUserMenu && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute right-0 mt-2 w-48 md-card py-1 z-50"
              >
                {/* User info header */}
                <div className="px-4 py-2 border-b border-outline/20">
                  <div className="text-sm font-medium text-on-surface">
                    {userName || "User"}
                  </div>
                  <div className="text-xs text-outline">Signed in</div>
                </div>

                {canInviteUsers && (
                  <motion.button
                    onClick={onInviteUser}
                    className="flex items-center w-full px-4 py-2 text-md rounded-md transition-colors duration-10 text-on-surface"
                    whileHover={{
                      backgroundColor: "rgba(255, 255, 255, 0.08)",
                    }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <UserPlus className="w-4 h-4 mr-3" />
                    Add User
                  </motion.button>
                )}
                {canManageUsers && (
                  <motion.button
                    onClick={onManageUsers}
                    className="flex items-center w-full px-4 py-2 text-md rounded-md transition-colors duration-100 text-on-surface"
                    whileHover={{
                      backgroundColor: "rgba(255, 255, 255, 0.08)",
                    }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <User className="w-4 h-4 mr-3" />
                    Manage Users
                  </motion.button>
                )}
                <motion.button
                  onClick={onLogout}
                  className="flex items-center w-full px-4 py-2 text-md rounded-md transition-colors duration-200 text-on-surface"
                  whileHover={{
                    backgroundColor: "rgba(255, 255, 255, 0.08)",
                  }}
                  whileTap={{ scale: 0.98 }}
                >
                  <LogOut className="w-4 h-4 mr-3" />
                  Sign Out
                </motion.button>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}