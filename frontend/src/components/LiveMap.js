import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect, useMemo, useState } from "react";

// Fix leaflet default icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function makeIcon(status) {
  const cls = `crash-marker ${status}`;
  return L.divIcon({
    className: "",
    html: `<div class="${cls}"><span class="pulse"></span></div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

const hasCoords = (d) => typeof d?.lat === "number" && typeof d?.lng === "number";

function FocusController({ focusDriver }) {
  const map = useMap();
  useEffect(() => {
    if (focusDriver && hasCoords(focusDriver)) {
      map.flyTo([focusDriver.lat, focusDriver.lng], 15, { duration: 0.8 });
    }
  }, [focusDriver, map]);
  return null;
}

export default function LiveMap({ drivers, selectedId, onSelect }) {
  const [theme, setTheme] = useState(() => document.body.dataset.theme || "dark");

  useEffect(() => {
    const updateTheme = () => setTheme(document.body.dataset.theme || "dark");
    window.addEventListener("themechange", updateTheme);
    return () => window.removeEventListener("themechange", updateTheme);
  }, []);
  const driverList = useMemo(() => Object.values(drivers || {}), [drivers]);
  const positioned = useMemo(() => driverList.filter(hasCoords), [driverList]);

  // Center: first driver with coords, else CDMX
  const center = positioned[0]
    ? [positioned[0].lat, positioned[0].lng]
    : [19.4326, -99.1332];

  const focus = selectedId ? drivers[selectedId] : null;
  const noGpsCount = driverList.length - positioned.length;

  return (
    <div className="relative h-full w-full" data-testid="live-map">
      <MapContainer key={`live-map-${theme}`}
        center={center}
        zoom={13}
        scrollWheelZoom
        zoomControl={true}
        className="h-full w-full"
        style={{ background: theme === "light" ? "#dbe7f3" : "#0a0a0a" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">carto.com</a>'
          url={theme === "light"
            ? "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            : "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"}
        />
        <FocusController focusDriver={focus} />

        {positioned.map((d) => (
          <Marker
            key={d.id}
            position={[d.lat, d.lng]}
            icon={makeIcon(d.status)}
            eventHandlers={{ click: () => onSelect?.(d.id) }}
          >
            <Popup>
              <div className="min-w-[200px]">
                <div className="text-[10px] uppercase tracking-[0.3em] text-neutral-400">
                  {d.id?.slice?.(-8)}
                </div>
                <div className="font-semibold text-base mb-2">{d.name}</div>
                <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                  <div>
                    <div className="text-[10px] uppercase text-neutral-500">Velocidad</div>
                    <div className="text-emerald-400">
                      {d.speed != null ? `${Math.round(d.speed)} km/h` : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-neutral-500">G-Force</div>
                    <div className={d.gforce > 3 ? "text-red-400" : "text-white"}>
                      {d.gforce != null ? d.gforce.toFixed(2) : "—"}G
                    </div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-[10px] uppercase text-neutral-500">GPS</div>
                    <div>
                      {d.lat.toFixed(5)}, {d.lng.toFixed(5)}
                    </div>
                  </div>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Floating legend */}
      <div className="absolute bottom-4 left-4 z-[400] rounded-xl border border-white/10 bg-black/40 backdrop-blur-xl p-3 text-[10px] uppercase tracking-[0.2em] text-neutral-300 space-y-1.5">
        <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.7)]" /> Activo</div>
        <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.7)]" /> Accidente</div>
        <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Advertencia</div>
        <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-neutral-600" /> Offline</div>
      </div>

      {/* No-GPS warning */}
      {noGpsCount > 0 ? (
        <div
          data-testid="no-gps-banner"
          className="absolute top-4 right-4 z-[400] max-w-[280px] rounded-xl border border-amber-500/30 bg-amber-500/10 backdrop-blur-xl px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-amber-300"
        >
          {noGpsCount} sin GPS — el mobile aún no envía coordenadas en /api/telemetry
        </div>
      ) : null}
    </div>
  );
}
