// Fallback mechanics checked against official Bitburner 3.0.1 Hacking.ts and Server/formulas/grow.ts.
// Pure calculations let small helper processes avoid overlapping home RPCs.
export function hackingChance(server, player) {
  if (!server.hasAdminRights || server.hackDifficulty >= 100) return 0;
  const skill = Math.max(1, 1.75 * player.skills.hacking);
  return Math.min(1, Math.max(0, (skill - server.requiredHackingSkill) / skill *
    ((100 - server.hackDifficulty) / 100) * player.mults.hacking_chance *
    (1 + Math.pow(player.skills.intelligence || 0, 0.8) / 600)));
}

export function hackingPercent(server, player, multipliers) {
  if (server.hackDifficulty >= 100 || player.skills.hacking <= 0) return 0;
  return Math.min(1, Math.max(0, (100 - server.hackDifficulty) / 100 *
    (player.skills.hacking - server.requiredHackingSkill + 1) / player.skills.hacking *
    player.mults.hacking_money * multipliers.ScriptHackMoney / 240));
}

export function growthLog(server, player, multipliers, cores = 1) {
  return Math.min(Math.log1p(0.03 / server.hackDifficulty), Math.log1p(0.0035)) *
    server.serverGrowth / 100 * multipliers.ServerGrowthRate * player.mults.hacking_grow * (1 + (cores - 1) / 16);
}

export function growThreads(server, player, multipliers, cores = 1) {
  const start = Math.max(0, server.moneyAvailable), target = server.moneyMax;
  if (target <= start) return 0;
  const k = growthLog(server, player, multipliers, cores);
  if (!Number.isFinite(k) || k < 0 || !server.serverGrowth) return Infinity;
  if (k === 0) return Math.ceil(target - start);
  // Newton iteration in log space avoids overflow on low-money, high-growth servers.
  let threads = (target - start) / (1 + (target / 16 + start * 15 / 16) * k);
  for (let i = 0; i < 64; i++) {
    const money = start + threads;
    const next = (threads - money * Math.log(money / target)) / (1 + money * k);
    if (!Number.isFinite(next)) throw new Error('Invalid grow-thread calculation');
    const difference = Math.abs(next - threads);
    threads = next;
    if (difference <= 1) {
      let count = Math.max(0, Math.ceil(threads));
      const reaches = n => Math.log((start + n) / target) + k * n >= -1e-14;
      if (count > 0 && reaches(count - 1)) count--;
      if (!reaches(count)) count++;
      return count;
    }
  }
  throw new Error('Grow-thread calculation did not converge');
}
