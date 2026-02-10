
export function todayPlus(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);

  return date.toISOString().split("T")[0];
}
