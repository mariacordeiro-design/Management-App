"use client";

import ProtectedPage from "@/src/components/ProtectedPage";
import { useState, useEffect } from "react";
import { getAllUsers, getAllDepartments } from "@/src/app/api/airtable/airtable";
import { getPeopleAvailability } from "@/src/app/api/crab/api";

interface TimeSlot {
  day: number;
  hour: number;
  minute: number;
}

interface Person {
  id: string;
  name: string;
  area: string;
  istId?: string;
}

interface AvailabilityData {
  [personId: string]: TimeSlot[];
}

const DAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Segunda a Domingo

const START_HOUR = 8;

const TIME_SLOTS = Array.from({ length: 32 }, (_, i) => {
  // Calculamos os minutos somando o offset da hora de início (8h * 60min)
  const totalMinutes = i * 30 + START_HOUR * 60;

  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return { hour, minute };
});

const CRAB_EVENTS = {
  presencial: "tlmoto-940143",
};

export default function Disponibilidades() {
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedArea, setSelectedArea] = useState<string>("");
  const [availability, setAvailability] = useState<AvailabilityData>({});
  const [users, setUsers] = useState<Person[]>([]);
  const [filteredPeople, setFilteredPeople] = useState<Person[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [selectedPersonIds, setSelectedPersonIds] = useState<string[]>([]);

  // Função para converter CrabFit availability format para TimeSlot[]
  const convertCrabFitAvailabilityToTimeSlots = (crabAvailability: string[]): TimeSlot[] => {
    const timeSlots: TimeSlot[] = [];
    const processedSlots = new Set<string>();

    crabAvailability.forEach(slot => {
      // Format: "HHMM-D" (e.g., "0800-1" for Monday 08:00)
      const match = slot.match(/^(\d{2})(\d{2})-(\d+)$/);
      if (match) {
        const hour = parseInt(match[1]);
        const minute = parseInt(match[2]);
        const day = parseInt(match[3]);

        // Converter slots de 15 minutos do CrabFit para slots de 30 minutos nossos
        if (minute % 30 === 0) {
          const slotKey = `${day}-${hour}-${minute}`;
          if (!processedSlots.has(slotKey)) {
            timeSlots.push({ day, hour, minute });
            processedSlots.add(slotKey);
          }
        }
      }
    });

    return timeSlots;
  };

  // Normalize function for search
  const normalize = (s: string) =>
    s
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();

  // Get search suggestions
  const getSearchSuggestions = () => {
    if (!searchTerm.trim()) return [];

    const searchFilter = normalize(searchTerm.trim());
    return users
      .filter(
        person =>
          normalize(person.name).includes(searchFilter) && !selectedPersonIds.includes(person.id)
      )
      .slice(0, 10); // Limit to 5 suggestions
  };

  // Handle person selection from suggestions
  const handlePersonSelect = (person: Person) => {
    setSelectedPersonIds(prev => [...prev, person.id]);
    setSearchTerm("");
    setShowSuggestions(false);
  };

  // Handle person removal
  const handlePersonRemove = (personId: string) => {
    setSelectedPersonIds(prev => prev.filter(id => id !== personId));
  };

  // Clear all selected people
  const clearSelectedPeople = () => {
    setSelectedPersonIds([]);
  };

  // Filtrar pessoas baseado nos selecionados e área
  useEffect(() => {
    let filtered = users;

    // Filter by selected people (if any are selected)
    if (selectedPersonIds.length > 0) {
      filtered = filtered.filter(person => selectedPersonIds.includes(person.id));
    }

    // Filter by area
    if (selectedArea !== "") {
      const areaFilter = normalize(selectedArea);
      filtered = filtered.filter(person => normalize(person.area || "") === areaFilter);
    }

    setFilteredPeople(filtered);
  }, [selectedPersonIds, selectedArea, users]);

  // Load data
  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      try {
        setIsLoading(true);

        // Load users from Airtable
        const allUsers = await getAllUsers();
        if (!mounted) return;

        const mappedUsers: Person[] = allUsers.map(u => ({
          id: u.id,
          name: u.nome,
          area: u.department,
          istId: u.istId?.toString(),
        }));

        setUsers(mappedUsers);
        setFilteredPeople(mappedUsers);

        // Load availability for all people from the CRAB event
        try {
          const peopleAvailability = await getPeopleAvailability(CRAB_EVENTS.presencial);

          if (!mounted) return;

          const availabilityData: AvailabilityData = {};

          // Process each person from CRAB API
          peopleAvailability.forEach(person => {
            if (!person.availability || person.availability.length === 0) return;

            let matchingUser: Person | undefined;

            // 1. Try to match by IST ID (if person.name is a number)
            if (/^\d+$/.test(person.name)) {
              matchingUser = mappedUsers.find(user => user.istId === person.name);
            }

            // 2. Try to match by Airtable Record ID
            if (!matchingUser) {
              matchingUser = mappedUsers.find(user => user.id === person.name);
            }

            // 3. Try to match by name (exact match)
            if (!matchingUser) {
              matchingUser = mappedUsers.find(user => user.name === person.name);
            }

            if (matchingUser) {
              const convertedSlots = convertCrabFitAvailabilityToTimeSlots(person.availability);
              availabilityData[matchingUser.id] = convertedSlots;
            }
          });

          setAvailability(availabilityData);
        } catch (err) {
          if (mounted) {
            setAvailability({});
          }
        }
      } catch (err) {
        // Silent error handling
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    loadData();

    return () => {
      mounted = false;
    };
  }, []);

  // Load departments from Airtable
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const deps = await getAllDepartments();
        if (mounted) setDepartments(deps);
      } catch (err) {
        // Silent error handling
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Calcular quantas pessoas (filtradas) estão disponíveis num slot específico
  const getSlotCount = (day: number, hour: number, minute: number) => {
    return filteredPeople.reduce((count, person) => {
      const personSlots = availability[person.id] || [];
      return personSlots.some(
        slot => slot.day === day && slot.hour === hour && slot.minute === minute
      )
        ? count + 1
        : count;
    }, 0);
  };

  // Calcular percentagem de disponibilidade para um slot
  const getSlotPercentage = (day: number, hour: number, minute: number) => {
    const count = getSlotCount(day, hour, minute);
    const totalPeople = filteredPeople.length || 1;
    return totalPeople ? Math.round((count / totalPeople) * 100) : 0;
  };

  // Obter cor baseada na percentagem de disponibilidade
  const getSlotColor = (day: number, hour: number, minute: number) => {
    const percentage = getSlotPercentage(day, hour, minute);
    if (percentage === 0) return "bg-gray-100";
    if (percentage <= 25) return "bg-red-200";
    if (percentage <= 50) return "bg-yellow-200";
    if (percentage <= 75) return "bg-blue-200";
    return "bg-green-300";
  };

  // Obter lista de pessoas disponíveis num slot específico
  const getPeopleAtSlot = (day: number, hour: number, minute: number) => {
    const peopleAtSlot: string[] = [];
    filteredPeople.forEach(person => {
      const personSlots = availability[person.id] || [];
      if (
        personSlots.some(slot => slot.day === day && slot.hour === hour && slot.minute === minute)
      ) {
        peopleAtSlot.push(person.name);
      }
    });
    return peopleAtSlot;
  };

  const getOverallStats = () => {
    let totalSlots = 0;
    let availableSlots = 0;

    TIME_SLOTS.forEach(timeSlot => {
      DAYS.forEach((_, dayIndex) => {
        totalSlots += filteredPeople.length;
        availableSlots += getSlotCount(dayIndex, timeSlot.hour, timeSlot.minute);
      });
    });

    return {
      totalPeople: filteredPeople.length,
      overallPercentage: totalSlots ? Math.round((availableSlots / totalSlots) * 100) : 0,
      totalHours: Math.round(availableSlots * 0.5 * 10) / 10,
    };
  };

  if (isLoading) {
    return (
      <ProtectedPage>
        <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
          </div>
        </main>
      </ProtectedPage>
    );
  }

  const suggestions = getSearchSuggestions();
  const selectedPeople = users.filter(person => selectedPersonIds.includes(person.id));

  return (
    <ProtectedPage>
      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold text-blue-500">Disponibilidades</h1>
          </div>

          {/* Motores de Busca */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="bg-white p-4 rounded-lg shadow">
              <label
                htmlFor="search-input"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Pesquisar por Nome:
              </label>
              <div className="relative">
                <input
                  id="search-input"
                  type="text"
                  value={searchTerm}
                  onChange={e => {
                    setSearchTerm(e.target.value);
                    setShowSuggestions(e.target.value.length > 0);
                  }}
                  onFocus={() => setShowSuggestions(searchTerm.length > 0)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  placeholder="Digite o nome da pessoa..."
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm 
                   focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-700"
                />

                {/* Dropdown de sugestões */}
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute z-50 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto mt-1">
                    {suggestions.map(person => (
                      <div
                        key={person.id}
                        onClick={() => handlePersonSelect(person)}
                        className="px-3 py-2 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                      >
                        <div className="font-medium text-gray-900">{person.name}</div>
                        {person.area && <div className="text-sm text-gray-500">{person.area}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Selected People */}
              {selectedPeople.length > 0 && (
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">
                      Pessoas selecionadas ({selectedPeople.length}):
                    </span>
                    <button
                      onClick={clearSelectedPeople}
                      className="text-xs text-red-600 hover:text-red-800"
                    >
                      Limpar todas
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedPeople.map(person => (
                      <div
                        key={person.id}
                        className="inline-flex items-center bg-blue-100 text-blue-800 text-sm px-2 py-1 rounded-full"
                      >
                        <span>{person.name}</span>
                        <button
                          onClick={() => handlePersonRemove(person.id)}
                          className="ml-1 text-blue-600 hover:text-blue-800"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white p-4 rounded-lg shadow">
              <label htmlFor="area-filter" className="block text-sm font-medium text-gray-700 mb-2">
                Filtrar por Área:
              </label>
              <select
                id="area-filter"
                value={selectedArea}
                onChange={e => setSelectedArea(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm 
                 focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-gray-700"
              >
                <option value="">Todas as Áreas</option>
                {departments.map(area => (
                  <option key={area} value={area}>
                    {area}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Calendário Agregado */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="p-4 border-b bg-gray-50">
              <h2 className="text-lg font-semibold text-gray-900">
                Calendário de Disponibilidades
              </h2>
            </div>

            <div className="overflow-x-auto">
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
                <tbody className="bg-white divide-y divide-gray-200">
                  {TIME_SLOTS.map((timeSlot, slotIndex) => (
                    <tr key={slotIndex}>
                      <td className="px-4 z-9 whitespace-nowrap text-sm font-medium text-gray-900 sticky left-0 bg-white border-r">
                        {timeSlot.hour.toString().padStart(2, "0")}:
                        {timeSlot.minute.toString().padStart(2, "0")}
                      </td>

                      {WEEK_ORDER.map(dayIndex => {
                        const count = getSlotCount(dayIndex, timeSlot.hour, timeSlot.minute);
                        const percentage = getSlotPercentage(
                          dayIndex,
                          timeSlot.hour,
                          timeSlot.minute
                        );
                        const peopleAtSlot = getPeopleAtSlot(
                          dayIndex,
                          timeSlot.hour,
                          timeSlot.minute
                        );

                        return (
                          <td key={dayIndex} className="w-20 sm:w-24 md:w-28 px-1 py-1">
                            <div
                              className={`
                                h-8 sm:h-10 w-full border border-gray-300 transition-all duration-200 rounded
                                ${getSlotColor(dayIndex, timeSlot.hour, timeSlot.minute)}
                                flex items-center justify-center relative group cursor-pointer
                              `}
                              title={`${count}/${filteredPeople.length} pessoas (${percentage}%)\n${peopleAtSlot.join(", ")}`}
                            >
                              <span className="text-xs font-medium text-gray-700">
                                {count > 0 ? count : ""}
                              </span>

                              {/* Tooltip on hover */}
                              {peopleAtSlot.length > 0 && (
                                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity z-20 whitespace-nowrap pointer-events-none">
                                  <div className="font-semibold">
                                    {count}/{filteredPeople.length} pessoas ({percentage}%)
                                  </div>
                                  <div className="mt-1">{peopleAtSlot.join(", ")}</div>
                                </div>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        {/* Estatísticas Gerais */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Estatísticas Gerais</h3>
          {(() => {
            const stats = getOverallStats();
            return (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-blue-600">{stats.totalPeople}</p>
                  <p className="text-sm text-gray-600">Pessoas</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">{stats.overallPercentage}%</p>
                  <p className="text-sm text-gray-600">Disponibilidade Média</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-purple-600">{stats.totalHours}h</p>
                  <p className="text-sm text-gray-600">Horas Totais Disponíveis</p>
                </div>
              </div>
            );
          })()}
        </div>
      </main>
    </ProtectedPage>
  );
}
