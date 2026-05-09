import { useState, useMemo } from "react";
import Topbar from "../components/Topbar";
import LiveMap from "../components/LiveMap";
import DriverList from "../components/DriverList";
import TelemetryBento from "../components/TelemetryBento";
import AlertsCenter from "../components/AlertsCenter";
import DriverDetailSheet from "../components/DriverDetailSheet";
import CrashHistoryModal from "../components/CrashHistoryModal";
import { useCrashSocket } from "../lib/ws";

export default function Dashboard() {
  const { drivers, alerts, setAlerts, status, lastImpactId } = useCrashSocket();
  const [selectedId, setSelectedId] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const driverList = Object.values(drivers || {});
  const selected = useMemo(() => {
    if (selectedId && drivers[selectedId]) return drivers[selectedId];
    if (driverList.length > 0) return driverList[0];
    return null;
  }, [selectedId, drivers, driverList]);

  const activeAlertCount = alerts.filter((a) => a.status === "pending").length;

  const openDetail = (id) => {
    setDetailId(id);
    setSheetOpen(true);
  };

  return (
    <div className="h-screen w-full p-3 lg:p-4 flex flex-col gap-3 lg:gap-4 overflow-hidden bg-[#0A0A0A]">
      <Topbar
        status={status}
        alertCount={activeAlertCount}
        onOpenHistory={() => setHistoryOpen(true)}
      />

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-4 min-h-0">
        <aside className="lg:col-span-3 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-2xl p-4 min-h-0 flex flex-col">
          <DriverList
            drivers={drivers}
            selectedId={selected?.id}
            onSelect={setSelectedId}
            onOpenDetail={openDetail}
          />
        </aside>

        <section className="lg:col-span-6 flex flex-col gap-3 lg:gap-4 min-h-0">
          <div className="flex-1 rounded-2xl border border-white/10 overflow-hidden min-h-[280px]">
            <LiveMap
              drivers={drivers}
              selectedId={selected?.id}
              onSelect={setSelectedId}
            />
          </div>
          <div className="flex-shrink-0">
            <TelemetryBento driver={selected} />
          </div>
        </section>

        <aside className="lg:col-span-3 min-h-0 flex">
          <div className="flex-1 min-h-0">
            <AlertsCenter
              alerts={alerts}
              setAlerts={setAlerts}
              lastImpactId={lastImpactId}
              onSelectDriver={setSelectedId}
              onOpenDriverDetail={openDetail}
            />
          </div>
        </aside>
      </div>

      <DriverDetailSheet
        driverId={detailId}
        driver={detailId ? drivers[detailId] : null}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />

      <CrashHistoryModal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
      />
    </div>
  );
}
