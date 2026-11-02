import { useEffect, useState } from "react";

// True once `busy` has stayed true for `afterMs` — lets a form explain a slow
// request (e.g. a sleeping server waking up) instead of spinning silently.
export default function useSlowHint(busy, afterMs = 5000) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!busy) {
      setSlow(false);
      return undefined;
    }
    const id = setTimeout(() => setSlow(true), afterMs);
    return () => clearTimeout(id);
  }, [busy, afterMs]);
  return slow;
}
