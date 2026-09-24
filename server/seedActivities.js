require("dotenv").config();

const mongoose = require("mongoose");

const Activity = require("./models/Activity");

const activities = [
  {
    name: "Walking - Slow",
    category: "Walking",
    met: 2.8,
    description:
      "Slow or casual walking",
  },

  {
    name: "Walking - Moderate",
    category: "Walking",
    met: 3.5,
    description:
      "Normal moderate-paced walking",
  },

  {
    name: "Walking - Brisk",
    category: "Walking",
    met: 4.3,
    description:
      "Brisk walking",
  },

  {
    name: "Running - Easy",
    category: "Running",
    met: 7.0,
    description:
      "Easy-paced running",
  },

  {
    name: "Running - Moderate",
    category: "Running",
    met: 8.3,
    description:
      "Moderate-paced running",
  },

  {
    name: "Cycling - Moderate",
    category: "Cycling",
    met: 7.5,
    description:
      "Moderate outdoor cycling",
  },

  {
    name: "Strength Training",
    category: "Strength",
    met: 5.0,
    description:
      "General resistance training",
  },

  {
    name: "Weight Training - Vigorous",
    category: "Strength",
    met: 6.0,
    description:
      "Vigorous weight training",
  },

  {
    name: "HIIT",
    category: "HIIT",
    met: 8.0,
    description:
      "High intensity interval training",
  },

  {
    name: "Yoga",
    category: "Mind & Mobility",
    met: 2.5,
    description:
      "General yoga session",
  },

  {
    name: "Swimming - Moderate",
    category: "Swimming",
    met: 6.0,
    description:
      "Moderate swimming",
  },

  {
    name: "Stair Climbing",
    category: "Cardio",
    met: 8.8,
    description:
      "Stair climbing exercise",
  },
];


async function seedActivities() {
  try {
    await mongoose.connect(
      process.env.MONGO_URI
    );

    console.log(
      "MongoDB connected successfully"
    );

    await Activity.deleteMany({});

    await Activity.insertMany(
      activities
    );

    console.log(
      `${activities.length} activities inserted successfully`
    );

    await mongoose.connection.close();

    console.log("Database connection closed");
  } catch (error) {
    console.error(
      "Failed to seed activities:",
      error
    );

    process.exit(1);
  }
}


seedActivities();