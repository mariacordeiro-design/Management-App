'use server';

import Airtable from 'airtable';
import {
  UserSchema,
  User,
  EventoSchema,
  Evento,
  TurnoSchema,
  Turno,
} from '@/src/components/Interfaces';

// --- CONFIGURAÇÃO INTERNA E SEGURA ---

const getAirtableBase = () => {
  const apiKey = process.env.API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;

  if (!apiKey || !baseId) {
    throw new Error(
      'Erro de Configuração: API_KEY ou AIRTABLE_BASE_ID não encontradas no ambiente.'
    );
  }

  const options: any = { apiKey };
  if (process.env.ENDPOINT_URL && process.env.ENDPOINT_URL.trim() !== '') {
    options.endpointUrl = process.env.ENDPOINT_URL;
  }

  return new Airtable(options).base(baseId);
};

// Instância única para uso em todas as funções
const airtableBase = getAirtableBase();

export interface TurnoAirtable {
  id?: string;
  nome: string;
  data: string;
  horaInicio: string;
  horaFim: string;
  eventoId: string;
  participantesIds: string[];
  responsavelId: string;
  observacoes?: string;
  tipo?: 'Turno' | 'Worksession' | 'Reunião';
  isRecurring?: boolean;
  dataLimiteRecorrencia?: string;
}

// --- HELPERS ---

const APP_TIME_ZONE = 'Europe/Lisbon';

const extractDateFromISO = (isoString: string): string => {
  if (!isoString) return '';
  return new Date(isoString).toLocaleDateString('pt-PT', {
    timeZone: APP_TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric',
  });
};

const extractTimeFromISO = (isoString: string): string => {
  if (!isoString) return '';
  return new Date(isoString).toLocaleTimeString('pt-PT', {
    timeZone: APP_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
};

const combineDateAndTimeToISO = (dateApp: string, timeApp: string): string => {
  if (!dateApp || !timeApp) return '';
  const [day, month, year] = dateApp.split('/').map(Number);
  const [hours, minutes] = timeApp.split(':').map(Number);
  const base = new Date(Date.UTC(year, month - 1, day));
  if (
    !Number.isInteger(year) || base.getUTCFullYear() !== year ||
    base.getUTCMonth() !== month - 1 || base.getUTCDate() !== day ||
    !Number.isInteger(hours) || !Number.isInteger(minutes) ||
    hours < 0 || hours > 24 || minutes < 0 || minutes > 59 ||
    (hours === 24 && minutes !== 0)
  ) throw new Error('Data ou hora inválida.');

  // A UTC timestamp used only to represent the requested Lisbon wall-clock fields.
  // 24:00 is normalized to midnight on the following day.
  const wallTime = Date.UTC(year, month - 1, day, hours, minutes);
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: APP_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  const localFieldsAsUTC = (timestamp: number): number => {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(timestamp))
      .filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  };

  // Derive both possible offsets around a clock change from the time-zone database.
  const offsets = new Set([-36, 0, 36].map(hoursAround => {
    const sample = wallTime + hoursAround * 3600000;
    return localFieldsAsUTC(sample) - sample;
  }));
  const matches = [...offsets].map(offset => wallTime - offset)
    .filter(candidate => localFieldsAsUTC(candidate) === wallTime)
    .sort((a, b) => a - b);
  if (!matches.length) {
    throw new Error('Esta hora não existe em Lisboa devido à mudança para o horário de verão.');
  }
  // In the repeated autumn hour, consistently choose its first occurrence.
  return new Date(matches[0]).toISOString();
};

// --- CONTROLO DE PRESENÇAS (EX-ControloPresencasService) ---

export async function getUserByIstId(istId: number): Promise<User | null> {
  try {
    const records = await airtableBase('Controlo de Presenças')
      .select({
        maxRecords: 1,
        view: 'Grid view',
        filterByFormula: `{IST ID} = ${istId}`,
      })
      .firstPage();

    if (!records || records.length === 0) throw new Error('No user found with the given IST ID');

    const record = records[0];
    const rawFuncao = record.get('Função');
    const safeFuncao = Array.isArray(rawFuncao) ? rawFuncao[0] : rawFuncao;

    const rawData = {
      id: record.id,
      nome: record.get('Nome e Sobrenome'),
      funcao: safeFuncao,
      department: record.get('Área'),
      istId: record.get('IST ID'),
    };

    const parsed = UserSchema.safeParse(rawData);
    if (!parsed.success) throw new Error('Airtable user data validation failed');

    return parsed.data;
  } catch (error) {
    console.error('Error fetching user:', error);
    return null;
  }
}

export async function getAllUsers(): Promise<User[]> {
  try {
    const records = await airtableBase('Controlo de Presenças').select({}).all();
    const users = records.map(record => {
      const rawFuncao = record.get('Função');
      const safeFuncao = Array.isArray(rawFuncao) ? rawFuncao[0] : rawFuncao;

      const rawData = {
        id: record.id,
        nome: record.get('Nome e Sobrenome'),
        funcao: safeFuncao,
        department: record.get('Área'),
        istId: record.get('IST ID'),
      };

      const parsed = UserSchema.safeParse(rawData);
      return parsed.success ? parsed.data : null;
    });

    const validUsers = users.filter((u): u is User => u !== null);
    validUsers.sort((a, b) => a.nome.localeCompare(b.nome, 'pt', { sensitivity: 'base' }));
    return validUsers;
  } catch (error) {
    console.error('Error fetching all users:', error);
    return [];
  }
}

export async function getAllDepartments(): Promise<string[]> {
  try {
    const records = await airtableBase('Controlo de Presenças')
      .select({ fields: ['Área'] })
      .all();
    const allValues = records.map(record => record.get('Área'));
    const flatValues = allValues.flat().filter(v => v !== undefined && v !== null);
    const stringSet = new Set(flatValues.map(item => String(item)));
    return Array.from(stringSet);
  } catch (error) {
    console.error('Error fetching departamentos:', error);
    return [];
  }
}

// --- EVENTOS (EX-EventosService) ---

export async function getEventos(): Promise<Evento[]> {
  try {
    const records = await airtableBase('Eventos').select({ view: 'Eventos' }).all();
    return records
      .map(record => {
        const rawData = {
          id: record.id,
          nome: record.get('Nome'),
          participantes: record.get('Participantes'),
          dataInicio: record.get('Data Início'),
          dataFim: record.get('Data Fim'),
          turnos: record.get('Turnos'),
        };
        const result = EventoSchema.safeParse(rawData);
        return result.success ? result.data : null;
      })
      .filter((r): r is Evento => r !== null);
  } catch (error) {
    console.error('Error fetching eventos:', error);
    return [];
  }
}

export async function getHistoricoEventos(): Promise<Evento[]> {
  try {
    const records = await airtableBase('Eventos').select({ view: 'Histórico Eventos' }).all();
    return records
      .map(record => {
        const rawData = {
          id: record.id,
          nome: record.get('Nome'),
          participantes: record.get('Participantes'),
          dataInicio: record.get('Data Início'),
          dataFim: record.get('Data Fim'),
          turnos: record.get('Turnos'),
        };
        const result = EventoSchema.safeParse(rawData);
        return result.success ? result.data : null;
      })
      .filter((r): r is Evento => r !== null);
  } catch (error) {
    console.error('Error fetching historico eventos:', error);
    return [];
  }
}

export async function getEventosAtivos(): Promise<Evento[]> {
  try {
    const records = await airtableBase('Eventos').select({ view: 'Eventos Ativos' }).all();
    return records
      .map(record => {
        const rawData = {
          id: record.id,
          nome: record.get('Nome'),
          participantes: record.get('Participantes'),
          dataInicio: record.get('Data Início'),
          dataFim: record.get('Data Fim'),
        };
        const result = EventoSchema.safeParse(rawData);
        return result.success ? result.data : null;
      })
      .filter((r): r is Evento => r !== null);
  } catch (error) {
    console.error('Error fetching eventos ativos:', error);
    return [];
  }
}

export async function criarEvento(evento: {
  nome: string;
  dataInicio: string;
  dataFim: string;
}): Promise<void> {
  try {
    await airtableBase('Eventos').create([
      {
        fields: {
          Nome: evento.nome,
          'Data Início': evento.dataInicio,
          'Data Fim': evento.dataFim,
        },
      },
    ]);
  } catch (error) {
    console.error('Error creating evento:', error);
    throw error;
  }
}

export async function apagarEvento(eventoId: string): Promise<void> {
  try {
    await airtableBase('Eventos').destroy([eventoId]);
  } catch (error) {
    console.error('Error deleting evento:', error);
    throw error;
  }
}

// --- TURNOS (EX-TurnosService) ---

export async function getTurnosAtivos(): Promise<Turno[]> {
  try {
    const records = await airtableBase('Turnos').select({ view: 'Turnos Ativos' }).all();
    return records
      .map(record => {
        const rawEvento = record.get('Evento');
        const safeEvento = Array.isArray(rawEvento) && rawEvento.length > 0 ? rawEvento[0] : 'Sem Evento';
        const rawData = {
          id: record.id,
          nome: record.get('Nome')?.toString() || 'Sem Nome',
          idTurno: record.get('ID Turno')?.toString(),
          participantes: record.get('Participantes'),
          evento: safeEvento,
          dataInicio: record.get('Data Início'),
          dataFim: record.get('Data Fim'),
        };
        const result = TurnoSchema.safeParse(rawData);
        return result.success ? result.data : null;
      })
      .filter((r): r is Turno => r !== null);
  } catch (error) {
    console.error('Error fetching turnos ativos:', error);
    return [];
  }
}

export async function getHistoricoTurnos(): Promise<Turno[]> {
  try {
    const records = await airtableBase('Turnos').select({ view: 'Histórico Turnos' }).all();
    return records
      .map(record => {
        const rawEvento = record.get('Evento');
        const safeEvento = Array.isArray(rawEvento) && rawEvento.length > 0 ? rawEvento[0] : 'Sem Evento';
        const rawData = {
          id: record.id,
          nome: record.get('Nome')?.toString() || 'Sem Nome',
          idTurno: record.get('ID Turno')?.toString(),
          participantes: record.get('Participantes'),
          evento: safeEvento,
          dataInicio: record.get('Data Início'),
          dataFim: record.get('Data Fim'),
        };
        const result = TurnoSchema.safeParse(rawData);
        return result.success ? result.data : null;
      })
      .filter((r): r is Turno => r !== null);
  } catch (error) {
    console.error('Error fetching historico turnos:', error);
    return [];
  }
}

export async function getTurnosAtivosPorPessoa(recordID: string): Promise<Turno[]> {
  try {
    const allRecords = await airtableBase('Turnos').select({ view: 'Turnos Ativos' }).all();
    const filteredRecords = allRecords.filter(record => {
      const participantes = record.get('Participantes');
      return Array.isArray(participantes) && participantes.includes(recordID);
    });

    return filteredRecords
      .map(record => {
        const rawEvento = record.get('Evento');
        const safeEvento =
          Array.isArray(rawEvento) && rawEvento.length > 0 ? rawEvento[0] : 'Sem Evento';
        const rawData = {
          id: record.id,
          nome: record.get('Nome')?.toString() || 'Sem Nome',
          idTurno: record.get('ID Turno')?.toString() || 'Sem ID Turno',
          participantes: record.get('Participantes'),
          evento: safeEvento,
          dataInicio: record.get('Data Início'),
          dataFim: record.get('Data Fim'),
        };
        const result = TurnoSchema.safeParse(rawData);
        return result.success ? result.data : null;
      })
      .filter((r): r is Turno => r !== null);
  } catch (error) {
    console.error('Error fetching turnos por pessoa:', error);
    return [];
  }
}

export async function getTurnos(): Promise<TurnoAirtable[]> {
  try {
    const records = await airtableBase('Turnos')
      .select({
        sort: [{ field: 'Data Início', direction: 'desc' }],
      })
      .all();

    return records.map(record => {
      const startISO = record.get('Data Início') as string;
      const endISO = record.get('Data Fim') as string;
      const eventoArr = record.get('Evento') as string[] | undefined;
      const responsavelArr = record.get('Responsável') as string[] | undefined;

      return {
        id: record.id,
        nome: (record.get('Nome') as string) || '',
        data: extractDateFromISO(startISO),
        horaInicio: extractTimeFromISO(startISO),
        horaFim: extractTimeFromISO(endISO),
        eventoId: eventoArr?.[0] || '',
        participantesIds: (record.get('Participantes') as string[]) || [],
        responsavelId: responsavelArr?.[0] || '',
        observacoes: (record.get('Observações') as string) || '',
        tipo: record.get('Tipo') as any,
        isRecurring: Boolean(record.get('Data Limite Recorrência')),
        dataLimiteRecorrencia: record.get('Data Limite Recorrência') as string,
      };
    });
  } catch (error) {
    console.error('Erro ao buscar turnos (Gestão):', error);
    return [];
  }
}

export async function criarTurno(payload: Omit<TurnoAirtable, 'id'>): Promise<string> {
  try {
    const fields: any = {
      Nome: payload.nome,
      'Data Início': combineDateAndTimeToISO(payload.data, payload.horaInicio),
      'Data Fim': combineDateAndTimeToISO(payload.data, payload.horaFim),
      Evento: payload.eventoId ? [payload.eventoId] : [],
      Participantes: payload.participantesIds,
      Observações: payload.observacoes || '',
      Tipo: payload.tipo,
      'Data Limite Recorrência': payload.dataLimiteRecorrencia,
    };

    if (payload.responsavelId) fields['Responsável'] = [payload.responsavelId];

    const records = await airtableBase('Turnos').create([{ fields }]);
    if (!records || records.length === 0) throw new Error('Falha ao criar registo.');
    return records[0].id;
  } catch (error) {
    console.error('Erro ao criar turno (Gestão):', error);
    throw error;
  }
}

export async function editarTurno(
  idTurno: string,
  payload: Omit<TurnoAirtable, 'id'>
): Promise<void> {
  try {
    const fields: any = {
      Nome: payload.nome,
      'Data Início': combineDateAndTimeToISO(payload.data, payload.horaInicio),
      'Data Fim': combineDateAndTimeToISO(payload.data, payload.horaFim),
      Evento: payload.eventoId ? [payload.eventoId] : [],
      Participantes: payload.participantesIds,
      Observações: payload.observacoes || '',
      Tipo: payload.tipo,
      'Data Limite Recorrência': payload.dataLimiteRecorrencia,
    };

    if (payload.responsavelId) fields['Responsável'] = [payload.responsavelId];

    await airtableBase('Turnos').update([{ id: idTurno, fields }]);
  } catch (error) {
    console.error('Erro ao editar turno (Gestão):', error);
    throw error;
  }
}

export async function apagarTurno(idTurno: string): Promise<void> {
  try {
    await airtableBase('Turnos').destroy([idTurno]);
  } catch (error) {
    console.error('Erro ao apagar turno (Gestão):', error);
    throw error;
  }
}
