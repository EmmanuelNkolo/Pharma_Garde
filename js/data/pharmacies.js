/**
 * Pharma-Garde — Base de données locale des pharmacies
 * Données réalistes basées sur les vrais quartiers du Cameroun
 */

const LOCAL_PHARMACIES = [
  // ══════════════════════ DOUALA ══════════════════════
  { id: 'local-d1', name: 'Pharmacie de l\'Aéroport', address: 'Bonapriso, Douala', quarter: 'Bonapriso', city: 'Douala', lat: 4.0201, lng: 9.7022, phone: '+237 233 42 10 01', whatsapp: '237233421001', hours: '07h30 - 21h00', rating: 4.6, isOpen: true, isOnDuty: false },
  { id: 'local-d2', name: 'Pharmacie de la Côte', address: 'Bonapriso, Douala', quarter: 'Bonapriso', city: 'Douala', lat: 4.0255, lng: 9.7051, phone: '+237 233 42 10 02', whatsapp: '237233421002', hours: '08h00 - 22h00', rating: 4.4, isOpen: true, isOnDuty: false },
  { id: 'local-d3', name: 'Pharmacie Akwa', address: 'Akwa, Douala', quarter: 'Akwa', city: 'Douala', lat: 4.0412, lng: 9.6998, phone: '+237 233 42 10 03', whatsapp: '237233421003', hours: '08h00 - 21h00', rating: 4.7, isOpen: true, isOnDuty: true },
  { id: 'local-d4', name: 'Pharmacie du Centre', address: 'Akwa, Douala', quarter: 'Akwa', city: 'Douala', lat: 4.0450, lng: 9.7010, phone: '+237 233 42 10 04', whatsapp: '237233421004', hours: '07h00 - 22h00', rating: 4.5, isOpen: true, isOnDuty: false },
  { id: 'local-d5', name: 'Pharmacie Joss', address: 'Bonanjo, Douala', quarter: 'Bonanjo', city: 'Douala', lat: 4.0381, lng: 9.6895, phone: '+237 233 42 10 05', whatsapp: '237233421005', hours: '08h00 - 20h00', rating: 4.3, isOpen: true, isOnDuty: false },
  { id: 'local-d6', name: 'Pharmacie de Ndokoti', address: 'Ndokoti, Douala', quarter: 'Ndokotti', city: 'Douala', lat: 4.0489, lng: 9.7421, phone: '+237 233 42 10 06', whatsapp: '237233421006', hours: '07h00 - 22h00', rating: 4.2, isOpen: true, isOnDuty: false },
  { id: 'local-d7', name: 'Pharmacie de Bépanda', address: 'Bépanda, Douala', quarter: 'Bépanda', city: 'Douala', lat: 4.0621, lng: 9.7215, phone: '+237 233 42 10 07', whatsapp: '237233421007', hours: '08h00 - 21h30', rating: 4.5, isOpen: true, isOnDuty: true },
  { id: 'local-d8', name: 'Pharmacie de Bonamoussadi', address: 'Bonamoussadi, Douala', quarter: 'Bonamoussadi', city: 'Douala', lat: 4.0881, lng: 9.7410, phone: '+237 233 42 10 08', whatsapp: '237233421008', hours: '07h30 - 22h00', rating: 4.8, isOpen: true, isOnDuty: false },
  { id: 'local-d9', name: 'Pharmacie de Makepe', address: 'Makepe, Douala', quarter: 'Makepe', city: 'Douala', lat: 4.0750, lng: 9.7390, phone: '+237 233 42 10 09', whatsapp: '237233421009', hours: '08h00 - 21h00', rating: 4.4, isOpen: true, isOnDuty: false },
  { id: 'local-d10', name: 'Pharmacie Deido', address: 'Deido, Douala', quarter: 'Deido', city: 'Douala', lat: 4.0580, lng: 9.7081, phone: '+237 233 42 10 10', whatsapp: '237233421010', hours: '07h00 - 21h00', rating: 4.3, isOpen: true, isOnDuty: false },
  { id: 'local-d11', name: 'Pharmacie Cité Sic', address: 'Cité Sic, Douala', quarter: 'Cité Sic', city: 'Douala', lat: 4.0551, lng: 9.7482, phone: '+237 233 42 10 11', whatsapp: '237233421011', hours: '08h00 - 20h00', rating: 4.1, isOpen: true, isOnDuty: false },
  { id: 'local-d12', name: 'Pharmacie Kotto', address: 'Kotto, Douala', quarter: 'Kotto', city: 'Douala', lat: 4.0851, lng: 9.7521, phone: '+237 233 42 10 12', whatsapp: '237233421012', hours: '08h00 - 22h00', rating: 4.6, isOpen: true, isOnDuty: true },
  { id: 'local-d13', name: 'Pharmacie de l\'Université', address: 'PK14, Douala', quarter: 'PK14', city: 'Douala', lat: 4.0511, lng: 9.7891, phone: '+237 233 42 10 13', whatsapp: '237233421013', hours: '08h00 - 20h00', rating: 4.0, isOpen: true, isOnDuty: false },
  { id: 'local-d14', name: 'Pharmacie PK8', address: 'PK8, Douala', quarter: 'PK8', city: 'Douala', lat: 4.0505, lng: 9.7611, phone: '+237 233 42 10 14', whatsapp: '237233421014', hours: '07h00 - 21h00', rating: 4.2, isOpen: true, isOnDuty: false },
  { id: 'local-d15', name: 'Pharmacie de Village', address: 'Village, Douala', quarter: 'Village', city: 'Douala', lat: 4.0311, lng: 9.7551, phone: '+237 233 42 10 15', whatsapp: '237233421015', hours: '08h00 - 20h00', rating: 4.1, isOpen: false, isOnDuty: false },
  { id: 'local-d16', name: 'Pharmacie de Yassa', address: 'Yassa, Douala', quarter: 'Yassa', city: 'Douala', lat: 4.0151, lng: 9.8021, phone: '+237 233 42 10 16', whatsapp: '237233421016', hours: '08h00 - 21h00', rating: 4.3, isOpen: true, isOnDuty: false },
  { id: 'local-d17', name: 'Pharmacie de Logpom', address: 'Logpom, Douala', quarter: 'Logpom', city: 'Douala', lat: 4.0951, lng: 9.7651, phone: '+237 233 42 10 17', whatsapp: '237233421017', hours: '07h30 - 22h00', rating: 4.5, isOpen: true, isOnDuty: false },
  { id: 'local-d18', name: 'Pharmacie Cité des Palmiers', address: 'Cité des Palmiers, Douala', quarter: 'Cité des Palmiers', city: 'Douala', lat: 4.0611, lng: 9.7651, phone: '+237 233 42 10 18', whatsapp: '237233421018', hours: '08h00 - 21h00', rating: 4.4, isOpen: true, isOnDuty: false },
  { id: 'local-d19', name: 'Pharmacie Ndogpassi', address: 'Ndogpassi, Douala', quarter: 'Ndogpassi', city: 'Douala', lat: 4.0251, lng: 9.7751, phone: '+237 233 42 10 19', whatsapp: '237233421019', hours: '08h00 - 20h00', rating: 4.0, isOpen: false, isOnDuty: false },
  { id: 'local-d20', name: 'Pharmacie Bonabéri', address: 'Bonabéri, Douala', quarter: 'Bonabéri', city: 'Douala', lat: 4.0711, lng: 9.6511, phone: '+237 233 42 10 20', whatsapp: '237233421020', hours: '07h00 - 21h00', rating: 4.3, isOpen: true, isOnDuty: false },

  // ══════════════════════ YAOUNDÉ ══════════════════════
  { id: 'local-y1', name: 'Pharmacie du Centre', address: 'Poste Centrale, Yaoundé', quarter: 'Centre', city: 'Yaoundé', lat: 3.8611, lng: 11.5201, phone: '+237 222 23 10 01', whatsapp: '237222231001', hours: '07h30 - 22h00', rating: 4.7, isOpen: true, isOnDuty: true },
  { id: 'local-y2', name: 'Pharmacie Française', address: 'Avenue Kennedy, Yaoundé', quarter: 'Centre Ville', city: 'Yaoundé', lat: 3.8651, lng: 11.5181, phone: '+237 222 23 10 02', whatsapp: '237222231002', hours: '08h00 - 21h00', rating: 4.8, isOpen: true, isOnDuty: false },
  { id: 'local-y3', name: 'Pharmacie de l\'Intendance', address: 'Intendance, Yaoundé', quarter: 'Centre', city: 'Yaoundé', lat: 3.8681, lng: 11.5151, phone: '+237 222 23 10 03', whatsapp: '237222231003', hours: '08h00 - 20h00', rating: 4.5, isOpen: true, isOnDuty: false },
  { id: 'local-y4', name: 'Pharmacie Bastos', address: 'Bastos, Yaoundé', quarter: 'Bastos', city: 'Yaoundé', lat: 3.8851, lng: 11.5051, phone: '+237 222 23 10 04', whatsapp: '237222231004', hours: '08h00 - 22h00', rating: 4.9, isOpen: true, isOnDuty: false },
  { id: 'local-y5', name: 'Pharmacie du Golf', address: 'Golf, Yaoundé', quarter: 'Golf', city: 'Yaoundé', lat: 3.8911, lng: 11.5121, phone: '+237 222 23 10 05', whatsapp: '237222231005', hours: '07h00 - 21h00', rating: 4.6, isOpen: true, isOnDuty: true },
  { id: 'local-y6', name: 'Pharmacie de Mvan', address: 'Mvan, Yaoundé', quarter: 'Mvan', city: 'Yaoundé', lat: 3.8211, lng: 11.5151, phone: '+237 222 23 10 06', whatsapp: '237222231006', hours: '08h00 - 20h00', rating: 4.2, isOpen: true, isOnDuty: false },
  { id: 'local-y7', name: 'Pharmacie de Biyem-Assi', address: 'Biyem-Assi, Yaoundé', quarter: 'Biyem-Assi', city: 'Yaoundé', lat: 3.8311, lng: 11.4851, phone: '+237 222 23 10 07', whatsapp: '237222231007', hours: '07h30 - 21h00', rating: 4.4, isOpen: true, isOnDuty: false },
  { id: 'local-y8', name: 'Pharmacie de Mendong', address: 'Mendong, Yaoundé', quarter: 'Mendong', city: 'Yaoundé', lat: 3.8251, lng: 11.4651, phone: '+237 222 23 10 08', whatsapp: '237222231008', hours: '08h00 - 20h30', rating: 4.3, isOpen: true, isOnDuty: false },
  { id: 'local-y9', name: 'Pharmacie de la Cité Verte', address: 'Cité Verte, Yaoundé', quarter: 'Cité Verte', city: 'Yaoundé', lat: 3.8751, lng: 11.4851, phone: '+237 222 23 10 09', whatsapp: '237222231009', hours: '08h00 - 21h00', rating: 4.5, isOpen: true, isOnDuty: false },
  { id: 'local-y10', name: 'Pharmacie de Mokolo', address: 'Mokolo, Yaoundé', quarter: 'Mokolo', city: 'Yaoundé', lat: 3.8711, lng: 11.4951, phone: '+237 222 23 10 10', whatsapp: '237222231010', hours: '07h00 - 22h00', rating: 4.3, isOpen: true, isOnDuty: false },
  { id: 'local-y11', name: 'Pharmacie de Nlongkak', address: 'Nlongkak, Yaoundé', quarter: 'Nlongkak', city: 'Yaoundé', lat: 3.8851, lng: 11.5251, phone: '+237 222 23 10 11', whatsapp: '237222231011', hours: '08h00 - 20h00', rating: 4.4, isOpen: true, isOnDuty: false },
  { id: 'local-y12', name: 'Pharmacie de Tsinga', address: 'Tsinga, Yaoundé', quarter: 'Tsinga', city: 'Yaoundé', lat: 3.8811, lng: 11.4951, phone: '+237 222 23 10 12', whatsapp: '237222231012', hours: '07h30 - 21h00', rating: 4.5, isOpen: true, isOnDuty: false },
  { id: 'local-y13', name: 'Pharmacie de la Gare', address: 'Gare, Yaoundé', quarter: 'Gare', city: 'Yaoundé', lat: 3.8551, lng: 11.5121, phone: '+237 222 23 10 13', whatsapp: '237222231013', hours: '08h00 - 20h00', rating: 4.1, isOpen: false, isOnDuty: false },
  { id: 'local-y14', name: 'Pharmacie de Melen', address: 'Melen, Yaoundé', quarter: 'Melen', city: 'Yaoundé', lat: 3.8651, lng: 11.4911, phone: '+237 222 23 10 14', whatsapp: '237222231014', hours: '08h00 - 21h00', rating: 4.2, isOpen: true, isOnDuty: false },
  { id: 'local-y15', name: 'Pharmacie de Ngoa-Ekellé', address: 'Ngoa-Ekellé, Yaoundé', quarter: 'Ngoa-Ekellé', city: 'Yaoundé', lat: 3.8581, lng: 11.4981, phone: '+237 222 23 10 15', whatsapp: '237222231015', hours: '07h00 - 20h00', rating: 4.3, isOpen: true, isOnDuty: false },
  { id: 'local-y16', name: 'Pharmacie d\'Essos', address: 'Essos, Yaoundé', quarter: 'Essos', city: 'Yaoundé', lat: 3.8711, lng: 11.5451, phone: '+237 222 23 10 16', whatsapp: '237222231016', hours: '08h00 - 22h00', rating: 4.4, isOpen: true, isOnDuty: false },
  { id: 'local-y17', name: 'Pharmacie de Kondengui', address: 'Kondengui, Yaoundé', quarter: 'Kondengui', city: 'Yaoundé', lat: 3.8551, lng: 11.5351, phone: '+237 222 23 10 17', whatsapp: '237222231017', hours: '08h00 - 20h00', rating: 4.0, isOpen: false, isOnDuty: false },
  { id: 'local-y18', name: 'Pharmacie Omnisport', address: 'Omnisport, Yaoundé', quarter: 'Omnisport', city: 'Yaoundé', lat: 3.8811, lng: 11.5351, phone: '+237 222 23 10 18', whatsapp: '237222231018', hours: '07h30 - 21h00', rating: 4.6, isOpen: true, isOnDuty: false },
  { id: 'local-y19', name: 'Pharmacie de Mimboman', address: 'Mimboman, Yaoundé', quarter: 'Mimboman', city: 'Yaoundé', lat: 3.8651, lng: 11.5551, phone: '+237 222 23 10 19', whatsapp: '237222231019', hours: '08h00 - 20h00', rating: 4.1, isOpen: true, isOnDuty: false },
  { id: 'local-y20', name: 'Pharmacie Nsam', address: 'Nsam, Yaoundé', quarter: 'Nsam', city: 'Yaoundé', lat: 3.8351, lng: 11.5111, phone: '+237 222 23 10 20', whatsapp: '237222231020', hours: '08h00 - 21h00', rating: 4.3, isOpen: true, isOnDuty: false },

  // ══════════════════════ BAFOUSSAM ══════════════════════
  { id: 'local-b1', name: 'Pharmacie du Marché A', address: 'Marché A, Bafoussam', quarter: 'Marché A', city: 'Bafoussam', lat: 5.4820, lng: 10.4150, phone: '+237 233 44 10 01', whatsapp: '237233441001', hours: '08h00 - 20h00', rating: 4.2, isOpen: true, isOnDuty: true },
  { id: 'local-b2', name: 'Pharmacie Djeleng', address: 'Djeleng, Bafoussam', quarter: 'Djeleng', city: 'Bafoussam', lat: 5.4900, lng: 10.4200, phone: '+237 233 44 10 02', whatsapp: '237233441002', hours: '08h00 - 21h00', rating: 4.3, isOpen: true, isOnDuty: false },
  { id: 'local-b3', name: 'Pharmacie Tamdem', address: 'Tamdem, Bafoussam', quarter: 'Tamdem', city: 'Bafoussam', lat: 5.4750, lng: 10.4100, phone: '+237 233 44 10 03', whatsapp: '237233441003', hours: '07h30 - 20h00', rating: 4.1, isOpen: true, isOnDuty: false },

  // ══════════════════════ GAROUA ══════════════════════
  { id: 'local-g1', name: 'Pharmacie Poumpoumre', address: 'Poumpoumre, Garoua', quarter: 'Poumpoumre', city: 'Garoua', lat: 9.3000, lng: 13.3999, phone: '+237 222 27 10 01', whatsapp: '237222271001', hours: '08h00 - 20h00', rating: 4.0, isOpen: true, isOnDuty: true },
  { id: 'local-g2', name: 'Pharmacie Yelwa', address: 'Yelwa, Garoua', quarter: 'Yelwa', city: 'Garoua', lat: 9.2900, lng: 13.3900, phone: '+237 222 27 10 02', whatsapp: '237222271002', hours: '08h00 - 19h00', rating: 4.1, isOpen: true, isOnDuty: false },

  // ══════════════════════ MAROUA ══════════════════════
  { id: 'local-m1', name: 'Pharmacie Domayo', address: 'Domayo, Maroua', quarter: 'Domayo', city: 'Maroua', lat: 10.5962, lng: 14.3159, phone: '+237 222 29 10 01', whatsapp: '237222291001', hours: '08h00 - 20h00', rating: 4.0, isOpen: true, isOnDuty: false },
  { id: 'local-m2', name: 'Pharmacie Hardé', address: 'Hardé, Maroua', quarter: 'Hardé', city: 'Maroua', lat: 10.6000, lng: 14.3200, phone: '+237 222 29 10 02', whatsapp: '237222291002', hours: '08h00 - 19h00', rating: 3.9, isOpen: true, isOnDuty: true },
];

// ============================================================
// VILLES ET QUARTIERS (Pour la sélection et détection)
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
window.LOCAL_PHARMACIES = LOCAL_PHARMACIES;
window.CITIES_AND_QUARTERS = CITIES_AND_QUARTERS;
