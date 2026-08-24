import { useEffect, useRef, useState } from "react";
import { MASKER_BREED, MASKER_HOOG, landMasker } from "~/lib/landmask";
import { LANDPOSITIES } from "~/lib/landposities";

/**
 * De bol.
 *
 * Dit is geen kaart van waar het vandaag druk was - dat staat al in de
 * landenlijst en in de kengetallen. Dit is wie er nú rondloopt, en dat is het
 * enige op dit scherm dat verandert terwijl je ernaar kijkt. Elke vijftien
 * seconden komen er nieuwe cijfers binnen en groeien de baken ernaartoe; komt
 * er een bestelling, dan slaat die in op het land waar hij vandaan komt en
 * schiet er een boog naar de winkel.
 *
 * De nachtzijde is echt: de zonpositie komt uit de UTC-tijd en de datum. Dat is
 * geen versiering - het verklaart in één blik waarom het om negen uur 's
 * ochtends in Groot-Brittannië druk is en in Californië niet.
 *
 * WAT ER NIET IN ZIT
 * Geen texturen, geen kaartbestanden, geen netwerkverzoeken voor de kaart zelf.
 * De continenten komen uit een bitmasker van tien kilobyte dat in de bundel
 * zit. Een ingebedde Shopify-app die halverwege een plaatje van een vreemde
 * host trekt is precies het soort ding dat er een jaar later uit ligt zonder
 * dat iemand het merkt.
 *
 * three.js wordt pas op idle geladen, en de tekenlus staat stil zodra de bol
 * uit beeld is of het tabblad naar de achtergrond gaat.
 */

export type GlobePunt = { land: string; sessies: number; actief: number };
export type GlobeOrder = { land: string; cents: number; op: string };

/** Breedte- en lengtegraad naar een punt op een bol met straal r. */
function naarXYZ(lat: number, lon: number, r: number) {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  return [
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  ] as const;
}

/**
 * Waar de zon staat, als punt op dezelfde bol.
 *
 * Lengtegraad uit de klok: om 12:00 UTC staat de zon op de nulmeridiaan, en hij
 * loopt vijftien graden per uur naar het westen. Breedtegraad uit de datum: de
 * declinatie zwaait in een jaar tussen -23,44 en +23,44. Geen efemeride, wel
 * goed tot op een graad of wat - ruim genoeg voor een schaduwlijn die je alleen
 * als sfeer leest.
 */
function zonRichting(nu: Date): [number, number, number] {
  const min = nu.getUTCHours() * 60 + nu.getUTCMinutes();
  const lon = 180 - (min / 1440) * 360;
  const dag = Math.floor((nu.getTime() - Date.UTC(nu.getUTCFullYear(), 0, 0)) / 864e5);
  const dec = 23.44 * Math.sin((2 * Math.PI * (dag - 80.5)) / 365.25);
  const [x, y, z] = naarXYZ(dec, lon, 1);
  return [x, y, z];
}

/* ── de stippen van het land ──────────────────────────────────────────────
 * Een eigen shader en geen PointsMaterial: de nachtzijde vraagt om een kleur
 * per punt die van de zonstand afhangt, en die zou anders elke minuut over
 * twintigduizend punten opnieuw geschreven moeten worden. Nu is het één
 * uniform. De ronde vorm zit meteen in de fragment shader, dus de textuur die
 * daar eerst voor nodig was kan ook weg.
 * ────────────────────────────────────────────────────────────────────────── */
const LAND_VERTEX = `
  uniform vec3 zon;
  uniform float grootte;
  varying float licht;
  void main() {
    // De positie ís de normaal: elk punt ligt op een bol met straal 1.
    licht = smoothstep(-0.22, 0.18, dot(normalize(position), zon));
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = grootte * (1.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;

const LAND_FRAGMENT = `
  uniform vec3 dagKleur;
  uniform vec3 nachtKleur;
  varying float licht;
  void main() {
    vec2 mid = gl_PointCoord - vec2(0.5);
    if (dot(mid, mid) > 0.25) discard;
    gl_FragColor = vec4(mix(nachtKleur, dagKleur, licht), 1.0);
  }`;

export function Globe({
  punten, winkelLand, verseOrders, opFilter,
}: {
  punten: GlobePunt[];
  /** Waar de winkel staat; zonder dit geen bogen, alleen de inslag. */
  winkelLand?: string | null;
  /** Orders sinds de vorige ronde. De bol onthoudt welke hij al liet zien. */
  verseOrders?: GlobeOrder[];
  /** Klikken op een land filtert het hele scherm erop. */
  opFilter?: (land: string) => void;
}) {
  const doosRef = useRef<HTMLDivElement>(null);
  const [labels, setLabels] = useState<
    { land: string; actief: number; x: number; y: number; zicht: number }[]
  >([]);
  const [status, setStatus] = useState<"wacht" | "klaar" | "geen-webgl">("wacht");

  // De scène wordt één keer gebouwd. Nieuwe cijfers komen er via deze twee
  // haken in, zodat vijftien seconden later niet de hele bol opnieuw ontstaat.
  const nieuweCijfers = useRef<((p: GlobePunt[]) => void) | null>(null);
  const nieuweOrders = useRef<((o: GlobeOrder[], winkel: string | null) => void) | null>(null);
  const puntenRef = useRef(punten);
  puntenRef.current = punten;
  const filterRef = useRef(opFilter);
  filterRef.current = opFilter;

  /**
   * Orders die binnenkomen voordat de scène er is, wachten even.
   *
   * three laadt op idle en dat mag twee seconden duren; de eerste ronde is er
   * meestal eerder. Zonder wachtrij verdween een order die daartussen viel
   * zonder spoor - en juist dat is het soort fout waar je nooit achter komt,
   * want er gebeurt gewoon niets.
   */
  const wachtrij = useRef<GlobeOrder[]>([]);

  useEffect(() => { nieuweCijfers.current?.(punten); }, [punten]);
  useEffect(() => {
    if (!verseOrders?.length) return;
    if (nieuweOrders.current) nieuweOrders.current(verseOrders, winkelLand ?? null);
    else wachtrij.current.push(...verseOrders);
  }, [verseOrders, winkelLand]);

  useEffect(() => {
    const doosNu = doosRef.current;
    if (!doosNu) return;

    let opgeruimd = false;
    let stop: (() => void) | null = null;

    /**
     * Laden als de pagina tot rust is, niet als de bol in beeld komt.
     *
     * Dat laatste was het eerste idee en het is verleidelijk - three is met
     * afstand het zwaarste stuk van deze pagina. Maar een IntersectionObserver
     * vuurt niet als er niet geschilderd wordt, en dan laadt de bol nooit
     * zonder dat er iets misgaat waar je op kunt zoeken. Zichtbaarheid is prima
     * om de tekenlus te pauzeren, want dan is niets doen het veilige antwoord;
     * om iets te starten is het dat niet.
     */
    const rIC = (window as any).requestIdleCallback as
      | ((cb: () => void, o?: { timeout: number }) => number)
      | undefined;
    const wacht = rIC
      ? rIC(() => start(doosNu), { timeout: 2000 })
      : window.setTimeout(() => start(doosNu), 300);

    // De doos komt als argument binnen en niet uit de ref: TypeScript verliest
    // de nulcontrole zodra er een await tussen zit, en terecht - de component
    // kan intussen weg zijn.
    async function start(doos: HTMLDivElement) {
      const THREE = await import("three");
      if (opgeruimd) return;

      const opruimen: (() => void)[] = [];
      let renderer: import("three").WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      } catch {
        setStatus("geen-webgl");
        return;
      }
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.setSize(doos.clientWidth, doos.clientHeight);
      doos.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(30, doos.clientWidth / doos.clientHeight, 0.1, 100);

      /**
       * Camera-afstand uit de hoogte van het paneel.
       *
       * Op een vaste afstand liep de bol boven en onder het paneel uit, want
       * het paneel is breed en laag: de hoogte is de krappe kant.
       *
       * Wat er omhoog kan steken bepaalt hoe dichtbij het mag. De baken zijn
       * korter geworden en de bogen vlakker, en daarmee kon dit van 1,42 naar
       * 1,28: de bol vult nu achtenzeventig procent van de paneelhoogte in
       * plaats van zeventig.
       */
      const PAST = 1.28;
      const zetCamera = () => {
        camera.aspect = doos.clientWidth / Math.max(doos.clientHeight, 1);
        camera.position.z = PAST / Math.tan(((camera.fov / 2) * Math.PI) / 180);
        camera.updateProjectionMatrix();
      };
      zetCamera();

      // Alles hangt aan één groep, zodat draaien één rotatie is en niet twintig.
      const bol = new THREE.Group();
      scene.add(bol);

      /* ── de bol zelf ────────────────────────────────────────────────────
       * Een dichte bol iets binnen de stippen. Die is niet om te zien maar om
       * te verbergen: zonder hem schijnen de stippen van de achterkant er
       * dwars doorheen en wordt het een wolk in plaats van een planeet.
       * ─────────────────────────────────────────────────────────────────── */
      const kern = new THREE.Mesh(
        new THREE.SphereGeometry(0.985, 64, 48),
        new THREE.MeshBasicMaterial({ color: 0x14131b }),
      );
      bol.add(kern);

      /* ── land, met een dag- en een nachtzijde ────────────────────────────── */
      const masker = landMasker();
      const coords: number[] = [];
      for (let ry = 0; ry < MASKER_HOOG; ry++) {
        const lat = 90 - (ry + 0.5) * (180 / MASKER_HOOG);
        for (let rx = 0; rx < MASKER_BREED; rx++) {
          if (!masker[ry * MASKER_BREED + rx]) continue;
          const lon = -180 + (rx + 0.5) * (360 / MASKER_BREED);
          coords.push(...naarXYZ(lat, lon, 1));
        }
      }
      const landGeo = new THREE.BufferGeometry();
      landGeo.setAttribute("position", new THREE.Float32BufferAttribute(coords, 3));
      const landMat = new THREE.ShaderMaterial({
        uniforms: {
          zon: { value: new THREE.Vector3(...zonRichting(new Date())) },
          grootte: { value: 5.4 * Math.min(devicePixelRatio, 2) },
          dagKleur: { value: new THREE.Color(0xbcb9d8) },
          nachtKleur: { value: new THREE.Color(0x3a3750) },
        },
        vertexShader: LAND_VERTEX,
        fragmentShader: LAND_FRAGMENT,
      });
      bol.add(new THREE.Points(landGeo, landMat));
      opruimen.push(() => { landGeo.dispose(); landMat.dispose(); });

      /* ── elk land op de kaart ────────────────────────────────────────────
       * Richtingen één keer uitrekenen voor élk land dat vandaag verkeer had,
       * niet alleen voor wie nu online is. Dat scheelt werk bij elke ronde, en
       * het aantal baken mag dan vrij bewegen zonder dat er iets opnieuw
       * opgebouwd hoeft te worden.
       * ─────────────────────────────────────────────────────────────────── */
      const omhoog = new THREE.Vector3(0, 1, 0);
      type Plek = {
        land: string;
        richting: import("three").Vector3;
        draai: import("three").Quaternion;
        doel: number;   // waar het baken heen groeit
        nu: number;     // waar het baken staat
        actief: number;
      };
      const plekVan = new Map<string, Plek>();
      const maakPlek = (land: string): Plek | null => {
        const bestaat = plekVan.get(land);
        if (bestaat) return bestaat;
        const ll = LANDPOSITIES[land];
        if (!ll) return null;
        const richting = new THREE.Vector3(...naarXYZ(ll[0], ll[1], 1)).normalize();
        const plek: Plek = {
          land, richting, doel: 0, nu: 0, actief: 0,
          draai: new THREE.Quaternion().setFromUnitVectors(omhoog, richting),
        };
        plekVan.set(land, plek);
        return plek;
      };
      for (const p of puntenRef.current) maakPlek(p.land);
      if (winkelLand) maakPlek(winkelLand);

      // Ruimte voor wat er nu is plus een marge: een land dat later online komt
      // moet erbij passen zonder de scène opnieuw op te bouwen.
      const RUIMTE = Math.max(plekVan.size + 24, 32);

      /* ── stille landen ───────────────────────────────────────────────────
       * Waar het vandaag druk was maar nu niemand is: een stipje. Ze staan er
       * altijd, ook onder een baken - dan is het de voet ervan. Dat scheelt het
       * opnieuw opbouwen van geometrie bij elke ronde.
       * ─────────────────────────────────────────────────────────────────── */
      const stilPos: number[] = [];
      for (const p of plekVan.values()) {
        stilPos.push(p.richting.x * 1.004, p.richting.y * 1.004, p.richting.z * 1.004);
      }
      const stilGeo = new THREE.BufferGeometry();
      stilGeo.setAttribute("position", new THREE.Float32BufferAttribute(stilPos, 3));
      const stilMat = new THREE.PointsMaterial({
        size: 0.024, sizeAttenuation: true, color: 0x6d5fa8,
        transparent: true, opacity: 0.9, depthWrite: false,
      });
      bol.add(new THREE.Points(stilGeo, stilMat));
      opruimen.push(() => { stilGeo.dispose(); stilMat.dispose(); });

      /* ── baken ───────────────────────────────────────────────────────────── */
      const staafGeo = new THREE.CylinderGeometry(0.006, 0.006, 1, 6, 1, true);
      staafGeo.translate(0, 0.5, 0);   // voet op de oorsprong, niet het midden
      const staafMat = new THREE.MeshBasicMaterial({
        color: 0x8b6dff, transparent: true, opacity: 0.75, depthWrite: false,
      });
      const staven = new THREE.InstancedMesh(staafGeo, staafMat, RUIMTE);
      const kopGeo = new THREE.SphereGeometry(0.017, 12, 10);
      const kopMat = new THREE.MeshBasicMaterial({ color: 0xb6a2ff });
      const koppen = new THREE.InstancedMesh(kopGeo, kopMat, RUIMTE);
      // Wat er getekend wordt staat los van wat er gealloceerd is. Zonder dit
      // staat er 's nachts een staafje van de identiteitsmatrix uit de
      // noordpool te steken.
      staven.count = 0;
      koppen.count = 0;
      bol.add(staven, koppen);
      opruimen.push(() => {
        staafGeo.dispose(); staafMat.dispose(); kopGeo.dispose(); kopMat.dispose();
      });

      /**
       * Nieuwe cijfers binnen: alleen de doelen verzetten.
       *
       * De baken springen niet, ze groeien. Een getal dat elke vijftien seconden
       * verspringt leest als ruis; hetzelfde getal dat ernaartoe beweegt leest
       * als beweging - en dat is precies waar dit scherm over gaat.
       */
      nieuweCijfers.current = (nieuw) => {
        const top = Math.max(...nieuw.map((p) => p.actief), 1);
        for (const p of plekVan.values()) { p.doel = 0; p.actief = 0; }
        for (const n of nieuw) {
          const plek = maakPlek(n.land);
          if (!plek || plekVan.size > RUIMTE) continue;
          plek.actief = n.actief;
          // Korter dan eerst. Een baken van bijna een halve straal zette de
          // kop zo ver van het land af dat het label erboven nergens meer bij
          // leek te horen.
          plek.doel = n.actief > 0 ? 0.05 + 0.28 * Math.sqrt(n.actief / top) : 0;
        }
      };
      nieuweCijfers.current(puntenRef.current);

      /* ── inslagen en bogen ───────────────────────────────────────────────
       * Een order slaat in op het land waar hij vandaan komt: een ring die
       * uitdijt en vervaagt. Weten we waar de winkel staat, dan schiet er een
       * boog naartoe die zichzelf tekent.
       *
       * Allebei leven ze hooguit twee seconden en ruimen zichzelf op. Er staat
       * een dak van twaalf tegelijk: bij een uitverkoop wil je een dashboard en
       * geen vuurwerk.
       * ─────────────────────────────────────────────────────────────────── */
      const ringGeo = new THREE.RingGeometry(0.4, 0.5, 32);
      const inslagen: { mesh: import("three").Mesh; t: number }[] = [];
      const bogen: { lijn: import("three").Line; t: number; punten: number }[] = [];
      opruimen.push(() => ringGeo.dispose());

      const gezien = new Set<string>();
      const toon = (orders: GlobeOrder[], winkel: string | null) => {
        for (const o of orders) {
          const sleutel = o.land + "|" + o.op;
          if (gezien.has(sleutel)) continue;
          gezien.add(sleutel);
          if (gezien.size > 400) gezien.delete(gezien.values().next().value as string);
          if (inslagen.length >= 12) continue;

          const van = maakPlek(o.land);
          if (!van) continue;

          const ring = new THREE.Mesh(
            ringGeo,
            new THREE.MeshBasicMaterial({
              color: 0x5fd8a6, transparent: true, opacity: 0.9,
              side: THREE.DoubleSide, depthWrite: false,
            }),
          );
          // Plat op de bol leggen: de ring kijkt van zichzelf langs +Z, de plek
          // langs zijn eigen richting.
          ring.position.copy(van.richting).multiplyScalar(1.006);
          ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), van.richting);
          bol.add(ring);
          inslagen.push({ mesh: ring, t: 0 });

          const naar = winkel ? maakPlek(winkel) : null;
          if (!naar || naar.land === van.land) continue;

          // Een boog die zich over de bol welft. Hoe verder weg, hoe hoger -
          // anders zakt een korte hop door de planeet heen.
          // Vlak genoeg om binnen het kader te blijven, ook van Nieuw-Zeeland
          // naar Groot-Brittannië - dat is bijna de halve planeet. Een hoge
          // boog dwingt de camera terug en maakt de bol dus kleiner.
          const hoog = Math.min(1.26, 1 + 0.06 + 0.1 * van.richting.distanceTo(naar.richting));
          const mid = van.richting.clone().add(naar.richting).normalize().multiplyScalar(hoog);
          const kromme = new THREE.QuadraticBezierCurve3(
            van.richting.clone().multiplyScalar(1.01),
            mid,
            naar.richting.clone().multiplyScalar(1.01),
          );
          const geo = new THREE.BufferGeometry().setFromPoints(kromme.getPoints(63));
          const lijn = new THREE.Line(
            geo,
            new THREE.LineBasicMaterial({ color: 0x5fd8a6, transparent: true, opacity: 0.85 }),
          );
          geo.setDrawRange(0, 2);
          bol.add(lijn);
          bogen.push({ lijn, t: 0, punten: 64 });
        }
      };
      nieuweOrders.current = toon;
      if (wachtrij.current.length) {
        toon(wachtrij.current, winkelLand ?? null);
        wachtrij.current = [];
      }

      /* ── beweging ────────────────────────────────────────────────────────
       * Begint op het drukste land waar nu iemand is. Is er niemand, dan op
       * waar het vandaag het drukst was - anders opent hij op de Stille Oceaan
       * juist wanneer je wilt zien wáár het eerder wel druk was.
       * ─────────────────────────────────────────────────────────────────── */
      const drukstNu = [...plekVan.values()].sort((a, b) => b.actief - a.actief)[0];
      const drukstVandaag = [...puntenRef.current]
        .filter((p) => plekVan.has(p.land))
        .sort((a, b) => b.sessies - a.sessies)[0];
      const richtOp =
        drukstNu && drukstNu.actief > 0 ? drukstNu.richting
          : drukstVandaag ? plekVan.get(drukstVandaag.land)!.richting
            : new THREE.Vector3(0, 0, 1);

      /**
       * De rotatie staat op XYZ, dus een punt gaat eerst door Y en dan door X.
       * Y zo kiezen dat x nul wordt, X zo dat y nul wordt: dan wijst de richting
       * langs +Z, precies waar de camera staat. Op het oog gokken leverde
       * Groot-Brittannië aan de bovenrand op.
       */
      let draaiY = Math.atan2(-richtOp.x, richtOp.z);
      /**
       * De kanteling gaat maar tot een kwart slag, niet tot vol.
       *
       * Groot-Brittannië ligt op 54 graden, en dat helemaal naar de camera
       * draaien kantelt de as 54 graden naar voren. De bol draait dan nog
       * steeds om zijn eigen pool, maar die pool wijst schuin naar je toe - en
       * dan ziet het eruit alsof hij rolt in plaats van draait. Vandaar dat het
       * leek of hij "half rond" ging.
       *
       * Op 26 graden staat de as vrijwel rechtop, blijft het land waar het om
       * gaat ruim in beeld, en draait hij zoals een globe hoort te draaien.
       */
      let draaiX = Math.max(-0.45, Math.min(0.45,
        Math.atan2(richtOp.y, Math.hypot(richtOp.x, richtOp.z))));
      let vaartY = 0;
      let sleept = false;
      let laatstX = 0, laatstY = 0;
      let stilSinds = 0;

      const rustig = matchMedia("(prefers-reduced-motion: reduce)").matches;

      const omlaag = (e: PointerEvent) => {
        sleept = true; laatstX = e.clientX; laatstY = e.clientY;
        renderer.domElement.setPointerCapture(e.pointerId);
      };
      const beweeg = (e: PointerEvent) => {
        if (!sleept) return;
        vaartY = (e.clientX - laatstX) * 0.005;
        draaiY += vaartY;
        // Slepen mag verder kantelen dan de startstand, maar niet tot over de
        // pool heen - daarachter staat de wereld op zijn kop.
        draaiX = Math.max(-1.0, Math.min(1.0, draaiX - (e.clientY - laatstY) * 0.005));
        laatstX = e.clientX; laatstY = e.clientY;
        stilSinds = performance.now();
      };
      const omhoogE = (e: PointerEvent) => {
        sleept = false;
        try { renderer.domElement.releasePointerCapture(e.pointerId); } catch { /* al los */ }
        stilSinds = performance.now();
      };
      renderer.domElement.addEventListener("pointerdown", omlaag);
      renderer.domElement.addEventListener("pointermove", beweeg);
      renderer.domElement.addEventListener("pointerup", omhoogE);
      renderer.domElement.addEventListener("pointercancel", omhoogE);

      const meet = new ResizeObserver(() => {
        if (!doos.clientWidth || !doos.clientHeight) return;
        zetCamera();
        renderer.setSize(doos.clientWidth, doos.clientHeight);
        // setSize wist de tekenbuffer. Loopt de lus, dan is dat na zestien
        // milliseconde weer goed; staat hij stil - tabblad op de achtergrond,
        // bol uit beeld - dan blijft er een leeg vlak staan tot je terugkomt.
        renderer.render(scene, camera);
      });
      meet.observe(doos);

      // Alleen tekenen als het te zien is. Een dashboard in een tabblad op de
      // achtergrond hoort niets te doen.
      let inBeeld = true;
      const zicht = new IntersectionObserver((i) => { inBeeld = i.some((x) => x.isIntersecting); });
      zicht.observe(doos);

      const m = new THREE.Matrix4();
      const schaal = new THREE.Vector3();
      const plek = new THREE.Vector3();
      const naarVoren = new THREE.Vector3();
      let zichtbaar: Plek[] = [];

      /** Baken naar hun doel bewegen, en wie er nu staat op een rij zetten. */
      function zetBaken(t: number, dt: number) {
        zichtbaar = [];
        let i = 0;
        for (const p of plekVan.values()) {
          // Exponentieel eraan toe: snel als het ver is, zacht als het dichtbij
          // komt. Onafhankelijk van de beeldsnelheid, anders loopt het op een
          // 120Hz-scherm dubbel zo snel.
          p.nu += (p.doel - p.nu) * (1 - Math.exp(-dt * 3.5));
          if (p.nu < 0.004 || i >= RUIMTE) continue;

          const puls = p.actief > 0 ? 1 + 0.3 * Math.sin(t / 260 + i) : 1;
          plek.copy(p.richting).multiplyScalar(1.001);
          m.compose(plek, p.draai, schaal.set(1, p.nu, 1));
          staven.setMatrixAt(i, m);
          plek.copy(p.richting).multiplyScalar(1 + p.nu);
          m.compose(plek, p.draai, schaal.set(puls, puls, puls));
          koppen.setMatrixAt(i, m);
          if (p.actief > 0) zichtbaar.push(p);
          i++;
        }
        staven.count = i;
        koppen.count = i;
        staven.instanceMatrix.needsUpdate = true;
        koppen.instanceMatrix.needsUpdate = true;
        zichtbaar.sort((a, b) => b.actief - a.actief);
      }

      /** Inslagen en bogen een stap verder, en opruimen wie klaar is. */
      function zetInslagen(dt: number) {
        for (let i = inslagen.length - 1; i >= 0; i--) {
          const s = inslagen[i];
          s.t += dt;
          const f = Math.min(s.t / 1.6, 1);
          s.mesh.scale.setScalar(0.06 + f * 0.34);
          (s.mesh.material as any).opacity = 0.9 * (1 - f);
          if (f >= 1) {
            bol.remove(s.mesh);
            (s.mesh.material as any).dispose();
            inslagen.splice(i, 1);
          }
        }
        for (let i = bogen.length - 1; i >= 0; i--) {
          const b = bogen[i];
          b.t += dt;
          // Eerst tekenen, dan dooft hij: de boog schiet ernaartoe en vervaagt.
          const groei = Math.min(b.t / 0.9, 1);
          b.lijn.geometry.setDrawRange(0, Math.max(2, Math.round(groei * b.punten)));
          (b.lijn.material as any).opacity = 0.85 * (1 - Math.max(0, (b.t - 1.1) / 0.9));
          if (b.t > 2) {
            bol.remove(b.lijn);
            b.lijn.geometry.dispose();
            (b.lijn.material as any).dispose();
            bogen.splice(i, 1);
          }
        }
      }

      /**
       * Labels die voor elkaar wijken.
       *
       * Europa is bij deze winkel één kluitje: Ierland, Spanje en Finland
       * stonden dwars door Groot-Brittannië heen, en juist het land met negentig
       * procent van het verkeer was onleesbaar. Ze staan op volgorde van drukte,
       * en wie een al geplaatst label raakt komt er niet.
       *
       * Geschat en niet gemeten: de doos opmeten kost een layout per label per
       * frame, en dit hoeft alleen goed genoeg te zijn om overlap te zien.
       */
      function zetLabels() {
        const b = doos.getBoundingClientRect();
        const gezet: { x: number; y: number; w: number }[] = [];
        const uit = [];

        for (const p of zichtbaar.slice(0, 8)) {
          naarVoren.copy(p.richting).multiplyScalar(1 + p.nu).applyEuler(bol.rotation);
          // Achterkant van de bol: wegfaden in plaats van er dwars doorheen
          // blijven staan.
          const zichtbaarheid = naarVoren.z > 0.15 ? 1 : naarVoren.z > -0.1 ? 0.25 : 0;
          if (zichtbaarheid === 0) continue;

          const diep = naarVoren.clone().project(camera);
          const x = ((diep.x + 1) / 2) * b.width;
          const y = ((1 - diep.y) / 2) * b.height - 15;   // het label zit op de kop
          const w = 26 + 6.6 * (p.land.length + String(p.actief).length + 4);

          if (gezet.some((g) => Math.abs(g.x - x) < (g.w + w) / 2 && Math.abs(g.y - y) < 22)) continue;
          gezet.push({ x, y, w });
          uit.push({ land: p.land, actief: p.actief, x, y: y + 15, zicht: zichtbaarheid });
          if (uit.length >= 5) break;
        }
        setLabels(uit);
      }

      // Meteen één frame, niet pas bij de eerste rAF. Anders staat er een zwart
      // vlak zolang het tabblad op de achtergrond is, en dat is precies het
      // moment waarop iemand terugkomt en wil zien of het werkt.
      bol.rotation.set(draaiX, draaiY, 0);
      for (const p of plekVan.values()) p.nu = p.doel;   // eerste beeld zonder groeien
      zetBaken(0, 0);
      renderer.render(scene, camera);
      zetLabels();

      let bezig = 0;
      let vorigeT = 0;
      let zonBijgewerkt = -1e9;
      const tekenen = (t: number) => {
        bezig = requestAnimationFrame(tekenen);
        if (!inBeeld || document.hidden) { vorigeT = t; return; }
        // Terug uit de achtergrond kan een sprong van minuten zijn; die mag de
        // animatie niet in één klap doorspoelen.
        const dt = Math.min((t - vorigeT) / 1000, 0.1);
        vorigeT = t;

        if (!sleept) {
          // Uitrollen na een sleep, daarna vanzelf verder draaien.
          vaartY *= 0.94;
          draaiY += vaartY;
          // Van rechts naar links. De aarde draait andersom - het oppervlak
          // schuift naar rechts, zoals de zon 's ochtends in het oosten opkomt
          // - maar Emiel wil deze kant op en het is een dashboard, geen
          // planetarium. Eén teken om te wisselen.
          if (!rustig && Math.abs(vaartY) < 0.0004 && t - stilSinds > 1200) draaiY -= 0.0016;
        }
        bol.rotation.y = draaiY;
        bol.rotation.x = draaiX;

        // De zon beweegt een kwart graad per minuut. Eens per minuut opnieuw
        // rekenen is ruim genoeg en scheelt het per frame te doen.
        if (t - zonBijgewerkt > 60_000) {
          zonBijgewerkt = t;
          landMat.uniforms.zon.value.set(...zonRichting(new Date()));
        }

        zetBaken(t, dt);
        zetInslagen(dt);
        renderer.render(scene, camera);
        zetLabels();
      };
      bezig = requestAnimationFrame(tekenen);
      setStatus("klaar");

      stop = () => {
        cancelAnimationFrame(bezig);
        nieuweCijfers.current = null;
        nieuweOrders.current = null;
        meet.disconnect();
        zicht.disconnect();
        renderer.domElement.removeEventListener("pointerdown", omlaag);
        renderer.domElement.removeEventListener("pointermove", beweeg);
        renderer.domElement.removeEventListener("pointerup", omhoogE);
        renderer.domElement.removeEventListener("pointercancel", omhoogE);
        for (const s of inslagen) { bol.remove(s.mesh); (s.mesh.material as any).dispose(); }
        for (const b of bogen) {
          bol.remove(b.lijn); b.lijn.geometry.dispose(); (b.lijn.material as any).dispose();
        }
        for (const f of opruimen) f();
        kern.geometry.dispose(); (kern.material as any).dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    }

    return () => {
      opgeruimd = true;
      if (rIC) (window as any).cancelIdleCallback?.(wacht);
      else clearTimeout(wacht);
      stop?.();
    };
    // Eén keer bouwen. Alles wat daarna verandert gaat via de twee haken
    // hierboven; de bol opnieuw opzetten bij elke ronde zou hem laten knipperen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nuOnline = punten.reduce((n, p) => n + p.actief, 0);
  const nuZonderPlek = punten
    .filter((p) => !LANDPOSITIES[p.land])
    .reduce((n, p) => n + p.actief, 0);

  return (
    <div className="globe">
      <div className="globe__doek" ref={doosRef} />
      {status === "klaar" &&
        labels.map((l) => (
          // Een knop en geen etiket: elke rij op dit scherm is een filter, en
          // deze stonden alleen ergens anders.
          <button
            type="button"
            key={l.land}
            className="globe__label"
            style={{ left: l.x, top: l.y, opacity: l.zicht }}
            onClick={() => filterRef.current?.(l.land)}
            title={"Show everything for " + l.land}
          >
            {l.land} <b>{l.actief.toLocaleString("en-US")}</b><i>now</i>
          </button>
        ))}
      {status === "geen-webgl" && (
        <p className="globe__uitleg">This browser has no WebGL, so the globe stays dark.</p>
      )}
      {/* Om drie uur 's nachts is er niemand, en dan hoort er te staan dat er
          niemand is - niet een bol met stippen waar je naar blijft zoeken. */}
      {status === "klaar" && nuOnline === 0 && (
        <p className="globe__leeg">Nobody on the site right now</p>
      )}
      {nuZonderPlek > 0 && (
        <p className="globe__voet">
          {nuZonderPlek.toLocaleString("en-US")} online without a known country
        </p>
      )}
    </div>
  );
}
