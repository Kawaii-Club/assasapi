
import "dotenv/config";
import app from "./app.js";

const PORT = process.env.PORT || 3000;
console.log("ASAAS_URL:", process.env.ASAAS_URL);
console.log("ASAAS_KEY:", process.env.ASAAS_KEY);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 API rodando em http://0.0.0.0:${PORT}`);
});