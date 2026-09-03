/**
 * Pharma-Garde — Médicaments Courants
 * Base de données de médicaments pour l'autocomplétion
 * Les données CITIES_AND_QUARTERS et LOCAL_PHARMACIES sont dans data/pharmacies.js
 */

// ============================================================
// MÉDICAMENTS COURANTS (Pour l'autocomplétion)
// ============================================================
const COMMON_MEDICATIONS = [
  // Antipaludéens (les plus demandés au Cameroun)
  'Artésunate Injectable',
  'Artéméther-Luméfantrine (Coartem)',
  'Quinine Injectable',
  'Quinine comprimés',
  'Artemether Injectable',
  'Dihydroartémisinine-Pipéraquine',

  // Antibiotiques
  'Amoxicilline 500mg',
  'Amoxicilline 250mg (sirop)',
  'Augmentin (Amoxicilline + Acide clavulanique)',
  'Azithromycine 500mg',
  'Ciprofloxacine 500mg',
  'Métronidazole 500mg (Flagyl)',
  'Ceftriaxone Injectable',
  'Cotrimoxazole (Bactrim)',
  'Doxycycline 100mg',
  'Gentamicine Injectable',

  // Antidouleurs / Anti-inflammatoires
  'Paracétamol 500mg',
  'Paracétamol 1000mg',
  'Paracétamol Sirop (enfant)',
  'Ibuprofène 400mg',
  'Diclofénac 50mg',
  'Diclofénac Injectable',
  'Tramadol 50mg',
  'Kétoprofène',

  // Vitamines & Suppléments
  'Fer + Acide Folique',
  'Vitamine C 1000mg',
  'Multivitamines',
  'Calcium + Vitamine D3',
  'Zinc (sirop enfant)',

  // Antihypertenseurs
  'Amlodipine 5mg',
  'Amlodipine 10mg',
  'Captopril 25mg',
  'Losartan 50mg',
  'Nifédipine 20mg',

  // Antidiabétiques
  'Metformine 500mg',
  'Metformine 850mg',
  'Glibenclamide 5mg',
  'Insuline Mixte',
  'Insuline Rapide',

  // Gastro-intestinal
  'Oméprazole 20mg',
  'Ranitidine 150mg',
  'Lopéramide (Imodium)',
  'SRO (Sels de Réhydratation Orale)',
  'Charbon activé',
  'Maalox',

  // Respiratoire
  'Salbutamol Inhalateur',
  'Salbutamol Sirop',
  'Prednisolone 5mg',
  'Dexaméthasone Injectable',
  'Sirop contre la toux (Toplexil)',
  'Ambroxol Sirop',

  // Dermatologie
  'Clotrimazole crème',
  'Kétoconazole crème',
  'Hydrocortisone crème',
  'Bétaméthasone crème',

  // Ophtalmologie
  'Chloramphénicol collyre',
  'Gentamicine collyre',

  // Contraception
  'Pilule contraceptive',
  'Contraceptif injectable',
  'Préservatifs',

  // Urgence
  'Adrénaline Injectable',
  'Sérum glucosé',
  'Sérum physiologique',
  'Sérum anti-venimeux',
];

window.COMMON_MEDICATIONS = COMMON_MEDICATIONS;
