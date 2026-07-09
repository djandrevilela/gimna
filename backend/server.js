require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

app.get("/health", (req, res) => res.json({ ok: true, service: "animakids-backend", time: new Date().toISOString() }));

app.use("/auth", require("./routes/auth"));
app.use("/api", require("./routes/api"));
app.use("/push", require("./routes/push"));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Erro interno do servidor." });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log("Gimna backend a correr em http://localhost:" + PORT);
  console.log("Testa com: curl http://localhost:" + PORT + "/health");
});
