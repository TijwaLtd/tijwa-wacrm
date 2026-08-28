"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

interface HeaderContextValue {
  /** Hide the default dashboard header for this page */
  hideDefaultHeader: () => void;
  /** Whether the default header should be hidden */
  headerHidden: boolean;
}

const HeaderContext = createContext<HeaderContextValue>({
  hideDefaultHeader: () => {},
  headerHidden: false,
});

export function HeaderProvider({ children }: { children: ReactNode }) {
  const [headerHidden, setHeaderHidden] = useState(false);

  const hideDefaultHeader = useCallback(() => {
    setHeaderHidden(true);
  }, []);

  return (
    <HeaderContext.Provider value={{ hideDefaultHeader, headerHidden }}>
      {children}
    </HeaderContext.Provider>
  );
}

export function useHideDefaultHeader() {
  return useContext(HeaderContext);
}
