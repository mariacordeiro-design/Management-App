"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import { Calendar, Users, Clock, TrendingUp, Search, PieChart, BarChart3 } from "lucide-react";
import { useMembers, useMembersByAreaArray } from "@/src/components/MemberProvider";
import { getEventos, getHistoricoTurnos } from "../../api/airtable/airtable";
import { getPeopleAvailability, PeopleAvailabilityResponse } from "../../api/crab/api";
import { Evento, Turno } from "@/src/components/Interfaces";
import ProtectedPage from "@/src/components/ProtectedPage";
import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

const normalizeSearch = (text: string) =>
  text
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

const generateColor = (index: number, total: number) => {
  const hue = (index * 360) / total;
  const saturation = 65;
  const lightness = 55;
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
};

const AVAILABILITY_EVENT_ID = "tlmoto-940143";

const StatisticsPage = () => {
  const [selectedPeople, setSelectedPeople] = useState<string[]>([]);
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [dateFilter, setDateFilter] = useState("all");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [participanteSearchTerm, setParticipanteSearchTerm] = useState("");
  const [eventoSearchTerm, setEventoSearchTerm] = useState("");
  const [departamentoSearchTerm, setDepartamentoSearchTerm] = useState("");
  const [participantChartType, setParticipantChartType] = useState<"pie" | "bar">("pie");
  const [eventChartType, setEventChartType] = useState<"pie" | "bar">("pie");
  const [availabilityPeople, setAvailabilityPeople] = useState<PeopleAvailabilityResponse[]>([]);
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);
  const { members } = useMembers();
  const membersByAreaArray = useMembersByAreaArray();

  useEffect(() => {
    loadEventos();
    loadTurnos();
    loadAvailabilityPeople();
  }, []);

  const loadEventos = () => {
    getEventos()
      .then(eventos => {
        setEventos(eventos || []);
      })
      .catch(error => {
        console.error("Erro ao carregar eventos:", error);
        alert("Falha ao carregar eventos. Tente novamente.");
      });
  };

  const loadTurnos = () => {
    getHistoricoTurnos()
      .then(turnos => {
        setTurnos(turnos || []);
      })
      .catch(error => {
        console.error("Erro ao carregar turnos:", error);
        alert("Falha ao carregar turnos. Tente novamente.");
      });
  };

  const loadAvailabilityPeople = () => {
    setIsLoadingAvailability(true);
    getPeopleAvailability(AVAILABILITY_EVENT_ID)
      .then(people => {
        setAvailabilityPeople(people || []);
      })
      .catch(error => {
        console.error("Erro ao carregar disponibilidades:", error);
      })
      .finally(() => {
        setIsLoadingAvailability(false);
      });
  };

  const calculateDateRange = useCallback(() => {
    const now = new Date();
    let startDate = null;

    switch (dateFilter) {
      case "7":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "30":
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case "90":
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case "180":
        startDate = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
        break;
      case "365":
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      case "custom":
        startDate = customStartDate ? new Date(customStartDate) : null;
        return { start: startDate, end: customEndDate ? new Date(customEndDate) : now };
      default:
        return { start: null, end: null };
    }

    return { start: startDate, end: now };
  }, [dateFilter, customStartDate, customEndDate]);

  const filteredEventos = useMemo(() => {
    const { start, end } = calculateDateRange();

    let eventosFiltrados = eventos;

    if (start || end) {
      const eventIdsInRange = new Set<string>();

      turnos.forEach(turno => {
        const turnoStart = new Date(turno.dataInicio);
        const turnoEnd = new Date(turno.dataFim);

        const isInRange = (!start || turnoStart >= start) && (!end || turnoEnd <= end);

        if (isInRange && turno.evento) {
          eventIdsInRange.add(turno.evento);
        }
      });

      eventosFiltrados = eventos.filter(evento => eventIdsInRange.has(evento.id));
    }

    if (normalizeSearch(eventoSearchTerm)) {
      const normalizedSearch = normalizeSearch(eventoSearchTerm);
      eventosFiltrados = eventosFiltrados.filter(evento =>
        normalizeSearch(evento.nome).includes(normalizedSearch)
      );
    }

    return eventosFiltrados;
  }, [eventos, turnos, calculateDateRange, eventoSearchTerm]);

  const filteredTurnos = useMemo(() => {
    const { start, end } = calculateDateRange();

    return turnos.filter(turno => {
      const turnoStart = new Date(turno.dataInicio);
      const turnoEnd = new Date(turno.dataFim);

      if (selectedPeople.length > 0) {
        const hasSelectedPerson = turno.participantes?.some(p => selectedPeople.includes(p));
        if (!hasSelectedPerson) return false;
      }

      if (selectedEvents.length > 0) {
        const hasSelectedEvent = selectedEvents.includes(turno.evento);
        if (!hasSelectedEvent) return false;
      }

      if (start && turnoStart < start) return false;
      if (end && turnoEnd > end) return false;

      return true;
    });
  }, [calculateDateRange, turnos, selectedPeople, selectedEvents]);

  const statistics = useMemo(() => {
    let totalHours = 0;
    const turnoCount = filteredTurnos.length;
    const hoursByEvent: { [key: string]: number } = {};
    const hoursByParticipant: { [key: string]: number } = {};

    filteredTurnos.forEach(turno => {
      const start = new Date(turno.dataInicio);
      const end = new Date(turno.dataFim);
      const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
      totalHours += hours;

      if (turno.evento) {
        hoursByEvent[turno.evento] = (hoursByEvent[turno.evento] || 0) + hours;
      }

      if (turno.participantes && turno.participantes.length > 0) {
        turno.participantes.forEach(participantId => {
          hoursByParticipant[participantId] = (hoursByParticipant[participantId] || 0) + hours;
        });
      }
    });

    const averageHours = turnoCount > 0 ? totalHours / turnoCount : 0;

    return {
      totalHours: totalHours.toFixed(2),
      averageHours: averageHours.toFixed(2),
      turnoCount,
      hoursByEvent,
      hoursByParticipant,
    };
  }, [filteredTurnos]);

  const pieChartDataByEvent = useMemo(() => {
    if (!statistics.hoursByEvent || Object.keys(statistics.hoursByEvent).length === 0) {
      return [];
    }

    return Object.entries(statistics.hoursByEvent)
      .map(([eventoId, hours]) => {
        const evento = eventos.find(e => e.id === eventoId);
        return {
          name: evento?.nome || "Evento Desconhecido",
          value: parseFloat(hours.toFixed(2)),
          hours: hours.toFixed(2),
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [statistics.hoursByEvent, eventos]);

  const pieChartDataByParticipant = useMemo(() => {
    if (!statistics.hoursByParticipant || Object.keys(statistics.hoursByParticipant).length === 0) {
      return [];
    }

    let participantsToShow = Object.keys(statistics.hoursByParticipant);

    if (selectedPeople.length > 0) {
      participantsToShow = participantsToShow.filter(id => selectedPeople.includes(id));
    }

    return participantsToShow
      .map(participantId => {
        const member = members.find(m => m.id === participantId);
        const hours = statistics.hoursByParticipant[participantId];
        return {
          name: member?.nome || "Participante Desconhecido",
          value: parseFloat(hours.toFixed(2)),
          hours: hours.toFixed(2),
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [statistics.hoursByParticipant, members, selectedPeople]);

  const handlePeopleChange = (personId: string) => {
    setSelectedPeople(prev =>
      prev.includes(personId) ? prev.filter(id => id !== personId) : [...prev, personId]
    );
  };

  const handleEventsChange = (eventId: string) => {
    setSelectedEvents(prev =>
      prev.includes(eventId) ? prev.filter(id => id !== eventId) : [...prev, eventId]
    );
  };

  const isDepartmentSelected = useCallback(
    (department: string) => {
      const deptMembers = membersByAreaArray.find(d => d.area === department)?.users || [];
      if (deptMembers.length === 0) return false;

      return deptMembers.every(m => selectedPeople.includes(m.id));
    },
    [membersByAreaArray, selectedPeople]
  );

  const handleDepartmentChange = (department: string) => {
    const deptMembers = membersByAreaArray.find(d => d.area === department)?.users || [];
    const deptIds = deptMembers.map(m => m.id);

    setSelectedPeople(prev => {
      const allSelected = deptIds.every(id => prev.includes(id));

      if (allSelected) {
        return prev.filter(id => !deptIds.includes(id));
      }

      const newSet = new Set(prev);
      deptIds.forEach(id => newSet.add(id));
      return Array.from(newSet);
    });
  };

  const filteredDepartments = useMemo(() => {
    if (!normalizeSearch(departamentoSearchTerm)) {
      return membersByAreaArray.map(d => d.area);
    }

    const normalizedSearch = normalizeSearch(departamentoSearchTerm);
    return membersByAreaArray
      .map(d => d.area)
      .filter(dept => normalizeSearch(dept).includes(normalizedSearch));
  }, [membersByAreaArray, departamentoSearchTerm]);

  const filteredMembers = useMemo(() => {
    if (!normalizeSearch(participanteSearchTerm)) {
      return members;
    }

    const normalizedSearch = normalizeSearch(participanteSearchTerm);
    return members.filter(member => normalizeSearch(member.nome).includes(normalizedSearch));
  }, [members, participanteSearchTerm]);

  const availabilityMembers = useMemo(() => {
    return availabilityPeople
      .map(person => {
        const member = members.find(m => m.istId?.toString() === person.name);
        return {
          id: member?.id || person.name,
          name: member?.nome || `Membro ${person.name}`,
          slots: new Set(person.availability || []).size,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [availabilityPeople, members]);

  const availabilityMembersFiltered = useMemo(() => {
    if (selectedPeople.length === 0) return [];

    // Ensure selected people appear even if they have no availability records (slots = 0)
    return selectedPeople.map(id => {
      const found = availabilityMembers.find(member => member.id === id);
      if (found) return found;
      const memberInfo = members.find(m => m.id === id);
      return {
        id,
        name: memberInfo?.nome || id,
        slots: 0,
      };
    });
  }, [availabilityMembers, selectedPeople, members]);

  const selectedAvailabilityHours = useMemo(() => {
    const slots = availabilityMembersFiltered.reduce((sum, member) => sum + member.slots, 0);
    return (slots * 0.25).toFixed(2);
  }, [availabilityMembersFiltered]);

  const totalAvailabilityHours = useMemo(() => {
    const totalSlots = availabilityMembers.reduce((sum, member) => sum + member.slots, 0);
    return (totalSlots * 0.25).toFixed(2);
  }, [availabilityMembers]);

  const hasActiveFilters =
    selectedPeople.length > 0 || selectedEvents.length > 0 || dateFilter !== "all";

  return (
    <ProtectedPage>
      <div className="min-h-screen bg-black p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">Estatísticas</h1>
            <p className="text-gray-200">Análise de turnos e desempenho</p>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-lg shadow-sm p-4 md:p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Filtros</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* People Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Users className="inline w-4 h-4 mr-1" />
                  Participantes
                </label>

                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={participanteSearchTerm}
                    onChange={e => setParticipanteSearchTerm(e.target.value)}
                    placeholder="Procurar participante..."
                    className="w-full pl-9 pr-3 py-2 text-sm border text-black rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div className="border rounded-lg p-3 max-h-40 overflow-y-auto bg-gray-50">
                  {filteredMembers.length > 0 ? (
                    filteredMembers.map(person => (
                      <label key={person.id} className="flex items-center mb-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedPeople.includes(person.id)}
                          onChange={() => handlePeopleChange(person.id)}
                          className="mr-2 w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">{person.nome}</span>
                      </label>
                    ))
                  ) : (
                    <p className="text-sm text-gray-500 text-center py-2">
                      Nenhum participante encontrado
                    </p>
                  )}
                </div>
              </div>

              {/* Departments */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Users className="inline w-4 h-4 mr-1" />
                  Departamentos
                </label>

                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={departamentoSearchTerm}
                    onChange={e => setDepartamentoSearchTerm(e.target.value)}
                    placeholder="Procurar departamento..."
                    className="w-full pl-9 pr-3 py-2 text-sm border text-black rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div className="border rounded-lg p-3 max-h-40 overflow-y-auto bg-gray-50">
                  {filteredDepartments.length > 0 ? (
                    filteredDepartments.map(department => (
                      <label
                        key={`dept-${department}`}
                        className="flex items-center mb-2 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={isDepartmentSelected(department)}
                          onChange={() => handleDepartmentChange(department)}
                          className="mr-2 w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">{department}</span>
                      </label>
                    ))
                  ) : (
                    <p className="text-sm text-gray-500 text-center py-2">
                      Nenhum Departamento encontrado
                    </p>
                  )}
                </div>
              </div>

              {/* Events Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Calendar className="inline w-4 h-4 mr-1" />
                  Eventos
                </label>

                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={eventoSearchTerm}
                    onChange={e => setEventoSearchTerm(e.target.value)}
                    placeholder="Procurar evento..."
                    className="w-full pl-9 pr-3 py-2 text-sm border text-black rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div className="border rounded-lg p-3 max-h-40 overflow-y-auto bg-gray-50">
                  {filteredEventos.length > 0 ? (
                    filteredEventos.map(event => (
                      <label key={event.id} className="flex items-center mb-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedEvents.includes(event.id)}
                          onChange={() => handleEventsChange(event.id)}
                          className="mr-2 w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">{event.nome}</span>
                      </label>
                    ))
                  ) : (
                    <p className="text-sm text-gray-500 text-center py-2">
                      Nenhum evento encontrado
                    </p>
                  )}
                </div>
              </div>

              {/* Date Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Clock className="inline w-4 h-4 mr-1" />
                  Período
                </label>
                <select
                  value={dateFilter}
                  onChange={e => setDateFilter(e.target.value)}
                  className="w-full border outline-black rounded-lg text-gray-400 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="all">Todos os períodos</option>
                  <option value="7">Últimos 7 dias</option>
                  <option value="30">Últimos 30 dias</option>
                  <option value="90">Últimos 90 dias</option>
                  <option value="180">Últimos 180 dias</option>
                  <option value="365">Último ano</option>
                  <option value="custom">Período personalizado</option>
                </select>

                {dateFilter === "custom" && (
                  <div className="mt-3 space-y-2">
                    <div className="mt-3 flex justify-between">
                      <label className="block text-sm text-gray-600 mt-2">Data Início:</label>
                      <input
                        type="date"
                        value={customStartDate}
                        onChange={e => setCustomStartDate(e.target.value)}
                        className="w-[70%] border bg-gray-50 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 text-gray-700"
                        placeholder="Data inicial"
                      />
                    </div>
                    <div className="mt-3 flex justify-between">
                      <label className="block text-sm text-gray-600 mt-2">Data Fim:</label>
                      <input
                        type="date"
                        value={customEndDate}
                        onChange={e => setCustomEndDate(e.target.value)}
                        className="w-[70%] border bg-gray-50 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 text-gray-700"
                        placeholder="Data final"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 h-6">
              {hasActiveFilters && (
                <button
                  onClick={() => {
                    setSelectedPeople([]);
                    setSelectedEvents([]);
                    setDateFilter("all");
                    setCustomStartDate("");
                    setCustomEndDate("");
                    setEventoSearchTerm("");
                    setParticipanteSearchTerm("");
                    setDepartamentoSearchTerm("");
                  }}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  Limpar filtros
                </button>
              )}
            </div>
          </div>

          {/* Statistics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-blue-500">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-600">Horas Totais Dadas</h3>
                <Clock className="w-5 h-5 text-blue-500" />
              </div>
              <p className="text-3xl font-bold text-gray-900">{statistics.totalHours}</p>
              <p className="text-sm text-gray-500 mt-1">horas</p>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-green-500">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-600">Média de Horas Dadas</h3>
                <TrendingUp className="w-5 h-5 text-green-500" />
              </div>
              <p className="text-3xl font-bold text-gray-900">{statistics.averageHours}</p>
              <p className="text-sm text-gray-500 mt-1">horas por turno</p>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-purple-500">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-600">Total de Turnos</h3>
                <Calendar className="w-5 h-5 text-purple-500" />
              </div>
              <p className="text-3xl font-bold text-gray-900">{statistics.turnoCount}</p>
              <p className="text-sm text-gray-500 mt-1">turnos registrados</p>
            </div>
          </div>

          <div className="mt-6 bg-white rounded-lg shadow-sm p-6 border-l-4 border-indigo-500">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-gray-600">
                Horas de Disponibilidade por Membro
              </h3>
              <Clock className="w-5 h-5 text-indigo-500" />
            </div>

            {isLoadingAvailability ? (
              <p className="mt-4 text-sm text-gray-500">A carregar disponibilidades...</p>
            ) : (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                  <p className="text-sm text-blue-700 font-medium">Disponibilidade total (todos)</p>
                  <p className="text-2xl font-bold text-blue-900 mt-1">
                    {totalAvailabilityHours} horas
                  </p>
                  <p className="text-xs text-blue-700 mt-1">{availabilityMembers.length} membros</p>
                </div>

                <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
                  <p className="text-sm text-indigo-700 font-medium">
                    Disponibilidade dos participantes filtrados
                  </p>
                  {availabilityMembersFiltered.length > 0 ? (
                    <>
                      <p className="text-2xl font-bold text-indigo-900 mt-1">
                        {selectedAvailabilityHours} horas
                      </p>
                      <p className="text-xs text-indigo-700 mt-1">
                        {availabilityMembersFiltered.length === 1
                          ? availabilityMembersFiltered[0].name
                          : `${availabilityMembersFiltered.length} membros selecionados`}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-indigo-700 mt-2">
                      Selecione participante(s) nos filtros do topo para ver as horas.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {filteredTurnos.length === 0 && (
            <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-yellow-800">
                Nenhum turno encontrado com os filtros selecionados. Tente ajustar os critérios de
                busca.
              </p>
            </div>
          )}

          {/* Pie Chart - Hours by Participant */}
          {pieChartDataByParticipant.length > 0 && (
            <div className="mt-6 bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center">
                  <Users className="w-5 h-5 text-gray-700 mr-2" />
                  <h2 className="text-lg font-semibold text-gray-900">
                    Distribuição de Horas por Participante
                  </h2>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setParticipantChartType("pie")}
                    className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      participantChartType === "pie"
                        ? "bg-blue-500 text-white"
                        : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                    }`}
                  >
                    <PieChart className="w-4 h-4" />
                    Gráfico de Pizza
                  </button>
                  <button
                    onClick={() => setParticipantChartType("bar")}
                    className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      participantChartType === "bar"
                        ? "bg-blue-500 text-white"
                        : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                    }`}
                  >
                    <BarChart3 className="w-4 h-4" />
                    Gráfico de Barras
                  </button>
                </div>
              </div>

              <div className="h-80 md:h-96">
                <ResponsiveContainer width="100%" height={360}>
                  {participantChartType === "pie" ? (
                    <RechartsPieChart>
                      <Pie
                        data={pieChartDataByParticipant}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) =>
                          `${name}: ${((percent ?? 0) * 100).toFixed(1)}%`
                        }
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {pieChartDataByParticipant.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={generateColor(index, pieChartDataByParticipant.length)}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number | undefined) => [`${value ?? 0} horas`, "Horas"]}
                      />
                      <Legend
                        verticalAlign="bottom"
                        height={36}
                        //eslint-disable-next-line @typescript-eslint/no-explicit-any
                        formatter={(value, entry: any) => `${value} (${entry.payload.hours}h)`}
                      />
                    </RechartsPieChart>
                  ) : (
                    <BarChart data={pieChartDataByParticipant}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                      <YAxis />
                      <Tooltip
                        formatter={(value: number | undefined) => [`${value ?? 0} horas`, "Horas"]}
                      />
                      <Bar dataKey="value" fill="#3b82f6" radius={[8, 8, 0, 0]}>
                        {pieChartDataByParticipant.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={generateColor(index, pieChartDataByParticipant.length)}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>

              <div className="mt-10 overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Participante
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Horas
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Percentagem
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {pieChartDataByParticipant.map((item, index) => {
                      const percentage = (
                        (item.value / parseFloat(statistics.totalHours)) *
                        100
                      ).toFixed(1);
                      return (
                        <tr key={index}>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                            <div className="flex items-center">
                              <div
                                className="w-3 h-3 rounded-full mr-2"
                                style={{
                                  backgroundColor: generateColor(
                                    index,
                                    pieChartDataByParticipant.length
                                  ),
                                }}
                              />

                              {item.name}
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-right">
                            {item.hours}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-right">
                            {percentage}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Pie Chart - Hours by Event */}
          {pieChartDataByEvent.length > 0 && (
            <div className="mt-6 bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center">
                  <PieChart className="w-5 h-5 text-gray-700 mr-2" />
                  <h2 className="text-lg font-semibold text-gray-900">
                    Distribuição de Horas por Evento
                  </h2>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setEventChartType("pie")}
                    className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      eventChartType === "pie"
                        ? "bg-blue-500 text-white"
                        : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                    }`}
                  >
                    <PieChart className="w-4 h-4" />
                    Gráfico de Pizza
                  </button>
                  <button
                    onClick={() => setEventChartType("bar")}
                    className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      eventChartType === "bar"
                        ? "bg-blue-500 text-white"
                        : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                    }`}
                  >
                    <BarChart3 className="w-4 h-4" />
                    Gráfico de Barras
                  </button>
                </div>
              </div>
              <div className="h-80 md:h-96">
                <ResponsiveContainer width="100%" height={360}>
                  {eventChartType === "pie" ? (
                    <RechartsPieChart>
                      <Pie
                        data={pieChartDataByEvent}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) =>
                          `${name}: ${((percent ?? 0) * 100).toFixed(1)}%`
                        }
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {pieChartDataByEvent.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={generateColor(index, pieChartDataByEvent.length)}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number | undefined) => [`${value ?? 0} horas`, "Horas"]}
                      />
                      <Legend
                        verticalAlign="bottom"
                        height={36}
                        //eslint-disable-next-line @typescript-eslint/no-explicit-any
                        formatter={(value, entry: any) => `${value} (${entry.payload.hours}h)`}
                      />
                    </RechartsPieChart>
                  ) : (
                    <BarChart data={pieChartDataByEvent}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                      <YAxis />
                      <Tooltip
                        formatter={(value: number | undefined) => [`${value ?? 0} horas`, "Horas"]}
                      />
                      <Bar dataKey="value" fill="#3b82f6" radius={[8, 8, 0, 0]}>
                        {pieChartDataByEvent.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={generateColor(index, pieChartDataByEvent.length)}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>

              <div className="mt-6 overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Evento
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Horas
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Percentagem
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {pieChartDataByEvent.map((item, index) => {
                      const percentage = (
                        (item.value / parseFloat(statistics.totalHours)) *
                        100
                      ).toFixed(1);
                      return (
                        <tr key={index}>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                            <div className="flex items-center">
                              <div
                                className="w-3 h-3 rounded-full mr-2"
                                style={{
                                  backgroundColor: generateColor(index, pieChartDataByEvent.length),
                                }}
                              />
                              {item.name}
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-right">
                            {item.hours}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-right">
                            {percentage}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </ProtectedPage>
  );
};

export default StatisticsPage;
