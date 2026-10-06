import supabase from "~/db.server";

/**
 * Wat er NU in elke lopende test gebeurt, per variant.
 *
 * Eén RPC (test_live, migratie 0028) die price_test_events - wie zit in welke
 * groep, wie legde iets in de cart, wie kocht - combineert met site_sessies -
 * wie is er nog, op welke pagina, hoe ver in de kassa. Zie de migratie voor de
 * vensters: "nu" is vijf minuten, de rest vijftien.
 */

export type LiveStap =
  | "bekijkt" | "cart" | "kassa" | "contact" | "verzending" | "betaling" | "gekocht";

export type LiveGroep = {
  nu: number;
  opPagina: number;
  cart: number;
  kassa: number;
  gekocht: number;
  omzet: number;
  vandaagOrders: number;
  vandaagOmzet: number;
  vandaagAbo: number;
};

export type LiveMens = {
  wie: string;
  klant: boolean;
  groep: "control" | "test";
  stap: LiveStap;
  land: string | null;
  device: string | null;
  pagina: string | null;
  cents: number;
  abo: boolean;
  sec: number;
};

export type LiveTest = {
  id: number;
  naam: string;
  type: string;
  split: number;
  paden: string[];
  groepen: { control: LiveGroep; test: LiveGroep };
  mensen: LiveMens[];
};

export type TestLiveData = { op: string; tests: LiveTest[]; fout?: string };

const LEEG: LiveGroep = {
  nu: 0, opPagina: 0, cart: 0, kassa: 0, gekocht: 0, omzet: 0,
  vandaagOrders: 0, vandaagOmzet: 0, vandaagAbo: 0,
};

const getal = (v: unknown) => Number(v) || 0;

function groep(r: any): LiveGroep {
  if (!r) return LEEG;
  return {
    nu: getal(r.nu), opPagina: getal(r.opPagina), cart: getal(r.cart), kassa: getal(r.kassa),
    gekocht: getal(r.gekocht), omzet: getal(r.omzet),
    vandaagOrders: getal(r.vandaagOrders), vandaagOmzet: getal(r.vandaagOmzet),
    vandaagAbo: getal(r.vandaagAbo),
  };
}

export async function testLiveData(shop: string): Promise<TestLiveData> {
  const { data, error } = await supabase.rpc("test_live", { p_shop: shop });
  if (error) {
    return { op: new Date().toISOString(), tests: [], fout: error.message };
  }
  const o = (data ?? {}) as any;
  return {
    op: String(o.op ?? new Date().toISOString()),
    tests: ((o.tests ?? []) as any[]).map((t) => ({
      id: getal(t.id),
      naam: String(t.naam ?? ""),
      type: String(t.type ?? ""),
      split: getal(t.split),
      paden: Array.isArray(t.paden) ? t.paden.map(String) : [],
      groepen: { control: groep(t.groepen?.control), test: groep(t.groepen?.test) },
      mensen: ((t.mensen ?? []) as any[]).map((m) => ({
        wie: String(m.wie ?? ""),
        klant: !!m.klant,
        groep: m.groep === "test" ? "test" : "control",
        stap: String(m.stap ?? "bekijkt") as LiveStap,
        land: m.land ? String(m.land) : null,
        device: m.device ? String(m.device) : null,
        pagina: m.pagina ? String(m.pagina) : null,
        cents: getal(m.cents),
        abo: !!m.abo,
        sec: getal(m.sec),
      })),
    })),
  };
}
