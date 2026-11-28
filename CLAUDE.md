# CLAUDE.md — Règles permanentes pour l'agent (Pharma-Garde)

Ce fichier est lu à chaque session. Il décrit le projet, la stack, les conventions, la base de données Supabase et la procédure de déploiement. **En cas de conflit entre une demande ponctuelle et ce fichier, signale le conflit avant d'agir.** Les points marqués « À CONFIRMER » n'ont pas été vérifiés : ne les traite pas comme acquis.

---

## 1. Le projet

**Pharma-Garde** est une application web (PWA) pour le Cameroun qui relie six types d'acteurs :

| Espace | Point d'entrée | Rôle |
|---|---|---|
| Client (patient) | `index.html` | Recherche de médicaments, pharmacies de garde, réservation, itinéraire |
| Officine | `pharmacien.html` | Demandes patients, stocks, gardes, réservations, messagerie |
| Médecin | `medecin.html` | Rendez-vous, téléconsultations, ordonnances (tables `doctor_*`, `medical_*`) |
| Établissement de santé | `etablissement.html` | Établissements, analyses de laboratoire, connecteurs (tables `health_facilities`, `lab_analysis_orders`, `facility_api_connectors`) |
| Délégué médical | `delegue.html` | Campagnes, visites, ruptures de stock, messagerie |
| Grossiste-répartiteur | `grossiste.html` | Catalogue, commandes B2B, campagnes, statistiques |

Une administration plateforme (« Super-Admin », dont le tableau de bord des revenus NotchPay) s'appuie sur les tables `platform_admins` et `admin_audit_logs` et sur l'Edge Function `admin-auth`. **À CONFIRMER : la page ou le module qui porte l'interface Super-Admin.**

Langue du produit : **français** (avec bascule FR / EN via `js/core/i18n.js`). Contexte : Cameroun (FCFA, Mobile Money, numéros à 9 chiffres avec indicatif `237`).

La documentation fonctionnelle et les rapports d'architecture sont dans `docs/` : les consulter avant toute modification structurelle.

---

## 2. Stack technique

- **Front-end** : HTML / CSS / JavaScript « vanilla ». **Pas de framework, pas de bundler, pas de `package.json` à la racine, aucune dépendance npm.** Les scripts sont chargés par des balises `<script>` et partagent des objets globaux (ex. `PG`, `PGLocation`, `window.supabase`). Ne pas introduire de framework ni de dépendance sans accord explicite.
- **Build de production** : `node scripts/build-prod.mjs` génère `dist/` (minification JS et CSS maison, `node --check` sur chaque JS minifié, repli automatique sur l'original en cas d'échec). Vercel l'exécute (`buildCommand` dans `vercel.json`) et publie `dist/` (`outputDirectory`). Ce script ne copie que : les pages et fichiers listés dans `ROOT_FILES` (les six pages HTML, `manifest.json`, `sw.js`, les icônes) et les dossiers `css/` et `js/`. **Tout nouveau fichier à la racine, ou tout nouveau dossier à publier, doit être ajouté à `ROOT_FILES` / `ASSET_DIRS` dans `scripts/build-prod.mjs`, sinon il est absent en production.** `docs/`, `connecteur/`, `supabase/` et `tests/` ne sont pas publiés.
- **PWA** : `manifest.json`, `sw.js` (Service Worker, stratégie Network-First + cache hors-ligne).
- **Cartographie / géo** : Leaflet + OpenStreetMap, Nominatim (géocodage), Overpass (quartiers, pharmacies), OSRM (itinéraires).
- **Backend** : Supabase (Postgres + RLS + Edge Functions Deno + pg_cron). Projet unique : `Pharma_Garde` (région `eu-west-1`).
- **Paiements** : Mobile Money (MTN MoMo / Orange Money) via les Edge Functions **NotchPay**. **NotchPay est le fournisseur actif.** Les fonctions Campay (`campay-payment`, `campay-webhook`) sont encore déployées : ne pas les modifier ni les supprimer sans demande explicite.
- **Hébergement** : Vercel (équipe `capbio`, plan Hobby au 28 novembre 2026), déploiement automatique depuis GitHub.
- **Dépôt** : `EmmanuelNkolo/Pharma_Garde`, branche de production `main`.

---

## 3. Structure du dépôt

```text
index.html, pharmacien.html, medecin.html,
etablissement.html, delegue.html, grossiste.html            # 6 espaces
sw.js, manifest.json, vercel.json                           # PWA + build + en-têtes de sécurité / CSP
scripts/build-prod.mjs                                      # build de production (dist/)
css/                  # design-system.css (tokens) + un fichier par espace
js/core/              # supabaseClient.js, core.js, geolocation.js, i18n.js
js/data/              # données embarquées (médicaments, pharmacies)
js/shared/            # modules transversaux (network, messagerie, abonnements, rapports…)
js/client|pharmacie|delegue|grossiste/   # code propre à chaque espace (À CONFIRMER : dossiers médecin / établissement)
connecteur/           # connecteur universel de stock d'officine (Node.js / SQL / CSV)
supabase/functions/   # Edge Functions (Deno)
supabase/sql/         # schémas SQL versionnés (supabase_schema.sql, v2 … v17)
docs/                 # documentation fonctionnelle et rapports
tests/                # tests (À CONFIRMER : comment les lancer)
.github/              # À CONFIRMER : contenu (workflows, modèles)
```

Règle : le code d'un espace reste dans le dossier de cet espace ; ce qui sert à plusieurs espaces va dans `js/shared/` ou `js/core/`. Pas de fichier orphelin à la racine.

---

## 4. Conventions de code

- **Sécurité front (obligatoire)** :
  - Échapper toute donnée dynamique insérée dans le DOM, les popups Leaflet et les étiquettes (`PG.esc` / `escapeHtml`). Jamais de `innerHTML` avec une valeur non échappée.
  - Pas de gestionnaires `onclick` inline : utiliser la délégation d'événements avec des attributs `data-*` échappés.
  - Exports CSV : protéger contre l'injection de formules (voir `js/shared/network.js`).
  - Numéros de téléphone : filtrer les caractères non numériques (`[^\d+]`) ; normaliser les numéros camerounais (`237` + 9 chiffres) ; `rel="noopener"` sur les liens externes.
- **Réseau** : réutiliser les utilitaires de `js/shared/network.js` (retry, cache TTL) plutôt que de réécrire du `fetch` ad hoc. Toute nouvelle requête vers un domaine externe doit être ajoutée à `connect-src` dans `vercel.json`, sinon elle est bloquée en production.
- **Performance** : rendu progressif (afficher le cache local d'abord, rafraîchir ensuite), chargement différé des bibliothèques lourdes (ex. OCR Tesseract uniquement au clic).
- **Style** : un seul fichier CSS par espace, tokens communs dans `css/design-system.css`. Ne pas dupliquer des couleurs ou espacements en dur si un token existe.
- **Nommage** : fichiers JS en minuscules (`kebab-case` ou `camelCase` selon l'existant, suivre le dossier). Commentaires et libellés utilisateur en français.
- **Compatibilité avec le minificateur** : le minificateur de `scripts/build-prod.mjs` est écrit à la main. Éviter les constructions JS exotiques (regex ambiguës, template literals très imbriqués) sans vérifier le build.
- **Vérification avant commit** : `node --check <fichier.js>` sur chaque JS modifié, **`node scripts/build-prod.mjs` doit se terminer sans erreur** (code de sortie 0, aucun « repli »), et aucun lien ou import de script ne doit être cassé dans les 6 pages HTML.
- **Service Worker** : toute modification d'un fichier mis en cache impose de **changer la version du cache dans `sw.js`**, sinon les utilisateurs gardent l'ancienne version.
- **Secrets** : jamais de clé secrète, token ou mot de passe dans le dépôt, les commits, les PR ou les réponses. Seule la clé *publishable* Supabase (publique par conception) figure côté client (`js/core/supabaseClient.js`).

---

## 5. Base de données Supabase

Projet : `Pharma_Garde`, Postgres 17. **Les 40 tables du schéma `public` (au 28 novembre 2026) ont la RLS activée** : cela doit rester vrai pour toute nouvelle table.

### Tables par domaine

| Domaine | Tables |
|---|---|
| Patients / recherche | `requests`, `responses`, `reservations`, `guard_schedule`, `pharmacy_guard_schedules` |
| Officines | `pharmacies`, `pharmacy_private`, `pharmacy_stock`, `pharmacy_confidential_stocks`, `pharmacy_peer_exchanges`, `stock_alerts` |
| Délégués médicaux | `delegates`, `delegate_labs`, `delegate_promotions`, `promotion_targets`, `visit_requests`, `delegate_samples` |
| Grossistes | `wholesalers`, `wholesaler_catalog`, `wholesaler_orders`, `wholesaler_campaigns` |
| Messagerie | `direct_messages` (officine ↔ délégué), `b2b_messages` (grossiste ↔ partenaires), `consultation_messages` (médecin ↔ patient) |
| Médecins / téléconsultation | `doctors`, `doctor_appointments`, `medical_consultations`, `medical_prescriptions` |
| Dossier patient / établissements | `patient_profiles`, `patient_medical_records`, `patient_share_grants`, `patient_access_audit`, `health_facilities`, `lab_analysis_orders`, `facility_api_connectors` |
| Paiements / abonnements | `payments`, `subscriptions`, `subscription_reminders_log` |
| Administration | `platform_admins`, `admin_audit_logs` |

### Relations clés
- `requests` → `responses` (une réponse par officine) → `reservations` (code de retrait, expiration 60 min).
- `pharmacies.id` est référencé par `pharmacy_stock`, `stock_alerts`, `responses`, `reservations`, `visit_requests`, `promotion_targets`, `direct_messages`.
- `delegates.id` est référencé par `delegate_promotions`, `delegate_labs`, `visit_requests`, `direct_messages`.
- `wholesalers.id` est référencé par `wholesaler_catalog`, `wholesaler_orders`, `wholesaler_campaigns`, `b2b_messages`.
- `delegate_promotions` → `promotion_targets` (ciblage des officines).
- `subscriptions` (champ `subscriber_role` + `subscriber_id`) couvre officines, délégués et grossistes ; `pharmacies`, `delegates` et `wholesalers` portent aussi un `subscription_status` / `subscription_plan` / dates d'essai et d'expiration.
- Types d'identifiants : certaines tables utilisent `uuid`, d'autres `text` (notamment `doctors`, `medical_consultations`, `pharmacy_guard_schedules`, `pharmacy_peer_exchanges`, `delegate_samples`, `health_facilities`). **Vérifier le type avant toute jointure ou nouvelle clé étrangère.**

### Edge Functions déployées (10)
| Fonction | `verify_jwt` | Rôle |
|---|---|---|
| `notchpay-payment`, `notchpay-webhook` | true / **false** | Paiement NotchPay et réception des notifications |
| `subscription-payment`, `doctor-consultation-payment` | true | Paiement des abonnements et des consultations |
| `subscription-reminders` | **false** | Relances d'abonnement (À CONFIRMER : appelée par `pg_cron`, voir `supabase_schema_v17_cron_pg_cron.sql`) |
| `lab-results-webhook` | **false** | Réception des résultats de laboratoire |
| `admin-auth` | **false** | Authentification de l'administration plateforme |
| `campay-payment`, `campay-webhook` | true | Ancien fournisseur Campay, conservé |

Code source dans `supabase/functions/`. **Les fonctions à `verify_jwt = false` doivent vérifier elles-mêmes l'appelant** (signature de webhook, secret partagé). Ne jamais les modifier de façon à lever cette vérification, ni passer `verify_jwt` à `false` pour une autre fonction sans accord explicite.

### Règles de travail sur la base
1. **Le schéma de référence est versionné dans `supabase/sql/`** (actuellement jusqu'à `supabase_schema_v17_cron_pg_cron.sql` ; il n'y a pas de fichier v15). Toute modification du schéma = **nouveau fichier SQL versionné** (`supabase_schema_v18_<sujet>.sql`), jamais de modification silencieuse en base seulement.
2. Pour appliquer une modification : utiliser une **migration** (`apply_migration`), pas `execute_sql`. Réserver `execute_sql` à la lecture.
3. Toute nouvelle table : activer la RLS **et** écrire les politiques dans le même fichier SQL. Tester avec un rôle non privilégié.
4. **Interdit sans confirmation explicite de l'utilisateur** : `DROP`, `TRUNCATE`, `DELETE` / `UPDATE` sans `WHERE`, suppression de colonne, désactivation de la RLS.
5. Migrations **rétro-compatibles** (ajouter avant de supprimer) : voir la section 6, la base est partagée entre aperçu et production.
6. **Données sensibles** : les identifiants d'accès aux systèmes de stock des officines (`api_endpoint`, `api_key`) ne doivent **jamais** être renvoyés côté client, affichés ou journalisés ; ils relèvent de `pharmacy_private`. Les données de santé (`patient_*`, `medical_*`, `lab_analysis_orders`, `consultation_messages`) ne sont jamais copiées dans les logs, commits, PR ou réponses ; tout accès d'un tiers passe par `patient_share_grants` et est tracé dans `patient_access_audit`. De même, les données d'identité professionnelle des délégués ne sont pas exposées au-delà de leur propriétaire. En cas de doute sur une politique RLS, le signaler à l'utilisateur en privé plutôt que dans ce dépôt public.
7. Après un changement de schéma, lancer les contrôles de sécurité Supabase (`get_advisors`) et corriger les alertes RLS.

---

## 6. Déploiement : toujours par une branche de prévisualisation avant `main`

**Règle absolue : on ne pousse jamais directement sur `main`.** `main` = production.

Flux obligatoire :

1. **Créer une branche** à partir de `main` : `feat/<sujet>`, `fix/<sujet>` ou `docs/<sujet>`.
2. **Commiter et pousser** sur cette branche (commits courts, message en français ou anglais clair, un sujet par commit).
3. **Vercel crée automatiquement un déploiement de prévisualisation** pour la branche. Récupérer son URL et vérifier son état (statut Ready, journaux de build : `node scripts/build-prod.mjs` doit passer sans repli).
4. **Tester l'aperçu** : au minimum, charger les pages modifiées, vérifier la console (erreurs CSP, erreurs JS), tester le parcours concerné sur mobile et sur desktop.
5. **Ouvrir une Pull Request vers `main`** avec : résumé, pages/fichiers touchés, lien de l'aperçu, résultats des tests, migrations SQL éventuelles.
6. **Attendre la validation de l'utilisateur**, puis fusionner. La fusion déclenche le déploiement de production.
7. **Après la fusion** : vérifier que le déploiement de production est Ready et que le Service Worker sert bien la nouvelle version.

Rollback : en cas de régression en production, proposer d'abord le retour au déploiement précédent (rollback Vercel) puis corriger par une nouvelle branche.

### Points d'attention
- **Projet Vercel de production : `pharma-garde`** (confirmé). **Décision du propriétaire (28 novembre 2026) : le second projet `pharma-garde-2zbt`, aussi lié à ce dépôt, doit être supprimé.** Cette suppression se fait manuellement dans le tableau de bord Vercel : l'agent ne la réalise pas. Tant qu'elle n'est pas faite, ignorer les déploiements de `pharma-garde-2zbt` et ne modifier aucun réglage des projets Vercel sans demande explicite.
- **Un seul projet Supabase** : l'aperçu Vercel utilise la **même base que la production** (l'URL Supabase est dans `js/core/supabaseClient.js`). Donc, pendant les tests d'une branche : ne pas créer de données de test sans les nettoyer, ne pas appliquer de migration destructive, et appliquer les migrations **avant** la fusion en les gardant rétro-compatibles avec le code actuellement en production. *Piste à discuter : une branche Supabase de développement (peut engendrer des coûts, ne pas la créer sans accord).*
- `vercel.json` porte la commande de build, les en-têtes de sécurité et la CSP : toute modification de ce fichier se teste obligatoirement sur l'aperçu avant fusion (une CSP trop stricte casse la carte, les paiements ou Supabase).
- **Tâches planifiées** : les relances d'abonnement sont gérées côté Supabase (pg_cron + Edge Function), pas par un cron Vercel. Ne pas ajouter de section `crons` dans `vercel.json` sans accord.

---

## 7. Comportement attendu de l'agent

- **Lire avant d'écrire** : parcourir le dossier concerné et `docs/` avant de modifier.
- **Changements minimaux et ciblés** : ne pas refactorer ce qui n'est pas demandé ; proposer le refactoring séparément.
- **Annoncer les actions à impact** (migration, suppression, changement de CSP, de domaine, de variable d'environnement, de paiement, de `verify_jwt`) et attendre la confirmation.
- **Ne jamais inventer** : si une information manque, le dire et poser la question.
- **Rendre compte** : à la fin d'une tâche, indiquer ce qui a changé, ce qui a été testé, ce qui reste à vérifier, et le lien de l'aperçu Vercel.
- **Sécurité des données** : les données de santé et d'identité professionnelle (cartes pro, CNI, téléphones) ne sont jamais copiées dans les logs, commits, PR ou réponses.

---

## 8. Mise à jour de ce fichier

Ce fichier doit rester fidèle à l'état réel du projet. Toute évolution de la stack, du schéma de base de données ou du processus de déploiement doit s'accompagner d'une mise à jour de `CLAUDE.md` dans la même Pull Request. Dernière mise à jour : 28 novembre 2026 (version applicative 17.0).
