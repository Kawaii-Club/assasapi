import "dotenv/config";
import app from "./app.js";

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 API rodando em ${process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`}`);
});
