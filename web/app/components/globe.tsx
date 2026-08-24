import { useEffect, useRef, useState } from "react";
import { MASKER_BREED, MASKER_HOOG, landMasker } from "~/lib/landmask";
import { LANDPOSITIES } from "~/lib/landposities";

/**
 * De bol.
 *
 * WAAROM DIT ER IS
 * Dit is geen kaart van waar het vandaag druk was - dat staat al in de
 * landenlijst en in de kengetallen. Dit is wie er nú rondloopt, en dat is het
 * enige cijfer op dit scherm dat verandert terwijl je ernaar kijkt.
 *
 * Baken op de wortel van het aantal mensen dat er nu is. Landen waar vandaag
 * verkeer was maar nu niemand houden een stipje: ze horen bij het beeld, maar
 * ze concurreren niet om de aandacht.
 *
 * WAT ER NIET IN ZIT
 * Geen texturen, geen kaartbestanden, geen netwerkverzoeken. De continenten
 * komen uit een bitmasker van tien kilobyte dat in de bundel zit. Een ingebedde
 * Shopify-app die halverwege een plaatje van een vreemde host trekt is precies
 * het soort ding dat er een jaar later uit ligt zonder dat iemand het merkt.
 *
 * three.js wordt pas geladen als deze component in beeld komt, en de lus staat
 * stil zodra hij dat niet meer is of het tabblad naar de achtergrond gaat. Een
 * dashboard hoort geen accu leeg te trekken terwijl je iets anders doet.
 */

export type GlobePunt = { land: string; sessies: number; actief: number };

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

/** Een rond stipje, want vierkante punten op een bol zien er niet uit. */
function stipTextuur(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const g = c.getContext("2d")!;
  g.beginPath();
  g.arc(16, 16, 14, 0, Math.PI * 2);
  g.fillStyle = "#fff";
  g.fill();
  return c;
}

export function Globe({ punten }: { punten: GlobePunt[] }) {
  const doosRef = useRef<HTMLDivElement>(null);
  const [labels, setLabels] = useState<
    { land: string; actief: number; x: number; y: number; zicht: number }[]
  >([]);
  const [status, setStatus] = useState<"wacht" | "klaar" | "geen-webgl">("wacht");

  // De punten in een ref, zodat nieuwe cijfers de scène niet opnieuw opbouwen.
  const puntenRef = useRef(punten);
  puntenRef.current = punten;

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
     * zonder dat er iets misgaat waar je op kunt zoeken. Zichtbaarheid is
     * prima om de tekenlus te pauzeren, want dan is niets doen het veilige
     * antwoord; om iets te starten is het dat niet.
     *
     * Op idle kost het niets: de lus staat toch stil zolang de bol niet in
     * beeld is, dus dit is alleen het binnenhalen van de code.
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

      let renderer: import("three").WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      } catch {
        setStatus("geen-webgl");
        return;
      }
      const opruimen: (() => void)[] = [];
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.setSize(doos.clientWidth, doos.clientHeight);
      doos.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(30, doos.clientWidth / doos.clientHeight, 0.1, 100);

      /**
       * Camera-afstand uit de hoogte van het paneel.
       *
       * Op een vaste afstand liep de bol boven en onder het paneel uit, want
       * het paneel is breed en laag: bij 340 pixels hoog en 1232 breed is de
       * hoogte de krappe kant, niet de breedte. Straal 1 plus een baken van
       * bijna een halve eenheid, plus wat lucht - dat moet erin.
       */
      // Hoeveel er in beeld moet passen wordt verderop uit de baken bepaald;
      // op een vaste waarde stond de bol onnodig klein.
      let past = 1.35;
      const zetCamera = () => {
        camera.aspect = doos.clientWidth / Math.max(doos.clientHeight, 1);
        camera.position.z = past / Math.tan(((camera.fov / 2) * Math.PI) / 180);
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

      /* ── land ───────────────────────────────────────────────────────────── */
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
      const stip = new THREE.CanvasTexture(stipTextuur());
      const landMat = new THREE.PointsMaterial({
        size: 0.019, sizeAttenuation: true, map: stip,
        color: 0xa3a0bd, transparent: true, alphaTest: 0.4, depthWrite: false,
      });
      bol.add(new THREE.Points(landGeo, landMat));

      /* ── baken per land ─────────────────────────────────────────────────
       * Dit gaat over wie er nú is, niet over wie er vandaag was. Dat laatste
       * staat al in de landenlijst en in de kengetallen, en op een bol is het
       * bovendien een dood getal: een baken dat de hele dag even hoog blijft.
       *
       * Landen waar op dit moment niemand rondloopt houden een klein stipje.
       * Ze horen wel bij het bereik van vandaag, maar ze hebben geen baken en
       * geen label - anders concurreren ze om de aandacht met waar het om gaat.
       *
       * Hoogte op de wortel, want ook hier is de verdeling scheef: 57 in
       * Groot-Brittannië tegen 1 in Nederland.
       * ─────────────────────────────────────────────────────────────────── */
      const opDeKaart = puntenRef.current.filter((p) => LANDPOSITIES[p.land]);
      const zichtbaar = opDeKaart
        .filter((p) => p.actief > 0)
        .sort((a, b) => b.actief - a.actief);
      const stil = opDeKaart.filter((p) => p.actief === 0);
      const top = Math.max(...zichtbaar.map((p) => p.actief), 1);

      const staafGeo = new THREE.CylinderGeometry(0.006, 0.006, 1, 6, 1, true);
      staafGeo.translate(0, 0.5, 0);   // voet op de oorsprong, niet het midden
      const staafMat = new THREE.MeshBasicMaterial({
        color: 0x8b6dff, transparent: true, opacity: 0.75, depthWrite: false,
      });
      const staven = new THREE.InstancedMesh(staafGeo, staafMat, Math.max(zichtbaar.length, 1));
      const kopGeo = new THREE.SphereGeometry(0.017, 12, 10);
      const kopMat = new THREE.MeshBasicMaterial({ color: 0xb6a2ff });
      const koppen = new THREE.InstancedMesh(kopGeo, kopMat, Math.max(zichtbaar.length, 1));
      // De allocatie is minstens één, want nul mag niet; het aantal dat getekend
      // wordt is het echte aantal. Zonder dit staat er 's nachts een staafje van
      // de identiteitsmatrix uit de noordpool te steken.
      staven.count = zichtbaar.length;
      koppen.count = zichtbaar.length;
      bol.add(staven, koppen);

      // Waar het vandaag druk was maar nu niemand is: een stipje op de bol,
      // gedimd genoeg om niet voor een baken door te gaan.
      if (stil.length) {
        const stilPos: number[] = [];
        for (const p of stil) {
          const [lat, lon] = LANDPOSITIES[p.land];
          stilPos.push(...naarXYZ(lat, lon, 1.004));
        }
        const stilGeo = new THREE.BufferGeometry();
        stilGeo.setAttribute("position", new THREE.Float32BufferAttribute(stilPos, 3));
        const stilMat = new THREE.PointsMaterial({
          size: 0.026, sizeAttenuation: true, map: stip,
          color: 0x6d5fa8, transparent: true, opacity: 0.85, alphaTest: 0.4, depthWrite: false,
        });
        bol.add(new THREE.Points(stilGeo, stilMat));
        opruimen.push(() => { stilGeo.dispose(); stilMat.dispose(); });
      }

      const omhoog = new THREE.Vector3(0, 1, 0);
      const plekken = zichtbaar.map((p) => {
        const [lat, lon] = LANDPOSITIES[p.land];
        const richting = new THREE.Vector3(...naarXYZ(lat, lon, 1)).normalize();
        return {
          ...p,
          richting,
          hoogte: 0.07 + 0.40 * Math.sqrt(p.actief / top),
          draai: new THREE.Quaternion().setFromUnitVectors(omhoog, richting),
        };
      });

      /**
       * Hoe ver de camera terug moet.
       *
       * Het drukste land staat naar de camera gedraaid, dus zíjn baken wijst
       * naar je toe en steekt nergens boven uit. Wat wél omhoog kan steken is
       * het op één na drukste, en dat is door de wortelschaal meestal een stuk
       * korter - bij deze winkel 0,17 tegen 0,47.
       *
       * Vast op 1,38 hield dus ruimte vrij voor een baken dat er niet is, en
       * de bol was daardoor kleiner dan hij hoefde te zijn.
       */
      past = 1.06 + (plekken.length > 1
        ? Math.max(...plekken.slice(1).map((p) => p.hoogte))
        : 0.16);
      past = Math.max(1.2, Math.min(1.55, past));
      zetCamera();

      const m = new THREE.Matrix4();
      const schaal = new THREE.Vector3();
      const plek = new THREE.Vector3();

      /* ── beweging ───────────────────────────────────────────────────────
       * Begint op het drukste land, want een bol die op de Stille Oceaan
       * opent laat je zoeken naar je eigen cijfers.
       * ─────────────────────────────────────────────────────────────────── */
      /**
       * Het drukste land recht naar de camera draaien.
       *
       * De rotatie staat op XYZ, dus een punt gaat eerst door Y en dan door X.
       * Y zo kiezen dat x nul wordt, X zo dat y nul wordt: dan wijst de richting
       * langs +Z, precies waar de camera staat. Op het oog gokken leverde
       * Groot-Brittannië aan de bovenrand op.
       */
      const drukste = [...stil].sort((x, y) => y.sessies - x.sessies)[0];
      const d = plekken[0]
        ? plekken[0].richting
        // Is er niemand online, dan valt hij terug op waar het vandaag het
        // drukst was. Anders opent hij op de Stille Oceaan zodra de winkel even
        // stil ligt, en dat is precies het moment waarop je wilt zien wáár het
        // eerder wel druk was.
        : drukste
          ? new THREE.Vector3(...naarXYZ(LANDPOSITIES[drukste.land][0],
                                         LANDPOSITIES[drukste.land][1], 1)).normalize()
          : new THREE.Vector3(0, 0, 1);
      let draaiY = Math.atan2(-d.x, d.z);
      let draaiX = Math.max(-1.05, Math.min(1.05, Math.atan2(d.y, Math.hypot(d.x, d.z))));
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
        draaiX = Math.max(-1.2, Math.min(1.2, draaiX - (e.clientY - laatstY) * 0.005));
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
      });
      meet.observe(doos);

      // Alleen tekenen als het te zien is. Een dashboard in een tabblad op de
      // achtergrond hoort niets te doen.
      let inBeeld = true;
      const zicht = new IntersectionObserver((i) => { inBeeld = i.some((x) => x.isIntersecting); });
      zicht.observe(doos);

      /** Levende landen kloppen. De rest staat stil, zodat het kloppen iets
       *  betekent en geen versiering is. */
      function zetBaken(t: number) {
        for (let i = 0; i < plekken.length; i++) {
          const p = plekken[i];
          const puls = p.actief > 0 ? 1 + 0.35 * Math.sin(t / 260 + i) : 1;
          plek.copy(p.richting).multiplyScalar(1.001);
          m.compose(plek, p.draai, schaal.set(1, p.hoogte, 1));
          staven.setMatrixAt(i, m);
          plek.copy(p.richting).multiplyScalar(1 + p.hoogte);
          m.compose(plek, p.draai, schaal.set(puls, puls, puls));
          koppen.setMatrixAt(i, m);
        }
        staven.instanceMatrix.needsUpdate = true;
        koppen.instanceMatrix.needsUpdate = true;
      }

      /** Labels als HTML en niet als 3D-tekst: tekst hoort scherp te zijn, en
       *  3D-letters op een bol van 340 pixels zijn dat nooit. */
      const naarVoren = new THREE.Vector3();

      /**
       * Labels die voor elkaar wijken.
       *
       * Europa is bij deze winkel één kluitje: Ierland, Spanje en Finland
       * stonden dwars door Groot-Brittannië heen, en juist het land met
       * negentig procent van het verkeer was onleesbaar. Ze staan op volgorde
       * van drukte, en wie een al geplaatst label raakt komt er niet.
       *
       * Geschat en niet gemeten: de doos opmeten kost een layout per label per
       * frame, en dit hoeft alleen goed genoeg te zijn om overlap te zien.
       */
      function zetLabels() {
        const b = doos.getBoundingClientRect();
        const gezet: { x: number; y: number; w: number }[] = [];
        const uit = [];

        for (const p of plekken.slice(0, 8)) {
          naarVoren.copy(p.richting).multiplyScalar(1 + p.hoogte).applyEuler(bol.rotation);
          // Achterkant van de bol: wegfaden in plaats van er dwars doorheen
          // blijven staan.
          const zicht = naarVoren.z > 0.15 ? 1 : naarVoren.z > -0.1 ? 0.25 : 0;
          if (zicht === 0) continue;

          const diep = naarVoren.clone().project(camera);
          const x = ((diep.x + 1) / 2) * b.width;
          const y = ((1 - diep.y) / 2) * b.height - 26;   // het label zweeft erboven
          const w = 26 + 6.6 * (p.land.length + String(p.actief).length + 4);

          if (gezet.some((g) => Math.abs(g.x - x) < (g.w + w) / 2 && Math.abs(g.y - y) < 22)) continue;
          gezet.push({ x, y, w });
          uit.push({ land: p.land, actief: p.actief, x, y: y + 26, zicht });
          if (uit.length >= 5) break;
        }
        setLabels(uit);
      }

      // Meteen één frame, niet pas bij de eerste rAF. Anders staat er een zwart
      // vlak zolang het tabblad op de achtergrond is, en dat is precies het
      // moment waarop iemand terugkomt en wil zien of het werkt.
      bol.rotation.set(draaiX, draaiY, 0);
      zetBaken(0);
      renderer.render(scene, camera);
      zetLabels();

      let bezig = 0;
      const tekenen = (t: number) => {
        bezig = requestAnimationFrame(tekenen);
        if (!inBeeld || document.hidden) return;

        if (!sleept) {
          // Uitrollen na een sleep, daarna vanzelf verder draaien.
          vaartY *= 0.94;
          draaiY += vaartY;
          if (!rustig && Math.abs(vaartY) < 0.0004 && t - stilSinds > 1200) draaiY += 0.0016;
        }
        bol.rotation.y = draaiY;
        bol.rotation.x = draaiX;

        zetBaken(t);
        renderer.render(scene, camera);

        zetLabels();
      };
      bezig = requestAnimationFrame(tekenen);
      setStatus("klaar");

      stop = () => {
        cancelAnimationFrame(bezig);
        meet.disconnect();
        zicht.disconnect();
        renderer.domElement.removeEventListener("pointerdown", omlaag);
        renderer.domElement.removeEventListener("pointermove", beweeg);
        renderer.domElement.removeEventListener("pointerup", omhoogE);
        renderer.domElement.removeEventListener("pointercancel", omhoogE);
        for (const f of opruimen) f();
        landGeo.dispose(); landMat.dispose(); stip.dispose();
        staafGeo.dispose(); staafMat.dispose(); kopGeo.dispose(); kopMat.dispose();
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
  }, []);

  const nuOnline = punten.reduce((n, p) => n + p.actief, 0);
  const nuZonderPlek = punten.filter((p) => !LANDPOSITIES[p.land]).reduce((n, p) => n + p.actief, 0);

  return (
    <div className="globe">
      <div className="globe__doek" ref={doosRef} />
      {status === "klaar" &&
        labels.map((l) => (
          <span
            key={l.land}
            className="globe__label globe__label--leeft"
            style={{ left: l.x, top: l.y, opacity: l.zicht }}
          >
            {l.land} <b>{l.actief.toLocaleString("en-US")}</b><i>now</i>
          </span>
        ))}
      {status === "geen-webgl" && (
        <p className="globe__uitleg">This browser has no WebGL, so the globe stays dark.</p>
      )}
      {/* Om drie uur 's nachts is er niemand, en dan hoort er te staan dat er
          niemand is - niet een bol met stippen waar je naar blijft zoeken. De
          stippen tonen dan nog wel waar het vandaag druk was. */}
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
