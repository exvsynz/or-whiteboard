import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Database,
  AssignmentStatus,
  RoomStatus,
  Json,
} from "./database.types";
import type { BoardPerson } from "./board-constants";
import type { AreaStatusInfo } from "./board-types";

type Client = SupabaseClient<Database>;

export interface AreaMaps {
  idByName: Map<string, string>;
  nameById: Map<string, string>;
}

// The client works with canonical area NAMES (board-constants); the DB is
// normalized on UUIDs. These maps are the single translation point.
let areaMapsPromise: Promise<AreaMaps> | null = null;

export function getAreaMaps(client: Client): Promise<AreaMaps> {
  if (!areaMapsPromise) {
    areaMapsPromise = fetchAreaMaps(client).catch((err) => {
      // Don't cache failures — allow retry on next call.
      areaMapsPromise = null;
      throw err;
    });
  }
  return areaMapsPromise;
}

export function resetAreaMapsCache(): void {
  areaMapsPromise = null;
}

async function fetchAreaMaps(client: Client): Promise<AreaMaps> {
  const { data, error } = await client.from("areas").select("id, name");
  if (error) throw new Error(`無法載入區域資料: ${error.message}`);
  const idByName = new Map<string, string>();
  const nameById = new Map<string, string>();
  for (const row of data) {
    idByName.set(row.name, row.id);
    nameById.set(row.id, row.name);
  }
  return { idByName, nameById };
}

export async function fetchRoster(
  client: Client,
  boardDate: string,
): Promise<BoardPerson[]> {
  const maps = await getAreaMaps(client);
  const { data, error } = await client
    .from("assignments")
    .select("person_id, area_id, status, people(name, role, color)")
    .eq("board_date", boardDate)
    // Stable order — without it card order shuffles on every refetch.
    .order("person_id", { ascending: true });
  if (error) throw new Error(`無法載入班表: ${error.message}`);

  const roster: BoardPerson[] = [];
  for (const row of data) {
    if (!row.people) continue;
    roster.push({
      id: row.person_id,
      name: row.people.name,
      role: row.people.role,
      color: row.people.color,
      area: row.area_id ? (maps.nameById.get(row.area_id) ?? null) : null,
      status: row.status,
    });
  }
  return roster;
}

export async function upsertAssignment(
  client: Client,
  personId: string,
  areaName: string | null,
  boardDate: string,
  status?: AssignmentStatus,
): Promise<void> {
  const maps = await getAreaMaps(client);
  let areaId: string | null = null;
  if (areaName !== null) {
    const resolved = maps.idByName.get(areaName);
    if (!resolved) throw new Error(`無效的區域: ${areaName}`);
    areaId = resolved;
  }
  const { error } = await client.from("assignments").upsert(
    {
      person_id: personId,
      area_id: areaId,
      board_date: boardDate,
      ...(status !== undefined ? { status } : {}),
    },
    { onConflict: "person_id,board_date" },
  );
  if (error) throw new Error(error.message);
}

export async function setAssignmentStatus(
  client: Client,
  personId: string,
  boardDate: string,
  status: AssignmentStatus,
): Promise<void> {
  const { error } = await client
    .from("assignments")
    .update({ status })
    .eq("person_id", personId)
    .eq("board_date", boardDate);
  if (error) throw new Error(error.message);
}

// Creates the person in the DB first so the local card carries the
// DB-generated id (the old code minted a client UUID the DB had never
// seen, so every later write against it failed or matched zero rows).
export async function addPersonToRoster(
  client: Client,
  name: string,
  role: string,
  color: string,
  boardDate: string,
): Promise<BoardPerson> {
  const { data: person, error: personError } = await client
    .from("people")
    .insert({ name, role, color })
    .select()
    .single();
  if (personError) throw new Error(personError.message);

  const { error: assignmentError } = await client.from("assignments").insert({
    person_id: person.id,
    area_id: null,
    board_date: boardDate,
  });
  if (assignmentError) {
    // Best-effort cleanup so a failed roster add doesn't leave an orphan
    // active person row (people has no delete policy; deactivate instead).
    await client
      .from("people")
      .update({ is_active: false })
      .eq("id", person.id);
    throw new Error(assignmentError.message);
  }

  return {
    id: person.id,
    name: person.name,
    role: person.role,
    color: person.color,
    area: null,
    status: "assigned",
  };
}

export async function removeFromRoster(
  client: Client,
  personId: string,
  boardDate: string,
): Promise<void> {
  const { data, error } = await client
    .from("assignments")
    .delete()
    .eq("person_id", personId)
    .eq("board_date", boardDate)
    .select("id");
  if (error) throw new Error(error.message);
  // A 0-row delete is a silent failure (the old removePerson bug) — surface it.
  if (!data || data.length === 0) {
    throw new Error("找不到該人員的班表記錄");
  }
}

export async function replaceBoard(
  client: Client,
  boardDate: string,
  people: BoardPerson[],
): Promise<BoardPerson[]> {
  const payload: Json = people.map((p) => ({
    name: p.name,
    role: p.role,
    color: p.color,
    area: p.area,
  }));
  const { data, error } = await client.rpc("replace_board", {
    p_board_date: boardDate,
    p_people: payload,
  });
  if (error) throw new Error(`匯入失敗: ${error.message}`);

  const rows = (data ?? []) as Array<{
    person_id: string;
    name: string;
    role: string;
    color: string;
    area: string | null;
  }>;
  return rows.map((row) => ({
    id: row.person_id,
    name: row.name,
    role: row.role,
    color: row.color,
    area: row.area,
    status: "assigned" as const,
  }));
}

export async function fetchAreaStatuses(
  client: Client,
): Promise<Map<string, AreaStatusInfo>> {
  const maps = await getAreaMaps(client);
  const { data, error } = await client
    .from("area_status")
    .select("area_id, status, note");
  if (error) throw new Error(`無法載入區域狀態: ${error.message}`);
  const result = new Map<string, AreaStatusInfo>();
  for (const row of data) {
    const name = maps.nameById.get(row.area_id);
    if (name) result.set(name, { status: row.status, note: row.note });
  }
  return result;
}

export async function setAreaStatus(
  client: Client,
  areaName: string,
  status: RoomStatus,
  note: string,
): Promise<void> {
  const maps = await getAreaMaps(client);
  const areaId = maps.idByName.get(areaName);
  if (!areaId) throw new Error(`無效的區域: ${areaName}`);
  const { error } = await client
    .from("area_status")
    .upsert({ area_id: areaId, status, note }, { onConflict: "area_id" });
  if (error) throw new Error(error.message);
}
