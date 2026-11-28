# Backend API change

New endpoint:

GET /api/progress/history?from=2026-09-01&to=2026-09-25

Response shape:
{
  "success": true,
  "from": "2026-09-01",
  "to": "2026-09-25",
  "days": [
    {
      "date": "2026-09-01",
      "weightKg": 82.4,
      "calories": 1700,
      "protein": 130,
      "carbohydrates": 150,
      "fat": 50,
      "fiber": 25,
      "waterMl": 3500,
      "exerciseMinutes": 45,
      "caloriesBurned": 280,
      "tasksTotal": 5,
      "tasksCompleted": 4,
      "habitsCompleted": 3
    }
  ],
  "totals": {}
}
