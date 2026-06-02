let mode = 0; // 1 = manche 1, 2 = manche 2, 3 = manche 3

let actions = [];

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

async function loadActionsFromCSV() {
  const response = await fetch("https://louise-rf.github.io/ClimAdapt-logiciel-jeu/actions.csv");
  const csvText = await response.text();

  const lines = csvText
    .split("\n")
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .slice(1);

  actions = lines.map((line, index) => {
    const cols = line.split(",");

    return {
      id: index + 1,
      title: cols[0]?.trim(),
      description: cols[1]?.trim(),
      cat: cols[2]?.trim(),
      tag: Number(cols[3]?.trim())
    };
  });

  startApp();
}

function startApp() {

  const cats = [...new Set(
    actions
      .map(a => a.cat)
      .filter(Boolean) // évite undefined / lignes cassées
  )];

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
        <input
          class="action-checkbox"
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

          <button type="button" class="select-btn">
            Sélectionner
          </button>

        </div>
        `;

        actionsGrid.appendChild(card);
        globalNumber++;
      });

    grid.appendChild(section);
  });

  applyCategoryFilter();
  initChart();
  updateScore();
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

  const cats = [...new Set(
    actions
      .map(a => a.cat)
      .filter(Boolean)
  )];

  if(!categoryFilterSelect) return;

  categoryFilterSelect.innerHTML =
    `<option value="">Tout afficher</option>` +
    cats.map(cat => `<option value="${cat}">${cat}</option>`).join('');

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
      <input
        class="action-checkbox"
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
    
        <button
          type="button"
          class="select-btn"
        >
          Sélectionner
        </button>
    
      </div>
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

function resetGame() {

  if (mode === 0) {
    return;
  }

  document.querySelectorAll('.action-card').forEach(card => {

    const checkbox = card.querySelector('.action-checkbox');
    const button = card.querySelector('.select-btn');

    checkbox.checked = false;

    card.classList.remove('selected');

    button.textContent = 'Sélectionner';

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

document.addEventListener('click', (e) => {
  if (!e.target.classList.contains('select-btn')) {
    return;
  }
  const card = e.target.closest('.action-card');
  const checkbox = card.querySelector('.action-checkbox');
  checkbox.checked = !checkbox.checked;
  card.classList.toggle(
    "selected",
    checkbox.checked
  );
  e.target.textContent =
    checkbox.checked
      ? "✓"
      : "Sélectionner";
  updateScore();

});

// initChart();
// updateScore();
loadActionsFromCSV();

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
