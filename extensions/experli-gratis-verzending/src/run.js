// @ts-check

/**
 * Experli — gratis verzending voor de testgroep.
 *
 * WAAROM DIT EEN KORTING IS EN GEEN VERZENDINSTELLING
 * De andere verzend-Function (experli-verzending) kent drie bewerkingen:
 * hernoemen, herordenen, verbergen. Een prijs veranderen zit er niet in, en
 * dat is een harde grens van de Delivery Customization API. In Shopify ís
 * gratis verzending een korting van honderd procent op de verzendgroep, en
 * daar hoort dit functietype bij.
 *
 * HET ALTERNATIEF DAT WE NIET GENOMEN HEBBEN
 * Je kunt hetzelfde bereiken met een tarief van nul naast het betaalde, en de
 * andere Function het verkeerde tarief laten verbergen per groep. Dat werkt en
 * kost geen regel code. Maar kijk naar hoe het faalt: draait die Function even
 * niet, dan ziet iedereen beide tarieven staan en kiest ook de controlegroep
 * gratis verzending. Hier is de mislukking "geen korting toegepast" - de
 * testgroep ziet dan de normale kassa, de test meet niets, en niemand krijgt
 * per ongeluk gratis verzending. Bij een test waar echt geld aan hangt wil je
 * dat de fout die kant op valt.
 *
 * DE CONTROLEGROEP KRIJGT NOOIT EEN KORTING.
 * Niet "nul procent" of "een korting van niets" - er gaat letterlijk geen
 * operatie uit. Dat is wat een controlegroep is: de winkel zoals hij zonder
 * deze test zou draaien, tot en met de kortingsregel die er niet staat.
 */

export function cartDeliveryOptionsDiscountsGenerateRun(input) {
  const leeg = { operations: [] };

  /* Shopify roept dezelfde Function aan voor meerdere kortingssoorten. Zonder
     deze controle zou deze code ook draaien als er om een productkorting
     gevraagd wordt, en dan levert ze een verzendkorting op een vraag die daar
     niet over ging. */
  const klassen = input?.discount?.discountClasses ?? [];
  if (!klassen.includes("SHIPPING")) return leeg;

  const cfg = input?.discount?.metafield?.jsonValue;
  if (!cfg || typeof cfg !== "object") return leeg;

  if (input?.cart?.cohort?.value !== "test") return leeg;

  /* En alleen als dit cohort van déze test komt. Zonder deze controle zou een
     kenmerk dat in een oude winkelwagen is blijven hangen - van een kassatest
     die vorige week gestopt is - gratis verzending blijven uitdelen, en dat is
     van buiten aan niets te zien tot je de omzet naloopt. */
  if (String(input?.cart?.vanTest?.value ?? "") !== String(cfg.testId ?? "")) return leeg;

  const groepen = input?.cart?.deliveryGroups ?? [];
  if (!groepen.length) return leeg;

  /* Alle verzendgroepen, niet alleen de eerste. Een wagen kan gesplitst zijn -
     iets uit voorraad en iets dat nagestuurd wordt - en dan zou "gratis
     verzending" op één helft slaan terwijl de koper voor de andere helft nog
     betaalt. Dat is precies het soort halve belofte waar een test niets van
     leert en een klant wél iets van vindt. */
  return {
    operations: [
      {
        deliveryDiscountsAdd: {
          candidates: groepen.map((g) => ({
            message: String(cfg.bericht || "Free shipping"),
            targets: [{ deliveryGroup: { id: g.id } }],
            value: { percentage: { value: 100 } },
          })),
          selectionStrategy: "ALL",
        },
      },
    ],
  };
}
