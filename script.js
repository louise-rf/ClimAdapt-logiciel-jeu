let mode = 0; // 1 = manche 1, 2 = manche 2, 3 = manche 3

const actions = [
  {
    "id": 1,
    "title": "Dispositifs énergétiques de secours pour assurer la continuité des activités du campus et des laboratoires",
    "description": "(ex : groupe électrogène pour maintenir les serveurs)",
    "cat": "Ressources Techniques",
    "tag": 0
  },
  {
    "id": 2,
    "title": "Développer l'autoconsommation énergétique du campus et réduire la dépendance au réseau électrique",
    "description": "(ex : ombrières photovoltaïques sur les parkings)",
    "cat": "Ressources Techniques",
    "tag": 0
  },
  {
    "id": 3,
    "title": "Installation d'un système de climatisation généralisée",
    "description": "(ex : climatisation centralisée dans les amphithéâtres)",
    "cat": "Ressources Techniques",
    "tag": 9
  },
  {
    "id": 4,
    "title": "Réduction de la dépendance du campus aux énergies fossiles",
    "description": "(ex : réduire progressivement les usages gaz au profit d'équipements électriques performants)",
    "cat": "Ressources Techniques",
    "tag": 0
  },
  {
    "id": 5,
    "title": "Déplacements des activités pédagogiques, administrative ou de recherche vers des zones plus sûres",
    "description": "(ex : déplacement du campus en Bretagne)",
    "cat": "Ressources Techniques",
    "tag": 9
  },
  {
    "id": 6,
    "title": "Amélioration de la résilience des bâtiments du campus",
    "description": "(ex : installation dans le bâtiment Carnot de brise-soleil)",
    "cat": "Ressources Techniques",
    "tag": 0
  },
  {
    "id": 7,
    "title": "Raccordement des bâtiments au réseau de chaleur urbain",
    "description": "(ex : racordement des bâtiments ENPC au réseau de chaleur de Champs-sur-Marne)",
    "cat": "Ressources Techniques",
    "tag": 8
  },
  {
    "id": 8,
    "title": "Les principaux fournisseurs des laboratoires ont mis en œuvre des solutions techniques visant l'amélioration de la robustesse de leurs sites",
    "description": "(ex : demander aux fournisseurs des laboratoires un plan de continuité d'activité climatique)",
    "cat": "Ressources Techniques",
    "tag": 5
  },
  {
    "id": 9,
    "title": "Utilisation raisonnée de la climatisation avec priorisation des espaces critiques (amphithéâtre, laboratoires, ...)",
    "description": "(ex : réserver le refroidissement aux amphithéâtres)",
    "cat": "Ressources Techniques",
    "tag": 8
  },
  {
    "id": 10,
    "title": "Mise en place de dispositifs de secours et d'urgence en cas d'aléas",
    "description": "(ex : système de SMS d'alerte)",
    "cat": "Ressources Techniques",
    "tag": 0
  },
  {
    "id": 11,
    "title": "Diagnostic des risques climatiques du campus régulièrement actualisé avec une prise en compte des mises à jour scientifiques",
    "description": "(ex : réaliser tous les 2 ans une cartographique chaleur, ruissellement, sécheresse, ...)",
    "cat": "Ressources Techniques",
    "tag": 4
  },
  {
    "id": 12,
    "title": "Evaluation régulière des équipements critiques du campus et des laboratoires pour s'assurer qu'ils sont dimensionnés aux conditions climatiques",
    "description": "(ex : tester la résistance des serveurs à des températures extrêmes)",
    "cat": "Ressources Techniques",
    "tag": 1
  },
  {
    "id": 1,
    "title": "Végétalisation du bâtiment",
    "description": "(ex : installation de murs végétalisés sur le bâtiment Carnot)",
    "cat": "Ressources Solutions fondées sur la Nature",
    "tag": 6
  },
  {
    "id": 2,
    "title": "Création de nouveaux habitats naturels sur le campus",
    "description": "(ex : créer des prairies fleuries sur les espaces peu utilisés)",
    "cat": "Ressources Solutions fondées sur la Nature",
    "tag": 6
  },
  {
    "id": 3,
    "title": "Renforcement de la trame végétale du campus",
    "description": "(ex : replanter des alignements d'arbres)",
    "cat": "Ressources Solutions fondées sur la Nature",
    "tag": 9
  },
  {
    "id": 4,
    "title": "Gestion intégrée des eaux pluviales sur le campus",
    "description": "(ex : installer des noues végétalisées autour des parkings et chemins du campus)",
    "cat": "Ressources Solutions fondées sur la Nature",
    "tag": 6
  },
  {
    "id": 5,
    "title": "Conservation des habitats existants pour la biodiversité",
    "description": "(ex : étendre le jardin Pontanique)",
    "cat": "Ressources Solutions fondées sur la Nature",
    "tag": 6
  },
  {
    "id": 6,
    "title": "Création de corridors écologiques pour le déplacement des espèces à l'échelle du campus",
    "description": "(ex : relier les espaces verts par haies)",
    "cat": "Ressources Solutions fondées sur la Nature",
    "tag": 6
  },
  {
    "id": 7,
    "title": "Renaturation des circulations hydriques du campus",
    "description": "(ex : restaurer les zones naturelles d'infiltration)",
    "cat": "Ressources Solutions fondées sur la Nature",
    "tag": 6
  },
  {
    "id": 8,
    "title": "Désimperméabilisation des parkings avec des parcelles \"éponge\"",
    "description": "(ex : transformer certaines places de parking en surfaces drainantes végétalisées)",
    "cat": "Ressources Solutions fondées sur la Nature",
    "tag": 6
  },
  {
    "id": 9,
    "title": "Création de points d'eau permanents",
    "description": "(ex : installer une mare plus grande que la toute petite existante)",
    "cat": "Ressources Solutions fondées sur la Nature",
    "tag": 6
  },
  {
    "id": 10,
    "title": "Choix d'essences végétales adaptées au futur climat de Champs-sur-Marne",
    "description": "(ex : choisir des érables champêtres résistants aux vagues de chaleur et aux gélées)",
    "cat": "Ressources Solutions fondées sur la Nature",
    "tag": 6
  },
  {
    "id": 11,
    "title": "Restauration écologiques des sols dégradés du campus",
    "description": "(ex : réhabiliter les sols compactés autour des bâtiments)",
    "cat": "Ressources Solutions fondées sur la Nature",
    "tag": 6
  },
  {
    "id": 12,
    "title": "Réduction des intrants chimiques dans la gestion du campus",
    "description": "(ex : supprimer progressivement herbicides et pesticides)",
    "cat": "Ressources Solutions fondées sur la Nature",
    "tag": 6
  },
  {
    "id": 13,
    "title": "Gestion différenciée et écologique des espaces verts",
    "description": "(ex : mettre certains pelouses en fauche tardive et tester l'écopâturage)",
    "cat": "Ressources Solutions fondées sur la Nature",
    "tag": 6
  },
  {
    "id": 14,
    "title": "Déploiement de solutions de ventilation naturelles dans les bâtiments",
    "description": "(ex : installer des ouvrants automatisés)",
    "cat": "Ressources Solutions fondées sur la Nature",
    "tag": 6
  },
  {
    "id": 1,
    "title": "Mise en place de protocoles d'urgence et de gestion de crfise climatique pour la campus",
    "description": "(ex : créer Plan Campus Résilience Climatique avec plusieurs niveaux d'alerte climatique)",
    "cat": "Ressources Organisationnelles",
    "tag": 5
  },
  {
    "id": 2,
    "title": "Diversification des fournisseurs stratégiques du campus et des laboratoires",
    "description": "(ex : identifier des fournisseurs alterantifs pour les équipements critiques des laboratoires)",
    "cat": "Ressources Organisationnelles",
    "tag": 5
  },
  {
    "id": 3,
    "title": "Engager un dialogue avec ses principaux fournisseurs sur la résilience de leurs sites",
    "description": "(ex : organiser un échange annuel avec le MRS sur leurs plans de résilience climatique)",
    "cat": "Ressources Organisationnelles",
    "tag": 5
  },
  {
    "id": 4,
    "title": "Politique de maintenance des bâtiments intégrant les risques climatiques",
    "description": "(ex : renforcer maintenant des réseaux pluviaux)",
    "cat": "Ressources Organisationnelles",
    "tag": 1
  },
  {
    "id": 5,
    "title": "Etablissement de règles de maintenance des équipements critique en prenant en compte les aléas",
    "description": "(ex : mettre en place une vérification saisonnière des équipements des équipements sensibles aux fortes chaleurs)",
    "cat": "Ressources Organisationnelles",
    "tag": 0
  },
  {
    "id": 6,
    "title": "Politique de gestion des conditions de travail des employés prenant en compte les risques climatiques",
    "description": "(ex : adapter les horaires lors des fortes chaleurs)",
    "cat": "Ressources Organisationnelles",
    "tag": 0
  },
  {
    "id": 7,
    "title": "Politique de gestion des conditions de travail des prestataires prenant en compte les risques climatiques",
    "description": "(ex : imposer des horaires aménagés pour les équipes de maintenance en été)",
    "cat": "Ressources Organisationnelles",
    "tag": 5
  },
  {
    "id": 8,
    "title": "Analyse regulière et mise à jour des dépendances critiques de l'École et des risques climatiques associés",
    "description": "(ex : mettre en place une cartographie des dépendances aux ressources)",
    "cat": "Ressources Organisationnelles",
    "tag": 1
  },
  {
    "id": 9,
    "title": "Plan de continuité pédagogique, scientifique et administrative",
    "description": "(ex : prévoir passage automatique en hybride pendant les canicules)",
    "cat": "Ressources Organisationnelles",
    "tag": 0
  },
  {
    "id": 10,
    "title": "Dialogue avec les fournisseurs et distributeurs sur la résilience de l'approvisionnement face aux aléas",
    "description": "(ex : échanger avec les fournisseurs de matériels sur les risques de rupture logistique)",
    "cat": "Ressources Organisationnelles",
    "tag": 5
  },
  {
    "id": 11,
    "title": "Collaboration avec les acteurs de territoire Paris-Est sur les stratégies et méthodes",
    "description": "(ex : mutualiser les retours d'expérience avec Université Gustave Eiffel)",
    "cat": "Ressources Organisationnelles",
    "tag": 3
  },
  {
    "id": 12,
    "title": "Relocalisation des équipements et activités essentiels aux étages supérieurs",
    "description": "(ex : déplacer les équipements sensibles hors sous-sols inondables)",
    "cat": "Ressources Organisationnelles",
    "tag": 0
  },
  {
    "id": 13,
    "title": "Flexibiliser les pratiques d’organisation d'enseignement",
    "description": "(ex : autoriser le télétravail et les horaires matinaux pendant les fortes chaleurs)",
    "cat": "Ressources Organisationnelles",
    "tag": 0
  },
  {
    "id": 14,
    "title": "Apprentissage à partir des retours d’expérience des établissements d’enseignement supérieur et de recherche",
    "description": "(ex : s'inspirer des plans d'adaptation de CentraleSupélec)",
    "cat": "Ressources Organisationnelles",
    "tag": 3
  },
  {
    "id": 15,
    "title": "Mise en place d'indicateurs de suivi, d'outils et de méthodologies",
    "description": "(ex : construire un tableau de bord climat campus)",
    "cat": "Ressources Organisationnelles",
    "tag": 7
  },
  {
    "id": 16,
    "title": "Priorisation des risques climatiques pour le campus selon les horizons temporels",
    "description": "(ex : prioriser canicule à l'horizon 2030, sécheresse structurelle à horizon 2050)",
    "cat": "Ressources Organisationnelles",
    "tag": 2
  },
  {
    "id": 17,
    "title": "Alignement avec les normes et réglementation liées à l'adaptation climatique",
    "description": "(ex : intégrer les recommandations de la RE2020)",
    "cat": "Ressources Organisationnelles",
    "tag": 0
  },
  {
    "id": 1,
    "title": "Alignement des investissements immobiliers et scientifiques avec les risques climatiques futurs",
    "description": "(ex : éviter un invetissement bâtiment non viable sous +4°C)",
    "cat": "Ressources Financières",
    "tag": 8
  },
  {
    "id": 2,
    "title": "Prise en comptes dans la gestion financière des surcoûts d'approvisionnement induits par des dommages sur les sites de ses principaux fournisseurs",
    "description": "(ex : créer une réserve budgétaire pour la hausse des matériaux pour la semaine design)",
    "cat": "Ressources Financières",
    "tag": 0
  },
  {
    "id": 3,
    "title": "Couverture assurantielle adaptée aux risques pesant sur les bâtiments, laboratoires et continuité d’activité",
    "description": "(ex : étendre les assurance aux pertes d'exploitation des serveurs)",
    "cat": "Ressources Financières",
    "tag": 5
  },
  {
    "id": 4,
    "title": "Plan de financement dédié à la résilience du campus et des infrastructures",
    "description": "(ex : créer un budget pluriannuel dédié à la résilience)",
    "cat": "Ressources Financières",
    "tag": 0
  },
  {
    "id": 5,
    "title": "Mobilisation des financements publics",
    "description": "(ex : déposer des dossiers pour l'Agence de l'eau, les Fonds Barnier, et les Prêts verts)",
    "cat": "Ressources Financières",
    "tag": 0
  },
  {
    "id": 6,
    "title": "Évaluation économique des besoins d’adaptation et des coûts de l’inaction",
    "description": "(ex : comparer coût fermeture campus pendant canicule au coût des investissements préventifs)",
    "cat": "Ressources Financières",
    "tag": 0
  },
  {
    "id": 7,
    "title": "Recherche de financements pour maintenir et soutenir les activités très exposées",
    "description": "(ex : chercher financements dédiés aux laboratoires)",
    "cat": "Ressources Financières",
    "tag": 9
  },
  {
    "id": 8,
    "title": "Quantité pertinente et suffisante de ressources financières",
    "description": "(ex : sanctuariser une enveloppe annuelle adaptation dans le budget)",
    "cat": "Ressources Financières",
    "tag": 0
  },
  {
    "id": 9,
    "title": "Programmes de recherche et d’innovation alignés avec les enjeux d’adaptation",
    "description": "(ex : financer davantage de projets sur les villes durables)",
    "cat": "Ressources Financières",
    "tag": 0
  },
  {
    "id": 10,
    "title": "Compatibilité entre les investissements réalisés et l’augmentation des risques physiques",
    "description": "(ex : vérifier que tout nouveau bpatiment reste opérationnel sous des pluies extrêmes)",
    "cat": "Ressources Financières",
    "tag": 8
  },
  {
    "id": 1,
    "title": "Promotion des comportements individuels adaptés face aux fortes chaleurs",
    "description": "(ex : diffuser les consignes d'hydratation et d'acccès aux espaces frais)",
    "cat": "Ressources Humaines",
    "tag": 0
  },
  {
    "id": 2,
    "title": "Sensibilisation et formation des étudiants, personnels et chercheurs continue avec une mise à jour des informations",
    "description": "(ex : formation adaptation pour les étudiants en 2ème année)",
    "cat": "Ressources Humaines",
    "tag": 10
  },
  {
    "id": 3,
    "title": "Inscription de l’adaptation climatique dans les instances et agendas stratégiques de l’École",
    "description": "(ex : ajouter un point adaptation trimestriel au CODIR)",
    "cat": "Ressources Humaines",
    "tag": 2
  },
  {
    "id": 4,
    "title": "Montée en compétences des équipes en interne sur les enjeux avec recours à une expertise externe si besoin",
    "description": "(ex : appui du Cerema)",
    "cat": "Ressources Humaines",
    "tag": 10
  },
  {
    "id": 5,
    "title": "Les personnes responsables de la mise en place et du suivi du plan d'adaptation ont été identifiées",
    "description": "(ex : nommer un référent adaptation climatique rattaché à la direction)",
    "cat": "Ressources Humaines",
    "tag": 10
  },
  {
    "id": 6,
    "title": "Communication aux usagers du campus des risques et des conduites à tenir en cas d'aléa",
    "description": "(ex : envoyer alerte SMS en cas de chaleur extrême avec consignes)",
    "cat": "Ressources Humaines",
    "tag": 5
  },
  {
    "id": 7,
    "title": "Renforcement des solidarités et des réseaux d’entraide sur le campus",
    "description": "(ex : créer un dispositif de vigiliance pour étudiants isolés)",
    "cat": "Ressources Humaines",
    "tag": 3
  },
  {
    "id": 8,
    "title": "Former aux dispositifs de secours mis en place et aux bons gestes du personnel et des usagers",
    "description": "(ex : organiser un exercice a nuel canicule)",
    "cat": "Ressources Humaines",
    "tag": 10
  },
  {
    "id": 9,
    "title": "Le pilotage sur l'adaptation se fait à haut niveau avec une direction formée et les questions d'adaptation sont dans l'agenda stratégique",
    "description": "(ex : créer un comité d'adaptation rattaché au CODIR avec reporting annuel)",
    "cat": "Ressources Humaines",
    "tag": 10
  }
];

let history=[0];
let chart;

function initChart(){
const ctx=document.getElementById('chart');

chart=new Chart(ctx, {
type:'line',
data:{
  labels:history,
  datasets:[{
    data:history,
    tension:0.3
  }]
},
options:{
  plugins:{
    legend:{
      display:false
    }
  },
  scales:{y:{min:0,max:10}}
}
});
}

function setMode(m){
  mode = m;

  document
  .getElementById("homeScreen")
  .classList.add("hidden");

  document
  .getElementById("dashboard")
  .classList.remove("hidden");

  document
  .querySelector(".sidebar")
  .classList.remove("hidden");

  document
  .getElementById("grid")
  .classList.remove("hidden");

  document
  .getElementById("mainHeader")
  .classList.remove("hidden");

  const chartCardEl = document.querySelector(".chart-card");
  const riskCardEl = document.querySelector(".risk-card");
  const categoryFilterWrap = document.getElementById("categoryFilterWrap");
  const categoryFilter = document.getElementById("categoryFilter");

  const modeLabel = document.getElementById("modeLabel");
  const modeTitle = document.getElementById("modeTitle");
  const modeCopy = {
    1: {
      label: "Manche 1",
      title: "Découvrir des actions d'adaptation",
    },
    2: {
      label: "Manche 2",
      title: "Elaborer une stratégie d'adaptation",
    },
    3: {
      label: "Manche 3",
      title: "Une amélioration continue",
    },
  };

  if (modeLabel && modeTitle && modeCopy[m]) {
    modeLabel.textContent = modeCopy[m].label;
    modeTitle.textContent = modeCopy[m].title;
  }

  if (categoryFilterWrap) {
    categoryFilterWrap.style.display = (m >= 1) ? "flex" : "none";
  }

  applyCategoryFilter();

  const chartCard = document.querySelector(".chart-card h3");
  const canvas = document.getElementById("chart");
  const pdfBtn = document.getElementById("pdfBtn");

  chartCard.classList.remove("future-title");

  document.querySelectorAll(".mode-box button").forEach(b=>{
    b.classList.remove("mode-active");
  });

  document.querySelectorAll(".mode-box button")[m-1].classList.add("mode-active");

  selectedCategory = categoryFilterSelect.value;

  if(mode === 1){
    chartCard.textContent = "À venir ...";
    chartCard.classList.add("future-title");
    canvas.style.display = "none";
    pdfBtn.classList.add("pdf-hidden");
    document.getElementById("criteriaBox").style.display = "none";
    document.querySelector(".dashboard").classList.remove("manche3");
    if (chartCardEl) chartCardEl.style.display = "none";
    if (riskCardEl) riskCardEl.style.display = "none";
    applyCategoryFilter();
  }

  if(mode === 2){
    chartCard.textContent = "Évolution du score";
    canvas.style.display = "block";
    pdfBtn.classList.add("pdf-hidden");
    document.getElementById("criteriaBox").style.display = "none";
    document.querySelector(".dashboard").classList.remove("manche3");
    if (chartCardEl) chartCardEl.style.display = "";
    if (riskCardEl) riskCardEl.style.display = "";
    applyCategoryFilter();
  }

  if(mode === 3){
    chartCard.textContent = "Analyse finale";
    canvas.style.display = "block";
    pdfBtn.classList.remove("pdf-hidden");

    history = [0];
    chart.destroy();
    initChart();

    document.getElementById("criteriaBox").style.display = "block";
    document.querySelector(".dashboard").classList.add("manche3");
    if (chartCardEl) chartCardEl.style.display = "";
    if (riskCardEl) riskCardEl.style.display = "";
    applyCategoryFilter();
  }

  updateScore();
  applyCategoryFilter();
}

function updateChart(v){
if(mode === 1) return;
history.push(v);
chart.data.labels=history.map((_,i)=>i);
chart.data.datasets[0].data=history;
chart.update();
}

const grid=document.getElementById('grid');
const categoryFilterSelect = document.getElementById('categoryFilter');
let selectedCategory = '';

function formatActionLabel(action){
  const description =
    (action.description || '').trim();
  return description.replace(
    /\(ex\s*:\s*(.*?)\)/g,
    '<span class="ex">(ex : $1)</span>'
  );
}

const cats=[...new Set(actions.map(a=>a.cat))];

function populateCategoryFilter(){
  if(!categoryFilterSelect) return;

  categoryFilterSelect.innerHTML =
    `<option value="">Tout afficher</option>` +
    cats
      .map(cat => `<option value="${cat}">${cat}</option>`)
      .join('');

  selectedCategory = '';
  categoryFilterSelect.value = '';
}

function applyCategoryFilter(){

  document
    .querySelectorAll('.category-section')
    .forEach(section => {

      const matchCategory =
        selectedCategory === '' ||
        section.dataset.cat === selectedCategory;

      section.style.display =
        matchCategory ? '' : 'none';
    });

}

function showAllCategoryCards(){
  document.querySelectorAll('.action-category-card').forEach(card => {
    card.style.display = '';
  });
}

if(categoryFilterSelect){
  categoryFilterSelect.addEventListener('change', () => {
    selectedCategory = categoryFilterSelect.value;
    applyCategoryFilter();
  });
}

populateCategoryFilter();

let globalNumber = 1;

cats.forEach(cat => {

  const section = document.createElement("div");
  section.className = "category-section";
  section.dataset.cat = cat;

  section.innerHTML = `
    <h2 class="cat-title">${cat}</h2>
    <div class="actions-grid"></div>
  `;

  const actionsGrid = section.querySelector(".actions-grid");

  actions
    .filter(a => a.cat === cat)
    .forEach(a => {

      const card = document.createElement("div");

      card.className = "action-card";
      card.dataset.cat = a.cat;

      card.innerHTML = `
        <label class="action-card__label">
          <input
            type="checkbox"
            data-id="${globalNumber}"
            data-cat="${a.cat}"
            data-tag="${a.tag}"
          >

          <div class="action-card__content">
            <div class="action-card__title">
              <strong>${globalNumber}.</strong> ${a.title}
            </div>

            <div class="action-card__desc">
              ${formatActionLabel(a)}
            </div>
          </div>
        </label>
      `;

      actionsGrid.appendChild(card);

      globalNumber++;
    });

  grid.appendChild(section);
});

applyCategoryFilter();

function updateScore(){

const sel = [
  ...document.querySelectorAll(
    '#grid input[type="checkbox"]:checked'
  )
];

const tags = sel.map(x => Number(x.dataset.tag));

const catsSel = [
  ...new Set(sel.map(x => x.dataset.cat))
];

let score = 0;

/* Diversification adaptation */
if(tags.includes(1)) score++;
if(tags.includes(2)) score++;
if(tags.includes(3)) score++;
if(tags.includes(4)) score++;

/* Gestion de crise */
if(tags.filter(t => t === 5).length > 1){
  score++;
}

/* Solutions fondées nature */
const nature = sel.filter(
  x => x.dataset.cat.includes('Nature')
).length;

const tech = sel.filter(
  x => x.dataset.cat.includes('Techniques')
).length;

if(
  tags.includes(6) &&
  nature / ((nature + tech) || 1) >= 0.5
){
  score++;
}

/* Suivi / indicateurs */
if(tags.includes(7)) score++;

/* Robustesse sans maladaptation */
if(tags.includes(8) && !tags.includes(9)){
  score++;
}

/* Gouvernance / compétences */
if(tags.includes(10)) score++;

/* Diversité des catégories */
const needed = [
"Ressources Solutions fondées sur la Nature",
"Ressources Organisationnelles",
"Ressources Financières",
"Ressources Humaines",
"Ressources Techniques"
];

if(needed.every(c => catsSel.includes(c))){
  score++;
}

score = Math.max(0, Math.min(10, score));

const scoreEl = document.getElementById('score');
const scoreGaugeFill = document.getElementById('scoreGaugeFill');
const actionProgressFill = document.getElementById('actionProgressFill');
const actionProgress = actionProgressFill ? actionProgressFill.parentElement : null;
const ratio = score / 10;
const selCount = sel.length;
const revealScore = mode === 2 || mode === 3 || selCount === 15;

scoreEl.textContent = revealScore ? score : "??";
scoreEl.classList.toggle('score--placeholder', !revealScore);
scoreEl.style.color = revealScore
  ? `rgb(${Math.round(255 * (1 - ratio))},${Math.round(255 * ratio)},0)`
  : 'var(--text_color)';

if (scoreGaugeFill) {
  scoreGaugeFill.parentElement.parentElement.style.setProperty('--score-ratio', revealScore ? ratio : 0);
}

if (actionProgressFill) {
  const actionRatio = Math.min(selCount, 15) / 15;
  actionProgressFill.style.width = `${actionRatio * 100}%`;
  actionProgress.classList.toggle('action-progress--full', selCount >= 15);
}

document.getElementById('count').textContent = sel.length;

/* message 15 actions */
updateChart(score);

const summary = document.getElementById("summaryText");

const numbers = sel.map(x => x.dataset.id);

summary.innerHTML = `
Actions : ${numbers.join(", ")}
`;

}

function resetGame(){
  if (mode === 0) {
    return;
  }

  document.querySelectorAll('#grid input[type="checkbox"]').forEach(i => {
    i.checked = false;
  });

  if (mode === 2 || mode === 3) {
    history = [0];
    chart.destroy();
    initChart();
  }

  updateScore();
}

document.addEventListener('change', (e) => {
  if (e.target.matches('#grid input[type="checkbox"]')) {
    updateScore();
  }
});

initChart();
updateScore();

function exportPDF(){

  const sel = [
    ...document.querySelectorAll('#grid input[type="checkbox"]:checked')
  ];

  const grouped = {};

  sel.forEach(x => {
    const cat = x.dataset.cat;
    if(!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(x.parentElement.textContent.trim());
  });

  let html = `
    <html>
    <head>
      <style>
        body{font-family:Arial;padding:20px;}
        h1{color:#7C51A6;}
        h2{color:#224A1E;margin-top:20px;}
        .crit{margin-bottom:10px;padding:10px;border-left:4px solid #7C51A6;}
        .cat{margin-top:20px;padding:10px;background:#f4f4f4;border-radius:8px;}
      </style>
    </head>
    <body>
      <h1>Rapport - Stratégie d’adaptation</h1>

      <h2>📌 10 critères d’une bonne stratégie</h2>

      <div class="crit">1 Une stratégie d’adaptation doit être continue et flexible. Ce n’est pas un processus qui se conduit sur un seul instant, mais bien un processus qui nécessite des révisions fréquentes.</div>
      <div class="crit">2 Plusieurs temporalités doivent être visibles dans une stratégie, une seule temporalité n’est pas suffisante à elle-même. Il faut donc plusieurs horizons (court, moyen, long terme).
</div>
      <div class="crit">3 Une collaboration avec les acteurs du territoires et du secteurs permet de mutualiser les efforts et d’accélérer l’apprentissage.</div>
      <div class="crit">4 Le calcul des risques est complet et priorise les risques entre eux. Cette analyse doit se renouveler pour s’adapter aux incertitudes des données climatiques.</div>
      <div class="crit">5 La chaîne de valeur de l’entreprise est analysée en entière avec une identification des scopes, des parties prenantes, et des priorités.</div>
      <div class="crit">6 Les solutions fondées sur la nature doivent être privilégiées face aux solutions “grises” tout en cherchant à éviter la maladaptation.</div>
      <div class="crit">7 La prise de décision doit être soutenue par des outils et des indicateurs avec une intégration des parties prenantes dans la discussion.</div>
      <div class="crit">8 Les préjudices importants ainsi que la maladaptation doivent être évités. La recherche doit se tourner vers les co-bénéfices.</div>
      <div class="crit">9 Les différentes strates de l’entreprise concernées doivent être formées sur les sujets d’adaptation et être tenues au courant de la stratégie interne. Les compétences doivent être actualisées si besoin.</div>
      <div class="crit">10 Une stratégie ne doit pas se concentrer sur une unique catégorie d’actions. Il faut mélanger les différentes catégories pour agir sur les différents pans d’une entreprise.</div>

      <h2>🧩 Actions sélectionnées</h2>
  `;

  Object.keys(grouped).forEach(cat=>{
    html += `<div class="cat"><strong>${cat}</strong><br>`;
    grouped[cat].forEach(a=>{
      html += `- ${a}<br>`;
    });
    html += `</div>`;
  });

  html += `</body></html>`;

  const win = window.open("", "", "width=900,height=700");
  win.document.write(html);
  win.document.close();
  win.print();
}

document.getElementById("dashboard").classList.add("hidden");
document.getElementById("grid").classList.add("hidden");
document.getElementById("mainHeader").classList.add("hidden");
document.querySelector(".sidebar").classList.add("hidden");

mode = 0;
