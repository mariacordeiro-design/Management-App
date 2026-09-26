"use client";

import ProtectedPage from "@/src/components/ProtectedPage";
import { criarTurno, getAllDepartments, getAllUsers } from "@/src/app/api/airtable/airtable";
import { getPeopleAvailability } from "@/src/app/api/crab/api";
import { CalendarDays, Copy, Info, RefreshCw, SlidersHorizontal, Users } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import Link from "next/link";


function ParameterInfo({ label, description }: { label: string; description: string }) {
  const [open, setOpen] = useState(false);
  const descriptionId = useId();

  return (
    <span className="inline">
      <button
        type="button"
        aria-label={"Informação sobre " + label}
        aria-expanded={open}
        aria-controls={descriptionId}
        onClick={event => {
          event.preventDefault();
          setOpen(current => !current);
        }}
        onKeyDown={event => {
          if (event.key === "Escape") {
            event.preventDefault();
            setOpen(false);
          }
        }}
        className="ml-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full align-middle text-blue-600 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <Info className="h-4 w-4" aria-hidden="true" />
      </button>
      <span
        id={descriptionId}
        hidden={!open}
        className={open ? "mt-1 block rounded-md bg-blue-50 p-2 text-xs font-normal leading-relaxed text-blue-900" : "hidden"}
      >
        {description}
      </span>
    </span>
  );
}

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

interface CandidateShift {
  id: string;
  day: number;
  startMinutes: number;
  endMinutes: number;
  availableIds: string[];
}

interface GeneratedShift extends CandidateShift {
  assignedIds: string[];
  responsibleId: string;
}

interface ScheduleResult {
  shifts: GeneratedShift[];
  warnings: string[];
  totals: Record<string, number>;
}

const CRAB_EVENTS = {
  presencial: "tlmoto-940143",
};

const DAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const minutesToTime = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
};

const convertCrabFitAvailabilityToTimeSlots = (crabAvailability: string[]): TimeSlot[] => {
  const timeSlots: TimeSlot[] = [];
  const processedSlots = new Set<string>();

  crabAvailability.forEach(slot => {
    const match = slot.match(/^(\d{2})(\d{2})-(\d+)$/);
    if (!match) return;

    const hour = parseInt(match[1], 10);
    const minute = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);

    if (minute % 30 !== 0) return;

    const slotKey = `${day}-${hour}-${minute}`;
    if (!processedSlots.has(slotKey)) {
      timeSlots.push({ day, hour, minute });
      processedSlots.add(slotKey);
    }
  });

  return timeSlots;
};

export default function GeradorTurnos() {
  const [people, setPeople] = useState<Person[]>([]);
  const [availability, setAvailability] = useState<AvailabilityData>({});
  const [departments, setDepartments] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<ScheduleResult | null>(null);
  const [expandedShiftId, setExpandedShiftId] = useState<string | null>(null);

  const [weekDate, setWeekDate] = useState("");
  const [selectedShiftIds, setSelectedShiftIds] = useState<string[]>([]);
  const [shiftNames, setShiftNames] = useState<Record<string, string>>({});
  const [savedKeys, setSavedKeys] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);
  const [saveMessage, setSaveMessage] = useState("");

  const [peoplePerShift, setPeoplePerShift] = useState(3);
  const [shiftDurationHours, setShiftDurationHours] = useState(3);
  const [shiftsPerDay, setShiftsPerDay] = useState(2);
  const [maxShiftsPerPersonDay, setMaxShiftsPerPersonDay] = useState(1);
  const [globalStartHour, setGlobalStartHour] = useState(8);
  const [globalEndHour, setGlobalEndHour] = useState(21);
  const [selectedResponsibleIds, setSelectedResponsibleIds] = useState<string[]>([]);
  const [maxResponsibleShiftsPerDay, setMaxResponsibleShiftsPerDay] = useState(2);
  const [responsibleTargetHoursPerWeek, setResponsibleTargetHoursPerWeek] = useState(9);
  const [targetHoursPerPersonWeek, setTargetHoursPerPersonWeek] = useState(6);
  const [weeklyToleranceHours, setWeeklyToleranceHours] = useState(1.5);
  const [selectedArea, setSelectedArea] = useState("");
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [allowOverlappingShifts, setAllowOverlappingShifts] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      try {
        setIsLoading(true);
        const [allUsers, allDepartments] = await Promise.all([getAllUsers(), getAllDepartments()]);
        if (!mounted) return;

        const mappedPeople: Person[] = allUsers.map(user => ({
          id: user.id,
          name: user.nome,
          area: user.department,
          istId: user.istId?.toString(),
        }));

        setPeople(mappedPeople);
        setDepartments(allDepartments);

        const peopleAvailability = await getPeopleAvailability(CRAB_EVENTS.presencial);
        if (!mounted) return;

        const nextAvailability: AvailabilityData = {};
        peopleAvailability.forEach(person => {
          let matchingUser: Person | undefined;

          if (/^\d+$/.test(person.name)) {
            matchingUser = mappedPeople.find(user => user.istId === person.name);
          }

          if (!matchingUser) {
            matchingUser = mappedPeople.find(user => user.id === person.name);
          }

          if (!matchingUser) {
            matchingUser = mappedPeople.find(user => user.name === person.name);
          }

          if (matchingUser && person.availability?.length) {
            nextAvailability[matchingUser.id] = convertCrabFitAvailabilityToTimeSlots(
              person.availability
            );
          }
        });

        setAvailability(nextAvailability);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    loadData();

    return () => {
      mounted = false;
    };
  }, []);

  const eligiblePeople = useMemo(() => {
    if (!selectedArea) return people;
    const areaFilter = normalize(selectedArea);
    return people.filter(person => normalize(person.area || "") === areaFilter);
  }, [people, selectedArea]);

  const suggestedHoursPerPersonWeek = useMemo(() => {
    if (eligiblePeople.length === 0) return 0;

    const totalHoursNeeded =
      selectedDays.length * shiftsPerDay * peoplePerShift * shiftDurationHours;

    return Math.round((totalHoursNeeded / eligiblePeople.length) * 10) / 10;
  }, [
    eligiblePeople.length,
    peoplePerShift,
    selectedDays.length,
    shiftDurationHours,
    shiftsPerDay,
  ]);

  const generateSchedule = async () => {
    if (savingRef.current) return;
    setSelectedShiftIds([]);
    setShiftNames({});
    setSaveMessage("");
    setIsGenerating(true);
    try {
      const response = await fetch("/api/optimize_shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          people,
          availability,
          peoplePerShift,
          shiftDurationHours,
          shiftsPerDay,
          maxShiftsPerPersonDay,
          globalStartHour,
          globalEndHour,
          selectedResponsibleIds,
          maxResponsibleShiftsPerDay,
          responsibleTargetHoursPerWeek,
          targetHoursPerPersonWeek,
          weeklyToleranceHours,
          selectedArea,
          selectedDays,
          allowOverlappingShifts,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível otimizar os turnos.");
      setResult(data as ScheduleResult);
    } catch (error) {
      setResult({
        shifts: [],
        totals: {},
        warnings: [error instanceof Error ? error.message : "Erro desconhecido no otimizador."],
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const getPersonName = (id: string) => people.find(person => person.id === id)?.name || id;

  const shiftDate = (shift: GeneratedShift) => {
    const now = new Date();
    const date = new Date(weekDate + "T12:00:00");
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
    if (date < today) date.setTime(today.getTime());
    date.setDate(date.getDate() + ((shift.day - date.getDay() + 7) % 7));
    const start = new Date(date);
    start.setHours(Math.floor(shift.startMinutes / 60), shift.startMinutes % 60, 0, 0);
    if (start <= now) date.setDate(date.getDate() + 7);
    return [String(date.getDate()).padStart(2, "0"), String(date.getMonth() + 1).padStart(2, "0"), date.getFullYear()].join("/");
  };

  const suggestedShiftName = (shift: GeneratedShift) =>
    "Turno - " + DAYS[shift.day] + " " + minutesToTime(shift.startMinutes) + "-" + minutesToTime(shift.endMinutes);

  const shiftKey = (shift: GeneratedShift) => JSON.stringify([
    shiftDate(shift), shift.startMinutes, shift.endMinutes,
    shift.responsibleId, [...shift.assignedIds].sort(),
  ]);

  const saveSelectedShifts = async () => {
    if (savingRef.current || !result || !weekDate) return;
    const selected = result.shifts.filter(shift =>
      selectedShiftIds.includes(shift.id) && !savedKeys.includes(shiftKey(shift))
    );
    if (!selected.length) return;
    savingRef.current = true;
    setIsSaving(true);
    setSaveMessage("");
    let saved = 0;
    try {
      for (const shift of selected) {
        await criarTurno({
          nome: shiftNames[shift.id]?.trim() || suggestedShiftName(shift),
          data: shiftDate(shift),
          horaInicio: minutesToTime(shift.startMinutes),
          horaFim: minutesToTime(shift.endMinutes),
          eventoId: "",
          participantesIds: [...new Set([...shift.assignedIds, shift.responsibleId])],
          responsavelId: shift.responsibleId,
          tipo: "Turno",
          isRecurring: false,
        });
        saved++;
        setSavedKeys(current => [...current, shiftKey(shift)]);
        setSelectedShiftIds(current => current.filter(id => id !== shift.id));
      }
      setSaveMessage(saved + " turno(s) adicionado(s) ao calendário e aos perfis dos participantes.");
    } catch {
      setSaveMessage(saved + " turno(s) guardado(s). Falha ao guardar os restantes. Verifica o calendário antes de tentar novamente.");
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  const getPersonArea = (id: string) =>
    people.find(person => person.id === id)?.area || "Sem Departamento";

  const copySchedule = async () => {
    if (!result) return;

    const text = result.shifts
      .map(shift => {
        const assignedNames = shift.assignedIds.map(getPersonName).join(", ");
        return `${DAYS[shift.day]} ${minutesToTime(shift.startMinutes)}-${minutesToTime(
          shift.endMinutes
        )}: ${assignedNames}`;
      })
      .join("\n");

    await navigator.clipboard.writeText(text);
  };

  const generatedByDay = useMemo(() => {
    const grouped = new Map<number, GeneratedShift[]>();
    result?.shifts.forEach(shift => {
      const shifts = grouped.get(shift.day) || [];
      shifts.push(shift);
      grouped.set(shift.day, shifts);
    });
    grouped.forEach(shifts => shifts.sort((a, b) => a.startMinutes - b.startMinutes));
    return grouped;
  }, [result]);

  const sortedTotals = useMemo(() => {
    if (!result) return [];
    return eligiblePeople
      .map(person => ({
        ...person,
        targetHours: selectedResponsibleIds.includes(person.id) ? responsibleTargetHoursPerWeek : targetHoursPerPersonWeek,
        turns: result.totals[person.id] || 0,
        hours: (result.totals[person.id] || 0) * shiftDurationHours,
      }))
      .sort((a, b) => b.turns - a.turns || a.name.localeCompare(b.name));
  }, [eligiblePeople, result, shiftDurationHours, selectedResponsibleIds, responsibleTargetHoursPerWeek, targetHoursPerPersonWeek]);

  const peopleWithShifts = sortedTotals.filter(person => person.turns > 0);
  const peopleWithoutShifts = sortedTotals.filter(person => person.turns === 0);

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

  return (
    <ProtectedPage>
      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-blue-500">Gerador de Turnos</h1>
          <p className="mt-2 text-sm text-gray-200">
            Gera uma proposta automática com base nas disponibilidades do CrabFit.
          </p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-6">
          <section className="bg-white rounded-lg shadow p-5 h-fit">
            <div className="flex items-center gap-2 mb-5">
              <SlidersHorizontal className="h-5 w-5 text-blue-600" />
              <h2 className="text-lg font-semibold text-gray-900">Parâmetros</h2>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <label htmlFor="parameter-peoplePerShift" className="block">
                <span className="text-sm font-medium text-gray-700">Pessoas/turno<ParameterInfo label="Pessoas/turno" description="Total de pessoas em cada turno, incluindo um responsável e os restantes ajudantes." /></span>
                <input id="parameter-peoplePerShift"
                  type="number"
                  min={1}
                  value={peoplePerShift}
                  onChange={event => setPeoplePerShift(Number(event.target.value))}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900"
                />
              </label>

              <label htmlFor="parameter-shiftDurationHours" className="block">
                <span className="text-sm font-medium text-gray-700">Duração<ParameterInfo label="Duração" description="Duração de cada turno em horas. Por exemplo, 1,5 corresponde a 1 hora e 30 minutos." /></span>
                <input id="parameter-shiftDurationHours"
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={shiftDurationHours}
                  onChange={event => setShiftDurationHours(Number(event.target.value))}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900"
                />
              </label>

              <label htmlFor="parameter-shiftsPerDay" className="block">
                <span className="text-sm font-medium text-gray-700">Turnos/dia<ParameterInfo label="Turnos/dia" description="Número de turnos pretendido por dia. Podem ser gerados menos se faltarem pessoas disponíveis dentro dos limites." /></span>
                <input id="parameter-shiftsPerDay"
                  type="number"
                  min={1}
                  value={shiftsPerDay}
                  onChange={event => setShiftsPerDay(Number(event.target.value))}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900"
                />
              </label>

              <label htmlFor="parameter-maxShiftsPerPersonDay" className="block">
                <span className="text-sm font-medium text-gray-700">Máx./pessoa/dia<ParameterInfo label="Máx./pessoa/dia" description="Máximo de turnos por dia para cada ajudante. As pessoas da lista de responsáveis usam o limite de responsáveis." /></span>
                <input id="parameter-maxShiftsPerPersonDay"
                  type="number"
                  min={1}
                  value={maxShiftsPerPersonDay}
                  onChange={event => setMaxShiftsPerPersonDay(Number(event.target.value))}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900"
                />
              </label>

              <label htmlFor="parameter-globalStartHour" className="block">
                <span className="text-sm font-medium text-gray-700">Início<ParameterInfo label="Início" description="Hora mais cedo a que um turno pode começar, no formato de 0 a 23 horas." /></span>
                <input id="parameter-globalStartHour"
                  type="number"
                  min={0}
                  max={23}
                  value={globalStartHour}
                  onChange={event => setGlobalStartHour(Number(event.target.value))}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900"
                />
              </label>

              <label htmlFor="parameter-globalEndHour" className="block">
                <span className="text-sm font-medium text-gray-700">Fim<ParameterInfo label="Fim" description="Hora até à qual todos os turnos devem terminar. O valor 24 corresponde à meia-noite." /></span>
                <input id="parameter-globalEndHour"
                  type="number"
                  min={1}
                  max={24}
                  value={globalEndHour}
                  onChange={event => setGlobalEndHour(Number(event.target.value))}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900"
                />
              </label>

              <label htmlFor="parameter-targetHoursPerPersonWeek" className="block">
                <span className="text-sm font-medium text-gray-700">Horas ajudantes/semana<ParameterInfo label="Horas ajudantes/semana" description="Alvo semanal de horas por ajudante. O máximo permitido é este valor mais a tolerância; pode receber menos horas." /></span>
                <input id="parameter-targetHoursPerPersonWeek"
                  type="number"
                  min={0}
                  step={0.5}
                  value={targetHoursPerPersonWeek}
                  onChange={event => setTargetHoursPerPersonWeek(Number(event.target.value))}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900"
                />
              </label>

              <label htmlFor="parameter-weeklyToleranceHours" className="block">
                <span className="text-sm font-medium text-gray-700">Tolerância<ParameterInfo label="Tolerância" description="Horas adicionais permitidas acima do alvo semanal, tanto para ajudantes como para responsáveis. Usa 0 para não ultrapassar o alvo." /></span>
                <input id="parameter-weeklyToleranceHours"
                  type="number"
                  min={0}
                  step={0.5}
                  value={weeklyToleranceHours}
                  onChange={event => setWeeklyToleranceHours(Number(event.target.value))}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900"
                />
              </label>
            </div>

            <p className="mt-3 text-xs text-gray-600">
              O máximo semanal de cada pessoa é o alvo do seu grupo + tolerância.
              Se não houver disponibilidade suficiente dentro desses limites, serão gerados menos turnos.
            </p>

            <div className="mt-3 rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-900">
              Sugestão automática pela carga total: {suggestedHoursPerPersonWeek}h por pessoa.
            </div>

            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <label htmlFor="parameter-responsibleTargetHoursPerWeek" className="block">
                  <span className="text-sm font-medium text-gray-700">
                    Horas responsáveis/semana<ParameterInfo label="Horas responsáveis/semana" description="Alvo semanal por pessoa da lista de responsáveis, contando também os turnos em que participa como ajudante. O máximo é o alvo mais a tolerância." />
                  </span>
                  <input id="parameter-responsibleTargetHoursPerWeek"
                    type="number"
                    min={0}
                    step={0.5}
                    value={responsibleTargetHoursPerWeek}
                    onChange={event => setResponsibleTargetHoursPerWeek(Number(event.target.value))}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900"
                  />
                </label>
                <label htmlFor="parameter-maxResponsibleShiftsPerDay" className="block">
                  <span className="text-sm font-medium text-gray-700">Máx. responsável/dia<ParameterInfo label="Máx. responsável/dia" description="Máximo de turnos por dia para cada pessoa da lista de responsáveis, mesmo quando participa como ajudante." /></span>
                  <input id="parameter-maxResponsibleShiftsPerDay"
                    type="number"
                    min={1}
                    value={maxResponsibleShiftsPerDay}
                    onChange={event => setMaxResponsibleShiftsPerDay(Number(event.target.value))}
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900"
                  />
                </label>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">Possíveis responsáveis<ParameterInfo label="Possíveis responsáveis" description="Pessoas que podem assumir a responsabilidade de um turno. Cada turno precisa de exatamente uma delas disponível." /></p>
                <div className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-md border border-gray-300 p-2">
                  {eligiblePeople.map(person => (
                    <label
                      key={person.id}
                      className="flex items-center gap-2 rounded px-2 py-1 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        checked={selectedResponsibleIds.includes(person.id)}
                        onChange={event =>
                          setSelectedResponsibleIds(current =>
                            event.target.checked
                              ? [...current, person.id]
                              : current.filter(id => id !== person.id)
                          )
                        }
                      />
                      <span>{person.name}</span>
                      <span className="ml-auto text-xs text-gray-400">{person.area}</span>
                    </label>
                  ))}
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Cada turno terá exatamente um responsável desta lista.
                </p>
              </div>

              <label htmlFor="parameter-selectedArea" className="block">
                <span className="text-sm font-medium text-gray-700">Filtrar pessoas por área<ParameterInfo label="Filtrar pessoas por área" description="Restringe a proposta a pessoas do departamento escolhido. Todas as áreas inclui todos os departamentos." /></span>
                <select id="parameter-selectedArea"
                  value={selectedArea}
                  onChange={event => setSelectedArea(event.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900"
                >
                  <option value="">Todas as áreas</option>
                  {departments.map(department => (
                    <option key={department} value={department}>
                      {department}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-5">
              <p className="text-sm font-medium text-gray-700 mb-2">Dias<ParameterInfo label="Dias" description="Dias da semana em que serão procurados turnos. A semana concreta é escolhida depois, ao guardar a proposta." /></p>
              <div className="grid grid-cols-2 gap-2">
                {WEEK_ORDER.map(day => (
                  <label
                    key={day}
                    className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700"
                  >
                    <input
                      type="checkbox"
                      checked={selectedDays.includes(day)}
                      onChange={event => {
                        setSelectedDays(current =>
                          event.target.checked
                            ? [...current, day].sort(
                                (a, b) => WEEK_ORDER.indexOf(a) - WEEK_ORDER.indexOf(b)
                              )
                            : current.filter(selectedDay => selectedDay !== day)
                        );
                      }}
                    />
                    {DAYS[day]}
                  </label>
                ))}
              </div>
            </div>

            <label htmlFor="parameter-overlap" className="mt-4 flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                id="parameter-overlap"
                checked={allowOverlappingShifts}
                onChange={event => setAllowOverlappingShifts(event.target.checked)}
              />
              Permitir turnos sobrepostos<ParameterInfo label="Permitir turnos sobrepostos" description="Permite gerar turnos cujos horários coincidem total ou parcialmente." />
            </label>

            <button
              onClick={generateSchedule}
              disabled={
                isGenerating || isSaving ||
                selectedDays.length === 0 ||
                eligiblePeople.length === 0 ||
                selectedResponsibleIds.length === 0
              }
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400"
            >
              <RefreshCw className={`h-4 w-4 ${isGenerating ? "animate-spin" : ""}`} />
              Gerar turnos
            </button>
          </section>

          <section className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-lg shadow p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-600">Pessoas usadas</p>
                  <Users className="h-5 w-5 text-blue-600" />
                </div>
                <p className="mt-2 text-3xl font-bold text-gray-900">{eligiblePeople.length}</p>
              </div>

              <div className="bg-white rounded-lg shadow p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-600">Com disponibilidade</p>
                  <CalendarDays className="h-5 w-5 text-green-600" />
                </div>
                <p className="mt-2 text-3xl font-bold text-gray-900">
                  {eligiblePeople.filter(person => availability[person.id]?.length).length}
                </p>
              </div>

              <div className="bg-white rounded-lg shadow p-5">
                <p className="text-sm font-medium text-gray-600">Possíveis responsáveis</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">
                  {selectedResponsibleIds.length}
                </p>
              </div>

              <div className="bg-white rounded-lg shadow p-5">
                <p className="text-sm font-medium text-gray-600">Alvo semanal</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">{targetHoursPerPersonWeek}h</p>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="flex flex-col gap-3 border-b bg-gray-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Proposta gerada</h2>
                <button
                  onClick={copySchedule}
                  disabled={!result?.shifts.length}
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-400"
                >
                  <Copy className="h-4 w-4" />
                  Copiar
                </button>
              </div>

              {!result ? (
                <div className="p-8 text-center text-gray-500">
                  Define os parâmetros e gera a primeira proposta.
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {result.shifts.length > 0 && (
                    <div className="space-y-3 p-4 text-sm text-gray-700">
                      <p>Seleciona a data a partir da qual queres marcar os turnos. Cada turno fica na próxima ocorrência do seu dia da semana; se o horário de hoje já passou, fica para a semana seguinte.</p>
                      <div className="flex flex-wrap gap-3">
                        <label>Marcar turnos a partir de
                          <input type="date" value={weekDate} disabled={isSaving} onChange={event => { setWeekDate(event.target.value); setSelectedShiftIds([]); setSaveMessage(""); }} className="mt-1 block rounded border p-2" />
                        </label>
                      </div>
                      <button type="button" disabled={isSaving || isGenerating || !weekDate || !selectedShiftIds.length} onClick={saveSelectedShifts} className="rounded bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-50">
                        {isSaving ? "A guardar…" : "Adicionar selecionados ao calendário (" + selectedShiftIds.length + ")"}
                      </button>
                      {saveMessage && <p role="status">{saveMessage} <Link href="/calendario" className="text-blue-700 underline">Ver calendário</Link></p>}
                    </div>
                  )}
                  {result.warnings.length > 0 && (
                    <div className="bg-yellow-50 p-4 text-sm text-yellow-900">
                      {result.warnings.map(warning => (
                        <p key={warning}>{warning}</p>
                      ))}
                    </div>
                  )}

                  {WEEK_ORDER.filter(day => generatedByDay.has(day)).map(day => (
                    <div key={day} className="p-4">
                      <h3 className="mb-3 font-semibold text-gray-900">{DAYS[day]}</h3>
                      <div className="space-y-3">
                        {(generatedByDay.get(day) || []).map(shift => (
                          <div
                            key={shift.id}
                            className="rounded-md border border-gray-200 p-3"
                          >
                            <label className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-700">
                              <input type="checkbox" checked={selectedShiftIds.includes(shift.id)} disabled={isSaving || isGenerating || !weekDate || savedKeys.includes(shiftKey(shift))} onChange={event => setSelectedShiftIds(current => event.target.checked ? [...current, shift.id] : current.filter(id => id !== shift.id))} />
                              {savedKeys.includes(shiftKey(shift)) ? "Adicionado ao calendário" : "Selecionar turno"}
                              {weekDate && <span>· {shiftDate(shift)}</span>}
                            </label>
                            {selectedShiftIds.includes(shift.id) && (
                              <label className="mb-3 block text-sm font-medium text-gray-700">
                                Nome do turno
                                <input
                                  type="text"
                                  value={shiftNames[shift.id] ?? suggestedShiftName(shift)}
                                  onChange={event => setShiftNames(current => ({
                                    ...current,
                                    [shift.id]: event.target.value,
                                  }))}
                                  disabled={isSaving}
                                  placeholder={suggestedShiftName(shift)}
                                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-gray-900 disabled:bg-gray-100"
                                />
                                <span className="mt-1 block text-xs font-normal text-gray-500">
                                  Se ficar vazio, será usado o nome sugerido.
                                </span>
                              </label>
                            )}
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                              <p className="font-semibold text-blue-700">
                                {minutesToTime(shift.startMinutes)}-
                                {minutesToTime(shift.endMinutes)}
                              </p>
                              <p className="text-xs text-gray-500">
                                {shift.availableIds.length} pessoas disponíveis
                              </p>
                            </div>
                            <p className="mt-2 text-sm font-medium text-purple-700">
                              Responsável: {getPersonName(shift.responsibleId)}
                            </p>
                            <p className="mt-3 text-xs font-medium uppercase tracking-wide text-gray-500">
                              Ajudantes atribuídos
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {shift.assignedIds
                                .filter(id => id !== shift.responsibleId)
                                .map(id => (
                                  <span
                                    key={id}
                                    title={getPersonArea(id)}
                                    className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-800"
                                  >
                                    {getPersonName(id)}
                                  </span>
                                ))}
                            </div>

                            <button type="button" aria-expanded={expandedShiftId === shift.id} onClick={() => setExpandedShiftId(current => current === shift.id ? null : shift.id)} className="mt-3 text-sm text-blue-700 underline">
                              {expandedShiftId === shift.id ? "Ocultar detalhes" : "Ver detalhes"}
                            </button>
                            {expandedShiftId === shift.id && (
                              <div className="mt-4 border-t border-gray-200 pt-4">
                                <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                                  <div>
                                    <dt className="text-gray-500">Duração</dt>
                                    <dd className="font-medium text-gray-900">
                                      {(shift.endMinutes - shift.startMinutes) / 60}h
                                    </dd>
                                  </div>
                                  <div>
                                    <dt className="text-gray-500">Responsável</dt>
                                    <dd className="font-medium text-purple-700">
                                      {getPersonName(shift.responsibleId)}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt className="text-gray-500">Total disponível</dt>
                                    <dd className="font-medium text-gray-900">
                                      {shift.availableIds.length}
                                    </dd>
                                  </div>
                                </dl>

                                <p className="mt-4 text-xs font-medium uppercase tracking-wide text-gray-500">
                                  Pessoas disponíveis neste horário
                                </p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {shift.availableIds
                                    .slice()
                                    .sort((a, b) =>
                                      getPersonName(a).localeCompare(getPersonName(b))
                                    )
                                    .map(id => (
                                      <span
                                        key={id}
                                        title={getPersonArea(id)}
                                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                                          id === shift.responsibleId
                                            ? "bg-purple-100 text-purple-800"
                                            : shift.assignedIds.includes(id)
                                              ? "bg-blue-100 text-blue-800"
                                              : "bg-gray-100 text-gray-700"
                                        }`}
                                      >
                                        {getPersonName(id)} · {getPersonArea(id)}
                                      </span>
                                    ))}
                                </div>
                                <p className="mt-3 text-xs text-gray-500">
                                  Roxo: responsável · Azul: ajudante atribuído · Cinzento:
                                  disponível
                                </p>
                              </div>
                            )}
                          </div>
                        ))}
                        {(generatedByDay.get(day) || []).length === 0 && (
                          <p className="text-sm text-gray-500">Sem turnos gerados.</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {result && (
              <div className="bg-white rounded-lg shadow p-5">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Carga por pessoa</h2>

                <div className="mb-6">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
                      Com turnos
                    </h3>
                    <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-800">
                      {peopleWithShifts.length}
                    </span>
                  </div>

                  {peopleWithShifts.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                      {peopleWithShifts.map(person => (
                        <div
                          key={person.id}
                          className="rounded-md border border-gray-200 bg-white p-3"
                        >
                          <p className="font-medium text-gray-900">{person.name}</p>
                          <p className="text-xs text-gray-500">{person.area}</p>
                          <p
                            className={`mt-2 text-sm font-medium ${
                              person.hours > person.targetHours + weeklyToleranceHours ||
                              person.hours < person.targetHours - weeklyToleranceHours
                                ? "text-yellow-700"
                                : "text-green-700"
                            }`}
                          >
                            {person.turns} turnos | {person.hours}h
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            alvo {person.targetHours}h ± {weeklyToleranceHours}h
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-md border border-gray-200 p-3 text-sm text-gray-500">
                      Nenhuma pessoa recebeu turnos.
                    </p>
                  )}
                </div>

                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
                      Sem turnos
                    </h3>
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                      {peopleWithoutShifts.length}
                    </span>
                  </div>

                  {peopleWithoutShifts.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                      {peopleWithoutShifts.map(person => (
                        <div
                          key={person.id}
                          className="rounded-md border border-gray-200 bg-gray-50 p-3"
                        >
                          <p className="font-medium text-gray-700">{person.name}</p>
                          <p className="text-xs text-gray-500">{person.area}</p>
                          <p className="mt-2 text-sm font-medium text-gray-500">0 turnos | 0h</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-md border border-gray-200 p-3 text-sm text-gray-500">
                      Todas as pessoas selecionadas receberam pelo menos um turno.
                    </p>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </ProtectedPage>
  );
}
