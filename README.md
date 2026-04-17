# Kawaii API

API backend para integração com Asaas, Firebase e notificações push.

## Visão geral

Este projeto contém principalmente duas partes:

- `src/`: API Express para assinaturas, pagamentos, conexões, notificações e webhooks.
- `functions/`: código de Cloud Functions Firebase separado, que atualmente replica parte da lógica de assinatura e envio de notificações.

## Tecnologias

- Node.js com `type: module`
- Express 5
- Firebase Admin
- Axios
- Asaas API
- dotenv
- CORS

## Como rodar

1. Instale dependências:

```bash
npm install
```

2. Crie um arquivo `.env` com as variáveis necessárias (veja `.env.example`).

3. Execute em modo de desenvolvimento:

```bash
npm run dev
```

4. Ou em produção:

```bash
npm start
```

## Variáveis de ambiente necessárias

- `PORT`: porta do servidor (opcional, padrão `3000`).
- `ASAAS_API_KEY`: token de API do Asaas.
- `ASAAS_API_URL`: URL base do Asaas.
- `ASAAS_WEBHOOK_TOKEN`: token esperado pelo webhook `/api/webhook/asaas`.
- `FIREBASE_SERVICE_ACCOUNT`: JSON do service account do Firebase (string JSON completa).

## Endpoints principais

### Saúde

- `GET /health`

### Pagamentos e assinaturas

- `POST /api/create-subscription`
- `POST /api/create-external-card`
- `POST /api/cancel-subscription`
- `POST /api/cancel-pending-payment`
- `POST /api/subscriptions/check-expiring/:userId`
- `POST /api/webhook/asaas`

### Conexões

- `POST /api/connections/request`

### Notificações

- `POST /api/notifications/send`
- `POST /api/notifications/test`

### Debug

- `GET /api/debug/test-notification/:userId`

## Problemas identificados e correções recomendadas

### 1. Rota de conexões duplicada / incorreta

Em `src/app.js` existe:

- `app.use("/api/connections", connectionRoutes)`
- `app.get("/api/connections", authMiddleware, requireActiveSubscription, connectionRoutes)`

O segundo trecho está incorreto. `connectionRoutes` é um `Router` com rota POST `/request`, logo não deve ser usado como callback direto em `app.get`. Deverá ser removido ou convertido para uma rota válida.

### 2. Rota `cancel-pending-payment` comentada/inconsistente

O comentário `// ← adicionar essa linha` em `src/app.js` indica código incompleto. Verificar se a rota realmente deve ser exposta e, caso afirmativo, manter apenas a declaração final e remover o comentário.

### 3. Autenticação e verificação de assinatura desalinhadas

- `auth.middleware.js` adiciona apenas `req.user` com o token Firebase.
- `subscription.middleware.js` espera `req.user.planStatus` e `req.user.planExpiresAt`.

Isso só funciona se o token Firebase já contém esses dados nas claims. Caso contrário, a validação é inválida e deve ser corrigida buscando o usuário no Firestore ou usando claims personalizadas.

### 4. Serviço de notificação inconsistente

- `src/services/notification.service.js` aceita apenas `fcmToken`.
- `src/controllers/connection.controller.js` e `src/routes/debug.routes.js` usam `toUserId`.

Isso é incompatível. Deve-se escolher uma interface única:

- ou `sendPushNotification({ fcmToken, ... })` e atualizar todas as chamadas,
- ou restaurar suporte a `toUserId` no serviço.

### 5. Código legacy e comentários desnecessários

- `src/services/notification.service.js` contém blocos de código comentados.
- `.readme` contém código comentado e trechos desatualizados.

Remover esses bloques e deixar apenas a implementação ativa.

### 6. Configuração de Firebase Admin

Em `src/firebase/firebaseAdmin.js`, o app exige `FIREBASE_SERVICE_ACCOUNT` como JSON string. Isso deve ficar documentado claramente ou o projeto deve usar um arquivo `serviceAccountKey.json` separado.

### 7. `functions/` com import path incorreto e lógica duplicada

- `functions/index.js` importa `./src/config/asaas.js`, mas a pasta `src` está no nível superior, então o caminho correto deveria ser `../src/config/asaas.js`.
- `functions/` contém lógica que duplica parte do `src/` e pode gerar divergências de comportamento.

Se o projeto não usar as Cloud Functions em produção, considerar remover ou estruturar `functions/` como um módulo separado, não misturado com o backend principal.

### 8. Uso incorreto de `POST` para checagem de expiração

`src/controllers/checkExpiring.controller.js` usa rota `POST /api/subscriptions/check-expiring/:userId`. Por semântica REST, `GET` é mais adequado, pois a rota apenas retorna dados de status.

### 9. `externalcard.controller.js` carrega `dotenv` dentro do controller

Configurações de ambiente devem ser centralizadas, não importadas em controllers. Remover `dotenv.config()` de dentro desse arquivo e garantir que a configuração seja carregada apenas uma vez no entrypoint do app.

## O que deve ser removido

- Código comentado antigo em `src/services/notification.service.js`.
- O conteúdo de `.readme` se ele não for utilizado como documentação oficial.
- Rota inválida ou duplicada em `src/app.js`.
- Usos quebrados de `toUserId` em rotas de debug e conexão, a menos que o serviço de notificação seja ajustado para suportá-los.
- Arquivos e lógica não utilizados de `functions/` se a intenção for manter apenas a API Express.

## Sugestão de organização

- `src/app.js`: manter apenas as configurações de middleware e rotas.
- `src/server.js`: apenas inicializa o app.
- `src/controllers/`: lógica de request/resposta.
- `src/services/`: lógica de integração com Asaas, Firebase, notificações.
- `src/config/`: só configuração de cliente e leitura de variáveis.
- `functions/`: separar claramente se for Cloud Functions e corrigir importações.

## Observações finais

- O projeto está funcional em grande parte, mas mistura várias responsabilidades e tem algumas rotas/serviços inconsistentes.
- A prioridade de correção deve ser: autenticação/subscription middleware, serviço de notificação e rota de conexões duplicadas.
- Depois, limpe código morto e documentação antiga.
