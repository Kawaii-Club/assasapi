# ⏰ Cloud Scheduler - Expiração Automática de Posts

## 📋 Visão Geral

A função `expireMuralPosts` foi criada para ser disparada automaticamente pelo **Cloud Scheduler** do Firebase (serviço gerenciado do Google Cloud).

A função busca todos os `mural_posts` com mais de 30 dias e atualiza seu status para "expired".

---

## 🚀 Como Configurar

### 1️⃣ Deploy da Função (Via CLI)

```bash
cd functions
firebase deploy --only functions:expireMuralPosts
```

Ou fazer deploy de todas as funções:
```bash
firebase deploy --only functions
```

Após o deploy, você verá uma URL como:
```
https://[REGION]-[PROJECT_ID].cloudfunctions.net/expireMuralPosts
```

### 2️⃣ Criar o Cloud Scheduler Job no Google Cloud Console

**Via Console:**
1. Acesse [Google Cloud Console](https://console.cloud.google.com)
2. Vá para **Cloud Scheduler**
3. Clique em **Create Job**
4. Configure:
   - **Name**: `expire-mural-posts`
   - **Frequency**: `0 0 * * *` (diariamente à meia-noite) ou `0 */6 * * *` (a cada 6 horas)
   - **Timezone**: Seu timezone (ex: America/Sao_Paulo)
   - **Execution timeout**: `60s`
5. Clique **Continue**
6. Configure a execução:
   - **Authentication**: Selecione **Add OIDC token**
   - **Service Account Email**: Escolha a service account padrão ou crie uma
   - **Audience**: Cole a URL da função (https://[REGION]-[PROJECT_ID].cloudfunctions.net/expireMuralPosts)
7. Clique **Create**

**Via gcloud CLI:**
```bash
gcloud scheduler jobs create http expire-mural-posts \
  --location=us-central1 \
  --schedule="0 0 * * *" \
  --uri="https://[REGION]-[PROJECT_ID].cloudfunctions.net/expireMuralPosts" \
  --http-method=POST \
  --oidc-service-account-email=[SERVICE_ACCOUNT_EMAIL] \
  --oidc-token-audience="https://[REGION]-[PROJECT_ID].cloudfunctions.net/expireMuralPosts"
```

### 3️⃣ Validar a Configuração

Teste manualmente a função:
```bash
# No Cloud Scheduler, clique em "Force run"
```

Ou via curl (com autenticação):
```bash
CREDENTIALS=$(gcloud auth print-identity-token --audiences=[FUNCTION_URL])
curl -X POST [FUNCTION_URL] \
  -H "Authorization: Bearer $CREDENTIALS" \
  -H "Content-Type: application/json"
```

---

## 📊 Expressões Cron (Frequências)

| Expressão | Significado |
|-----------|-------------|
| `0 0 * * *` | Diariamente à meia-noite ⏰ |
| `0 */6 * * *` | A cada 6 horas |
| `0 9,17 * * *` | Todos os dias às 09:00 e 17:00 |
| `0 0 * * 0` | Toda segunda-feira à meia-noite |
| `0 0 1 * *` | Primeiro dia de cada mês |

---

## 🔒 Segurança

- ✅ A função valida o **Authorization header** com OIDC token
- ✅ Somente Cloud Scheduler pode disparar (em produção)
- ✅ Timeout configurado em 60 segundos
- ✅ Logs de auditoria no Cloud Logging

---

## 📝 Logs e Monitoramento

Ver logs da execução:
```bash
firebase functions:log --only expireMuralPosts
```

Ou no Cloud Console → **Cloud Logging** → Filtrar pela função.

---

## ✅ Vantagens do Cloud Scheduler vs Node-Cron

| Aspecto | Cloud Scheduler | Node-Cron |
|--------|-----------------|-----------|
| Infraestrutura | Gerenciada | Precisa manter servidor rodando |
| Escalabilidade | Automática | Manual |
| Confiabilidade | Alta (Google Cloud) | Depende do servidor |
| Custo | Apenas pelo uso | Custo do servidor 24/7 |
| Failover | Automático | Manual |

---

## 🧪 Testar Localmente

Para testar a função localmente:

```bash
# Iniciar emulador
firebase emulators:start --only functions

# Em outro terminal, fazer requisição
curl -X POST http://localhost:5001/[PROJECT_ID]/us-central1/expireMuralPosts \
  -H "Content-Type: application/json"
```

---

## 🆘 Troubleshooting

**Função não está sendo executada?**
- Verificar se o job foi criado no Cloud Scheduler
- Validar a URL da função
- Verificar permissões da service account

**Erro de autenticação?**
- Confirmar que OIDC token está configurado
- Verificar se a service account tem permissão de `cloudfunctions.functions.invoke`

**Posts não estão sendo expirados?**
- Verificar se existem posts com `createdAt` anterior a 30 dias
- Verificar logs: `firebase functions:log`
