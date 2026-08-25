import json
import unicodedata
from http.server import BaseHTTPRequestHandler

from ortools.sat.python import cp_model

DAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"]


def as_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def normalize(value):
    return "".join(c for c in unicodedata.normalize("NFD", str(value or "")) if unicodedata.category(c) != "Mn").lower()


def build_candidates(data, people):
    selected_days = [as_int(day) for day in data.get("selectedDays", [])]
    duration = as_int(round(float(data.get("shiftDurationHours", 0)) * 60))
    start_limit = as_int(data.get("globalStartHour")) * 60
    end_limit = as_int(data.get("globalEndHour")) * 60
    selected_area = normalize(data.get("selectedArea"))
    eligible = [p for p in people if not selected_area or normalize(p.get("area")) == selected_area]
    raw_availability = data.get("availability") or {}
    slots = {
        p["id"]: {
            (as_int(slot.get("day")), as_int(slot.get("hour")) * 60 + as_int(slot.get("minute")))
            for slot in raw_availability.get(p["id"], []) if isinstance(slot, dict)
        }
        for p in eligible
    }
    candidates = []
    if duration <= 0 or start_limit >= end_limit:
        return eligible, candidates
    for day in selected_days:
        for start in range(start_limit, end_limit - duration + 1, 30):
            end = start + duration
            needed = [(day, minute) for minute in range(start, end, 30)]
            available = [p["id"] for p in eligible if all(slot in slots[p["id"]] for slot in needed)]
            candidates.append({
                "id": f"{day}-{start}-{end}", "day": day,
                "startMinutes": start, "endMinutes": end,
                "availableIds": available,
            })
    return eligible, candidates


def empty_result(days, per_day, person_ids, status="INFEASIBLE"):
    return {
        "shifts": [], "totals": {pid: 0 for pid in person_ids}, "solverStatus": status,
        "warnings": [f"{DAYS[day]}: só foi possível criar 0/{per_day} turnos." for day in days],
    }


def optimize_schedule(data):
    people = [p for p in data.get("people", []) if p.get("id")]
    eligible, candidates = build_candidates(data, people)
    people_per_shift = as_int(data.get("peoplePerShift"))
    shifts_per_day = as_int(data.get("shiftsPerDay"))
    daily_max = as_int(data.get("maxShiftsPerPersonDay"))
    responsible_ids = set(data.get("selectedResponsibleIds") or [])
    responsible_daily_max = as_int(data.get("maxResponsibleShiftsPerDay"), daily_max)
    responsible_target_units = as_int(round(float(data.get("responsibleTargetHoursPerWeek", 0)) * 2))
    duration_units = as_int(round(float(data.get("shiftDurationHours", 0)) * 2))
    target_units = as_int(round(float(data.get("targetHoursPerPersonWeek", 0)) * 2))
    tolerance_units = as_int(round(float(data.get("weeklyToleranceHours", 0)) * 2))
    days = [as_int(day) for day in data.get("selectedDays", [])]
    allow_overlaps = bool(data.get("allowOverlappingShifts"))
    if people_per_shift < 1 or shifts_per_day < 1 or daily_max < 1 or duration_units < 1:
        raise ValueError("Os parâmetros numéricos do gerador são inválidos.")
    if not responsible_ids:
        raise ValueError("Seleciona pelo menos um possível responsável.")

    candidates = [c for c in candidates if len(c["availableIds"]) >= people_per_shift and any(pid in responsible_ids for pid in c["availableIds"])]
    person_ids = [p["id"] for p in eligible]
    by_day = {day: [i for i, c in enumerate(candidates) if c["day"] == day] for day in days}
    model = cp_model.CpModel()
    selected = [model.new_bool_var(f"shift_{i}") for i in range(len(candidates))]
    assigned = {}
    responsible = {}
    for i, candidate in enumerate(candidates):
        for pid in candidate["availableIds"]:
            assigned[i, pid] = model.new_bool_var(f"assign_{i}_{pid}")
            if pid in responsible_ids:
                responsible[i, pid] = model.new_bool_var(f"responsible_{i}_{pid}")
                model.add(responsible[i, pid] <= assigned[i, pid])
        model.add(sum(assigned[i, pid] for pid in candidate["availableIds"]) == people_per_shift * selected[i])
        model.add(sum(responsible[i, pid] for pid in candidate["availableIds"] if (i, pid) in responsible) == selected[i])

    for day, indices in by_day.items():
        model.add(sum(selected[i] for i in indices) <= shifts_per_day)
        for pid in person_ids:
            daily = [assigned[i, pid] for i in indices if (i, pid) in assigned]
            if daily:
                model.add(sum(daily) <= (responsible_daily_max if pid in responsible_ids else daily_max))
        if not allow_overlaps:
            for pos, left_i in enumerate(indices):
                left = candidates[left_i]
                for right_i in indices[pos + 1:]:
                    right = candidates[right_i]
                    if left["startMinutes"] < right["endMinutes"] and right["startMinutes"] < left["endMinutes"]:
                        model.add(selected[left_i] + selected[right_i] <= 1)

    total_selected = sum(selected)
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 8
    solver.parameters.num_search_workers = 8
    model.maximize(total_selected)
    first_status = solver.solve(model)
    if first_status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return empty_result(days, shifts_per_day, person_ids)
    maximum_shifts = as_int(round(solver.objective_value))
    model.add(total_selected == maximum_shifts)

    deviations, overloads, zero_flags, totals = [], [], [], {}
    max_assignments = max(1, len(days) * max(daily_max, responsible_daily_max))
    max_units = max_assignments * duration_units
    for pid in person_ids:
        person_vars = [var for (_, assigned_pid), var in assigned.items() if assigned_pid == pid]
        total = model.new_int_var(0, max_assignments, f"total_{pid}")
        model.add(total == sum(person_vars))
        totals[pid] = total
        hours = model.new_int_var(0, max_units, f"hours_{pid}")
        model.add(hours == total * duration_units)
        person_target = responsible_target_units if pid in responsible_ids else target_units
        deviation = model.new_int_var(0, max(person_target, max_units), f"deviation_{pid}")
        model.add_abs_equality(deviation, hours - person_target)
        deviations.append(deviation)
        overload = model.new_int_var(0, max_units, f"overload_{pid}")
        model.add_max_equality(overload, [hours - person_target - tolerance_units, 0])
        overloads.append(overload)
        zero = model.new_bool_var(f"zero_{pid}")
        model.add(total == 0).only_enforce_if(zero)
        model.add(total >= 1).only_enforce_if(zero.Not())
        zero_flags.append(zero)

    model.minimize(sum(deviations) + 20 * sum(overloads) + 4 * sum(zero_flags))
    solver.parameters.max_time_in_seconds = 12
    status = solver.solve(model)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return empty_result(days, shifts_per_day, person_ids)

    generated = []
    for i, candidate in enumerate(candidates):
        if solver.value(selected[i]):
            generated.append({**candidate, "assignedIds": [pid for pid in candidate["availableIds"] if solver.value(assigned[i, pid])], "responsibleId": next(pid for pid in candidate["availableIds"] if (i, pid) in responsible and solver.value(responsible[i, pid]))})
    generated.sort(key=lambda shift: (days.index(shift["day"]), shift["startMinutes"]))
    warnings = []
    for day in days:
        count = sum(1 for shift in generated if shift["day"] == day)
        if count < shifts_per_day:
            warnings.append(f"{DAYS[day]}: só foi possível criar {count}/{shifts_per_day} turnos.")
    if not candidates:
        warnings.append("Não existem turnos candidatos com estes parâmetros e disponibilidades.")
    return {
        "shifts": generated, "warnings": warnings,
        "totals": {pid: solver.value(total) for pid, total in totals.items()},
        "solverStatus": "OPTIMAL" if first_status == cp_model.OPTIMAL and status == cp_model.OPTIMAL else "FEASIBLE",
    }


class handler(BaseHTTPRequestHandler):
    def send_json(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        try:
            length = as_int(self.headers.get("Content-Length"))
            self.send_json(200, optimize_schedule(json.loads(self.rfile.read(length) or b"{}")))
        except (ValueError, TypeError, json.JSONDecodeError) as error:
            self.send_json(400, {"error": str(error)})
        except Exception as error:
            self.send_json(500, {"error": f"Erro interno do otimizador: {error}"})
