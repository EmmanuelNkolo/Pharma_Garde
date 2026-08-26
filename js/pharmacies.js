/**
 * Pharma-Garde — Données des Pharmacies
 * Mock data réaliste pour le prototype
 * Coordonnées basées sur les vrais quartiers de Douala et Yaoundé
 */

// ============================================================
// PHARMACIES DATABASE
// ============================================================
let PHARMACIES = [];

async function fetchPharmaciesFromSupabase() {
  try {
    const { data, error } = await supabase
      .from('pharmacies')
      .select('*');
    
    if (error) {
      console.error("Supabase API Error:", error);
      return;
    }
    
    PHARMACIES = data.map(p => ({
      id: p.id,
      name: p.name,
      address: p.address,
      quarter: p.address || 'Quartier Inconnu',
      city: 'Douala', // For MVP, we can assume Douala or we can add it to schema later
      lat: p.lat,
      lng: p.lng,
      phone: p.phone,
      isOnDuty: p.is_open,
      isOpen: p.is_open,
      hours: '08h - 22h (Garde: 24h)',
      rating: 4.5
    }));
    
    console.log("✅ Pharmacies chargées depuis Supabase :", PHARMACIES.length);
  } catch(e) {
    console.error("Erreur critique au chargement des pharmacies:", e);
  }
}

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
  'Charbon activé',
];

// ============================================================
// VILLES ET QUARTIERS (Pour la sélection manuelle)
// ============================================================
const CITIES_AND_QUARTERS = {
  'Douala': {
    center: { lat: 4.0511, lng: 9.7679 },
    quarters: [
      { name: 'Bonanjo', lat: 4.0435, lng: 9.6928 },
      { name: 'Akwa', lat: 4.0483, lng: 9.7043 },
      { name: 'Deido', lat: 4.0589, lng: 9.7155 },
      { name: 'Bonabéri', lat: 4.0697, lng: 9.6777 },
      { name: 'Bonamoussadi', lat: 4.0715, lng: 9.7358 },
      { name: 'Makepe', lat: 4.0667, lng: 9.7503 },
      { name: 'Logpom', lat: 4.0605, lng: 9.7591 },
      { name: 'Bépanda', lat: 4.0555, lng: 9.7289 },
      { name: 'New Bell', lat: 4.0289, lng: 9.7131 },
      { name: 'Bonapriso', lat: 4.0361, lng: 9.6928 },
      { name: 'Ndokotti', lat: 4.0464, lng: 9.7440 },
      { name: 'Kotto', lat: 4.0831, lng: 9.7501 },
      { name: 'Yassa', lat: 4.0233, lng: 9.7873 },
      { name: 'PK8', lat: 4.0154, lng: 9.7722 },
      { name: 'Village', lat: 4.0623, lng: 9.7091 },
      { name: 'Bali', lat: 4.0381, lng: 9.6961 },
      { name: 'Logbessou', lat: 4.0952, lng: 9.7583 },
      { name: 'Cité Sic', lat: 4.0583, lng: 9.7408 },
    ],
  },
  'Yaoundé': {
    center: { lat: 3.8480, lng: 11.5021 },
    quarters: [
      { name: 'Bastos', lat: 3.8789, lng: 11.5079 },
      { name: 'Mfandena', lat: 3.8700, lng: 11.5175 },
      { name: 'Biyem-Assi', lat: 3.8431, lng: 11.4817 },
      { name: 'Essos', lat: 3.8717, lng: 11.5369 },
      { name: 'Mvog-Mbi', lat: 3.8589, lng: 11.5181 },
      { name: 'Messa', lat: 3.8667, lng: 11.4933 },
      { name: 'Nsimeyong', lat: 3.8367, lng: 11.4978 },
      { name: 'Ekounou', lat: 3.8556, lng: 11.5478 },
      { name: 'Nkolbisson', lat: 3.8778, lng: 11.4633 },
      { name: 'Mendong', lat: 3.8522, lng: 11.4711 },
      { name: 'Omnisport', lat: 3.8833, lng: 11.5256 },
      { name: 'Ngousso', lat: 3.8867, lng: 11.5367 },
      { name: 'Emana', lat: 3.9033, lng: 11.5156 },
      { name: 'Mokolo', lat: 3.8622, lng: 11.5078 },
      { name: 'Soa', lat: 3.9633, lng: 11.5878 },
      { name: 'Tsinga', lat: 3.8821, lng: 11.5012 },
      { name: 'Odza', lat: 3.8055, lng: 11.5332 },
    ],
  },
  'Bafoussam': {
    center: { lat: 5.4833, lng: 10.4167 },
    quarters: [
      { name: 'Marché A', lat: 5.4820, lng: 10.4150 },
      { name: 'Marché B', lat: 5.4833, lng: 10.4167 },
      { name: 'Djeleng', lat: 5.4900, lng: 10.4200 },
      { name: 'Tamdem', lat: 5.4750, lng: 10.4100 },
      { name: 'Kopchou', lat: 5.4700, lng: 10.4250 },
    ],
  },
  'Garoua': {
    center: { lat: 9.3000, lng: 13.3999 },
    quarters: [
      { name: 'Poumpoumre', lat: 9.3000, lng: 13.3999 },
      { name: 'Djamboutou', lat: 9.3100, lng: 13.4100 },
      { name: 'Yelwa', lat: 9.2900, lng: 13.3900 },
      { name: 'Marouare', lat: 9.3200, lng: 13.3800 },
    ],
  },
  'Maroua': {
    center: { lat: 10.5962, lng: 14.3159 },
    quarters: [
      { name: 'Domayo', lat: 10.5962, lng: 14.3159 },
      { name: 'Hardé', lat: 10.6000, lng: 14.3200 },
      { name: 'Kakataré', lat: 10.5900, lng: 14.3100 },
      { name: 'Doualaré', lat: 10.6100, lng: 14.3000 },
    ],
  }
};
