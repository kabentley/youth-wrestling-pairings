import { promises as fs } from "fs";
import path from "path";

import JSZip from "jszip";
import { NextResponse } from "next/server";

import { DAYS_PER_YEAR } from "@/lib/constants";
import { db } from "@/lib/db";
import { requireAnyRole } from "@/lib/rbac";

export const runtime = "nodejs";

type TeamRow = {
  id: string;
  name: string;
  symbol: string;
  color: string;
  legacyId: number;
  sheetName: string;
  styleId: string;
  fileName: string;
};

type WrestlerRow = {
  id: string;
  teamId: string;
  first: string;
  last: string;
  weight: number;
  birthdate: Date;
  experienceYears: number;
  skill: number;
  status?: string | null;
};

type BoutRow = {
  id: string;
  redId: string;
  greenId: string;
  mat: number;
  order: number;
};

function sanitizeFilePart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 64) || "meet";
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function trimNumber(value: number, decimals = 1) {
  const fixed = value.toFixed(decimals);
  return fixed.replace(/\.0+$|(\.\d*[1-9])0+$/, "$1");
}

function formatDateShort(date: Date) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
}

function toDateOnlyUtc(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function formatAge(birthdate: Date, meetDate: Date) {
  const birth = toDateOnlyUtc(birthdate);
  const meet = toDateOnlyUtc(meetDate);
  const days = (meet.getTime() - birth.getTime()) / (1000 * 60 * 60 * 24);
  const years = Math.max(0, days / DAYS_PER_YEAR);
  return trimNumber(years, 1);
}

function formatWeight(weight: number) {
  return trimNumber(weight, 1);
}

function toStyleId(symbol: string) {
  let id = symbol.replace(/[^a-zA-Z0-9_]/g, "");
  if (!id) id = "T";
  if (!/^[A-Za-z_]/.test(id)) id = `T${id}`;
  return id;
}

function sanitizeSheetName(value: string) {
  const invalidChars = new Set(["[", "]", "*", "/", "\\", "?", ":"]);
  let cleaned = "";
  for (const ch of value) {
    cleaned += invalidChars.has(ch) ? "_" : ch;
  }
  return cleaned;
}

function toSheetName(symbol: string, used: Set<string>) {
  let name = sanitizeSheetName(symbol).slice(0, 31) || "Team";
  let unique = name;
  let counter = 2;
  while (used.has(unique)) {
    const suffix = `_${counter}`;
    unique = `${name.slice(0, 31 - suffix.length)}${suffix}`;
    counter += 1;
  }
  used.add(unique);
  return unique;
}

function toSymbol(raw: string, used: Set<string>, fallback: string) {
  let symbol = raw.trim();
  if (!symbol) symbol = fallback;
  symbol = symbol.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!symbol) symbol = fallback;
  let unique = symbol;
  let counter = 2;
  while (used.has(unique)) {
    unique = `${symbol}${counter}`;
    counter += 1;
  }
  used.add(unique);
  return unique;
}

function toSignedColor(color: string | null | undefined) {
  const hex = color?.startsWith("#") ? color.slice(1) : "";
  if (hex.length !== 6) {
    return -16777216;
  }
  const value = parseInt(hex, 16);
  if (Number.isNaN(value)) return -16777216;
  const argb = (0xff << 24) | value;
  const signed = argb >> 0;
  return signed;
}

function formatInitialName(first: string, last: string) {
  const initial = first.trim().slice(0, 1);
  return `${initial ? `${initial} ` : ""}${last.trim()}`.trim();
}

function formatFullName(first: string, last: string) {
  return `${first.trim()} ${last.trim()}`.trim();
}

function cell(value: string | number, type: "String" | "Number", styleId?: string) {
  const stylePart = styleId ? ` ss:StyleID="${styleId}"` : "";
  const safe = type === "String" ? escapeXml(String(value)) : String(value);
  return `<Cell${stylePart}><Data ss:Type="${type}">${safe}</Data></Cell>`;
}

function row(cells: string[]) {
  return `<Row>${cells.join("")}</Row>`;
}

export async function GET(_req: Request, { params }: { params: Promise<{ meetId: string }> }) {
  try {
    await requireAnyRole(["COACH", "ADMIN"]);
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: "Coaches only." }, { status: 403 });
    }
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { meetId } = await params;
  const meet = await db.meet.findUnique({
    where: { id: meetId },
    select: {
      id: true,
      name: true,
      date: true,
      numMats: true,
      homeTeamId: true,
      meetTeams: {
        include: {
          team: { select: { id: true, name: true, symbol: true, color: true } },
        },
      },
    },
  });

  if (!meet) {
    return NextResponse.json({ error: "Meet not found." }, { status: 404 });
  }

  const teamIds = meet.meetTeams.map(mt => mt.teamId);
  const [wrestlersRaw, statusesRaw, boutsRaw, xslContent] = await Promise.all([
    db.wrestler.findMany({
      where: { teamId: { in: teamIds } },
      select: {
        id: true,
        teamId: true,
        first: true,
        last: true,
        weight: true,
        birthdate: true,
        experienceYears: true,
        skill: true,
      },
    }),
    db.meetWrestlerStatus.findMany({
      where: { meetId },
      select: { wrestlerId: true, status: true },
    }),
    db.bout.findMany({
      where: { meetId },
      select: { id: true, redId: true, greenId: true, mat: true, order: true },
    }),
    fs.readFile(path.join(process.cwd(), "src", "lib", "pairings2010", "pairings.xsl"), "utf8"),
  ]);

  const statusMap = new Map(statusesRaw.map(s => [s.wrestlerId, s.status]));
  const wrestlers = wrestlersRaw.map(w => ({ ...w, status: statusMap.get(w.id) })) as WrestlerRow[];
  const wrestlerById = new Map(wrestlers.map(w => [w.id, w]));

  const usedSymbols = new Set<string>();
  const usedSheetNames = new Set<string>();
  const rawTeams = meet.meetTeams.map(mt => mt.team);
  let orderedTeams = rawTeams;
  if (meet.homeTeamId) {
    const homeTeam = rawTeams.find(t => t.id === meet.homeTeamId);
    if (homeTeam) {
      orderedTeams = [homeTeam, ...rawTeams.filter(t => t.id !== meet.homeTeamId)];
    }
  }

  const teams: TeamRow[] = orderedTeams.map((team, index) => {
    const fallback = `T${index + 1}`;
    const symbol = toSymbol(team.symbol, usedSymbols, fallback);
    const styleId = toStyleId(symbol);
    const sheetName = toSheetName(symbol, usedSheetNames);
    return {
      id: team.id,
      name: team.name,
      symbol,
      color: team.color,
      legacyId: index + 1,
      sheetName,
      styleId,
      fileName: `${symbol}.csv`,
    };
  });

  const teamById = new Map(teams.map(t => [t.id, t]));

  const wrestlersByTeam = new Map<string, WrestlerRow[]>();
  for (const team of teams) {
    const list = wrestlers
      .filter(w => w.teamId === team.id)
      .sort((a, b) => (a.last === b.last ? a.first.localeCompare(b.first) : a.last.localeCompare(b.last)));
    wrestlersByTeam.set(team.id, list);
  }

  const wrestlerIndexById = new Map<string, number>();
  for (const team of teams) {
    const list = wrestlersByTeam.get(team.id) ?? [];
    list.forEach((w, idx) => {
      wrestlerIndexById.set(w.id, idx);
    });
  }

  const bouts: BoutRow[] = boutsRaw.map(b => ({
    id: b.id,
    redId: b.redId,
    greenId: b.greenId,
    mat: b.mat ?? 1,
    order: b.order ?? 9999,
  }));

  const matMap = new Map<number, BoutRow[]>();
  for (const bout of bouts) {
    const list = matMap.get(bout.mat) ?? [];
    list.push(bout);
    matMap.set(bout.mat, list);
  }

  const maxMat = Math.max(meet.numMats, ...Array.from(matMap.keys()));
  const matNumbers = Array.from({ length: maxMat }, (_, i) => i + 1);

  const boutNumberById = new Map<string, number>();
  const matOrderedBouts = new Map<number, BoutRow[]>();
  for (const mat of matNumbers) {
    const list = (matMap.get(mat) ?? []).slice().sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.id.localeCompare(b.id);
    });
    list.forEach((bout, index) => {
      boutNumberById.set(bout.id, mat * 100 + index);
    });
    matOrderedBouts.set(mat, list);
  }

  const wrestlerBouts = new Map<string, { number: number; oppTeam: string; oppName: string }[]>();
  for (const bout of bouts) {
    const number = boutNumberById.get(bout.id);
    if (number === undefined) continue;
    const red = wrestlerById.get(bout.redId);
    const green = wrestlerById.get(bout.greenId);
    if (!red || !green) continue;
    const redTeam = teamById.get(red.teamId);
    const greenTeam = teamById.get(green.teamId);
    if (!redTeam || !greenTeam) continue;
    const redOpp = {
      number,
      oppTeam: greenTeam.symbol,
      oppName: formatInitialName(green.first, green.last),
    };
    const greenOpp = {
      number,
      oppTeam: redTeam.symbol,
      oppName: formatInitialName(red.first, red.last),
    };
    if (!wrestlerBouts.has(red.id)) wrestlerBouts.set(red.id, []);
    if (!wrestlerBouts.has(green.id)) wrestlerBouts.set(green.id, []);
    wrestlerBouts.get(red.id)!.push(redOpp);
    wrestlerBouts.get(green.id)!.push(greenOpp);
  }

  for (const entries of wrestlerBouts.values()) {
    entries.sort((a, b) => a.number - b.number);
  }

  const meetName = meet.name.trim() || "meet";
  const safeMeetName = sanitizeFilePart(meetName);
  const meetDate = meet.date;

  const wrsLines: string[] = [];
  wrsLines.push('<?xml version="1.0" encoding="utf-8"?>');
  wrsLines.push('<Meet Version="3000">');
  for (const team of teams) {
    wrsLines.push(
      `  <Team ID="${team.legacyId}" File="${escapeXml(team.fileName)}" Name="${escapeXml(team.name)}" Symbol="${escapeXml(team.symbol)}" Color="${toSignedColor(team.color)}">`,
    );
    const teamWrestlers = wrestlersByTeam.get(team.id) ?? [];
    for (const wrestler of teamWrestlers) {
      const status = wrestler.status ?? null;
      const attending = status !== "NOT_COMING" && status !== "ABSENT";
      const early = status === "EARLY";
      const late = status === "LATE";
      wrsLines.push(
        `    <Wrestler First="${escapeXml(wrestler.first)}" Last="${escapeXml(wrestler.last)}" Weight="${formatWeight(wrestler.weight)}" Birthday="${formatDateShort(wrestler.birthdate)}" Exp="${wrestler.experienceYears}" Skill="${wrestler.skill}" Attending="${attending ? "true" : "false"}" Early="${early ? "true" : "false"}" Late="${late ? "true" : "false"}" />`,
      );
    }
    wrsLines.push("  </Team>");
  }
  for (const mat of matNumbers) {
    wrsLines.push(`  <Mat Number="${mat}">`);
    const list = matOrderedBouts.get(mat) ?? [];
    for (const bout of list) {
      const red = wrestlerById.get(bout.redId);
      const green = wrestlerById.get(bout.greenId);
      if (!red || !green) continue;
      const redTeam = teamById.get(red.teamId);
      const greenTeam = teamById.get(green.teamId);
      if (!redTeam || !greenTeam) continue;
      const redIndex = wrestlerIndexById.get(red.id);
      const greenIndex = wrestlerIndexById.get(green.id);
      if (redIndex === undefined || greenIndex === undefined) continue;
      wrsLines.push(
        `    <Bout DefaultMat="${mat}" Team1="${redTeam.legacyId}" ID1="${redIndex}" Team2="${greenTeam.legacyId}" ID2="${greenIndex}" />`,
      );
    }
    wrsLines.push("  </Mat>");
  }
  wrsLines.push("</Meet>");
  const wrsXml = wrsLines.join("\n");

  const webLines: string[] = [];
  webLines.push('<?xml version="1.0" encoding="utf-8"?>');
  webLines.push('<?xml-stylesheet type="text/xsl" href="pairings.xsl"?>');
  webLines.push(`<Meet Name="${escapeXml(meetName)}" ShowStats="false">`);
  for (const team of teams) {
    webLines.push(
      `  <Team Name="${escapeXml(team.name)}" Symbol="${escapeXml(team.symbol)}" Color="${escapeXml(team.color)}">`,
    );
    const teamWrestlers = wrestlersByTeam.get(team.id) ?? [];
    for (const wrestler of teamWrestlers) {
      const age = formatAge(wrestler.birthdate, meetDate);
      const weight = formatWeight(wrestler.weight);
      webLines.push(
        `    <Member FirstName="${escapeXml(wrestler.first)}" LastName="${escapeXml(wrestler.last)}" Age="${age}" Weight="${weight}" Skill="${wrestler.skill}" Experience="${wrestler.experienceYears}">`,
      );
      const entries = wrestlerBouts.get(wrestler.id) ?? [];
      for (const entry of entries) {
        webLines.push(
          `      <Bout Number="${entry.number}" OppTeam="${escapeXml(entry.oppTeam)}" Opponent="${escapeXml(entry.oppName)}"></Bout>`,
        );
      }
      webLines.push("    </Member>");
    }
    webLines.push("  </Team>");
  }
  for (const mat of matNumbers) {
    webLines.push(`  <Mat Name="Mat ${mat}">`);
    const list = matOrderedBouts.get(mat) ?? [];
    for (const bout of list) {
      const number = boutNumberById.get(bout.id);
      if (number === undefined) continue;
      const red = wrestlerById.get(bout.redId);
      const green = wrestlerById.get(bout.greenId);
      if (!red || !green) continue;
      const redTeam = teamById.get(red.teamId);
      const greenTeam = teamById.get(green.teamId);
      if (!redTeam || !greenTeam) continue;
      webLines.push(`    <MatBout Number="${number}">`);
      webLines.push(
        `      <Wrestler1 Team="${escapeXml(redTeam.symbol)}" Name="${escapeXml(formatFullName(red.first, red.last))}" />`,
      );
      webLines.push(
        `      <Wrestler2 Team="${escapeXml(greenTeam.symbol)}" Name="${escapeXml(formatFullName(green.first, green.last))}" />`,
      );
      webLines.push("    </MatBout>");
    }
    webLines.push("  </Mat>");
  }
  webLines.push("</Meet>");
  const webXml = webLines.join("\n");

  const excelLines: string[] = [];
  excelLines.push('<?xml version="1.0" encoding="utf-8"?>');
  excelLines.push('<?mso-application progid="Excel.Sheet"?>');
  excelLines.push(
    '<Workbook xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:html="http://www.w3.org/TR/REC-html40" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="urn:schemas-microsoft-com:office:spreadsheet">',
  );
  excelLines.push("  <Styles>");
  excelLines.push('    <Style ss:ID="Default" ss:Name="Normal">');
  excelLines.push('      <Alignment ss:Vertical="Bottom" />');
  excelLines.push("      <Borders />");
  excelLines.push('      <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="11" ss:Color="#000000" />');
  excelLines.push("      <Interior />");
  excelLines.push("      <NumberFormat />");
  excelLines.push("      <Protection />");
  excelLines.push("    </Style>");
  excelLines.push('    <Style ss:ID="matheading">');
  excelLines.push('      <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="18" ss:Color="#000000" ss:Bold="1" />');
  excelLines.push("    </Style>");
  excelLines.push('    <Style ss:ID="teamname">');
  excelLines.push('      <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="18" ss:Color="#000000" ss:Bold="1" ss:Italic="1" />');
  excelLines.push("    </Style>");
  excelLines.push('    <Style ss:ID="boldnormal">');
  excelLines.push('      <Alignment ss:Horizontal="Left" ss:Vertical="Bottom" />');
  excelLines.push('      <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="11" ss:Bold="1" ss:Color="#000000" />');
  excelLines.push("    </Style>");
  for (const team of teams) {
    const color = team.color.startsWith("#") ? team.color : "#000000";
    excelLines.push(`    <Style ss:ID="${team.styleId}_bold">`);
    excelLines.push(`      <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="11" ss:Color="${color}" ss:Bold="1" />`);
    excelLines.push("    </Style>");
    excelLines.push(`    <Style ss:ID="${team.styleId}">`);
    excelLines.push(`      <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="11" ss:Color="${color}" />`);
    excelLines.push("    </Style>");
  }
  excelLines.push("  </Styles>");

  for (const team of teams) {
    const teamWrestlers = wrestlersByTeam.get(team.id) ?? [];
    const maxBouts = Math.max(0, ...teamWrestlers.map(w => (wrestlerBouts.get(w.id) ?? []).length));
    const columnCount = 4 + maxBouts * 2;
    const rowCount = teamWrestlers.length + 1;
    excelLines.push(`  <Worksheet ss:Name="${escapeXml(team.sheetName)}">`);
    excelLines.push(
      `    <Table ss:ExpandedColumnCount="${columnCount}" ss:ExpandedRowCount="${rowCount}" x:FullColumns="1" x:FullRows="1" ss:DefaultRowHeight="15">`,
    );
    excelLines.push(row([cell(team.name, "String", "teamname")]));
    for (const wrestler of teamWrestlers) {
      const entries = wrestlerBouts.get(wrestler.id) ?? [];
      const cells: string[] = [];
      cells.push(cell(formatAge(wrestler.birthdate, meetDate), "Number"));
      cells.push(cell(formatWeight(wrestler.weight), "Number"));
      cells.push(cell(wrestler.experienceYears, "Number"));
      cells.push(cell(`${wrestler.last}, ${wrestler.first}`, "String", `${team.styleId}_bold`));
      for (const entry of entries) {
        cells.push(cell(entry.number, "Number"));
        const oppTeam = teams.find(t => t.symbol === entry.oppTeam);
        const oppStyle = oppTeam ? oppTeam.styleId : undefined;
        cells.push(cell(entry.oppName, "String", oppStyle));
      }
      excelLines.push(row(cells));
    }
    excelLines.push("    </Table>");
    excelLines.push("  </Worksheet>");
  }

  for (const mat of matNumbers) {
    const list = matOrderedBouts.get(mat) ?? [];
    excelLines.push(`  <Worksheet ss:Name="Mat ${mat}">`);
    excelLines.push(
      `    <Table ss:ExpandedColumnCount="5" ss:ExpandedRowCount="${list.length + 1}" x:FullColumns="1" x:FullRows="1" ss:DefaultRowHeight="15">`,
    );
    excelLines.push(row([cell(`Mat ${mat}`, "String", "matheading")]));
    for (const bout of list) {
      const number = boutNumberById.get(bout.id);
      if (number === undefined) continue;
      const red = wrestlerById.get(bout.redId);
      const green = wrestlerById.get(bout.greenId);
      if (!red || !green) continue;
      const redTeam = teamById.get(red.teamId);
      const greenTeam = teamById.get(green.teamId);
      if (!redTeam || !greenTeam) continue;
      const cells = [
        cell(number, "Number"),
        cell(redTeam.symbol, "String", redTeam.styleId),
        cell(formatFullName(red.first, red.last), "String", redTeam.styleId),
        cell(greenTeam.symbol, "String", greenTeam.styleId),
        cell(formatFullName(green.first, green.last), "String", greenTeam.styleId),
      ];
      excelLines.push(row(cells));
    }
    excelLines.push("    </Table>");
    excelLines.push("  </Worksheet>");
  }

  excelLines.push("</Workbook>");
  const excelXml = excelLines.join("\n");

  const zip = new JSZip();
  zip.file(`${safeMeetName}.wrs`, wrsXml);
  zip.file(`${safeMeetName}.web.xml`, webXml);
  zip.file(`${safeMeetName}.excel.xml`, excelXml);
  zip.file("pairings.xsl", xslContent);

  const exportStamp = meet.date.toISOString().slice(0, 10);
  const zipData = await zip.generateAsync({ type: "nodebuffer" });
  return new NextResponse(new Uint8Array(zipData), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${safeMeetName}_${exportStamp}.zip"`,
    },
  });
}
