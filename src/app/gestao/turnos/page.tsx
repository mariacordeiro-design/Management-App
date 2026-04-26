"use client";
import ProtectedPage from "@/src/components/ProtectedPage";
import { useUser } from "@/src/components/UserProvider";
import React, { JSX, useEffect, useState, useMemo } from "react";

import {
  getEventos,
  getTurnos,
  getAllUsers,
  TurnoAirtable,
  editarTurno,
  criarTurno,
  apagarTurno,
} from "../../api/airtable/airtable";
import { Evento, User } from "@/src/components/Interfaces";
import { getPeopleAvailability, PeopleAvailabilityResponse } from "../../api/crab/api";

const API_EVENT_ID = "tlmoto-940143";

const DIAS_SEMANA = [
  { value: 0, label: "Domingo" },
  { value: 1, label: "Segunda-feira" },
  { value: 2, label: "Terça-feira" },
  { value: 3, label: "Quarta-feira" },
  { value: 4, label: "Quinta-feira" },
  { value: 5, label: "Sexta-feira" },
  { value: 6, label: "Sábado" },
];

interface TurnoLocal extends TurnoAirtable {
  diaSemana?: number;
  dataCompleta?: string;
  isVirtual?: boolean;
}

interface ParticipanteDisponivel {
  name: string;
  istId: string;
  nomeReal: string;
  nomeCompleto: string;
  availability: string[];
  matchPercentage: number;
  matchedSlots: number;
  totalSlotsRequired: number;
  departamento?: string; // NOVO CAMPO PARA DEPARTAMENTO
}

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

const getNextDateForWeekday = (weekday: number): string => {
  const today = new Date();
  const daysUntilTarget = (weekday - today.getDay() + 7) % 7;
  const targetDate = new Date(today);
  targetDate.setDate(today.getDate() + (daysUntilTarget === 0 ? 7 : daysUntilTarget));
  return formatDateToDDMMYYYY(targetDate);
};

const converterStringParaData = (str: string): Date => {
  const [day, month, year] = str.split("/").map(Number);
  return new Date(year, month - 1, day);
};

const normalizarData = (date: Date): Date => {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
};

const parseDataDDMMYYYY = (value: string): Date | null => {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);

  const parsed = new Date(year, month - 1, day);
  const isValid =
    parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;

  return isValid ? normalizarData(parsed) : null;
};

const parseDataISO = (value: string): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return normalizarData(parsed);
};

const expandirTurnosRecorrentes = (turnosOriginais: TurnoLocal[]): TurnoLocal[] => {
  const listaExpandida: TurnoLocal[] = [];

  turnosOriginais.forEach(turno => {
    listaExpandida.push(turno);

    if (turno.tipo !== "Turno" && turno.dataLimiteRecorrencia) {
      const dataLimite = new Date(turno.dataLimiteRecorrencia);
      let dataReferencia = converterStringParaData(turno.dataCompleta!);

      while (true) {
        dataReferencia.setDate(dataReferencia.getDate() + 7);
        if (dataReferencia > dataLimite) break;

        listaExpandida.push({
          ...turno,
          id: `${turno.id}_virtual_${dataReferencia.getTime()}`,
          dataCompleta: formatDateToDDMMYYYY(new Date(dataReferencia)),
          isVirtual: true,
        });
      }
    }
  });

  return listaExpandida;
};

const isTurnoFuturo = (turno: TurnoLocal): boolean => {
  if (!turno.dataCompleta) return false;
  const [day, month, year] = turno.dataCompleta.split("/").map(Number);
  const turnoDate = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return turnoDate >= today;
};

export default function Turnos(): JSX.Element {
  const { user } = useUser();

  // --- ESTADOS ---
  const [turnos, setTurnos] = useState<TurnoLocal[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"active" | "historical">("active");

  const [filterNomeAtivo, setFilterNomeAtivo] = useState("");
  const [filterParticipanteAtivo, setFilterParticipanteAtivo] = useState("");
  const [filterNomeHistorico, setFilterNomeHistorico] = useState("");
  const [filterParticipanteHistorico, setFilterParticipanteHistorico] = useState("");

  const [eventos, setEventos] = useState<Evento[]>([]);
  const [airtableUsers, setAirtableUsers] = useState<User[]>([]);
  // Form states
  const [nomeTurno, setNomeTurno] = useState("");
  const [dataEspecifica, setDataEspecifica] = useState("");
  const [usarDataEspecifica, setUsarDataEspecifica] = useState(false);
  const [diaSemana, setDiaSemana] = useState<number | "">("");
  const [horaInicio, setHoraInicio] = useState("");
  const [horaFim, setHoraFim] = useState("");
  const [eventoSelecionado, setEventoSelecionado] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [responsavelSelecionadoId, setResponsavelSelecionadoId] = useState("");
  const [tipoTurno, setTipoTurno] = useState<"Turno" | "Worksession" | "Reunião">("Turno");
  const [dataLimiteRecorrencia, setDataLimiteRecorrencia] = useState("");

  // Data states
  const [participantesCrabFit, setParticipantesCrabFit] = useState<PeopleAvailabilityResponse[]>(
    []
  );
  const [participantesDisponiveis, setParticipantesDisponiveis] = useState<
    ParticipanteDisponivel[]
  >([]);
  const [isLoadingParticipantes, setIsLoadingParticipantes] = useState(false);
  const [participantesSelecionadosIds, setParticipantesSelecionadosIds] = useState<string[]>([]);
  const [pesquisaParticipantes, setPesquisaParticipantes] = useState("");

  // NOVOS ESTADOS PARA FILTRO POR DEPARTAMENTO
  const [filtroDepartamento, setFiltroDepartamento] = useState("");
  const [departamentosDisponiveis, setDepartamentosDisponiveis] = useState<string[]>([]);

  // Edit States
  const [isEditing, setIsEditing] = useState(false);
  const [editingTurnoId, setEditingTurnoId] = useState<string | null>(null);

  // --- HELPERS PARA UI ---
  const getRecordId = (istId: string): string | null => {
    const found = airtableUsers.find(u => u.istId?.toString() === istId);
    return found ? found.id : null;
  };

  const getNomeParticipanteParaTabela = (id: string) => {
    const foundRec = airtableUsers.find(u => u.id === id);
    if (foundRec) return foundRec.nome;
    const foundIst = airtableUsers.find(u => u.istId?.toString() === id);
    if (foundIst) return foundIst.nome;
    return id || "---";
  };

  const getNomeEvento = (id: string) => eventos.find(e => e.id === id)?.nome || "Desconhecido";

  const turnosAtivos = useMemo(() => turnos.filter(isTurnoFuturo), [turnos]);
  const turnosHistoricos = useMemo(() => turnos.filter(turno => !isTurnoFuturo(turno)), [turnos]);

  const filteredTurnosAtivos = useMemo(() => {
    return turnosAtivos.filter(turno => {
      const matchesNome =
        filterNomeAtivo === "" ||
        (turno.nome && turno.nome.toLowerCase().includes(filterNomeAtivo.toLowerCase())) ||
        getNomeEvento(turno.eventoId).toLowerCase().includes(filterNomeAtivo.toLowerCase());
      const matchesParticipante =
        filterParticipanteAtivo === "" ||
        turno.participantesIds.some(id =>
          getNomeParticipanteParaTabela(id)
            .toLowerCase()
            .includes(filterParticipanteAtivo.toLowerCase())
        ) ||
        getNomeParticipanteParaTabela(turno.responsavelId)
          .toLowerCase()
          .includes(filterParticipanteAtivo.toLowerCase());
      return matchesNome && matchesParticipante;
    });
  }, [turnosAtivos, filterNomeAtivo, filterParticipanteAtivo, eventos, airtableUsers]);

  const filteredTurnosHistoricos = useMemo(() => {
    return turnosHistoricos.filter(turno => {
      const matchesNome =
        filterNomeHistorico === "" ||
        (turno.nome && turno.nome.toLowerCase().includes(filterNomeHistorico.toLowerCase())) ||
        getNomeEvento(turno.eventoId).toLowerCase().includes(filterNomeHistorico.toLowerCase());
      const matchesParticipante =
        filterParticipanteHistorico === "" ||
        turno.participantesIds.some(id =>
          getNomeParticipanteParaTabela(id)
            .toLowerCase()
            .includes(filterParticipanteHistorico.toLowerCase())
        ) ||
        getNomeParticipanteParaTabela(turno.responsavelId)
          .toLowerCase()
          .includes(filterParticipanteHistorico.toLowerCase());
      return matchesNome && matchesParticipante;
    });
  }, [turnosHistoricos, filterNomeHistorico, filterParticipanteHistorico, eventos, airtableUsers]);

  // MEMO ATUALIZADO PARA FILTRAR PARTICIPANTES POR NOME E DEPARTAMENTO
  const participantesFiltrados = useMemo(() => {
    let filtrados = participantesDisponiveis;

    // Filtrar por pesquisa de nome
    if (pesquisaParticipantes) {
      filtrados = filtrados.filter(p =>
        p.nomeCompleto.toLowerCase().includes(pesquisaParticipantes.toLowerCase())
      );
    }

    // Filtrar por departamento
    if (filtroDepartamento) {
      filtrados = filtrados.filter(p => p.departamento === filtroDepartamento);
    }

    return filtrados;
  }, [participantesDisponiveis, pesquisaParticipantes, filtroDepartamento]);

  useEffect(() => {
    loadTurnos();
    loadEventos();
    fetchAirtableUsers();
    fetchPeopleFixed();
  }, []);

  useEffect(() => {
    processarParticipantesDisponiveis();
  }, [
    participantesCrabFit,
    user,
    diaSemana,
    dataEspecifica,
    usarDataEspecifica,
    horaInicio,
    horaFim,
    airtableUsers,
  ]);

  // NOVO USEEFFECT PARA EXTRAIR DEPARTAMENTOS ÚNICOS
  useEffect(() => {
    const departamentos = [
      ...new Set(
        participantesDisponiveis
          .map(p => p.departamento)
          .filter((dep): dep is string => Boolean(dep && dep.trim() !== ""))
      ),
    ].sort();
    setDepartamentosDisponiveis(departamentos);
  }, [participantesDisponiveis]);

  const loadTurnos = async () => {
    setIsLoading(true);
    try {
      const data = await getTurnos();
      const turnosProcessados: TurnoLocal[] = data.map(turno => ({
        ...turno,
        diaSemana: getWeekDayFromDate(turno.data),
        dataCompleta: turno.data,
      }));
      setTurnos(expandirTurnosRecorrentes(turnosProcessados));
    } catch (error) {
      console.error("Erro ao carregar turnos:", error);
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

  async function fetchPeopleFixed() {
    setIsLoadingParticipantes(true);
    try {
      const data = await getPeopleAvailability(API_EVENT_ID);
      setParticipantesCrabFit(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingParticipantes(false);
    }
  }

  const generateRequiredSlots = (start: string, end: string, day: number): string[] => {
    const slots: string[] = [];
    if (!start || !end) return slots;
    const [startH, startM] = start.split(":").map(Number);
    const [endH, endM] = end.split(":").map(Number);
    let currentMins = startH * 60 + startM;
    const endMins = endH * 60 + endM;
    while (currentMins < endMins) {
      const h = Math.floor(currentMins / 60);
      const m = currentMins % 60;
      slots.push(`${h.toString().padStart(2, "0")}${m.toString().padStart(2, "0")}-${day}`);
      currentMins += 30;
    }
    return slots;
  };

  // FUNÇÃO ATUALIZADA PARA INCLUIR DEPARTAMENTO
  const processarParticipantesDisponiveis = () => {
    if (!participantesCrabFit || participantesCrabFit.length === 0) {
      setParticipantesDisponiveis([]);
      return;
    }
    let requiredSlots: string[] = [];
    let dayToUse: number | undefined;

    if (usarDataEspecifica && dataEspecifica) {
      dayToUse = getWeekDayFromDate(dataEspecifica);
    } else if (!usarDataEspecifica && diaSemana !== "") {
      dayToUse = diaSemana as number;
    }

    if (dayToUse !== undefined && horaInicio && horaFim) {
      requiredSlots = generateRequiredSlots(horaInicio, horaFim, dayToUse);
    }

    const participantesProcessados = participantesCrabFit.map(pessoa => {
      const userAirtable = airtableUsers.find(u => u.istId?.toString() === pessoa.name);
      const realName = userAirtable ? userAirtable.nome : pessoa.name;
      const departamento = userAirtable?.department || "Sem Departamento"; // OBTER DEPARTAMENTO DO AIRTABLE
      const isCurrentUser = user?.istId?.toString() === pessoa.name;
      const displayName = isCurrentUser ? `${realName} (Eu)` : realName;
      let matchPercentage =
        requiredSlots.length > 0
          ? (requiredSlots.filter(slot => pessoa.availability.includes(slot)).length /
              requiredSlots.length) *
            100
          : 100;

      return {
        name: pessoa.name,
        istId: pessoa.name,
        nomeReal: realName,
        nomeCompleto: displayName,
        departamento, // NOVO CAMPO
        availability: pessoa.availability,
        matchPercentage,
        matchedSlots:
          requiredSlots.length > 0
            ? requiredSlots.filter(slot => pessoa.availability.includes(slot)).length
            : 0,
        totalSlotsRequired: requiredSlots.length,
      };
    });

    participantesProcessados.sort(
      (a, b) =>
        b.matchPercentage - a.matchPercentage || a.nomeCompleto.localeCompare(b.nomeCompleto)
    );
    setParticipantesDisponiveis(participantesProcessados);
  };

  const toggleParticipante = (id: string) => {
    setParticipantesSelecionadosIds(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  // FUNÇÃO ATUALIZADA PARA SELECIONAR TODOS OS FILTRADOS
  const handleSelecionarTodos = () => {
    const idsVisiveis = participantesFiltrados.map(p => p.istId);

    // Verifica se todos os visíveis já estão selecionados
    const todosSelecionados = idsVisiveis.every(id => participantesSelecionadosIds.includes(id));

    if (todosSelecionados) {
      // Desmarca os visíveis
      setParticipantesSelecionadosIds(prev => prev.filter(id => !idsVisiveis.includes(id)));
    } else {
      // Marca os visíveis (mantendo os que já estavam)
      setParticipantesSelecionadosIds(prev => {
        const novosIds = idsVisiveis.filter(id => !prev.includes(id));
        return [...prev, ...novosIds];
      });
    }
  };

  // NOVA FUNÇÃO PARA SELECIONAR TODOS DE UM DEPARTAMENTO
  const handleSelecionarPorDepartamento = (departamento: string) => {
    const participantesDoDepto = participantesDisponiveis
      .filter(p => p.departamento === departamento)
      .map(p => p.istId);

    const todosDoDeptoSelecionados = participantesDoDepto.every(id =>
      participantesSelecionadosIds.includes(id)
    );

    if (todosDoDeptoSelecionados) {
      // Desmarca todos do departamento
      setParticipantesSelecionadosIds(prev =>
        prev.filter(id => !participantesDoDepto.includes(id))
      );
    } else {
      // Marca todos do departamento
      setParticipantesSelecionadosIds(prev => {
        const novosIds = participantesDoDepto.filter(id => !prev.includes(id));
        return [...prev, ...novosIds];
      });
    }
  };

  // --- ACTIONS ---

  const abrirEdicao = (turno: TurnoLocal) => {
    setIsEditing(true);
    setEditingTurnoId(turno.id || null);

    setNomeTurno(turno.nome || "");
    setTipoTurno((turno.tipo as any) || "Turno");
    setDataLimiteRecorrencia(turno.dataLimiteRecorrencia || "");

    setUsarDataEspecifica(true);
    setDataEspecifica(turno.dataCompleta || "");
    setHoraInicio(turno.horaInicio);
    setHoraFim(turno.horaFim);
    setEventoSelecionado(turno.eventoId);
    setObservacoes(turno.observacoes || "");

    const pIstIds = turno.participantesIds.map(
      recId => airtableUsers.find(u => u.id === recId)?.istId?.toString() || recId
    );
    setParticipantesSelecionadosIds(pIstIds);

    const rIstId = airtableUsers.find(u => u.id === turno.responsavelId)?.istId?.toString() || "";
    setResponsavelSelecionadoId(rIstId);

    setIsModalOpen(true);
  };

  const handleSalvarTurno = async () => {
    try {
      let dataFinal = usarDataEspecifica
        ? dataEspecifica
        : diaSemana !== ""
          ? getNextDateForWeekday(diaSemana as number)
          : "";

      if (!nomeTurno.trim()) return alert("Por favor, dê um nome à marcação!");
      if (!dataFinal) return alert("Selecione uma data!");
      if (
        !eventoSelecionado ||
        !horaInicio ||
        !horaFim ||
        participantesSelecionadosIds.length === 0 ||
        !responsavelSelecionadoId
      )
        return alert("Preencha os campos obrigatórios!");
      if (tipoTurno !== "Turno" && !dataLimiteRecorrencia)
        return alert("Defina até quando a marcação se repete!");

      if (horaInicio >= horaFim) {
        return alert("A hora de início tem de ser anterior à hora de fim.");
      }

      const dataTurno = parseDataDDMMYYYY(dataFinal);
      if (!dataTurno) {
        return alert("A data escolhida é inválida.");
      }

      const hoje = normalizarData(new Date());
      if (!isEditing && dataTurno < hoje) {
        return alert("Não é possível criar marcações em datas passadas.");
      }

      let dataLimite: Date | null = null;
      if (tipoTurno !== "Turno") {
        dataLimite = parseDataISO(dataLimiteRecorrencia);
        if (!dataLimite) {
          return alert("A data limite de recorrência é inválida.");
        }
        if (dataLimite < dataTurno) {
          return alert("A data limite deve ser igual ou posterior à data da primeira sessão.");
        }
      }

      const eventoSelecionadoData = eventos.find(ev => ev.id === eventoSelecionado);
      if (!eventoSelecionadoData) {
        return alert("Evento inválido.");
      }

      const dataInicioEvento = parseDataISO(eventoSelecionadoData.dataInicio);
      const dataFimEvento = parseDataISO(eventoSelecionadoData.dataFim);

      if (!dataInicioEvento || !dataFimEvento) {
        return alert("O evento associado tem datas inválidas. Verifique o evento.");
      }

      if (dataTurno < dataInicioEvento || dataTurno > dataFimEvento) {
        return alert("A data da marcação tem de estar dentro do intervalo do evento.");
      }

      if (dataLimite && (dataLimite < dataInicioEvento || dataLimite > dataFimEvento)) {
        return alert("A data limite da recorrência tem de estar dentro do intervalo do evento.");
      }

      const responsavelRecId = getRecordId(responsavelSelecionadoId);
      const participantesRecIds = participantesSelecionadosIds
        .map(id => getRecordId(id))
        .filter((id): id is string => id !== null);

      if (!responsavelRecId) return alert("Responsável inválido.");

      setIsLoading(true);

      const turnoData: any = {
        nome: nomeTurno,
        tipo: tipoTurno,
        isRecorrente: tipoTurno !== "Turno",
        dataLimiteRecorrencia: tipoTurno !== "Turno" ? dataLimiteRecorrencia : undefined,
        data: dataFinal,
        horaInicio,
        horaFim,
        eventoId: eventoSelecionado,
        participantesIds: participantesRecIds,
        responsavelId: responsavelRecId,
        observacoes,
      };

      if (isEditing && editingTurnoId) {
        await editarTurno(editingTurnoId, turnoData);
        alert("Atualizado!");
      } else {
        await criarTurno(turnoData);
        alert("Criado!");
      }

      fecharModal();
      loadTurnos();
    } catch (error) {
      console.error(error);
      alert("Erro ao guardar.");
    } finally {
      setIsLoading(false);
    }
  };

  const apagarTurnoApp = async (idTurno: string) => {
    if (window.confirm("Tem a certeza que deseja excluir?")) {
      try {
        await apagarTurno(idTurno);
        loadTurnos();
      } catch (error) {
        alert("Erro ao apagar.");
      }
    }
  };

  const fecharModal = () => {
    setIsModalOpen(false);
    setIsEditing(false);
    setEditingTurnoId(null);

    setNomeTurno("");
    setTipoTurno("Turno");
    setDataLimiteRecorrencia("");

    setUsarDataEspecifica(false);
    setDataEspecifica("");
    setDiaSemana("");
    setHoraInicio("");
    setHoraFim("");
    setEventoSelecionado("");
    setParticipantesSelecionadosIds([]);
    setResponsavelSelecionadoId("");
    setObservacoes("");
    setPesquisaParticipantes(""); // Reset da pesquisa
    setFiltroDepartamento(""); // Reset do filtro de departamento
  };

  // BADGE DE DISPONIBILIDADE
  const renderAvailabilityBadge = (percentage: number, matched: number, total: number) => {
    if (total === 0) return null;
    if (percentage === 100)
      return (
        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase bg-green-100 text-green-700 border border-green-200">
          Disponível
        </span>
      );
    if (percentage === 0)
      return (
        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase bg-red-100 text-red-600 border border-red-200">
          Indisponível
        </span>
      );
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase bg-yellow-100 text-yellow-700 border border-yellow-200">
        Parcial ({matched}/{total})
      </span>
    );
  };

  const TurnosTable = ({
    turnos: turnosList,
    isHistorical,
  }: {
    turnos: TurnoLocal[];
    isHistorical: boolean;
  }) => (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden min-h-[300px]">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Data
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Nome
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Tipo
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Horário
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                Responsável
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                Ações
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {turnosList.map(turno => (
              <tr
                key={turno.id}
                className={turno.isVirtual ? "bg-gray-50 italic text-gray-500" : "hover:bg-gray-50"}
              >
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  {turno.dataCompleta}
                  {turno.isVirtual && (
                    <span className="ml-2 text-[10px] text-blue-500 font-normal">(Repetição)</span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                  {turno.nome || "---"}
                  <div className="text-[10px] font-normal text-gray-500">
                    {getNomeEvento(turno.eventoId)}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                      turno.tipo === "Worksession"
                        ? "bg-purple-100 text-purple-700"
                        : turno.tipo === "Reunião"
                          ? "bg-orange-100 text-orange-700"
                          : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {turno.tipo || "Turno"}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                  {turno.horaInicio} - {turno.horaFim}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-blue-600">
                  {getNomeParticipanteParaTabela(turno.responsavelId)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  {!turno.isVirtual ? (
                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => abrirEdicao(turno)}
                        className="text-blue-600 hover:underline"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => apagarTurnoApp(turno.id!)}
                        className={`hover:underline ${isHistorical ? "text-orange-600" : "text-red-600"}`}
                      >
                        Apagar
                      </button>
                    </div>
                  ) : (
                    <span className="text-gray-400 text-xs">Editar no original</span>
                  )}
                </td>
              </tr>
            ))}
            {turnosList.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                  {isLoading ? "A carregar..." : "Nenhum registo encontrado."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <ProtectedPage>
      <main className="min-h-screen flex flex-col pt-20 px-4 max-w-7xl mx-auto w-full">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl text-white font-semibold">Gestão de Calendário</h1>
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium shadow-md transition"
          >
            + Criar Marcação
          </button>
        </div>

        <div className="mb-6">
          <nav className="flex space-x-4 border-b border-gray-200 pb-2">
            <button
              onClick={() => setActiveTab("active")}
              className={`pb-2 px-4 ${activeTab === "active" ? "border-b-2 border-blue-500 text-blue-500 font-bold" : "text-gray-400"}`}
            >
              Ativos
            </button>
            <button
              onClick={() => setActiveTab("historical")}
              className={`pb-2 px-4 ${activeTab === "historical" ? "border-b-2 border-blue-500 text-blue-500 font-bold" : "text-gray-400"}`}
            >
              Histórico
            </button>
          </nav>
        </div>

        <TurnosTable
          turnos={activeTab === "active" ? filteredTurnosAtivos : filteredTurnosHistoricos}
          isHistorical={activeTab === "historical"}
        />

        {isModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
              <div className="p-6 border-b flex justify-between items-center">
                <h2 className="text-xl text-gray-900 font-bold">
                  {isEditing ? "Editar Marcação" : "Nova Marcação"}
                </h2>
                <button onClick={fecharModal} className="text-gray-500 hover:text-black text-xl">
                  ✕
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700">
                    Nome da Marcação *
                  </label>
                  <input
                    type="text"
                    value={nomeTurno}
                    onChange={e => setNomeTurno(e.target.value)}
                    placeholder="Ex: Reunião Geral, Worksession Design..."
                    className="w-full p-2 mt-1 border rounded text-black focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700">
                    Tipo de Marcação *
                  </label>
                  <div className="flex gap-2 mt-2">
                    {["Turno", "Worksession", "Reunião"].map(t => (
                      <button
                        key={t}
                        onClick={() => setTipoTurno(t as any)}
                        className={`flex-1 py-2 rounded border text-sm transition ${tipoTurno === t ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-700 hover:bg-gray-50"}`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {tipoTurno !== "Turno" && (
                  <div className="bg-blue-50 p-3 rounded-md border border-blue-100">
                    <label className="block text-xs font-bold text-blue-700 mb-1 uppercase">
                      Repetir semanalmente até: *
                    </label>
                    <input
                      type="date"
                      value={dataLimiteRecorrencia}
                      onChange={e => setDataLimiteRecorrencia(e.target.value)}
                      className="w-full p-2 border rounded text-black text-sm"
                    />
                  </div>
                )}

                {/* Evento */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700">
                    Evento Associado *
                  </label>
                  <select
                    value={eventoSelecionado}
                    onChange={e => setEventoSelecionado(e.target.value)}
                    className="w-full p-2 border rounded text-black mt-1"
                  >
                    <option value="">Selecione...</option>
                    {eventos.map(ev => (
                      <option key={ev.id} value={ev.id}>
                        {ev.nome}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Data */}
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="checkbox"
                    id="checkDate"
                    checked={usarDataEspecifica}
                    onChange={e => setUsarDataEspecifica(e.target.checked)}
                  />
                  <label htmlFor="checkDate" className="text-sm text-gray-700 italic">
                    Data específica da 1ª sessão *
                  </label>
                </div>
                {usarDataEspecifica ? (
                  <input
                    type="date"
                    value={dataEspecifica.split("/").reverse().join("-")}
                    onChange={e => setDataEspecifica(e.target.value.split("-").reverse().join("/"))}
                    className="w-full p-2 border rounded text-black"
                  />
                ) : (
                  <select
                    value={diaSemana}
                    onChange={e =>
                      setDiaSemana(e.target.value === "" ? "" : Number(e.target.value))
                    }
                    className="w-full p-2 border rounded text-black"
                  >
                    <option value="">Dia da semana...</option>
                    {DIAS_SEMANA.map(d => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                )}

                {/* Horários */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-500 font-semibold">Início</label>
                    <input
                      type="time"
                      value={horaInicio}
                      onChange={e => setHoraInicio(e.target.value)}
                      className="w-full p-2 border rounded text-black mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 font-semibold">Fim</label>
                    <input
                      type="time"
                      value={horaFim}
                      onChange={e => setHoraFim(e.target.value)}
                      className="w-full p-2 border rounded text-black mt-1"
                    />
                  </div>
                </div>

                {/* SEÇÃO DE PARTICIPANTES ATUALIZADA COM FILTRO POR DEPARTAMENTO */}
                <div className="pt-2 border-t">
                  <div className="flex justify-between items-center mb-3">
                    <label className="block text-sm font-semibold text-gray-700">
                      Participantes *
                    </label>
                    <button
                      type="button"
                      onClick={handleSelecionarTodos}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                    >
                      {participantesFiltrados.every(p =>
                        participantesSelecionadosIds.includes(p.istId)
                      ) && participantesFiltrados.length > 0
                        ? "Desmarcar Visíveis"
                        : "Selecionar Visíveis"}
                    </button>
                  </div>

                  {/* FILTROS - NOME E DEPARTAMENTO */}
                  <div className="space-y-2 mb-3">
                    <input
                      type="text"
                      placeholder="Pesquisar por nome..."
                      value={pesquisaParticipantes}
                      onChange={e => setPesquisaParticipantes(e.target.value)}
                      className="w-full p-2 text-sm border rounded text-black focus:ring-2 focus:ring-blue-500"
                    />

                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={filtroDepartamento}
                        onChange={e => setFiltroDepartamento(e.target.value)}
                        className="w-full p-2 text-sm border rounded text-black focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Todos os departamentos</option>
                        {departamentosDisponiveis.map(dep => (
                          <option key={dep} value={dep}>
                            {dep}
                          </option>
                        ))}
                      </select>

                      {filtroDepartamento && (
                        <button
                          type="button"
                          onClick={() => handleSelecionarPorDepartamento(filtroDepartamento)}
                          className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded px-2 py-1 border transition"
                        >
                          {participantesDisponiveis
                            .filter(p => p.departamento === filtroDepartamento)
                            .every(p => participantesSelecionadosIds.includes(p.istId))
                            ? `Desmarcar ${filtroDepartamento}`
                            : `Selecionar ${filtroDepartamento}`}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* LISTA DE PARTICIPANTES */}
                  <div className="border rounded bg-white max-h-48 overflow-y-auto">
                    {participantesFiltrados.length === 0 ? (
                      <p className="p-3 text-sm text-gray-500 text-center">
                        {pesquisaParticipantes || filtroDepartamento
                          ? "Nenhum participante encontrado com os filtros aplicados."
                          : "Nenhum participante encontrado."}
                      </p>
                    ) : (
                      participantesFiltrados.map(p => (
                        <label
                          key={p.istId}
                          className="flex justify-between items-center p-2 hover:bg-gray-50 border-b last:border-0 cursor-pointer text-black"
                        >
                          <div className="flex items-center gap-2 overflow-hidden">
                            <input
                              type="checkbox"
                              checked={participantesSelecionadosIds.includes(p.istId)}
                              onChange={() => toggleParticipante(p.istId)}
                              className="shrink-0"
                            />
                            <div className="min-w-0">
                              <span className="text-sm truncate block" title={p.nomeCompleto}>
                                {p.nomeCompleto}
                              </span>
                              {p.departamento && (
                                <span
                                  className="text-xs text-gray-500 truncate block"
                                  title={p.departamento}
                                >
                                  {p.departamento}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="shrink-0 pl-2">
                            {renderAvailabilityBadge(
                              p.matchPercentage,
                              p.matchedSlots,
                              p.totalSlotsRequired
                            )}
                          </div>
                        </label>
                      ))
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {participantesSelecionadosIds.length} selecionado(s) de{" "}
                    {participantesDisponiveis.length} totais
                    {(pesquisaParticipantes || filtroDepartamento) && (
                      <span> • {participantesFiltrados.length} visíveis</span>
                    )}
                  </p>
                </div>

                {/* Responsável e Observações */}
                <select
                  value={responsavelSelecionadoId}
                  onChange={e => setResponsavelSelecionadoId(e.target.value)}
                  className="w-full p-2 border rounded text-black mt-2"
                >
                  <option value="">Responsável...</option>
                  {participantesDisponiveis
                    .filter(p => participantesSelecionadosIds.includes(p.istId))
                    .map(p => (
                      <option key={p.istId} value={p.istId}>
                        {p.nomeReal}
                      </option>
                    ))}
                </select>

                <textarea
                  value={observacoes}
                  onChange={e => setObservacoes(e.target.value)}
                  placeholder="Observações..."
                  className="w-full p-2 border rounded text-black"
                  rows={2}
                />
              </div>

              <div className="p-6 border-t flex justify-end gap-3 bg-gray-50">
                <button onClick={fecharModal} className="px-4 py-2 text-gray-600">
                  Cancelar
                </button>
                <button
                  onClick={handleSalvarTurno}
                  disabled={isLoading}
                  className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300"
                >
                  {isLoading ? "A guardar..." : isEditing ? "Guardar Alterações" : "Criar Marcação"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </ProtectedPage>
  );
}
