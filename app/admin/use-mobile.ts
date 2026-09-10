/**
 * The prototype's `isMobile` flag, which several of its layout values switch
 * on (`homeCols`, `recentCols`, `aCols`, `notMobile`). Same breakpoint as the
 * shell so the two agree about when the sidebar has gone away.
 */
import { useEffect, useState } from "react";

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 900);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return isMobile;
}
