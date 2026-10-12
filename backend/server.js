require("dotenv").config({ path: __dirname + "/.env" });

const express = require("express");
const cors = require("cors");
const { rateLimit } = require("express-rate-limit");

const app = express();
const PORT = process.env.PORT || 3000;
const MODEL = "gemini-3.5-flash-lite";
const allowedOrigins = (process.env.FRONTEND_ORIGIN || "https://sebastianmaestre.github.io")
  .split(",").map(origin => origin.trim()).filter(Boolean);

app.disable("x-powered-by");
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Origen no autorizado por la política CORS."));
  },
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));
app.use(express.json({ limit: "32kb" }));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 15,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { success: false, error: "Demasiadas solicitudes. Inténtalo en un minuto." }
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "online", name: "TYRON AI", version: "1.0", brain: "Gemini API" });
});

app.post("/api/tyron", apiLimiter, async (req, res) => {
  const message = req.body && req.body.message;
  if (typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ success: false, error: "Escribe un mensaje para TYRON." });
  }
  if (message.length > 8000) {
    return res.status(413).json({ success: false, error: "El mensaje es demasiado largo." });
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ success: false, error: "Falta configurar la clave de la IA en el servidor." });
  }
  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + MODEL + ":generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: "Eres TYRON, un asistente inteligente, útil y natural. Responde en el idioma del usuario. Sé claro, lógico, respetuoso y honesto. No afirmes haber realizado acciones que no hiciste. Este endpoint solo conversa; no controla dispositivos. Si no sabes algo, admítelo." }] },
        contents: [{ role: "user", parts: [{ text: message.trim() }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 700 }
      })
    });
    const data = await response.json();
    if (!response.ok) {
      console.error("Gemini API error:", response.status, data.error && data.error.message);
      return res.status(502).json({ success: false, error: response.status === 429 ? "Se alcanzó el límite de uso de la IA. Inténtalo más tarde." : "La IA remota no pudo procesar el mensaje." });
    }
    const reply = data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts
      ? data.candidates[0].content.parts.map(part => part.text || "").join("").trim() : "";
    if (!reply) return res.status(502).json({ success: false, error: "La IA no devolvió una respuesta de texto." });
    return res.json({ success: true, reply, source: "Gemini API", model: MODEL });
  } catch (error) {
    console.error("Error de conexión con Gemini:", error.message);
    return res.status(502).json({ success: false, error: "No se pudo conectar con la IA remota." });
  }
});

app.listen(PORT, () => {
  console.log("TYRON AI backend activo en puerto " + PORT);
  console.log("Modelo configurado: " + MODEL);
});
