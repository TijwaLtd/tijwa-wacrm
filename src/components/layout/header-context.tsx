"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

interface HeaderContextValue {
  /** Hide the default dashboard header (desktop) for this page */
  hideDefaultHeader: () => void;
  /** Show the default dashboard header (desktop) for this page */
  showDefaultHeader: () => void;
  /** Whether the default header should be hidden */
  headerHidden: boolean;
  /** Hide the mobile bottom nav for this page */
  hideBottomNav: () => void;
  /** Show the mobile bottom nav for this page */
  showBottomNav: () => void;
  /** Whether the bottom nav is hidden */
  bottomNavHidden: boolean;
  /** Hide the mobile header for this page */
  hideMobileHeader: () => void;
  /** Show the mobile header for this page */
  showMobileHeader: () => void;
  /** Whether the mobile header is hidden */
  mobileHeaderHidden: boolean;
}

const HeaderContext = createContext<HeaderContextValue>({
  hideDefaultHeader: () => {},
  showDefaultHeader: () => {},
  headerHidden: false,
  hideBottomNav: () => {},
  showBottomNav: () => {},
  bottomNavHidden: false,
  hideMobileHeader: () => {},
  showMobileHeader: () => {},
  mobileHeaderHidden: false,
});

export function HeaderProvider({ children }: { children: ReactNode }) {
  const [headerHidden, setHeaderHidden] = useState(false);
  const [bottomNavHidden, setBottomNavHidden] = useState(false);
  const [mobileHeaderHidden, setMobileHeaderHidden] = useState(false);

  const hideDefaultHeader = useCallback(() => setHeaderHidden(true), []);
  const showDefaultHeader = useCallback(() => setHeaderHidden(false), []);
  const hideBottomNav = useCallback(() => setBottomNavHidden(true), []);
  const showBottomNav = useCallback(() => setBottomNavHidden(false), []);
  const hideMobileHeader = useCallback(() => setMobileHeaderHidden(true), []);
  const showMobileHeader = useCallback(() => setMobileHeaderHidden(false), []);

  return (
    <HeaderContext.Provider
      value={{
        hideDefaultHeader,
        showDefaultHeader,
        headerHidden,
        hideBottomNav,
        showBottomNav,
        bottomNavHidden,
        hideMobileHeader,
        showMobileHeader,
        mobileHeaderHidden,
      }}
    >
      {children}
    </HeaderContext.Provider>
  );
}

export function useHideDefaultHeader() {
  return useContext(HeaderContext);
}
