const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

require("dotenv").config();

const foodRoutes = require("./routes/foodRoutes");
const foodLogRoutes = require("./routes/foodLogRoutes");
const activityRoutes = require("./routes/activityRoutes");
const taskRoutes = require("./routes/taskRoutes");
const habitRoutes = require("./routes/habitRoutes");
const waterRoutes = require("./routes/waterRoutes");
const weightRoutes = require("./routes/weightRoutes");
const profileRoutes = require("./routes/profileRoutes");

const app = express();

const PORT =
  Number(process.env.PORT) || 5001;

// ============================================================
// MIDDLEWARE
// ============================================================

const allowedOrigins = [
  "http://localhost:5173",
  process.env.CLIENT_URL,
];

app.use(
  cors({
    origin: allowedOrigins.filter(Boolean),
  })
);

app.use(
  express.json()
);

// ============================================================
// API ROUTES
// ============================================================

app.use(
  "/api/foods",
  foodRoutes
);

app.use(
  "/api/food-logs",
  foodLogRoutes
);

app.use(
  "/api/activities",
  activityRoutes
);

app.use(
  "/api/tasks",
  taskRoutes
);

app.use(
  "/api/habits",
  habitRoutes
);

app.use(
  "/api/water",
  waterRoutes
);

app.use(
  "/api/weight",
  weightRoutes
);

app.use(
  "/api/profile",
  profileRoutes
);

// ============================================================
// HOME ROUTE
// ============================================================

app.get("/", (req, res) => {
  res.json({
    message:
      "MyDailyOS API is running 🚀",
  });
});

// ============================================================
// TEST API
// ============================================================

app.get(
  "/api/test",
  (req, res) => {
    res.json({
      success: true,
      message:
        "Backend is working!",
    });
  }
);

// ============================================================
// MONGODB CONNECTION
// ============================================================

mongoose
  .connect(
    process.env.MONGO_URI
  )
  .then(() => {
    console.log(
      "MongoDB connected successfully ✅"
    );

    app.listen(
      PORT,
      "0.0.0.0",
      () => {
        console.log(
          `MyDailyOS server running on port ${PORT}`
        );
      }
    );
  })
  .catch((error) => {
    console.error(
      "MongoDB connection failed ❌"
    );

    console.error(
      error.message
    );

    process.exit(1);
  });