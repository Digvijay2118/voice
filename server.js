const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const fs = require("fs");
const cors = require("cors");

const mysql = require("mysql2/promise");
const path = require("path");

const app = express();

app.use(cors());
const server = http.createServer(app);
const io = require("socket.io")(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

// Create a MySQL connection pool
const pool = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "123456",
  database: "audio",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});
app.use(express.static("public"));

const sessions = {}; // Session management data structure

io.on("connection", (socket) => {
  console.log("A user connected");

  socket.on("join-session", (sessionID) => {
    console.log("User joined session:", sessionID); // Add this log
    if (!sessions[sessionID]) {
      sessions[sessionID] = [];
    }
    sessions[sessionID].push(socket.id);
    socket.join(sessionID);
  });

  // socket.on("send-audio", async (audioBlob) => {
  socket.on("send-audio", async (data) => {
    const { sessionID, audioBlob } = data;
    const audioFileName = `${Date.now()}.webm`;

    const audioPath = path.join(__dirname, "public", "audio", audioFileName);

    // fs.writeFileSync(audioPath, audioBlob);
    fs.writeFile(audioPath, audioBlob, async (err) => {
      if (err) {
        console.error("Error writing audio file:", err);
        return;
      }
      try {
        const audioURL =
          // `http://localhost:5000
          `/audio/${audioFileName}`;

        // Save audio message in the database
        // const insertQuery =
        //   "INSERT INTO audio_message (sender, audio_url) VALUES (?, ?)";
        // await pool.query(insertQuery, [socket.id, audioURL]);
        // // Broadcast the audio to all connected users
        // socket.broadcast.emit("received-audio", audioURL);
        await pool.query(
          "INSERT INTO audio_message (sender, audio_url, session) VALUES (?, ?, ?)",
          [socket.id, audioURL, sessionID]
        );
        io.to(sessionID).emit("received-audio", audioURL);
      } catch (error) {
        console.error("Error saving audio message in the database:", error);
      }
    });
  });

  socket.on("disconnect", () => {
    console.log("A user disconnected");
  });
});

for (const sessionID in sessions) {
  const index = sessions[sessionID].indexOf(socket.id);
  if (index !== -1) {
    sessions[sessionID].splice(index, 1);
    if (sessions[sessionID].length === 0) {
      delete sessions[sessionID];
    }
    break;
  }
}

app.post("/api/store-audio", async (req, res) => {
  const { sender, audioPath } = req.body;

  try {
    // Save audio message in the database
    const insertQuery =
      "INSERT INTO audio_message (sender, audio_url) VALUES (?, ?)";
    await pool.execute(insertQuery, [sender, audioPath]);

    res.status(201).json({ message: "Audio message stored successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error storing audio message" });
  }
});

app.get("/api/audio-messages", async (req, res) => {
  try {
    const sessionID = req.query.sessionID; // Get the session ID from the query parameter
    console.log("id-->", sessionID);
    const selectQuery = "SELECT audio_url FROM audio_message WHERE session = ?";
    const [rows, fields] = await pool.execute(selectQuery, [sessionID]);
    res.status(200).json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error fetching audio messages" });
  }
});

// Serve audio files from the 'public' folder
app.use("/audio", express.static(path.join(__dirname, "public", "audio")));

server.listen(5000, () => {
  console.log("Server is running on port 5000");
});
