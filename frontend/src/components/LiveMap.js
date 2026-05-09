import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect, useMemo } from "react";

// Fix leaflet default icon (we use divIcon anyway, but keep safety)
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

function FocusController({ focusDriver }) {
  const map = useMap();
  useEffect(() => {
    if (focusDriver) {
      map.flyTo([focusDriver.lat, focusDriver.lng], 15, { duration: 0.8 });
    }
  }, [focusDriver, map]);
  return null;
}

export default function LiveMap({ drivers, selectedId, onSelect }) {
  const driverList = useMemo(() => Object.values(drivers || {}), [drivers]);
  const center = driverList[0] ? [driverList[0].lat, driverList[0].lng] : [19.4326, -99.1332];

  const focus = selectedId ? drivers[selectedId] : null;

  return (
    <div className="relative h-full w-full" data-testid="live-map">
      <MapContainer
        center={center}
        zoom={13}
        scrollWheelZoom
        zoomControl={true}
        className="h-full w-full"
        style={{ background: "#0a0a0a" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">carto.com</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <FocusController focusDriver={focus} />

        {driverList.map((d) => (
          <Marker
            key={d.id}
            position={[d.lat, d.lng]}
            icon={makeIcon(d.status)}
            eventHandlers={{ click: () => onSelect?.(d.id) }}
          >
            <Popup>
              <div className="min-w-[200px]">
                <div className="text-[10px] uppercase tracking-[0.3em] text-neutral-400">
                  {d.id}
                </div>
                <div className="font-semibold text-base mb-2">{d.name}</div>
                <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                  <div>
                    <div className="text-[10px] uppercase text-neutral-500">Velocidad</div>
                    <div className="text-emerald-400">{Math.round(d.speed)} km/h</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-neutral-500">G-Force</div>
                    <div className={d.gforce > 3 ? "text-red-400" : "text-white"}>
                      {d.gforce.toFixed(2)}G
                    </div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-[10px] uppercase text-neutral-500">GPS</div>
                    <div>{d.lat.toFixed(5)}, {d.lng.toFixed(5)}</div>
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
    </div>
  );
}
