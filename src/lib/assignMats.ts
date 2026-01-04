import { db } from "./db";

export type MatSettings = {
  numMats: number;
  minRestBouts: number;
  restPenalty: number;
};

export async function assignMatsForMeet(meetId: string, s: MatSettings) {
  const bouts = await db.bout.findMany({
    where: { meetId },
    orderBy: [{ locked: "desc" }, { score: "asc" }],
  });

  await db.bout.updateMany({ where: { meetId }, data: { mat: null, order: null } });

  const mats: { boutIds: string[] }[] = Array.from({ length: s.numMats }, () => ({ boutIds: [] }));
  const lastOnMat = new Map<string, { matIdx: number; order: number }>();

  function penalty(bout: { redId: string; greenId: string }, matIdx: number) {
    const nextOrder = mats[matIdx].boutIds.length + 1;
    let p = 0;

    for (const wid of [bout.redId, bout.greenId]) {
      const last = lastOnMat.get(wid);
      if (!last) continue;
      if (last.matIdx === matIdx) {
        const gap = nextOrder - last.order;
        if (gap <= s.minRestBouts) p += s.restPenalty * (s.minRestBouts - gap + 1);
      }
    }

    p += mats[matIdx].boutIds.length * 0.01;
    return p;
  }

  for (const b of bouts) {
    let bestMat = 0;
    let best = Number.POSITIVE_INFINITY;

    for (let m = 0; m < s.numMats; m++) {
      const p = penalty(b, m);
      if (p < best) { best = p; bestMat = m; }
    }

    const order = mats[bestMat].boutIds.length + 1;
    mats[bestMat].boutIds.push(b.id);

    await db.bout.update({ where: { id: b.id }, data: { mat: bestMat + 1, order } });

    lastOnMat.set(b.redId, { matIdx: bestMat, order });
    lastOnMat.set(b.greenId, { matIdx: bestMat, order });
  }

  return { assigned: bouts.length, numMats: s.numMats };
}
