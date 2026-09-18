import unittest

from api.optimize_shifts import optimize_schedule


class ShiftOptimizerTest(unittest.TestCase):
    def base_payload(self):
        people = [
            {"id": "a", "area": "Aerodinâmica"},
            {"id": "b", "area": "Chassis"},
            {"id": "c", "area": "Aerodinâmica"},
            {"id": "d", "area": "Eletrónica"},
        ]
        slots = [
            {"day": 1, "hour": hour, "minute": minute}
            for hour in range(8, 14)
            for minute in (0, 30)
        ]
        return {
            "people": people,
            "availability": {person["id"]: slots for person in people},
            "selectedDays": [1],
            "peoplePerShift": 2,
            "shiftDurationHours": 2,
            "shiftsPerDay": 2,
            "maxShiftsPerPersonDay": 1,
            "globalStartHour": 8,
            "globalEndHour": 14,
            "selectedResponsibleIds": ["a", "c"],
            "maxResponsibleShiftsPerDay": 2,
            "responsibleTargetHoursPerWeek": 4,
            "targetHoursPerPersonWeek": 2,
            "weeklyToleranceHours": 0,
            "selectedArea": "",
            "allowOverlappingShifts": False,
        }

    def test_finds_balanced_global_solution(self):
        result = optimize_schedule(self.base_payload())

        self.assertEqual("OPTIMAL", result["solverStatus"])
        self.assertEqual(2, len(result["shifts"]))
        self.assertTrue(all(len(shift["assignedIds"]) == 2 for shift in result["shifts"]))
        self.assertTrue(all(shift["responsibleId"] in {"a", "c"} for shift in result["shifts"]))
        self.assertTrue(all(total == 1 for total in result["totals"].values()))
        self.assertFalse(result["warnings"])

    def test_returns_partial_schedule_with_warning(self):
        payload = self.base_payload()
        payload["availability"] = {
            "a": payload["availability"]["a"],
            "b": payload["availability"]["b"],
        }

        result = optimize_schedule(payload)

        self.assertEqual(1, len(result["shifts"]))
        self.assertTrue(result["warnings"])



    def weekly_payload(self):
        payload = self.base_payload()
        payload.update(
            selectedDays=[1, 2, 3, 4, 5],
            shiftDurationHours=3,
            selectedResponsibleIds=["a"],
            responsibleTargetHoursPerWeek=9,
            targetHoursPerPersonWeek=6,
            weeklyToleranceHours=1.5,
        )
        slots = [
            {"day": day, "hour": hour, "minute": minute}
            for day in payload["selectedDays"]
            for hour in range(8, 14)
            for minute in (0, 30)
        ]
        payload["availability"] = {person["id"]: slots for person in payload["people"]}
        return payload

    def test_responsible_weekly_limit_overrides_full_coverage(self):
        result = optimize_schedule(self.weekly_payload())
        self.assertEqual(3, len(result["shifts"]))
        self.assertEqual(3, result["totals"]["a"])
        self.assertTrue(result["warnings"])
        for pid, total in result["totals"].items():
            self.assertLessEqual(total * 3, 10.5 if pid == "a" else 7.5)

    def test_helper_weekly_limit_overrides_full_coverage(self):
        payload = self.weekly_payload()
        payload["responsibleTargetHoursPerWeek"] = 30
        payload["availability"] = {pid: slots for pid, slots in payload["availability"].items() if pid in {"a", "b"}}
        result = optimize_schedule(payload)
        self.assertEqual(2, len(result["shifts"]))
        self.assertEqual(2, result["totals"]["b"])
        self.assertTrue(result["warnings"])

    def test_tolerance_allows_only_the_configured_extra_hours(self):
        payload = self.weekly_payload()
        payload["responsibleTargetHoursPerWeek"] = 4.5
        result = optimize_schedule(payload)
        self.assertEqual(2, result["totals"]["a"])
        payload["weeklyToleranceHours"] = 0
        result = optimize_schedule(payload)
        self.assertEqual(1, result["totals"]["a"])

    def test_limit_smaller_than_shift_produces_no_assignments(self):
        payload = self.weekly_payload()
        payload["responsibleTargetHoursPerWeek"] = 0
        result = optimize_schedule(payload)
        self.assertEqual([], result["shifts"])
        self.assertTrue(all(total == 0 for total in result["totals"].values()))
        self.assertTrue(result["warnings"])


if __name__ == "__main__":
    unittest.main()
