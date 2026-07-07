import { db } from "../firebase/firebaseAdmin.js";

/**
 * Busca todos os mural_posts com mais de 30 dias e atualiza status para "expired"
 * @returns {Promise<Object>} Resultado da operação
 */
export const expireOldMuralPosts = async () => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Buscar posts criados há mais de 30 dias que ainda não estão expirados
    const snapshot = await db
      .collection("mural_posts")
      .where("createdAt", "<", thirtyDaysAgo)
      .where("status", "!=", "expired")
      .get();

    if (snapshot.empty) {
      return {
        success: true,
        message: "Nenhum post para expirar",
        updatedCount: 0,
        posts: [],
      };
    }

    const updatedPosts = [];
    const batch = db.batch();

    snapshot.forEach((doc) => {
      batch.update(doc.ref, {
        status: "expired",
        expiredAt: new Date(),
      });

      updatedPosts.push({
        id: doc.id,
        ...doc.data(),
      });
    });

    await batch.commit();

    console.log(`✅ ${snapshot.size} post(s) expirado(s) com sucesso`);

    return {
      success: true,
      message: `${snapshot.size} post(s) expirado(s) com sucesso`,
      updatedCount: snapshot.size,
      posts: updatedPosts,
    };
  } catch (error) {
    console.error("❌ Erro ao expirar posts antigos:", error);
    return {
      success: false,
      error: error.message,
      updatedCount: 0,
    };
  }
};
