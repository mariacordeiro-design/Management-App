"use client";

import React, { useState, useEffect, useMemo } from "react";
import type { JSX } from "react";
import ProtectedPage from "@/src/components/ProtectedPage";
import { getTurnos, getEventos, getAllUsers, TurnoAirtable } from "../api/airtable/airtable";
import { Evento, User } from "@/src/components/Interfaces";

const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

// 1. ATUALIZADA: Interface para suportar os novos campos e a flag virtual
interface TurnoLocal extends TurnoAirtable {
  diaSemana?: number;
  dataCompleta?: string;
  isVirtual?: boolean;
}

interface DiaCalendario {
  date: Date;
  day: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  turnos: TurnoLocal[];
}

type VistaCalendario = "mes" | "semana";

const DIAS_SEMANA = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const HOUR_HEIGHT_PX = 64;
const WEEK_VIEW_START_MINUTES = 10 * 60;
const WEEK_VIEW_END_MINUTES = 23 * 60 + 30;

// --- HELPERS ---
const getWeekDayFromDate = (dateStr: string): number => {
  if (!dateStr) return 0;
  const [day, month, year] = dateStr.split("/").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getDay();
};

const formatDateToDDMMYYYY = (date: Date): string => {
  const day = date.getDate().toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

const getStartOfWeek = (date: Date): Date => {
  const start = new Date(date);
  const dayOfWeek = start.getDay();
  const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  start.setDate(start.getDate() - daysToSubtract);
  start.setHours(0, 0, 0, 0);
  return start;
};

const parseDateString = (dateStr: string): Date => {
  const [day, month, year] = dateStr.split("/").map(Number);
  return new Date(year, month - 1, day);
};

const isTurnoFuturo = (turno: TurnoLocal): boolean => {
  if (!turno.dataCompleta) return false;
  const turnoDate = parseDateString(turno.dataCompleta);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return turnoDate >= today;
};

// 2. NOVA FUNÇÃO: Gera as repetições virtuais para povoar o calendário
const expandirTurnosRecorrentes = (turnosOriginais: TurnoLocal[]): TurnoLocal[] => {
  const listaExpandida: TurnoLocal[] = [];

  turnosOriginais.forEach(turno => {
    listaExpandida.push(turno); // Adiciona o real

    if (turno.tipo !== "Turno" && turno.dataLimiteRecorrencia) {
      const dataLimite = new Date(turno.dataLimiteRecorrencia);
      let dataReferencia = parseDateString(turno.dataCompleta!);

      while (true) {
        dataReferencia.setDate(dataReferencia.getDate() + 7);
        if (dataReferencia > dataLimite) break;

        listaExpandida.push({
          ...turno,
          id: `${turno.id}_virtual_${dataReferencia.getTime()}`,
          dataCompleta: formatDateToDDMMYYYY(new Date(dataReferencia)),
          isVirtual: true, // Marca como repetição
        });
      }
    }
  });

  return listaExpandida;
};

const isSameDay = (date1: Date, date2: Date): boolean => {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
};

const generateCalendarDays = (currentDate: Date, turnos: TurnoLocal[]): DiaCalendario[] => {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDayOfMonth = new Date(year, month, 1);

  const startDate = new Date(firstDayOfMonth);
  const dayOfWeek = firstDayOfMonth.getDay();
  const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  startDate.setDate(firstDayOfMonth.getDate() - daysToSubtract);

  const days: DiaCalendario[] = [];
  const today = new Date();

  for (let i = 0; i < 42; i++) {
    const currentDay = new Date(startDate);
    currentDay.setDate(startDate.getDate() + i);

    const dayTurnos = turnos.filter(turno => {
      if (!turno.dataCompleta) return false;
      const turnoDate = parseDateString(turno.dataCompleta);
      return isSameDay(turnoDate, currentDay);
    });

    // Ordenar turnos do dia por hora de início
    dayTurnos.sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));

    days.push({
      date: new Date(currentDay),
      day: currentDay.getDate(),
      isCurrentMonth: currentDay.getMonth() === month,
      isToday: isSameDay(currentDay, today),
      turnos: dayTurnos,
    });
  }

  return days;
};

const generateWeekDays = (currentDate: Date, turnos: TurnoLocal[]): DiaCalendario[] => {
  const startDate = getStartOfWeek(currentDate);
  const today = new Date();

  return Array.from({ length: 7 }, (_, index) => {
    const currentDay = new Date(startDate);
    currentDay.setDate(startDate.getDate() + index);

    const dayTurnos = turnos
      .filter(turno => {
        if (!turno.dataCompleta) return false;
        const turnoDate = parseDateString(turno.dataCompleta);
        return isSameDay(turnoDate, currentDay);
      })
      .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));

    return {
      date: currentDay,
      day: currentDay.getDate(),
      isCurrentMonth: currentDay.getMonth() === currentDate.getMonth(),
      isToday: isSameDay(currentDay, today),
      turnos: dayTurnos,
    };
  });
};

const timeToMinutes = (time?: string): number => {
  if (!time) return 0;
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

const formatMinutesToTime = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours.toString().padStart(2, "0")}:${remainingMinutes.toString().padStart(2, "0")}`;
};

const getHorarioSemana = (_dias: DiaCalendario[]) => {
  const horas = Array.from(
    { length: Math.floor((WEEK_VIEW_END_MINUTES - WEEK_VIEW_START_MINUTES) / 60) + 1 },
    (_, i) => WEEK_VIEW_START_MINUTES + i * 60
  );

  return {
    inicioMinutos: WEEK_VIEW_START_MINUTES,
    fimMinutos: WEEK_VIEW_END_MINUTES,
    marcas: [...horas, WEEK_VIEW_END_MINUTES],
  };
}; 

// HELPER DE CORES
const getCorPorTipo = (tipo?: string, isPassado?: boolean) => {
  if (isPassado) return "bg-gray-400 text-white border-gray-500";
  switch (tipo) {
    case "Worksession":
      return "bg-purple-100 text-purple-800 border-purple-300";
    case "Reunião":
      return "bg-orange-100 text-orange-800 border-orange-300";
    default:
      return "bg-blue-100 text-blue-800 border-blue-300";
  }
};

export default function Calendario(): JSX.Element {
  // --- ESTADOS ---
  const [turnos, setTurnos] = useState<TurnoLocal[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<DiaCalendario | null>(null);
  const [vista, setVista] = useState<VistaCalendario>("mes");

  const [eventos, setEventos] = useState<Evento[]>([]);
  const [airtableUsers, setAirtableUsers] = useState<User[]>([]);

  // --- HELPERS PARA UI ---
  const getNomeParticipanteParaTabela = (id: string) => {
    const foundRec = airtableUsers.find(u => u.id === id);
    if (foundRec) return foundRec.nome;
    const foundIst = airtableUsers.find(u => u.istId?.toString() === id);
    if (foundIst) return foundIst.nome;
    return id || "---";
  };

  const getNomeEvento = (id: string) => eventos.find(e => e.id === id)?.nome || "---";

  // Calendar days
  const calendarDays = useMemo(() => {
    return generateCalendarDays(currentMonth, turnos);
  }, [currentMonth, turnos]);

  const weekDays = useMemo(() => {
    return generateWeekDays(currentMonth, turnos);
  }, [currentMonth, turnos]);

  const horarioSemana = useMemo(() => getHorarioSemana(weekDays), [weekDays]);

  useEffect(() => {
    loadTurnos();
    loadEventos();
    fetchAirtableUsers();
  }, []);

  // --- ACTIONS ---
  const loadTurnos = async () => {
    setIsLoading(true);
    try {
      const data = await getTurnos();
      const processados: TurnoLocal[] = data.map(turno => ({
        ...turno,
        diaSemana: getWeekDayFromDate(turno.data),
        dataCompleta: turno.data,
      }));

      // 3. ATUALIZADA: Aplicar a expansão antes de guardar no estado
      setTurnos(expandirTurnosRecorrentes(processados));
    } catch (error) {
      console.error("Erro ao carregar:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadEventos = async () => {
    try {
      const data = await getEventos();
      setEventos(data || []);
    } catch (error) {
      setEventos([]);
    }
  };

  async function fetchAirtableUsers() {
    try {
      const users = await getAllUsers();
      setAirtableUsers(users);
    } catch (e) {
      console.error(e);
    }
  }

  // --- NAVIGATION ---
  const goToPreviousMonth = () =>
    setCurrentMonth(prev => {
      if (vista === "semana") {
        const nextDate = new Date(prev);
        nextDate.setDate(prev.getDate() - 7);
        return nextDate;
      }
      return new Date(prev.getFullYear(), prev.getMonth() - 1, 1);
    });
  const goToNextMonth = () =>
    setCurrentMonth(prev => {
      if (vista === "semana") {
        const nextDate = new Date(prev);
        nextDate.setDate(prev.getDate() + 7);
        return nextDate;
      }
      return new Date(prev.getFullYear(), prev.getMonth() + 1, 1);
    });
  const goToToday = () => setCurrentMonth(new Date());

  const tituloCalendario =
    vista === "semana"
      ? `Vista Semanal`
      : `${MESES[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`;

  return (
    <ProtectedPage>
      <main className="min-h-screen flex flex-col pt-20 px-4 sm:px-6 lg:px-8 2xl:px-10 max-w-screen-2xl mx-auto w-full">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl text-white font-semibold">Calendário Geral</h1>
          <button
            onClick={() => loadTurnos()}
            disabled={isLoading}
            className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg font-medium transition flex items-center gap-2"
          >
            <span className={isLoading ? "animate-spin" : ""}>↻</span>
            {isLoading ? "A carregar..." : "Refrescar"}
          </button>
        </div>

        {/* CALENDAR VIEW */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden mb-8">
          {/* Header */}
          <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <h2 className="text-xl font-bold text-gray-800 capitalize">
                {tituloCalendario}
              </h2>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex rounded-lg border border-gray-200 bg-white p-1">
                  <button
                    onClick={() => setVista("mes")}
                    className={`px-3 py-1.5 text-sm font-bold rounded-md transition ${
                      vista === "mes"
                        ? "bg-blue-100 text-blue-700"
                        : "text-gray-500 hover:bg-gray-100"
                    }`}
                  >
                    Mês
                  </button>
                  <button
                    onClick={() => setVista("semana")}
                    className={`px-3 py-1.5 text-sm font-bold rounded-md transition ${
                      vista === "semana"
                        ? "bg-blue-100 text-blue-700"
                        : "text-gray-500 hover:bg-gray-100"
                    }`}
                  >
                    Semana
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={goToPreviousMonth}
                    className="p-2 hover:bg-gray-200 text-gray-600 rounded-lg transition font-bold text-lg"
                    aria-label={vista === "semana" ? "Semana anterior" : "Mês anterior"}
                  >
                    ←
                  </button>
                  <button
                    onClick={goToToday}
                    className="px-4 py-1 text-sm bg-blue-100 text-blue-700 font-bold rounded hover:bg-blue-200 transition"
                  >
                    Hoje
                  </button>
                  <button
                    onClick={goToNextMonth}
                    className="p-2 hover:bg-gray-200 text-gray-600 rounded-lg transition font-bold text-lg"
                    aria-label={vista === "semana" ? "Semana seguinte" : "Mês seguinte"}
                  >
                    →
                  </button>
                </div>
              </div>
            </div>
          </div>

          {vista === "mes" ? (
            <>
              {/* Days Header */}
              <div className="grid grid-cols-7 bg-white border-b border-gray-200">
                {DIAS_SEMANA.map(day => (
                  <div
                    key={day}
                  className="px-2 py-3 text-center text-xs font-bold text-gray-500 uppercase sm:px-3"
                  >
                    {day}
                  </div>
                ))}
              </div>

              {/* Grid */}
              <div className="grid grid-cols-7">
                {calendarDays.map((dia, index) => (
                  <div
                    key={index}
                    className={`min-h-[120px] p-1.5 border-b border-r border-gray-100 cursor-pointer transition sm:min-h-[140px] sm:p-2 xl:min-h-[165px] 2xl:min-h-[190px]
                      ${!dia.isCurrentMonth ? "bg-gray-50/50" : "bg-white hover:bg-gray-50"} 
                      ${dia.isToday ? "ring-2 ring-inset ring-blue-500 bg-blue-50/10" : ""}
                    `}
                    onClick={() => setSelectedDay(dia)}
                  >
                    <div
                      className={`text-sm font-bold mb-2 ${!dia.isCurrentMonth ? "text-gray-400" : dia.isToday ? "text-blue-600" : "text-gray-700"}`}
                    >
                      {dia.day}
                    </div>

                    <div className="space-y-1.5 overflow-hidden">
                      {dia.turnos.slice(0, 4).map(turno => {
                        const isPassado = !isTurnoFuturo(turno);
                        const corClasses = getCorPorTipo(turno.tipo, isPassado);

                        return (
                          <div
                            key={turno.id}
                            className={`text-[10px] px-1.5 py-1 rounded border leading-tight truncate font-medium ${corClasses} ${turno.isVirtual ? "border-dashed" : ""}`}
                            title={`${turno.nome || turno.tipo} (${turno.horaInicio}-${turno.horaFim})`}
                          >
                            <span className="font-bold mr-1">{turno.horaInicio}</span>
                            {turno.nome || turno.tipo || "Turno"}
                          </div>
                        );
                      })}
                      {dia.turnos.length > 4 && (
                        <div className="text-[10px] text-gray-500 font-bold text-center mt-1">
                          +{dia.turnos.length - 4} marcações
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="overflow-x-auto bg-white">
              <div className="w-full min-w-[760px] xl:min-w-0">
                <div className="grid grid-cols-[52px_repeat(7,minmax(96px,1fr))] lg:grid-cols-[72px_repeat(7,minmax(120px,1fr))] 2xl:grid-cols-[84px_repeat(7,minmax(150px,1fr))] border-b border-gray-200">
                  <div className="bg-gray-50 border-r border-gray-200" />
                  {weekDays.map((dia, index) => (
                    <button
                      key={dia.date.toISOString()}
                      onClick={() => setSelectedDay(dia)}
                      className={`px-3 py-3 text-center border-r border-gray-100 transition hover:bg-gray-50 ${
                        dia.isToday ? "bg-blue-50" : "bg-white"
                      }`}
                    >
                      <div className="text-xs font-bold text-gray-500 uppercase">
                        {DIAS_SEMANA[index]}
                      </div>
                      <div
                        className={`mt-1 mx-auto flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                          dia.isToday ? "bg-blue-600 text-white" : "text-gray-800"
                        }`}
                      >
                        {dia.day}
                      </div>
                    </button>
                  ))}
                </div>

                <div
                  className="grid grid-cols-[52px_repeat(7,minmax(96px,1fr))] lg:grid-cols-[72px_repeat(7,minmax(120px,1fr))] 2xl:grid-cols-[84px_repeat(7,minmax(150px,1fr))] relative"
                  style={{
                    height: `${
                      ((horarioSemana.fimMinutos - horarioSemana.inicioMinutos) / 60) *
                      HOUR_HEIGHT_PX
                    }px`,
                  }}
                >
                  <div className="relative bg-gray-50 border-r border-gray-200">
                    {horarioSemana.marcas.map(minutos => (
                      <div
                        key={minutos}
                        className="absolute left-0 right-0 -translate-y-2 pr-3 text-right text-xs font-semibold text-gray-400"
                        style={{
                          top: `${
                            ((minutos - horarioSemana.inicioMinutos) / 60) * HOUR_HEIGHT_PX
                          }px`,
                        }}
                      >
                        {formatMinutesToTime(minutos)}
                      </div>
                    ))}
                  </div>

                  {weekDays.map(dia => (
                    <div
                      key={dia.date.toISOString()}
                      className={`relative border-r border-gray-100 ${
                        dia.isToday ? "bg-blue-50/30" : "bg-white"
                      }`}
                    >
                      {horarioSemana.marcas.map(minutos => (
                        <div
                          key={minutos}
                          className="absolute left-0 right-0 border-t border-gray-100"
                          style={{
                            top: `${
                              ((minutos - horarioSemana.inicioMinutos) / 60) * HOUR_HEIGHT_PX
                            }px`,
                          }}
                        />
                      ))}

                      {dia.turnos.map(turno => {
                        const startMinutes = timeToMinutes(turno.horaInicio);
                        const endMinutes = timeToMinutes(turno.horaFim);
                        const durationMinutes = Math.max(endMinutes - startMinutes, 30);
                        const top =
                          ((startMinutes - horarioSemana.inicioMinutos) / 60) * HOUR_HEIGHT_PX;
                        const height = Math.max((durationMinutes / 60) * HOUR_HEIGHT_PX, 30);
                        const isPassado = !isTurnoFuturo(turno);
                        const corClasses = getCorPorTipo(turno.tipo, isPassado);

                        return (
                          <button
                            key={turno.id}
                            onClick={() => setSelectedDay(dia)}
                            className={`absolute left-0.5 right-0.5 rounded border px-1 py-1 text-left text-[9px] md:text-xs leading-tight shadow-sm overflow-hidden transition hover:shadow-md ${corClasses} ${
                              turno.isVirtual ? "border-dashed" : ""
                            }`}
                            style={{ top: `${top}px`, height: `${height}px` }}
                            title={`${turno.nome || turno.tipo} (${turno.horaInicio}-${turno.horaFim})`}
                          >
                            <span className="block font-bold truncate">
                              {turno.horaInicio} - {turno.horaFim}
                            </span>
                            <span className="block truncate">{turno.nome || turno.tipo || "Turno"}</span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* MODAL DETALHE DO DIA */}
        {selectedDay && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-xl w-full max-h-[85vh] flex flex-col shadow-2xl">
              <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-lg">
                <h2 className="text-xl font-bold text-gray-800">
                  {selectedDay.day} de {MESES[selectedDay.date.getMonth()]}{" "}
                  {selectedDay.date.getFullYear()}
                </h2>
                <button
                  onClick={() => setSelectedDay(null)}
                  className="text-gray-400 hover:text-black text-2xl leading-none"
                >
                  ×
                </button>
              </div>

              <div className="p-5 overflow-y-auto flex-1 bg-white">
                {selectedDay.turnos.length === 0 ? (
                  <div className="text-center py-10 text-gray-500">
                    <p className="text-lg mb-1"></p>
                    <p>Dia livre! Não há nada marcado.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {selectedDay.turnos.map(turno => {
                      const isPassado = !isTurnoFuturo(turno);
                      return (
                        <div
                          key={turno.id}
                          className={`border rounded-lg p-4 relative ${isPassado ? "bg-gray-50 border-gray-200" : "border-gray-200 hover:border-blue-300 transition"}`}
                        >
                          {turno.isVirtual && (
                            <span className="absolute top-4 right-4 text-[10px] bg-blue-50 text-blue-500 px-2 py-0.5 rounded font-medium border border-blue-100">
                              Repetição Semanal
                            </span>
                          )}

                          <div className="mb-3 pr-24">
                            <div className="flex items-center gap-2 mb-1">
                              {/* BADGE DE TIPO */}
                              <span
                                className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide ${getCorPorTipo(turno.tipo, isPassado)}`}
                              >
                                {turno.tipo || "Turno"}
                              </span>
                              {isPassado && (
                                <span className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase bg-gray-200 text-gray-600">
                                  Concluído
                                </span>
                              )}
                            </div>

                            {/* TITULO (Nome) */}
                            <h3
                              className={`text-lg font-bold ${isPassado ? "text-gray-500" : "text-gray-900"}`}
                            >
                              {turno.nome || "Sem título"}
                            </h3>
                            <p className="text-xs text-gray-500 mt-0.5">
                              Evento: {getNomeEvento(turno.eventoId)}
                            </p>
                          </div>

                          <div
                            className={`space-y-1.5 text-sm ${isPassado ? "text-gray-500" : "text-gray-700"}`}
                          >
                            <p className="flex items-center gap-2">
                              <span className="font-semibold w-24">Horário:</span>
                              {turno.horaInicio} às {turno.horaFim}
                            </p>
                            <p className="flex items-center gap-2">
                              <span className="font-semibold w-24">Responsável:</span>
                              {getNomeParticipanteParaTabela(turno.responsavelId)}
                            </p>
                            <p className="flex items-start gap-2">
                              <span className="font-semibold w-24 shrink-0">👥 Equipa:</span>
                              <span>
                                {turno.participantesIds
                                  .map(id => getNomeParticipanteParaTabela(id))
                                  .join(", ")}
                              </span>
                            </p>
                            {turno.observacoes && (
                              <p className="flex items-start gap-2 mt-2 pt-2 border-t border-gray-100">
                                <span className="font-semibold w-24 shrink-0 text-gray-500">
                                  📝 Notas:
                                </span>
                                <span className="italic text-gray-600">{turno.observacoes}</span>
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </ProtectedPage>
  );
}
