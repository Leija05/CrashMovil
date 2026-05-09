import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE } from "./api";

/**
 * useCrashSocket — connects to /api/ws and exposes:
 *   - drivers: live map of driver id -> state
 *   - alerts:  live alerts list (pending + recent)
 *   - status:  'connecting' | 'open' | 'closed'
 *   - lastImpactId: id of the most recently raised impact alert (for sound trigger)
 *
 * Telemetry frames are throttled per-driver so re-renders stay smooth.
 */
export function useCrashSocket() {
  const [drivers, setDrivers] = useState({});
  const [alerts, setAlerts] = useState([]);
  const [status, setStatus] = useState("connecting");
  const [lastImpactId, setLastImpactId] = useState(null);

  const wsRef = useRef(null);
  const reconnectRef = useRef(0);
  const pendingDriversRef = useRef(null);
  const flushTimerRef = useRef(null);

  const flush = useCallback(() => {
    if (pendingDriversRef.current) {
      setDrivers(pendingDriversRef.current);
      pendingDriversRef.current = null;
    }
    flushTimerRef.current = null;
  }, []);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current == null) {
      flushTimerRef.current = window.setTimeout(flush, 250);
    }
  }, [flush]);

  const connect = useCallback(() => {
    const token = localStorage.getItem("crash_token") || "";
    const url = API_BASE.replace(/^http/, "ws") + `/api/ws?token=${encodeURIComponent(token)}`;
    setStatus("connecting");
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectRef.current = 0;
      setStatus("open");
    };

    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }

      if (msg.type === "snapshot") {
        const map = {};
        for (const d of msg.drivers) map[d.id] = d;
        setDrivers(map);
        setAlerts(msg.alerts || []);
      } else if (msg.type === "telemetry_batch") {
        const next = { ...(pendingDriversRef.current || {}) };
        // start from current state
        if (!pendingDriversRef.current) {
          for (const k in (wsRef.current?._lastDrivers || {})) {
            next[k] = wsRef.current._lastDrivers[k];
          }
        }
        for (const d of msg.drivers) next[d.id] = d;
        pendingDriversRef.current = next;
        wsRef.current._lastDrivers = next;
        scheduleFlush();
      } else if (msg.type === "alert") {
        setAlerts((prev) => [msg.alert, ...prev.filter((a) => a.id !== msg.alert.id)]);
        if (msg.alert.type === "impact" && msg.alert.status === "pending") {
          setLastImpactId(msg.alert.id);
        }
      } else if (msg.type === "alert_update") {
        setAlerts((prev) => prev.map((a) => (a.id === msg.alert.id ? msg.alert : a)));
      }
    };

    ws.onclose = () => {
      setStatus("closed");
      // exponential backoff up to 10s
      const delay = Math.min(10000, 800 * 2 ** reconnectRef.current);
      reconnectRef.current += 1;
      setTimeout(connect, delay);
    };

    ws.onerror = () => { try { ws.close(); } catch { /* ignore */ } };
  }, [scheduleFlush]);

  useEffect(() => {
    connect();
    return () => {
      try { wsRef.current?.close(); } catch { /* ignore */ }
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    };
  }, [connect]);

  return { drivers, alerts, setAlerts, status, lastImpactId };
}
