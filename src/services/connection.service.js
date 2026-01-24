// ============================================
// CONNECTION SERVICE
// ============================================

// Função para criar solicitação de conexão
// Apenas uma declaração, já exportada diretamente
export async function createConnectionRequest({ fromUserId, toUserId }) {
  // Simulação de inserção no banco de dados
  // Substitua por sua lógica real de Firestore ou outro DB
  const requestId = Math.random().toString(36).substring(2, 10);

  console.log(`✅ Solicitação criada: ${requestId} de ${fromUserId} para ${toUserId}`);
  return requestId;
}