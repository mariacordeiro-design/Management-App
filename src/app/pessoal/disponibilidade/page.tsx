"use client";

import ProtectedPage from "@/src/components/ProtectedPage";
import { useState, useCallback, useRef, useEffect } from "react";
import { loginOrCreatePerson, updateAvailability } from "../../api/crab/api";
import { useUser } from "@/src/components/UserProvider";
interface TimeSlot {
  day: number;
  hour: number;
  minute: number;
}

interface AvailabilityData {
  [personId: string]: TimeSlot[];
}

interface DragStart {
  day: number;
  hour: number;
  minute: number;
}

const DAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

const START_HOUR = 8;
const TIME_SLOTS = Array.from({ length: 32 }, (_, i) => {
  const totalMinutes = START_HOUR * 60 + i * 30;
  const hour = Math.floor(totalMinutes / 60) % 24;
  const minute = totalMinutes % 60;
  return { hour, minute };
});

const CRAB_EVENTS = {
  presencial: "tlmoto-940143",
};

export default function Disponibilidade() {
  const [availability, setAvailability] = useState<AvailabilityData>({});
  const [dragStart, setDragStart] = useState<DragStart | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSelectingMode, setIsSelectingMode] = useState<boolean | null>(null);

  const isPointerDown = useRef(false);
  const lastTouchedCellRef = useRef<string | null>(null);
  const dragBaseSlotsRef = useRef<TimeSlot[] | null>(null);

  const { user } = useUser();
  const selectedPerson = user ? `user-${user.istId}` : "";

  useEffect(() => {
    const loadAvailabilityFromCrabFit = (crabAvailability: string[]) => {
      const timeSlots: TimeSlot[] = [];
      const processedSlots = new Set<string>();

      crabAvailability.forEach(slot => {
        const match = slot.match(/^(\d{2})(\d{2})-(\d+)$/);
        if (!match) return;

        const hour = parseInt(match[1]);
        const minute = parseInt(match[2]);
        const day = parseInt(match[3]);

        if (minute % 30 === 0) {
          const slotKey = `${day}-${hour}-${minute}`;
          if (!processedSlots.has(slotKey)) {
            timeSlots.push({ day, hour, minute });
            processedSlots.add(slotKey);
          }
        }
      });

      if (selectedPerson) {
        setAvailability(prev => ({
          ...prev,
          [selectedPerson]: timeSlots,
        }));
      }
    };

    const autoLoginUser = async () => {
      if (!user) return;

      setIsLoading(true);

      try {
        const result = await loginOrCreatePerson(CRAB_EVENTS.presencial, user.istId.toString());
        setIsLoggedIn(true);

        if (result.availability && result.availability.length > 0) {
          loadAvailabilityFromCrabFit(result.availability);
        }

      } catch (error) {
        console.error("Erro no login automático:", error);
      } finally {
        setIsLoading(false);
      }
    };

    if (user && !isLoggedIn) {
      autoLoginUser();
    }
  }, [isLoggedIn, selectedPerson, user]);

  useEffect(() => {
    const saved = localStorage.getItem("tlcrab-availability");
    if (saved) {
      try {
        setAvailability(JSON.parse(saved));
      } catch (err) {
        console.error("Erro ao carregar dados:", err);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("tlcrab-availability", JSON.stringify(availability));
  }, [availability]);

  const isSlotSelected = useCallback(
    (day: number, hour: number, minute: number) => {
      if (!selectedPerson) return false;
      const personSlots = availability[selectedPerson] || [];
      return personSlots.some(
        slot => slot.day === day && slot.hour === hour && slot.minute === minute
      );
    },
    [availability, selectedPerson]
  );

  const applySelectionRange = useCallback(
    (start: DragStart, end: DragStart, shouldSelect: boolean, personId: string) => {
      const startColumnIndex = WEEK_ORDER.indexOf(start.day);
      const endColumnIndex = WEEK_ORDER.indexOf(end.day);

      if (startColumnIndex === -1 || endColumnIndex === -1) return;

      const startColumn = Math.min(startColumnIndex, endColumnIndex);
      const endColumn = Math.max(startColumnIndex, endColumnIndex);

      const startSlotIndex = TIME_SLOTS.findIndex(
        slot => slot.hour === start.hour && slot.minute === start.minute
      );
      const endSlotIndex = TIME_SLOTS.findIndex(
        slot => slot.hour === end.hour && slot.minute === end.minute
      );

      if (startSlotIndex === -1 || endSlotIndex === -1) return;

      const startSlot = Math.min(startSlotIndex, endSlotIndex);
      const endSlot = Math.max(startSlotIndex, endSlotIndex);

      const newSlots: TimeSlot[] = [];
      for (let column = startColumn; column <= endColumn; column++) {
        const day = WEEK_ORDER[column];
        for (let s = startSlot; s <= endSlot; s++) {
          newSlots.push({
            day,
            hour: TIME_SLOTS[s].hour,
            minute: TIME_SLOTS[s].minute,
          });
        }
      }

      setAvailability(prev => {
        const personSlots = dragBaseSlotsRef.current ?? prev[personId] ?? [];

        if (shouldSelect) {
          const merged = [...personSlots];

          for (const slot of newSlots) {
            if (
              !merged.some(
                s => s.day === slot.day && s.hour === slot.hour && s.minute === slot.minute
              )
            ) {
              merged.push(slot);
            }
          }

          return {
            ...prev,
            [personId]: merged,
          };
        }

        return {
          ...prev,
          [personId]: personSlots.filter(
            s =>
              !newSlots.some(
                slot => slot.day === s.day && slot.hour === s.hour && slot.minute === s.minute
              )
          ),
        };
      });
    },
    []
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, day: number, hour: number, minute: number) => {
      if (!selectedPerson || !isLoggedIn) return;

      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);

      const currentlySelected = isSlotSelected(day, hour, minute);
      const shouldSelect = !currentlySelected;

      isPointerDown.current = true;
      setIsSelectingMode(shouldSelect);
      dragBaseSlotsRef.current = availability[selectedPerson] || [];

      const start = { day, hour, minute };
      setDragStart(start);

      const cellKey = `${day}-${hour}-${minute}`;
      lastTouchedCellRef.current = cellKey;

      applySelectionRange(start, start, shouldSelect, selectedPerson);
    },
    [applySelectionRange, availability, isLoggedIn, isSlotSelected, selectedPerson]
  );

  const handlePointerUp = useCallback(() => {
    isPointerDown.current = false;
    setDragStart(null);
    setIsSelectingMode(null);
    lastTouchedCellRef.current = null;
    dragBaseSlotsRef.current = null;
  }, []);

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLTableSectionElement>) => {
      if (
        !isPointerDown.current ||
        !selectedPerson ||
        !dragStart ||
        isSelectingMode === null ||
        !isLoggedIn
      ) {
        return;
      }

      const element = document.elementFromPoint(event.clientX, event.clientY);
      if (!element) return;

      const cell = (element as HTMLElement).closest("[data-slot='true']") as HTMLElement | null;
      if (!cell) return;

      const dayAttr = cell.dataset.day;
      const hourAttr = cell.dataset.hour;
      const minuteAttr = cell.dataset.minute;

      if (!dayAttr || !hourAttr || !minuteAttr) return;

      const day = parseInt(dayAttr, 10);
      const hour = parseInt(hourAttr, 10);
      const minute = parseInt(minuteAttr, 10);

      const cellKey = `${day}-${hour}-${minute}`;

      if (lastTouchedCellRef.current === cellKey) return;
      lastTouchedCellRef.current = cellKey;

      applySelectionRange(dragStart, { day, hour, minute }, isSelectingMode, selectedPerson);
    },
    [applySelectionRange, dragStart, isLoggedIn, isSelectingMode, selectedPerson]
  );

  const syncAvailability = async () => {
    if (!user || !isLoggedIn || !selectedPerson) return;

    const personSlots = availability[selectedPerson] || [];
    const crabAvailability: string[] = [];

    personSlots.forEach(slot => {
      const hourStr = slot.hour.toString().padStart(2, "0");
      const minuteStr = slot.minute.toString().padStart(2, "0");

      crabAvailability.push(`${hourStr}${minuteStr}-${slot.day}`);

      const secondSlotMinute = slot.minute + 15;
      let secondSlotHour = slot.hour;

      if (secondSlotMinute >= 60) {
        secondSlotHour = (slot.hour + 1) % 24;
      }

      const secondHourStr = secondSlotHour.toString().padStart(2, "0");
      const secondMinuteStr = (secondSlotMinute % 60).toString().padStart(2, "0");

      crabAvailability.push(`${secondHourStr}${secondMinuteStr}-${slot.day}`);
    });

    try {
      await updateAvailability(CRAB_EVENTS.presencial, user.istId.toString(), crabAvailability);
    } catch (error) {
      console.error("Erro na sincronização automática:", error);
      throw error;
    }
  };

  const manualSync = async () => {
    if (!user || !isLoggedIn || !selectedPerson) return;

    try {
      await syncAvailability();
    } catch (error) {
      console.error("Erro na sincronização:", error);
    }
  };

  const getPersonStats = (personId: string) => {
    const slots = availability[personId] || [];
    return {
      totalHours: Math.round(slots.length * 0.5 * 10) / 10,
      weekPercentage: Math.round((slots.length / (7 * TIME_SLOTS.length)) * 100),
    };
  };

  if (!user) {
    return (
      <ProtectedPage>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-red-600 mb-4">Acesso Negado</h1>
            <p>Você precisa fazer login para acessar esta página.</p>
          </div>
        </div>
      </ProtectedPage>
    );
  }

  return (
    <ProtectedPage>
      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-blue-500 mb-8 mt-8 relative z-30">
          Minha Disponibilidade
        </h1>

        {isLoading && (
          <div className="mb-4 rounded-md bg-blue-50 border border-blue-200 px-4 py-3 text-blue-700">
            A carregar disponibilidade...
          </div>
        )}

        <div className="bg-white rounded-lg shadow mb-8 overflow-x-auto">
          <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-900">Disponibilidade</h2>

            {isLoggedIn && (
              <button
                onClick={manualSync}
                disabled={!selectedPerson}
                className="bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded font-medium transition-colors"
              >
                Guardar
              </button>
            )}
          </div>

          <div className="relative">
            <table className="min-w-full table-fixed">
              <thead className="bg-gray-50">
                <tr>
                  <th className="w-20 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 z-10 bg-gray-50 border-r border-gray-200">
                    Hora
                  </th>

                  {WEEK_ORDER.map(dayIndex => (
                    <th
                      key={dayIndex}
                      className="w-20 sm:w-24 md:w-28 px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      <div className="block sm:hidden">{DAYS[dayIndex].substring(0, 3)}</div>
                      <div className="hidden sm:block">{DAYS[dayIndex]}</div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody
                className={`bg-white divide-y divide-gray-200 select-none ${
                  !isLoggedIn ? "opacity-50 pointer-events-none" : ""
                }`}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
              >
                {TIME_SLOTS.map((timeSlot, slotIndex) => (
                  <tr key={slotIndex}>
                    <td className="px-4 whitespace-nowrap text-sm font-medium text-gray-900 sticky left-0 bg-white border-r">
                      {timeSlot.hour.toString().padStart(2, "0")}:
                      {timeSlot.minute.toString().padStart(2, "0")}-
                      {(() => {
                        const nextIndex = slotIndex + 1;
                        let endHour: number;
                        let endMinute: number;

                        if (nextIndex < TIME_SLOTS.length) {
                          endHour = TIME_SLOTS[nextIndex].hour;
                          endMinute = TIME_SLOTS[nextIndex].minute;
                        } else {
                          const totalMinutes = timeSlot.hour * 60 + timeSlot.minute + 30;
                          endHour = Math.floor(totalMinutes / 60) % 24;
                          endMinute = totalMinutes % 60;
                        }

                        return (
                          <>
                            {endHour.toString().padStart(2, "0")}:
                            {endMinute.toString().padStart(2, "0")}
                          </>
                        );
                      })()}
                    </td>

                    {WEEK_ORDER.map(dayIndex => {
                      const isSelected = isSlotSelected(dayIndex, timeSlot.hour, timeSlot.minute);

                      return (
                        <td key={dayIndex} className="w-20 sm:w-24 md:w-28 px-1 py-1">
                          <div
                            data-slot="true"
                            data-day={dayIndex}
                            data-hour={timeSlot.hour}
                            data-minute={timeSlot.minute}
                            className={`
                              h-8 sm:h-10 w-full border border-gray-200 transition-all duration-150 rounded
                              ${
                                isSelected
                                  ? "ring-1 sm:ring-2 ring-blue-500 bg-blue-100"
                                  : "bg-gray-50 hover:bg-gray-100"
                              }
                              ${
                                !selectedPerson || !isLoggedIn
                                  ? "cursor-not-allowed opacity-50"
                                  : "cursor-pointer"
                              }
                              flex items-center justify-center touch-manipulation
                            `}
                            onPointerDown={event =>
                              handlePointerDown(event, dayIndex, timeSlot.hour, timeSlot.minute)
                            }
                            style={{ touchAction: "none" }}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {selectedPerson && user && isLoggedIn && (
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Estatísticas de {user.nome}</h3>

            {(() => {
              const stats = getPersonStats(selectedPerson);
              return (
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-blue-600">{stats.totalHours}h</p>
                    <p className="text-sm text-gray-600">Horas Totais</p>
                  </div>

                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-600">{stats.weekPercentage}%</p>
                    <p className="text-sm text-gray-600">Da Semana</p>
                  </div>

                  <div className="text-center">
                    <p className="text-2xl font-bold text-purple-600">
                      {(availability[selectedPerson] || []).length}
                    </p>
                    <p className="text-sm text-gray-600">Slots Totais</p>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </main>
    </ProtectedPage>
  );
}
