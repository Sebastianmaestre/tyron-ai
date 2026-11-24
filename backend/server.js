require("dotenv").config({ path: __dirname + "/.env" });

const express = require("express");
const cors = require("cors");
const { rateLimit } = require("express-rate-limit");

const app = express();
const PORT = process.env.PORT || 3000;
const MODEL = "gemini-3.5-flash-lite";

const allowedOrigins = (process.env.FRONTEND_ORIGIN ||
  "https://sebastianmaestre.github.io")
  .split(",").map(origin => origin.trim()).filter(Boolean);

const isAllowedOrigin = (origin) =>
  !origin ||
  allowedOrigins.includes(origin) ||
  /^https:\/\/[a-z0-9-]+-5500\.app\.github\.dev$/.test(origin);

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(cors({
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));


app.use(express.json({ limit: "32kb" }));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 15,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    error: "Demasiadas solicitudes. Inténtalo en un minuto."
  }
});

app.get("/api/health", (_req, res) => {
  res.json({
    status: "online",
    name: "TYRON AI",
    version: "1.1",
    brain: "Gemini API",
    memory: "conversation"
  });
});

function safeText(value, max = 2000) {
  return typeof value === "string" ? value.slice(0, max) : "";
}

app.post("/api/tyron", apiLimiter, async (req, res) => {
  const body = req.body || {};
  const message = safeText(body.message, 8000).trim();

  if (!message) {
    return res.status(400).json({
      success: false,
      error: "Escribe un mensaje para TYRON."
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: "Falta configurar la clave de IA en el servidor."
    });
  }

  try {
    const conversation = Array.isArray(body.conversation)
      ? body.conversation.slice(-12)
      : [];

    const contents = [];

    for (const item of conversation) {
      if (!item || typeof item.text !== "string") continue;

      const text = safeText(item.text, 4000).trim();
      if (!text) continue;

      const role = item.role === "ai" || item.role === "model"
        ? "model"
        : item.role === "user"
          ? "user"
          : null;

      if (!role) continue;

      const previous = contents[contents.length - 1];

      if (previous && previous.role === role) {
        previous.parts[0].text += "\n" + text;
      } else {
        contents.push({
          role,
          parts: [{ text }]
        });
      }
    }

    const last = contents[contents.length - 1];

    if (!last || last.role !== "user" ||
        last.parts[0].text !== message) {
      contents.push({
        role: "user",
        parts: [{ text: message }]
      });
    }

    const memory = Array.isArray(body.memory)
      ? body.memory.slice(-30)
      : [];

    const goals = Array.isArray(body.goals)
      ? body.goals.slice(0, 20)
      : [];

    const files = Array.isArray(body.files)
      ? body.files.slice(0, 10)
      : [];

    const profile = body.profile && typeof body.profile === "object"
      ? body.profile
      : {};

    const context = {
      profile: {
        name: safeText(profile.name, 100),
        tone: safeText(profile.tone, 100)
      },
      mood: safeText(body.mood, 50),
      memory: memory.map(item =>
        safeText(item && item.text, 500)
      ).filter(Boolean),
      goals,
      files: files.map(file => ({
        name: safeText(file && file.name, 200),
        type: safeText(file && file.type, 100)
      }))
    };

    const systemPrompt = `
Eres TYRON, un asistente inteligente con identidad propia.

Tu personalidad:
- Eres natural, claro, lógico, respetuoso y honesto.
- Respondes en el idioma del usuario.
- Adaptas tu tono al contexto y a las necesidades del usuario.
- Comprendes el historial antes de responder.
- Aprovechas los recuerdos y el perfil proporcionados.
- No inventas recuerdos ni afirmas conocer datos que no recibiste.
- No afirmas haber realizado acciones que no ejecutaste.
- Este servidor solo permite conversar: no controla dispositivos.

CONTEXTO DE TYRON:
${JSON.stringify(context)}
`;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" +
      MODEL + ":generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemPrompt }]
          },
          contents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 900
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error(
        "Gemini API error:",
        response.status,
        data.error && data.error.message
      );

      return res.status(502).json({
        success: false,
        error: response.status === 429
          ? "Se alcanzó el límite de uso de la IA."
          : "La IA remota no pudo procesar el mensaje."
      });
    }

    const reply = data.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("")
      .trim();

    if (!reply) {
      return res.status(502).json({
        success: false,
        error: "La IA no devolvió una respuesta de texto."
      });
    }

    return res.json({
      success: true,
      reply,
      source: "Gemini API",
      model: MODEL
    });

  } catch (error) {
    console.error("Error de conexión:", error.message);

    return res.status(502).json({
      success: false,
      error: "No se pudo conectar con la IA remota."
    });
  }
});


// ===== GITHUB API: ACCESO DE SOLO LECTURA =====

const GITHUB_OWNER = "Sebastianmaestre";
const GITHUB_REPO = "tyron-ai";
const GITHUB_API = "https://api.github.com";

const githubLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    error: "Demasiadas consultas a GitHub. Inténtalo en un minuto."
  }
});

function requireGitHubToken(_req, res, next) {
  if (!process.env.GITHUB_TOKEN) {
    return res.status(503).json({
      success: false,
      error: "La conexión con GitHub no está configurada."
    });
  }

  next();
}

async function githubGet(path) {
  const response = await fetch(GITHUB_API + path, {
    method: "GET",
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": "Bearer " + process.env.GITHUB_TOKEN,
      "X-GitHub-Api-Version": "2022-11-28"
    },
    signal: AbortSignal.timeout(10000)
  });

  const data = await response.json().catch(() => ({}));

  return {
    ok: response.ok,
    status: response.status,
    data
  };
}

function githubError(res, result) {
  const status = result.status === 401 ? 502 :
    result.status === 403 ? 502 :
    result.status === 404 ? 404 : 502;

  return res.status(status).json({
    success: false,
    error: result.status === 404
      ? "No se encontró el repositorio o recurso solicitado."
      : "GitHub no pudo completar la consulta.",
    githubStatus: result.status
  });
}

// Comprobar acceso al repositorio.
app.get(
  "/api/github/status",
  githubLimiter,
  requireGitHubToken,
  async (_req, res) => {
    try {
      const result = await githubGet(
        "/repos/" + GITHUB_OWNER + "/" + GITHUB_REPO
      );

      if (!result.ok) return githubError(res, result);

      return res.json({
        success: true,
        connected: true,
        repository: result.data.full_name,
        defaultBranch: result.data.default_branch,
        private: result.data.private
      });
    } catch (error) {
      console.error("GitHub connection error:", error.message);
      return res.status(502).json({
        success: false,
        error: "No se pudo conectar con GitHub."
      });
    }
  }
);

// Consultar información general del repositorio.
app.get(
  "/api/github/repository",
  githubLimiter,
  requireGitHubToken,
  async (_req, res) => {
    try {
      const result = await githubGet(
        "/repos/" + GITHUB_OWNER + "/" + GITHUB_REPO
      );

      if (!result.ok) return githubError(res, result);

      return res.json({
        success: true,
        repository: {
          name: result.data.name,
          fullName: result.data.full_name,
          description: result.data.description,
          defaultBranch: result.data.default_branch,
          private: result.data.private,
          htmlUrl: result.data.html_url,
          updatedAt: result.data.updated_at
        }
      });
    } catch (error) {
      console.error("GitHub repository error:", error.message);
      return res.status(502).json({
        success: false,
        error: "No se pudo consultar el repositorio."
      });
    }
  }
);

// Listar archivos y carpetas sin descargar ni modificar su contenido.
app.get(
  "/api/github/tree",
  githubLimiter,
  requireGitHubToken,
  async (req, res) => {
    try {
      const repo = await githubGet(
        "/repos/" + GITHUB_OWNER + "/" + GITHUB_REPO
      );

      if (!repo.ok) return githubError(res, repo);

      const requestedRef = typeof req.query.ref === "string"
        ? req.query.ref.slice(0, 200)
        : repo.data.default_branch;

      const tree = await githubGet(
        "/repos/" + GITHUB_OWNER + "/" + GITHUB_REPO +
        "/git/trees/" + encodeURIComponent(requestedRef) +
        "?recursive=1"
      );

      if (!tree.ok) return githubError(res, tree);

      const entries = Array.isArray(tree.data.tree)
        ? tree.data.tree
        : [];

      return res.json({
        success: true,
        repository: repo.data.full_name,
        ref: requestedRef,
        total: entries.length,
        truncated: entries.length > 500 || Boolean(tree.data.truncated),
        files: entries.slice(0, 500).map(item => ({
          path: item.path,
          type: item.type,
          size: item.size || null,
          sha: item.sha
        }))
      });
    } catch (error) {
      console.error("GitHub tree error:", error.message);
      return res.status(502).json({
        success: false,
        error: "No se pudo consultar la estructura del repositorio."
      });
    }
  }
);

// ===== FIN DE GITHUB API =====

app.listen(PORT, () => {
  console.log("TYRON AI activo en puerto " + PORT);
  console.log("Modelo configurado: " + MODEL);
});
