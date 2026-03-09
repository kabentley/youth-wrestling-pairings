import type { Prisma, PrismaClient } from "@prisma/client";

type BoutClient = Prisma.TransactionClient | PrismaClient;

function normalizeMats(mats: Iterable<number>) {
  const unique = new Set<number>();
  for (const mat of mats) {
    if (Number.isInteger(mat) && mat > 0) unique.add(mat);
  }
  return [...unique].sort((a, b) => a - b);
}

/** Rewrites bout orders on the given mats so they become contiguous starting at 1. */
export async function renumberBoutOrdersOnMats(
  client: BoutClient,
  meetId: string,
  mats: Iterable<number>,
) {
  const matList = normalizeMats(mats);
  if (matList.length === 0) {
    return { mats: [] as number[], renumbered: 0 };
  }

  const bouts = await client.bout.findMany({
    where: { meetId, mat: { in: matList } },
    select: { id: true, mat: true, order: true },
    orderBy: [{ mat: "asc" }, { order: "asc" }, { id: "asc" }],
  });

  const byMat = new Map<number, Array<{ id: string; order: number | null }>>();
  for (const bout of bouts) {
    if (!bout.mat) continue;
    const list = byMat.get(bout.mat) ?? [];
    list.push({ id: bout.id, order: bout.order ?? null });
    byMat.set(bout.mat, list);
  }

  let renumbered = 0;
  for (const mat of matList) {
    const list = byMat.get(mat) ?? [];
    for (let index = 0; index < list.length; index += 1) {
      const nextOrder = index + 1;
      if (list[index].order === nextOrder) continue;
      await client.bout.update({
        where: { id: list[index].id },
        data: { order: nextOrder },
      });
      renumbered += 1;
    }
  }

  return { mats: matList, renumbered };
}

/**
 * Deletes a set of bouts and then compacts ordering on every affected mat.
 *
 * Callers pass a Prisma `where` fragment scoped to the target subset of bouts.
 */
export async function deleteBoutsAndRenumber(
  client: BoutClient,
  meetId: string,
  where: Prisma.BoutWhereInput,
) {
  const toDelete = await client.bout.findMany({
    where: { meetId, ...where },
    select: { id: true, mat: true },
  });
  if (toDelete.length === 0) {
    return { deleted: 0, renumbered: 0, mats: [] as number[] };
  }

  const deleteIds = toDelete.map((bout) => bout.id);
  const affectedMats = toDelete
    .map((bout) => bout.mat)
    .filter((mat): mat is number => typeof mat === "number");

  await client.bout.deleteMany({
    where: { id: { in: deleteIds } },
  });

  const renumberResult = await renumberBoutOrdersOnMats(client, meetId, affectedMats);
  return { deleted: deleteIds.length, renumbered: renumberResult.renumbered, mats: renumberResult.mats };
}
