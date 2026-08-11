(function () {
  const HERO_IMAGE_URL =
    "https://vwfzsel6qjgbz0yk4_gbjmhdqi3wnhcg55usw7h8zpw.canva-cdn.email/c86e1bd02866dc2abb45eba605306a0f.png";
  const FOOTER_ICON_LEFT =
    "https://vwfzsel6qjgbz0yk4_gbjmhdqi3wnhcg55usw7h8zpw.canva-cdn.email/152b7731fe605e6f981b4b368190ab71.png";
  const FOOTER_ICON_MIDDLE =
    "https://vwfzsel6qjgbz0yk4_gbjmhdqi3wnhcg55usw7h8zpw.canva-cdn.email/bbb6c7da7088c40139226704e546ff6c.png";

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderAchievementItems(items) {
    if (!Array.isArray(items) || items.length === 0) {
      return '<p class="empty-state">Aucun succ&egrave;s d&eacute;bloqu&eacute; pour le moment.</p>';
    }

    return `
      <div class="achievement-list">
        ${items
          .map(
            (item) => `
              <div class="achievement-chip">
                <span class="achievement-chip__emoji">${escapeHtml(item.badge)}</span>
                <span class="achievement-chip__label">${escapeHtml(item.title)}</span>
              </div>
            `
          )
          .join("")}
      </div>
    `;
  }

  function renderActionGroups(groups) {
    if (!Array.isArray(groups) || groups.length === 0) {
      return '<p class="empty-state">Aucune action s&eacute;lectionn&eacute;e.</p>';
    }

    return groups
      .map(
        (group) => `
          <section class="action-group">
            <h4>${escapeHtml(group.category)}</h4>
            <ul>
              ${group.actions
                .map((actionTitle) => `<li>${escapeHtml(actionTitle)}</li>`)
                .join("")}
            </ul>
          </section>
        `
      )
      .join("");
  }

  function buildClimAdaptExportHtml(payload) {
    const scoreText = escapeHtml(payload?.scoreText || "0 / 10");
    const achievementsMarkup = renderAchievementItems(payload?.achievements || []);
    const actionsMarkup = renderActionGroups(payload?.actionGroups || []);
    const logoUrl = escapeHtml(payload?.assets?.logoUrl || "");

    return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Atelier ClimAdapt - Export</title>
  <style>
    :root {
      --page-bg: #f0f1f5;
      --surface: #ffffff;
      --surface-soft: #f6f7f8;
      --surface-accent: #e7f5e7;
      --border: rgba(15, 18, 22, 0.12);
      --border-strong: rgba(15, 18, 22, 0.2);
      --text: #14181b;
      --muted: #4c5a52;
      --accent: #99ff99;
      --accent-deep: #1b4d2b;
      --accent-soft: #ddf4dd;
      --shadow: 0 18px 40px rgba(16, 24, 20, 0.08);
      --radius-lg: 24px;
      --radius-md: 14px;
      --sheet-width: 190mm;
    }

    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    @page {
      size: A4;
      margin: 10mm;
    }

    html, body {
      margin: 0;
      padding: 0;
      background: var(--page-bg);
      color: var(--text);
      font-family: Lato, Arial, Helvetica, sans-serif;
    }

    body {
      padding: 12px 0 24px;
    }

    .sheet {
      width: var(--sheet-width);
      margin: 0 auto 16px;
      background: var(--surface);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow);
      overflow: hidden;
      page-break-after: always;
    }

    .sheet:last-child {
      page-break-after: auto;
    }

    .hero {
      display: grid;
      grid-template-columns: 1.1fr 0.9fr;
      gap: 18px;
      align-items: end;
      background: var(--accent);
      padding: 28px 28px 18px;
    }

    .hero__title {
      margin: 0;
      font-size: 3rem;
      line-height: 0.96;
      color: #212121;
      font-weight: 800;
    }

    .hero__title-accent {
      display: inline-block;
      color: var(--accent);
      background: #212121;
      padding: 0 6px;
      border-radius: 999px;
      font-size: 1.1rem;
      vertical-align: middle;
      margin: 0 4px 0 0;
    }

    .hero__subtitle {
      margin: 14px 0 0;
      color: var(--accent-deep);
      font-size: 0.98rem;
      line-height: 1.55;
      max-width: 36ch;
    }

    .hero__media {
      text-align: right;
    }

    .hero__media img {
      width: 100%;
      max-width: 280px;
      height: auto;
      display: inline-block;
    }

    .sheet__body {
      padding: 26px 28px 30px;
    }

    .section {
      margin-bottom: 24px;
    }

    .section:last-child {
      margin-bottom: 0;
    }

    .section__title {
      margin: 0 0 12px;
      font-size: 1.34rem;
      line-height: 1.35;
      font-weight: 800;
    }

    .section__title-index {
      display: inline-block;
      background: var(--accent);
      padding: 0 6px;
      margin-right: 8px;
    }

    .section__text {
      margin: 0 0 12px;
      font-size: 0.98rem;
      line-height: 1.62;
      color: var(--text);
    }

    .tip-box {
      display: grid;
      grid-template-columns: 42px 1fr;
      gap: 10px;
      align-items: start;
      background: var(--accent-soft);
      border-radius: var(--radius-md);
      padding: 12px 14px;
      margin: 12px 0 0;
    }

    .tip-box__icon {
      font-size: 1.8rem;
      line-height: 1;
    }

    .tip-box__text {
      margin: 0;
      font-size: 0.92rem;
      line-height: 1.58;
      color: #0d1216;
    }

    .formula {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
      font-size: 1.16rem;
      font-weight: 800;
      margin: 14px 0;
    }

    .formula__pill {
      background: var(--surface-soft);
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 8px 14px;
    }

    .axis-card {
      margin-top: 12px;
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      overflow: hidden;
      background: var(--surface);
    }

    .axis-card__title {
      margin: 0;
      padding: 10px 14px;
      background: var(--surface-soft);
      border-bottom: 1px solid var(--border);
      font-size: 0.98rem;
      font-weight: 800;
    }

    .axis-card ul {
      margin: 0;
      padding: 12px 18px 14px 28px;
    }

    .axis-card li {
      margin-bottom: 7px;
      color: var(--text);
      line-height: 1.5;
      font-size: 0.94rem;
    }

    .results-grid {
      display: grid;
      gap: 16px;
    }

    .result-card {
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      background: var(--surface);
      padding: 16px 18px;
    }

    .result-card__title {
      margin: 0 0 12px;
      font-size: 1rem;
      font-weight: 800;
    }

    .score-pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 108px;
      padding: 10px 18px;
      border-radius: 999px;
      background: var(--accent);
      color: var(--accent-deep);
      font-size: 1.24rem;
      font-weight: 900;
    }

    .achievement-list {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .achievement-chip {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: 999px;
      background: var(--surface-soft);
      border: 1px solid var(--border);
      font-size: 0.95rem;
      font-weight: 700;
      color: var(--text);
    }

    .achievement-chip__emoji {
      font-size: 1.1rem;
      line-height: 1;
    }

    .action-groups {
      display: grid;
      gap: 12px;
    }

    .action-group {
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      background: var(--surface-soft);
      padding: 12px 14px;
      break-inside: avoid;
    }

    .action-group h4 {
      margin: 0 0 8px;
      font-size: 0.98rem;
      color: var(--accent-deep);
    }

    .action-group ul {
      margin: 0;
      padding-left: 20px;
    }

    .action-group li {
      margin-bottom: 6px;
      font-size: 0.93rem;
      line-height: 1.48;
      color: var(--text);
    }

    .empty-state {
      margin: 0;
      color: var(--muted);
      font-size: 0.94rem;
      line-height: 1.5;
    }

    .footer {
      display: grid;
      grid-template-columns: auto auto 1fr auto;
      gap: 12px;
      align-items: end;
      background: var(--surface-accent);
      padding: 16px 24px 20px;
      border-top: 1px solid var(--border);
    }

    .footer img {
      display: block;
      height: 46px;
      width: auto;
    }

    .footer__logo {
      max-width: 150px;
      height: auto;
    }

    .footer__meta {
      text-align: right;
      font-size: 0.72rem;
      line-height: 1.45;
      color: var(--muted);
    }

    .footer__meta a {
      color: inherit;
      text-decoration: none;
    }

    @media print {
      body {
        padding: 0;
        background: var(--page-bg);
      }

      .sheet {
        margin: 0 auto 10mm;
        box-shadow: none;
      }
    }
  </style>
</head>
<body>
  <article class="sheet">
    <header class="hero">
      <div>
        <h1 class="hero__title">Atelier <span class="hero__title-accent">p</span>ClimAdapt</h1>
        <p class="hero__subtitle">
          Une synth&egrave;se de votre atelier pour garder une trace lisible de votre strat&eacute;gie d&rsquo;adaptation.
        </p>
      </div>
      <div class="hero__media">
        <img src="${HERO_IMAGE_URL}" alt="Illustration Atelier ClimAdapt">
      </div>
    </header>
    <div class="sheet__body">
      <section class="section">
        <h2 class="section__title"><span class="section__title-index">1.</span>Comprendre : les d&eacute;finitions de l&rsquo;adaptation</h2>
        <p class="section__text">
          L&rsquo;adaptation est une d&eacute;marche d&rsquo;ajustement au climat actuel ou attendu ainsi qu&rsquo;&agrave; ses effets.
          Elle agit sur les cons&eacute;quences du changement climatique, l&agrave; o&ugrave; l&rsquo;att&eacute;nuation agit sur ses effets.
        </p>
        <p class="section__text">
          Ces cons&eacute;quences se traduisent notamment par des risques de transition et des risques physiques,
          qui doivent &ecirc;tre appr&eacute;hend&eacute;s ensemble dans la strat&eacute;gie.
        </p>
        <div class="tip-box">
          <div class="tip-box__icon">💡</div>
          <p class="tip-box__text">
            L&rsquo;att&eacute;nuation et l&rsquo;adaptation sont compl&eacute;mentaires. Il ne faut pas les opposer mais bien les associer.
          </p>
        </div>
      </section>

      <section class="section">
        <h2 class="section__title"><span class="section__title-index">2.</span>Analyser : identifier et prioriser les risques</h2>
        <p class="section__text">
          Le calcul du risque repose sur le croisement de trois composantes majeures.
        </p>
        <div class="formula">
          <span>Risque =</span>
          <span class="formula__pill">Al&eacute;a</span>
          <span>x</span>
          <span class="formula__pill">Exposition</span>
          <span>x</span>
          <span class="formula__pill">Vuln&eacute;rabilit&eacute;</span>
        </div>
        <p class="section__text">
          L&rsquo;adaptation consiste principalement &agrave; agir sur l&rsquo;exposition et la vuln&eacute;rabilit&eacute;.
          L&rsquo;analyse doit aussi tenir compte des diff&eacute;rents horizons temporels.
        </p>
        <div class="tip-box">
          <div class="tip-box__icon">💡</div>
          <p class="tip-box__text">
            Une analyse utile du risque n&rsquo;est pas fig&eacute;e : elle doit &ecirc;tre r&eacute;&eacute;valu&eacute;e &agrave; mesure que les donn&eacute;es et les connaissances progressent.
          </p>
        </div>
      </section>
    </div>
  </article>

  <article class="sheet">
    <div class="sheet__body">
      <section class="section">
        <h2 class="section__title"><span class="section__title-index">3.</span>Agir : construire une strat&eacute;gie d&rsquo;adaptation</h2>
        <p class="section__text">
          Pour s&eacute;lectionner des actions d&rsquo;adaptation, il faut &eacute;viter la maladaptation et rechercher les co-b&eacute;n&eacute;fices.
          Les actions peuvent ensuite &ecirc;tre r&eacute;parties entre ressources techniques, solutions fond&eacute;es sur la nature,
          ressources organisationnelles, financi&egrave;res et humaines.
        </p>

        <section class="axis-card">
          <h3 class="axis-card__title">Axe 1 : Anticiper et diagnostiquer les risques climatiques</h3>
          <ul>
            <li>Le calcul des risques est complet et priorise les risques entre eux.</li>
            <li>La cha&icirc;ne de valeur est analys&eacute;e dans son ensemble avec les parties prenantes concern&eacute;es.</li>
          </ul>
        </section>

        <section class="axis-card">
          <h3 class="axis-card__title">Axe 2 : Construire une strat&eacute;gie d&rsquo;adaptation de long terme</h3>
          <ul>
            <li>La strat&eacute;gie d&rsquo;adaptation reste continue, flexible et r&eacute;visable.</li>
            <li>Plusieurs temporalit&eacute;s sont visibles dans la strat&eacute;gie.</li>
          </ul>
        </section>

        <section class="axis-card">
          <h3 class="axis-card__title">Axe 3 : D&eacute;ployer un plan d&rsquo;actions op&eacute;rationnel</h3>
          <ul>
            <li>Les pr&eacute;judices importants et la maladaptation sont &eacute;vit&eacute;s.</li>
            <li>La strat&eacute;gie ne se concentre pas sur une unique cat&eacute;gorie d&rsquo;actions.</li>
            <li>Les solutions fond&eacute;es sur la nature sont privil&eacute;gi&eacute;es face aux solutions grises.</li>
          </ul>
        </section>

        <section class="axis-card">
          <h3 class="axis-card__title">Axe 4 : Mettre en place un suivi et une gouvernance de l&rsquo;adaptation</h3>
          <ul>
            <li>Les &eacute;quipes concern&eacute;es sont form&eacute;es et tenues au courant de la strat&eacute;gie.</li>
            <li>La prise de d&eacute;cision est soutenue par des outils, des indicateurs et une discussion collective.</li>
          </ul>
        </section>
      </section>
    </div>
  </article>

  <article class="sheet">
    <div class="sheet__body">
      <section class="section">
        <h2 class="section__title"><span class="section__title-index">4.</span>Vos choix : une strat&eacute;gie robuste</h2>
        <div class="results-grid">
          <section class="result-card">
            <h3 class="result-card__title">Votre score :</h3>
            <div class="score-pill">${scoreText}</div>
          </section>

          <section class="result-card">
            <h3 class="result-card__title">Vos succ&egrave;s d&eacute;bloqu&eacute;s :</h3>
            ${achievementsMarkup}
          </section>

          <section class="result-card">
            <h3 class="result-card__title">Vos actions s&eacute;lectionn&eacute;es :</h3>
            <div class="action-groups">
              ${actionsMarkup}
            </div>
          </section>
        </div>
      </section>
    </div>

    <footer class="footer">
      <img src="${FOOTER_ICON_LEFT}" alt="">
      <img src="${FOOTER_ICON_MIDDLE}" alt="">
      <img class="footer__logo" src="${logoUrl}" alt="Logo Akteo">
      <div class="footer__meta">
        <div>&copy; 2026 Akteo - Tous droits r&eacute;serv&eacute;s</div>
        <div>akteo.ovh | conseil@akteo.fr</div>
      </div>
    </footer>
  </article>

  <script>
    (function () {
      function waitForImages() {
        var images = Array.prototype.slice.call(document.images || []);
        if (!images.length) {
          return Promise.resolve();
        }

        return Promise.all(
          images.map(function (image) {
            if (image.complete) {
              return Promise.resolve();
            }

            return new Promise(function (resolve) {
              var done = function () { resolve(); };
              image.addEventListener("load", done, { once: true });
              image.addEventListener("error", done, { once: true });
              window.setTimeout(done, 2500);
            });
          })
        );
      }

      function triggerPrint() {
        window.setTimeout(function () {
          window.focus();
          window.print();
        }, 200);
      }

      window.addEventListener("load", function () {
        waitForImages().then(function () {
          if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(triggerPrint);
            return;
          }

          triggerPrint();
        });
      });
    })();
  </script>
</body>
</html>`;
  }

  function openClimAdaptPrintWindow(html) {
    const printWindow = window.open("", "climadapt-export", "width=1200,height=900");
    if (!printWindow) {
      return null;
    }

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    return printWindow;
  }

  window.buildClimAdaptExportHtml = buildClimAdaptExportHtml;
  window.openClimAdaptPrintWindow = openClimAdaptPrintWindow;
})();
