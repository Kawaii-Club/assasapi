import axios from "axios";

const ASAAS_API_URL = "https://api-sandbox.asaas.com/v3";
const ASAAS_API_KEY = process.env.ASAAS_API_KEY;

export const asaas = axios.create({
  baseURL: ASAAS_API_URL,
  headers: {
    access_token: ASAAS_API_KEY,
    "Content-Type": "application/json",
  },
});
