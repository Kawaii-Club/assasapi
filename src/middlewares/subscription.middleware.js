export function requireActiveSubscription(req, res, next) {
  const user = req.user; 

  if (!user.planStatus) {
    return res.status(403).json({ error: "Sem assinatura" });
  }

  if (user.planStatus !== "active") {
    return res.status(403).json({ error: "Assinatura inativa" });
  }

  if (user.planExpiresAt) {
    const expiresAt = new Date(user.planExpiresAt);
    const now = new Date();

    if (now > expiresAt) {
      return res.status(403).json({ error: "Assinatura vencida" });
    }
  }

  next();
}