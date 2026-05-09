"use client";
import { Evento, EventoPorCriar } from "@/src/components/Interfaces";
import React, { useState, useEffect } from "react";
import { getHistoricoEventos, getEventosAtivos, criarEvento } from "../../api/airtable/airtable";
import { useMembers } from "@/src/components/MemberProvider";
import ProtectedPage from "@/src/components/ProtectedPage";
import { useUser } from "@/src/components/UserProvider";

const normalizeSearch = (text: string) =>
  text
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

export default function Eventos() {
  const [activeTab, setActiveTab] = useState<"active" | "historical">("active");
  const [nome, setNome] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [eventosAtivos, setEventosAtivos] = useState<Evento[]>([]);
  const [eventosHistoricos, setEventosHistoricos] = useState<Evento[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { members } = useMembers();
  const { isLider } = useUser();

  // Filter states for active events
  const [filterNomeAtivo, setFilterNomeAtivo] = useState("");
  const [filterParticipanteAtivo, setFilterParticipanteAtivo] = useState("");

  // Filter states for historical events
  const [filterNomeHistorico, setFilterNomeHistorico] = useState("");
  const [filterParticipanteHistorico, setFilterParticipanteHistorico] = useState("");

  useEffect(() => {
    loadEventos();
  }, []);

  const loadEventos = () => {
    setIsLoading(true);
    // Simulate API call
    setTimeout(async () => {
      setEventosAtivos(await getEventosAtivos());
      setEventosHistoricos(await getHistoricoEventos());
      setIsLoading(false);
    }, 500);
  };

  const datasInvalidas =
    dataInicio !== "" && dataFim !== "" && new Date(dataInicio) > new Date(dataFim);

  const criarEventoApp = () => {
    if (datasInvalidas) {
      alert("A data de início não pode ser posterior a data de fim");
      return;
    }
    const evento: EventoPorCriar = {
      nome,
      dataInicio,
      dataFim,
    };
    criarEvento(evento);
    loadEventos();
    alert("Evento criado com sucesso!");
    setNome("");
    setDataInicio("");
    setDataFim("");
    setIsModalOpen(false);
  };

  const apagarEvento = (idEvento: string, isHistorical: boolean) => {
      if (window.confirm("Tem a certeza de que pretende eliminar este evento?")) {
      if (isHistorical) {
        setEventosHistoricos(eventosHistoricos.filter(e => e.id !== idEvento));
      } else {
        setEventosAtivos(eventosAtivos.filter(e => e.id !== idEvento));
      }
        alert("Evento eliminado com sucesso!");
    }
  };

  const obterNomeParticipantes = (participantIds: string[]): string[] => {
    const uniqueIds = Array.from(new Set(participantIds));
    return uniqueIds.map(id => {
      const member = members.find(m => m.id === id);
      return member ? member.nome : id;
    });
  };

  const filteredEventosAtivos = eventosAtivos.filter(evento => {
    const participantNames = obterNomeParticipantes(evento.participantes);

    const searchNomeAtivo = normalizeSearch(filterNomeAtivo);
    const searchParticipanteAtivo = normalizeSearch(filterParticipanteAtivo);

    const matchesNome =
      searchNomeAtivo === "" || normalizeSearch(evento.nome).includes(searchNomeAtivo);

    const matchesParticipante =
      searchParticipanteAtivo === "" ||
      participantNames.some(name => normalizeSearch(name).includes(searchParticipanteAtivo));

    return matchesNome && matchesParticipante;
  });

  const filteredEventosHistoricos = eventosHistoricos.filter(evento => {
    const participantNames = obterNomeParticipantes(evento.participantes);

    const searchNomeHistorico = normalizeSearch(filterNomeHistorico);
    const searchParticipanteHistorico = normalizeSearch(filterParticipanteHistorico);

    const matchesNome =
      searchNomeHistorico === "" || normalizeSearch(evento.nome).includes(searchNomeHistorico);

    const matchesParticipante =
      searchParticipanteHistorico === "" ||
      participantNames.some(name => normalizeSearch(name).includes(searchParticipanteHistorico));

    return matchesNome && matchesParticipante;
  });

  const EventsTable = ({ eventos, isHistorical }: { eventos: Evento[]; isHistorical: boolean }) => (
    <>
      {/* Desktop Table View */}
      <div className="hidden md:block bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed">
            <colgroup>
              <col className="w-1/5" />
              <col className="w-2/5" />
              <col className="w-1/6" />
              <col className="w-1/6" />
              {isLider && <col className="w-20" />}
            </colgroup>
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Nome
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Participantes
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Data Início
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Data Fim
                </th>
                {isLider && (
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ações
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {eventos.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    Nenhum evento encontrado
                  </td>
                </tr>
              ) : (
                eventos.map(evento => (
                  <tr key={evento.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      <div className="break-words">{evento.nome}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      <div className="break-words leading-relaxed">
                        {obterNomeParticipantes(evento.participantes).join(", ")}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      <div className="whitespace-nowrap">
                        {new Date(evento.dataInicio).toLocaleDateString("pt-PT")}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      <div className="whitespace-nowrap">
                        {new Date(evento.dataFim).toLocaleDateString("pt-PT")}
                      </div>
                    </td>
                    {isLider && (
                      <td className="px-6 py-4 text-right text-sm font-medium">
                        <button
                          onClick={() => apagarEvento(evento.id, isHistorical)}
                          className="text-red-600 hover:text-red-900 transition inline-flex justify-center"
                          title="Excluir evento"
                        >
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-4">
        {eventos.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-6 text-center text-gray-500">
            Nenhum evento encontrado
          </div>
        ) : (
          eventos.map(evento => (
            <div key={evento.id} className="bg-white rounded-lg shadow-sm p-4 space-y-3">
              <div className="flex justify-between items-start gap-2">
                <h3 className="text-base font-semibold text-gray-900 break-words flex-1">
                  {evento.nome}
                </h3>
                {isLider && (
                  <button
                    onClick={() => apagarEvento(evento.id, isHistorical)}
                    className="text-red-600 hover:text-red-900 transition flex-shrink-0"
                    title="Excluir evento"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                )}
              </div>

              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-medium text-gray-500">Participantes:</span>
                  <p className="text-gray-700 mt-1 break-words">
                    {obterNomeParticipantes(evento.participantes).join(", ")}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="font-medium text-gray-500 block">Data Início:</span>
                    <span className="text-gray-700">
                      {new Date(evento.dataInicio).toLocaleDateString("pt-PT")}
                    </span>
                  </div>
                  <div>
                    <span className="font-medium text-gray-500 block">Data Fim:</span>
                    <span className="text-gray-700">
                      {new Date(evento.dataFim).toLocaleDateString("pt-PT")}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );

  return (
    <ProtectedPage>
      <main className="min-h-screen flex flex-col pt-20 px-4 max-w-7xl mx-auto w-full">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl text-white font-semibold">Gestão de Eventos</h1>
        </div>

        <div className="flex justify-between items-center mb-8">
          <button
            onClick={() => loadEventos()}
            disabled={isLoading}
            className="bg-white hover:bg-gray-100 text-black px-6 py-2 rounded-lg font-medium transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <span className={isLoading ? "animate-spin" : ""}>↻</span>
            {isLoading ? "A carregar..." : "Atualizar"}
          </button>
          {isLider && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition"
            >
              + Criar Evento
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="mb-6">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab("active")}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition ${
                  activeTab === "active"
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300"
                }`}
              >
                Eventos Ativos
                <span className="ml-2 bg-blue-100 text-blue-600 py-0.5 px-2.5 rounded-full text-xs font-medium">
                  {eventosAtivos.length}
                </span>
              </button>
              <button
                onClick={() => setActiveTab("historical")}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition ${
                  activeTab === "historical"
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300"
                }`}
              >
                Eventos Históricos
                <span className="ml-2 bg-gray-100 text-gray-600 py-0.5 px-2.5 rounded-full text-xs font-medium">
                  {eventosHistoricos.length}
                </span>
              </button>
            </nav>
          </div>
        </div>

        {/* Active Events Tab */}
        {activeTab === "active" && (
          <>
            {/* Filters for Active Events */}
            <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
              <h2 className="text-lg text-black font-medium mb-4">Filtros</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nome do Evento
                  </label>
                  <input
                    type="text"
                    value={filterNomeAtivo}
                    onChange={e => setFilterNomeAtivo(e.target.value)}
                    placeholder="Filtrar por nome..."
                    className="w-full px-4 py-2 border text-gray-500 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Pessoa</label>
                  <input
                    type="text"
                    value={filterParticipanteAtivo}
                    onChange={e => setFilterParticipanteAtivo(e.target.value)}
                    placeholder="Filtrar por participante..."
                    className="w-full px-4 py-2 border text-gray-500 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            <EventsTable eventos={filteredEventosAtivos} isHistorical={false} />
          </>
        )}

        {/* Historical Events Tab */}
        {activeTab === "historical" && (
          <>
            {/* Filters for Historical Events */}
            <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
              <h2 className="text-lg text-black font-medium mb-4">Filtros</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nome do Evento
                  </label>
                  <input
                    type="text"
                    value={filterNomeHistorico}
                    onChange={e => setFilterNomeHistorico(e.target.value)}
                    placeholder="Filtrar por nome..."
                    className="w-full px-4 py-2 border text-gray-500 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Pessoa</label>
                  <input
                    type="text"
                    value={filterParticipanteHistorico}
                    onChange={e => setFilterParticipanteHistorico(e.target.value)}
                    placeholder="Filtrar por participante..."
                    className="w-full px-4 py-2 border text-gray-500 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            <EventsTable eventos={filteredEventosHistoricos} isHistorical={true} />
          </>
        )}

        {/* Create Event Modal */}
        {isLider && isModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl text-black font-semibold">Criar Novo Evento</h2>
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="text-gray-400 hover:text-gray-600 transition"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Nome do Evento *
                    </label>
                    <input
                      type="text"
                      value={nome}
                      onChange={e => setNome(e.target.value)}
                      className="w-full px-4 py-2 text-gray-500 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Digite o nome do evento"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Data de Início *
                      </label>
                      <input
                        type="date"
                        value={dataInicio}
                        onChange={e => setDataInicio(e.target.value)}
                        className="w-full px-4 py-2 text-gray-500 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Data de Fim *
                      </label>
                      <input
                        type="date"
                        value={dataFim}
                        onChange={e => setDataFim(e.target.value)}
                        className="w-full px-4 py-2 text-gray-500 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-6 pt-6 border-t">
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition font-medium"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={criarEventoApp}
                    disabled={!nome || !dataInicio || !dataFim}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition font-medium"
                  >
                    Criar Evento
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </ProtectedPage>
  );
}
