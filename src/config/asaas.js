import axios from "axios";

// Certifique-se de que o env está sendo carregado (ex: dotenv.config())
const env = process.env; 

export const getAsaasClient = () => {
  // CORREÇÃO: Lança erro se as variáveis NÃO estiverem presentes
  if (!env.ASAAS_API_KEY || !env.ASAAS_API_URL) {
    throw new Error("ASAAS_API_KEY ou ASAAS_API_URL não configurados no arquivo .env");
  }

  return axios.create({
    baseURL: env.ASAAS_API_URL,
    headers: {
      "Content-Type": "application/json",
      "access_token": env.ASAAS_API_KEY, // Use a mesma variável aqui
    },
  });
};

export const getAsaasConfig = () => ({
  key: env.ASAAS_API_KEY,
  url: env.ASAAS_API_URL,
});