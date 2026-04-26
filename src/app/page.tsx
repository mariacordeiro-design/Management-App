"use client";
import ProtectedPage from "../components/ProtectedPage";
import { useEffect, useState } from "react";
import { getEventosAtivos, getTurnosAtivosPorPessoa } from "./api/airtable/airtable";
import { useMembers } from "../components/MemberProvider";
import Link from "next/link";
import { useUser } from "../components/UserProvider";
import { Turno, Evento } from "../components/Interfaces";

/**
 * 
 * type User = {
  id: string;
  nome: string;
  department: string;
  funcao: string;
  istId: number;
};

  const { user, setUser, department, setDepartment, funcao, setFuncao };
  const hasPermission = (role: string): boolean => {
    const regex = /^(Sublíder|Líder)(?: de .+)?$/;
    return regex.test(role);
  };

  useEffect(() => {
    const fetchData = async () => {
      const data = await UserService.getUser(99461);
      setUser(data);
      setDepartment(data?.department || "");
      setFuncao(data?.funcao || "");
    }, [department, user?.funcao]);
    
    fetchData();
  }, [setUser, setDepartment]);

 */

/**
 * 
 * type User = {
  id: string;
  nome: string;
  department: string;
  funcao: string;
  istId: number;
};

  const { user, setUser, department, setDepartment, funcao, setFuncao };
  const hasPermission = (role: string): boolean => {
    const regex = /^(Sublíder|Líder)(?: de .+)?$/;
    return regex.test(role);
  };

  useEffect(() => {
    const fetchData = async () => {
      const data = await UserService.getUser(99461);
      setUser(data);
      setDepartment(data?.department || "");
      setFuncao(data?.funcao || "");
    }, [department, user?.funcao]);
    
    fetchData();
  }, [setUser, setDepartment]);

 */

export default function Home() {
  const { members } = useMembers();
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [meusTurnos, setMeusTurnos] = useState<Turno[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user: currentUser, isLoading: isUserLoading, isLider } = useUser();

  useEffect(() => {
    if (isUserLoading) {
      return;
    }

    const loadDashboardData = () => {
      setIsLoading(true);
      getEventosAtivos()
        .then(eventos => {
          setEventos(eventos || []);
        })
        .catch(error => {
          console.error("Erro ao carregar eventos: ", error);
        })
        .finally(() => {
          if (!currentUser) {
            console.error("Utilizador não autenticado.");
            setIsLoading(false);
            return;
          }
          getTurnosAtivosPorPessoa(currentUser.id)
            .then(turnos => {
              setMeusTurnos(turnos);
            })
            .catch(error => {
              console.error("Erro ao carregar meus turnos:", error);
            })
            .finally(() => {
              setIsLoading(false);
            });
        });
    };
    loadDashboardData();
  }, [currentUser, isUserLoading]);

  // Get active events (ongoing)
  const activeEvents = eventos.filter(evento => {
    const now = new Date();
    return new Date(evento.dataInicio) <= now && new Date(evento.dataFim) >= now;
  });

  // Get my events (if user is a participant)
  const myEvents = currentUser
    ? eventos.filter(evento => evento.participantes?.includes(currentUser.id))
    : [];

  const obterNomeParticipantes = (participantIds: string[]): string[] => {
    if (!members || members.length === 0) return Array.from(new Set(participantIds));

    const uniqueIds = Array.from(new Set(participantIds));

    return uniqueIds.map(id => {
      const member = members.find(m => m.id === id);
      return member ? member.nome : id;
    });
  };

  const obterNomeEvento = (eventoId: string): string => {
    const evento = eventos.find(e => e.id === eventoId);
    return evento ? evento.nome : eventoId;
  };

  const obterTituloTurno = (turno: Turno): string => {
    return turno.nome?.trim() || turno.idTurno || "Turno sem nome";
  };

  return (
    <ProtectedPage>
      <main className="min-h-screen pt-20 px-4 max-w-7xl mx-auto w-full">
        {/* Header */}
        <div className="mb-4">
          <h1 className="text-4xl text-white font-bold mb-2">Dashboard</h1>
          <p className="text-gray-300">Gestão de Eventos e Turnos</p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex items-center gap-3 text-white">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
              <span className="text-lg">Carregando...</span>
            </div>
          </div>
        ) : (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white rounded-lg shadow-sm p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Eventos Ativos</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">{activeEvents.length}</p>
                  </div>
                  <div className="bg-blue-100 rounded-full p-3">
                    <svg
                      className="w-8 h-8 text-blue-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Meus Turnos</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">{meusTurnos.length}</p>
                  </div>
                  <div className="bg-green-100 rounded-full p-3">
                    <svg
                      className="w-8 h-8 text-green-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">Meus Eventos</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">{myEvents.length}</p>
                  </div>
                  <div className="bg-purple-100 rounded-full p-3">
                    <svg
                      className="w-8 h-8 text-purple-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                      />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Ações Rápidas</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {isLider && (
                  <>
                    <Link
                      href="/gestao/eventos"
                      className="flex items-center gap-3 p-4 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition group"
                    >
                      <div className="bg-blue-100 rounded-lg p-3 group-hover:bg-blue-200 transition">
                        <svg
                          className="w-6 h-6 text-blue-600"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">Gerir Eventos</p>
                        <p className="text-sm text-gray-500">Ver e criar eventos</p>
                      </div>
                    </Link>

                    <Link
                      href="/gestao/turnos"
                      className="flex items-center gap-3 p-4 border-2 border-gray-200 rounded-lg hover:border-green-500 hover:bg-green-50 transition group"
                    >
                      <div className="bg-green-100 rounded-lg p-3 group-hover:bg-green-200 transition">
                        <svg
                          className="w-6 h-6 text-green-600"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">Gerir Turnos</p>
                        <p className="text-sm text-gray-500">Ver e atribuir turnos</p>
                      </div>
                    </Link>

                    <Link
                      href="/gestao/membros"
                      className="flex items-center gap-3 p-4 border-2 border-gray-200 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition group"
                    >
                      <div className="bg-purple-100 rounded-lg p-3 group-hover:bg-purple-200 transition">
                        <svg
                          className="w-6 h-6 text-purple-600"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                          />
                        </svg>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">Gerir Membros</p>
                        <p className="text-sm text-gray-500">Ver equipa</p>
                      </div>
                    </Link>
                  </>
                )}
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900">Meus Próximos Turnos</h2>
              </div>
              <div className="space-y-3">
                {[...meusTurnos]
                  .filter(turno => new Date(turno.dataFim) >= new Date())
                  .sort(
                    (a, b) => new Date(a.dataInicio).getTime() - new Date(b.dataInicio).getTime()
                  )
                  .map(turno => (
                    <div
                      key={turno.id}
                      className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
                    >
                      <div className="flex-1">
                        <h3 className="font-medium text-gray-900">
                          {obterTituloTurno(turno)}
                        </h3>
                        <p className="text-sm text-gray-500 mt-1">
                          {new Date(turno.dataInicio).toLocaleDateString("pt-PT", {
                            day: "2-digit",
                            month: "2-digit",
                          })}{" "}
                          {new Date(turno.dataInicio).toLocaleTimeString("pt-PT", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}{" "}
                          -{" "}
                          {new Date(turno.dataFim).toLocaleDateString("pt-PT", {
                            day: "2-digit",
                            month: "2-digit",
                          })}{" "}
                          {new Date(turno.dataFim).toLocaleTimeString("pt-PT", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <svg
                            className="w-4 h-4 text-gray-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                            />
                          </svg>
                          <span className="text-sm text-gray-600">
                            {turno.participantes?.length || 0} participantes
                          </span>
                        </div>
                      </div>
                      <div className="ml-4">
                        <span className="px-3 py-1 bg-blue-100 text-blue-700 text-sm font-medium rounded-full">
                          {Math.ceil(
                            (new Date(turno.dataInicio).getTime() - new Date().getTime()) /
                              (1000 * 60 * 60 * 24)
                          )}{" "}
                          dias
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900">Eventos Ativos Agora</h2>
                <Link
                  href="/gestao/eventos"
                  className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                >
                  Ver todos →
                </Link>
              </div>
              <div className="space-y-3">
                {activeEvents.map(evento => (
                  <div
                    key={evento.id}
                    className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        <h3 className="font-medium text-gray-900">{evento.nome}</h3>
                      </div>
                      <p className="text-sm text-gray-600 mt-1 ml-4">
                        Termina a{" "}
                        {new Date(evento.dataFim).toLocaleDateString("pt-PT", {
                          day: "numeric",
                          month: "long",
                        })}
                      </p>
                      <p className="text-sm text-gray-500 mt-1 ml-4">
                        {obterNomeParticipantes(evento.participantes || []).join(", ")}
                      </p>
                    </div>
                    <span className="px-3 py-1 bg-green-600 text-white text-sm font-medium rounded-full">
                      Em curso
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </main>
    </ProtectedPage>
  );
}
