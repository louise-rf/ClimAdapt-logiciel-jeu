(function () {
  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getDirectChildElements(parent, tagName) {
    const normalizedTagName = String(tagName || "").toUpperCase();
    return Array.from(parent?.children || []).filter(
      (child) => child.tagName === normalizedTagName
    );
  }

  function clearElement(node) {
    while (node?.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        resolve(String(reader.result || ""));
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function findPrimaryContentTbody(root) {
    return root?.querySelector("tbody[data-export-content]") || null;
  }

  function isPreferredBreakRow(row) {
    return Boolean(row?.matches(".export-heading, .export-subheading, .export-axis"));
  }

  function prepareExportVisuals(root, options) {
    Array.from(root?.querySelectorAll("img") || []).forEach((image) => {
      image.setAttribute("crossorigin", "anonymous");
      image.style.maxWidth = image.style.maxWidth || "100%";
      image.style.height = image.style.height || "auto";
    });

    Array.from(root?.querySelectorAll("td") || []).forEach((cell) => {
      const text = String(cell.textContent || "").trim();
      if (text === "💡") {
        cell.style.textAlign = "center";
        cell.style.fontFamily =
          '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",Tahoma,Geneva,sans-serif';
      }
    });
  }

  async function inlineExternalImages(root) {
    const images = Array.from(root?.querySelectorAll("img") || []);
    const tasks = images.map(async function (image) {
      const source = String(image.getAttribute("src") || image.src || "").trim();
      if (!source || !/^https?:\/\//i.test(source)) {
        return;
      }

      try {
        const response = await fetch(source, { mode: "cors", cache: "force-cache" });
        if (!response.ok) {
          return;
        }

        const blob = await response.blob();
        const dataUrl = await blobToDataUrl(blob);
        if (dataUrl) {
          image.setAttribute("src", dataUrl);
        }
      } catch (error) {
        console.warn("Impossible d'intégrer une image distante dans l'export PDF.", error);
      }
    });

    await Promise.all(tasks);
  }

  function waitForExportAssets(root, exportDocument) {
    const images = Array.from(root?.querySelectorAll("img") || []);
    const imagePromises = images.map((image) => {
      if (image.complete && image.naturalWidth > 0) {
        return Promise.resolve();
      }

      return new Promise((resolve) => {
        const done = function () {
          resolve();
        };

        image.addEventListener("load", done, { once: true });
        image.addEventListener("error", done, { once: true });
        window.setTimeout(done, 4000);
      });
    });

    const fontsReady =
      exportDocument?.fonts && exportDocument.fonts.ready
        ? exportDocument.fonts.ready.catch(function () {})
        : Promise.resolve();

    return Promise.all([fontsReady, Promise.all(imagePromises)]).then(function () {});
  }

  function renderScoreHtml(scoreText) {
    return `<table border="0" cellpadding="0" cellspacing="0" style="margin-top:8px"><tbody><tr><td style="background-color:#ddf4dd;border-radius:10px;padding:10px 14px;font-size:21.3px;font-weight:700;font-family:Lato, Arial, Helvetica, sans-serif;line-height:1.2;color:#0d1216">${scoreText || "&nbsp;"}</td></tr></tbody></table>`;
  }

  function renderAchievementHtml(items) {
    if (!Array.isArray(items) || items.length === 0) {
      return "";
    }

    const chips = items
      .map((item) => ({
        badge: escapeHtml(String(item?.badge || "").trim()),
        title: escapeHtml(String(item?.title || "").trim()),
      }))
      .filter((item) => item.badge || item.title)
      .map(
        (item) =>
          `<span style="display:inline-block;background-color:#ddf4dd;border-radius:999px;padding:7px 12px;margin:8px 8px 0 0;font-size:14px;font-weight:700;font-family:Lato, Arial, Helvetica, sans-serif;line-height:1.3;color:#0d1216">${item.badge ? `${item.badge} ` : ""}${item.title}</span>`
      )
      .join("");

    return chips ? `<div style="margin-top:4px">${chips}</div>` : "";
  }

  function renderActionHtml(groups) {
    if (!Array.isArray(groups) || groups.length === 0) {
      return "";
    }

    const sections = groups
      .map((group) => {
        const category = escapeHtml(String(group?.category || "").trim());
        const actions = Array.isArray(group?.actions)
          ? group.actions
              .map((action) => escapeHtml(String(action || "").trim()))
              .filter(Boolean)
          : [];

        if (!category && !actions.length) {
          return "";
        }

        const actionItems = actions
          .map(
            (action) =>
              `<tr><td style="width:18px;vertical-align:top;font-size:16px;line-height:1.4;color:#0d1216">•</td><td style="font-size:14px;font-family:Lato, Arial, Helvetica, sans-serif;line-height:1.5;color:#0d1216">${action}</td></tr>`
          )
          .join("");

        return `<table border="0" cellpadding="0" cellspacing="0" style="width:100%;margin-top:10px;background-color:#f6f7f8;border-radius:10px"><tbody><tr><td style="padding:10px 12px 8px;font-size:14px;font-weight:700;font-family:Lato, Arial, Helvetica, sans-serif;line-height:1.3;color:#0d1216">${category || "&nbsp;"}</td></tr><tr><td style="padding:0 12px 10px"><table border="0" cellpadding="0" cellspacing="0" style="width:100%"><tbody>${actionItems}</tbody></table></td></tr></tbody></table>`;
      })
      .join("");

    return sections ? `<div style="margin-top:2px">${sections}</div>` : "";
  }

  // Keep the supplied document's typography, spacing and table layout in one place.
  function renderTextRow(html, className, padding) {
    return `<tr${className ? ` class="${className}"` : ""}><td dir="ltr" class="export-text" style="font-size:16px;font-family:Lato, Arial, Helvetica, sans-serif;text-align:left;padding:${padding || "0px 24px 16px"};line-height:1.4">${html}<br></td></tr>`;
  }

  function renderSectionHeading(number, title) {
    return `<tr class="export-heading" data-export-section="${number}"><td dir="ltr" style="font-size:21.3px;font-weight:700;font-family:Lato, Arial, Helvetica, sans-serif;text-align:left;padding:${number === 1 ? "24px" : "0px"} 24px 16px;line-height:1.4"><span style="background-color:#99ff99">${number}.</span> ${title}<br></td></tr>`;
  }

  function renderListRow(html, options) {
    const marker = options?.marker || "•";
    const isSubtitle = options?.subtitle;
    const rowClass = isSubtitle ? "export-subheading" : options?.keepWithNext ? "export-keep-next" : "";
    const size = isSubtitle ? "18.7px" : "16px";
    const padding = options?.compact ? "0px 24px" : "0px 24px 16px";
    return `<tr${rowClass ? ` class="${rowClass}"` : ""}><td dir="ltr" style="text-align:left;padding:${padding};line-height:1.4;font-size:0"><table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-family:Arial, Helvetica, sans-serif"><tbody><tr><td style="width:24px;vertical-align:top;padding-right:8px;text-align:right;white-space:nowrap"><span style="font-size:${size};color:#000;display:inline-block">${marker}</span></td><td class="export-text" style="font-size:${size};${isSubtitle ? "font-style:italic;" : ""}font-family:Lato, Arial, Helvetica, sans-serif;vertical-align:top">${html}<br></td></tr></tbody></table></td></tr>`;
  }

  function renderTipRow(text) {
    return `<tr class="export-tip"><td style="padding:0px 24px 16px"><table border="0" cellpadding="0" cellspacing="0" style="width:100%;table-layout:fixed;background-color:#ddf4dd;border-radius:10px"><tbody><tr><td style="width:9.95%;box-sizing:border-box;vertical-align:middle;padding:5px;text-align:center;font-size:32px;font-family:'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',Tahoma,Geneva,sans-serif;line-height:1.4">💡</td><td style="width:3px;font-size:0">&nbsp;</td><td style="vertical-align:middle;padding:10px;color:#0d1216;font-size:13.3px;font-family:Lato, Arial, Helvetica, sans-serif;line-height:22.4px">${text}<br></td></tr></tbody></table></td></tr>`;
  }

  function renderDividerRow() {
    return '<tr><td style="padding:0px 24px 16px"><div style="height:2px;border-radius:999px;background-color:#99ff99"></div></td></tr>';
  }

  function renderAxisRow(title) {
    return `<tr class="export-axis"><td style="padding:0px 24px 16px"><table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tbody><tr><td style="padding:10px;background-color:#f6f7f8;border:2px solid #fff;font-size:16px;font-weight:700;font-family:Lato, Arial, Helvetica, sans-serif;line-height:1.4">${title}<br></td></tr></tbody></table></td></tr>`;
  }

  function buildClimAdaptExportHtml(payload) {
    const scoreHtml = renderScoreHtml(escapeHtml(payload?.scoreText || ""));
    const achievementsHtml = renderAchievementHtml(payload?.achievements || []);
    const actionsHtml = renderActionHtml(payload?.actionGroups || []);
    const contentHtml = [
      renderSectionHeading(1, 'Un contexte : <span style="font-size:24px">pourquoi faut-il s’adapter ?</span>'),
      renderTextRow('Les effets du changement climatique sont déjà visibles et touchent directement notre société et nos organisations. Ils peuvent provoquer des dommages sur les bâtiments et les infrastructures, affecter la santé, perturber les transports, les ressources en eau, l’énergie, les écosystèmes ou encore entraîner des interruptions d’activité.'),
      renderTextRow('Ces impacts ne sont pas toujours isolés : <strong>un même événement climatique peut provoquer des conséquences en cascade</strong>. Une inondation peut par exemple endommager un bâtiment, entraîner une coupure électrique, perturber une activité et avoir ensuite des conséquences économiques ou humaines.'),
      renderTextRow('Les organisations sont donc directement concernées, mais elles ne peuvent pas compter uniquement sur l’assurance ou l’action de l’État pour absorber l’ensemble de ces impacts. <strong>S’adapter devient une nécessité et constitue également un investissement permettant de limiter les dommages futurs.</strong>'),
      renderTipRow('Le climat change déjà. L’objectif de l’adaptation est de se préparer à ses conséquences avant qu’elles ne deviennent critiques.'),
      renderDividerRow(),

      renderSectionHeading(2, 'Comprendre : <span style="font-size:24px">de l’évolution du climat aux risques climatiques</span>'),
      renderListRow('Atténuation et adaptation : deux démarches complémentaires', { subtitle: true }),
      renderTextRow('Face au changement climatique, deux démarches complémentaires existent :'),
      renderTextRow('L’<strong>atténuation</strong> agit sur les <strong>causes</strong> du changement climatique, en réduisant les émissions de gaz à effet de serre ou en augmentant les puits de carbone.'),
      renderTextRow('L’<strong>adaptation</strong> agit sur ses <strong>conséquences</strong>. Elle correspond à une démarche d’ajustement au climat actuel ou attendu ainsi qu’à ses effets.'),
      renderTipRow('L’atténuation et l’adaptation sont les deux faces d’une même pièce : il faut réduire le changement climatique tout en se préparant aux changements devenus inévitables.'),
      renderListRow("Le climat de demain n'est pas celui d'aujourd'hui", { subtitle: true }),
      renderTextRow("L'adaptation nécessite de se projeter dans un climat futur. En France, la <strong>TRACC</strong> (Trajectoire de Réchauffement de référence pour l’Adaptation au Changement Climatique) fournit un cadre commun pour évaluer les risques climatiques."),
      renderTextRow('Elle retient comme référence pour la France métropolitaine :'),
      renderListRow('<strong>2030 : +2 °C</strong>', { compact: true }),
      renderListRow('<strong>2050 : +2,7 °C</strong>', { compact: true }),
      renderListRow('<strong>2100 : +4 °C</strong>'),
      renderTextRow('Ces niveaux de réchauffement ne signifient pas uniquement des températures moyennes plus élevées. Ils s’accompagnent également d’une <strong>intensification de certains événements extrêmes</strong> et de <strong>perturbations du cycle de l’eau</strong>.'),
      renderTextRow('Les risques physiques liés au climat peuvent être regroupés en deux catégories :'),
      renderListRow('<strong>les risques extrêmes</strong>, associés à des événements ponctuels comme une vague de chaleur, une inondation, une tempête ou de fortes pluies', { compact: true }),
      renderListRow('<strong>les risques chroniques</strong>, liés à des évolutions progressives et durables du climat'),
      renderTextRow('Leurs conséquences peuvent concerner notamment la <strong>santé, les matériels et infrastructures, les activités économiques, les mobilités et transports, l’eau, l’énergie, la biodiversité et les milieux naturels</strong> ou encore <strong>la réputation</strong>.'),
      renderTipRow('On ne construit pas une stratégie d’adaptation à partir du climat passé. Il faut comprendre comment les aléas peuvent évoluer aux horizons qui comptent pour son organisation.'),
      renderDividerRow(),

      renderSectionHeading(3, 'Analyser : identifier et prioriser les risques'),
      renderTextRow('Connaître les évolutions climatiques ne suffit pas. Un même aléa peut avoir des conséquences très différentes selon l’organisation concernée.'),
      renderTextRow('Le risque repose sur le croisement de trois composantes :'),
      renderTextRow('<span style="font-size:21.3px"><strong>Risque</strong> = <strong>Aléa</strong> x <strong>Exposition</strong> x <strong>Vulnérabilité</strong></span>', 'export-avoid-break'),
      renderTextRow('Un <strong>aléa</strong> est un événement susceptible de se produire et pouvant entraîner des dommages. Le changement climatique peut modifier sa <strong>fréquence, son intensité ou ses caractéristiques</strong>.'),
      renderTextRow('L’<strong>exposition</strong> correspond aux populations, activités, bâtiments, équipements ou milieux susceptibles d’être touchés par l’aléa.'),
      renderTextRow('La <strong>vulnérabilité</strong> représente le degré auquel ces éléments exposés peuvent être négativement affectés.'),
      renderTextRow('Deux organisations exposées au même aléa peuvent donc présenter des risques très différents selon leurs bâtiments, leurs activités, leurs équipements, leurs salariés, leurs fournisseurs ou encore leur capacité à faire face à l’événement.'),
      renderListRow('Regarder au-delà de son propre site', { subtitle: true }),
      renderTextRow('Une analyse des risques climatiques ne doit pas se limiter aux bâtiments de l’organisation.'),
      renderTextRow('Elle doit également prendre en compte sa <strong>chaîne de valeur et ses parties prenantes</strong> : fournisseurs, fournisseurs de fournisseurs, réseaux d’eau ou d’électricité, transporteurs, clients, usagers, partenaires…'),
      renderTextRow('Un risque climatique situé chez un fournisseur ou sur un réseau essentiel peut ainsi provoquer des conséquences importantes sur une organisation qui n’a pourtant subi aucun dommage direct.'),
      renderTipRow('Être soi-même à l’abri d’un aléa ne signifie pas que son activité est à l’abri.'),
      renderListRow('Tous les risques ne se valent pas', { subtitle: true }),
      renderTextRow('Après avoir identifié les risques, il faut les <strong>prioriser</strong>.'),
      renderTextRow('Deux questions permettent notamment de les comparer :'),
      renderListRow('<strong>Probabilité :</strong> quelle est la probabilité que le risque se produise ?', { compact: true }),
      renderListRow('<strong>Impact :</strong> quelle serait la gravité de ses conséquences ?'),
      renderTextRow('Cette priorisation permet de distinguer les risques les plus urgents et de concentrer les moyens disponibles là où ils seront les plus utiles.'),
      renderTextRow('Enfin, cette analyse ne doit pas être considérée comme une photographie définitive. <strong>Les risques évoluent avec le climat, l’organisation et son environnement</strong>. Un risque peut donc être différent en 2030, 2050 ou 2100.'),
      renderTipRow('Identifier un risque ne suffit pas. Il faut le comparer aux autres risques, le prioriser et réévaluer régulièrement son évolution.'),
      renderDividerRow(),

      renderSectionHeading(4, 'Agir : construire une stratégie d’adaptation'),
      renderListRow('Toutes les adaptations n’ont pas la même ambition', { subtitle: true }),
      renderTextRow('Les actions d’adaptation peuvent également correspondre à différents niveaux de transformation :'),
      renderListRow('<strong>Adaptation réactive</strong>', { marker: '1.&nbsp;', keepWithNext: true }),
      renderTextRow('Elle répond ponctuellement à une perturbation donnée.'),
      renderListRow('<strong>Adaptation incrémentale</strong>', { marker: '2.&nbsp;', keepWithNext: true }),
      renderTextRow('Elle fait évoluer progressivement un système ou un processus tout en conservant son fonctionnement général.'),
      renderListRow('<strong>Adaptation transformationnelle</strong>', { marker: '3.&nbsp;', keepWithNext: true }),
      renderTextRow('Elle modifie plus profondément certains attributs du système en agissant sur les causes structurelles de ses impacts, de son exposition ou de sa vulnérabilité.'),
      renderTipRow('Une réponse efficace aujourd’hui n’est pas forcément suffisante demain. Une stratégie robuste doit pouvoir évoluer avec l’intensification des risques.'),
      renderListRow('Éviter la maladaptation et rechercher les co-bénéfices', { subtitle: true }),
      renderTextRow('Une action n’est pas automatiquement une bonne action d’adaptation.'),
      renderTextRow('La <strong>maladaptation</strong> désigne une action qui produit des effets néfastes ou indésirés et peut finalement augmenter certains risques ou en créer de nouveaux.'),
      renderTextRow('À l’inverse, une action peut générer des <strong>co-bénéfices</strong> en plus de réduire le risque climatique : réduction des émissions de gaz à effet de serre, protection de la biodiversité, respect des limites planétaires ou réduction des inégalités.'),
      renderTextRow('Il faut donc se demander pour chaque action : “Est-ce que cette action réduit réellement notre risque sans en créer d’autres ? Et peut-elle apporter d’autres bénéfices à l’organisation ou à son environnement ?”'),
      renderListRow('Diversifier les types d’actions', { subtitle: true }),
      renderTextRow('Il n’existe pas une solution unique à l’adaptation. Les actions peuvent mobiliser différentes ressources :'),
      renderListRow('<strong>techniques</strong> : technologies, équipements, outils ou innovations ;', { compact: true }),
      renderListRow('<strong>organisationnelles</strong> : évolution des processus, du fonctionnement ou de la prise de décision ;', { compact: true }),
      renderListRow('<strong>solutions fondées sur la nature</strong> : actions utilisant les écosystèmes tout en contribuant à leur protection ;', { compact: true }),
      renderListRow('<strong>financières</strong> : ressources économiques permettant de financer et sécuriser l’adaptation ;', { compact: true }),
      renderListRow('<strong>humaines</strong> : compétences, connaissances, savoir-faire et temps de travail.'),
      renderDividerRow(),

      renderSectionHeading(5, 'Les 10 critères d’une stratégie d’adaptation robuste'),
      renderTextRow('Pour construire une stratégie d’adaptation robuste et cohérente, 10 critères clés permettent de guider la démarche :'),
      renderAxisRow('Axe 1 : Anticiper et diagnostiquer les risques climatiques'),
      renderListRow('Le calcul des risques est complet et priorise les risques entre eux, cette analyse est renouvelée pour s’adapter aux incertitudes des données climatiques', { compact: true }),
      renderListRow('La chaîne de valeur de l’entreprise est analysée dans son ensemble avec une identification des parties prenantes'),
      renderAxisRow('Axe 2 : Construire une stratégie d’adaptation de long terme'),
      renderListRow('La stratégie d’adaptation est continue et flexible, des révisions fréquentes sont prévues', { compact: true }),
      renderListRow('Plusieurs temporalités sont visibles dans la stratégie'),
      renderAxisRow('Axe 3 : Déployer un plan d’actions opérationnel'),
      renderListRow('Les préjudices importants ainsi que la maladaptation sont évités, la recherche est tournée vers les co-bénéfices', { compact: true }),
      renderListRow('Une collaboration avec les acteurs du territoires et du secteurs est mise en place', { compact: true }),
      renderListRow('La stratégie ne se concentre pas sur une unique catégorie d’actions', { compact: true }),
      renderListRow('Les solutions fondées sur la nature sont privilégiées face aux solutions “grises”'),
      renderAxisRow('Axe 4 : Mettre en place un suivi et une gouvernance de l’adaptation'),
      renderListRow('Les différentes strates de l’entreprise concernées sont formées sur les sujets d’adaptation et sont tenues au courant de la stratégie interne, les compétences sont actualisées si besoin', { compact: true }),
      renderListRow('La prise de décision est soutenue par des outils et des indicateurs avec une intégration des parties prenantes dans la discussion'),
      renderTipRow('Ces bonnes pratiques s’appuient sur les recommandations actuelles des instances gouvernementales et scientifiques françaises. Elles sont amenées à évoluer et à s’affiner au fil des années, à mesure que les connaissances et les retours d’expérience progressent.'),
      renderDividerRow(),

      renderSectionHeading(6, 'Le chemin de l’adaptation'),
      renderTextRow('L’adaptation peut finalement être résumée comme un <strong>chemin progressif</strong> :'),
      renderListRow('Comprendre les évolutions climatiques', { marker: '1.&nbsp;', compact: true }),
      renderListRow('Identifier les aléas, l’exposition et la vulnérabilité', { marker: '2.&nbsp;', compact: true }),
      renderListRow('Identifier et prioriser les risques', { marker: '3.&nbsp;', compact: true }),
      renderListRow('Construire une stratégie et sélectionner des actions adaptées', { marker: '4.&nbsp;', compact: true }),
      renderListRow('Rechercher les co-bénéfices et éviter la maladaptation', { marker: '5.&nbsp;', compact: true }),
      renderListRow('Assurer la gouvernance, le suivi et la mise à jour de la stratégie', { marker: '6.&nbsp;' }),
      renderTextRow('L’objectif n’est pas d’atteindre immédiatement une adaptation parfaite, mais de mettre l’organisation en mouvement et d’<strong>améliorer progressivement</strong> sa résilience.'),
      renderDividerRow(),

      renderSectionHeading(7, 'Vos choix : une stratégie robuste'),
      renderListRow('Votre score :', { keepWithNext: true }),
      renderTextRow(scoreHtml),
      renderListRow('Vos succès débloqués :', { keepWithNext: true }),
      renderTextRow(achievementsHtml),
      renderListRow('Vos actions sélectionnées :', { keepWithNext: true }),
      renderTextRow(actionsHtml),
    ].join("");
    const printStyles = `<style>@page{size:A4;margin:6mm}html,body{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important}img{max-width:100%;height:auto}.export-avoid-break{break-inside:avoid;page-break-inside:avoid}.export-break-before{break-before:page;page-break-before:always}@media print{html,body{background-color:#f0f1f5!important}body,table,tbody,tr,td,span,p,a{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important}.ecw{width:100%!important;min-width:0!important;max-width:none!important}table[width="600"]{width:100%!important}table[style*="max-width:600px"]{max-width:none!important;width:100%!important}table[style*="max-width:552px"]{max-width:none!important;width:100%!important}.export-avoid-break{break-inside:avoid;page-break-inside:avoid}.export-break-before{break-before:page;page-break-before:always}}.export-heading,.export-subheading,.export-axis,.export-keep-next{break-after:avoid;page-break-after:avoid}.export-tip{break-inside:avoid;page-break-inside:avoid}.export-text strong{font-weight:700}</style>`;
    const printScript = `<script>(function(){function f(b){return new Promise(function(c,d){var e=new FileReader();e.onload=function(){c(String(e.result||""))};e.onerror=d;e.readAsDataURL(b)})}function g(){var b=Array.prototype.slice.call(document.images||[]);return Promise.all(b.map(function(c){var d=String(c.getAttribute("src")||c.src||"").trim();if(!/^https?:\\/\\//i.test(d)){return Promise.resolve()}return fetch(d,{mode:"cors",cache:"force-cache"}).then(function(e){if(!e.ok){return null}return e.blob()}).then(function(e){if(!e){return null}return f(e)}).then(function(e){if(e){c.src=e}}).catch(function(){return null})}))}function h(){var b=Array.prototype.slice.call(document.images||[]);if(!b.length){return Promise.resolve()}return Promise.all(b.map(function(c){if(c.complete&&c.naturalWidth>0){return Promise.resolve()}return new Promise(function(d){var e=function(){d()};c.addEventListener("load",e,{once:true});c.addEventListener("error",e,{once:true});window.setTimeout(e,4000)})}))}function i(){document.title="";window.setTimeout(function(){window.focus();window.print()},500)}window.addEventListener("load",function(){document.title="";g().then(h).then(function(){if(document.fonts&&document.fonts.ready){return document.fonts.ready.catch(function(){})}}).then(i)})})();</script>`;
    return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd"><html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><meta name="format-detection" content="telephone=no, date=no, address=no, email=no"><meta name="x-apple-disable-message-reformatting"><meta name="keywords" content="DAHZeV7ChqQ, BAFftZ2lh3s"><style>body{margin:0;padding:0}table{mso-table-lspace:0;mso-table-rspace:0}p,span,h1,h2,h3,h4,h5,h6{margin:0;padding:0}p{line-height:inherit}a[x-apple-data-detectors]{color:inherit!important;text-decoration:inherit!important}#MessageViewBody a{color:inherit;text-decoration:none}img+div{display:none}@media (max-width:599px){.ecw{width:100%!important;min-width:0!important}}</style><!--[if mso]><div>
                <noscript>
                  <xml>
                    <w:WordDocument xmlns:w="urn:schemas-microsoft-com:office:word">
                      <w:DontUseAdvancedTypographyReadingMail/>
                    </w:WordDocument>
                    <o:OfficeDocumentSettings>
                      <o:AllowPNG/>
                      <o:PixelsPerInch>96</o:PixelsPerInch>
                    </o:OfficeDocumentSettings>
                  </xml>
                </noscript></div><![endif]--><!--[if !mso]><!--><style>@media (max-width:1px){
.l0-c0,.l0-c1{display:block!important;width:100%!important}
.l0-s0{display:block!important;width:auto!important;height:16px;font-size:0}
}</style><!--<![endif]--><!--[if !mso]><!--><style>@media (max-width:100px){
.l1-c0,.l1-c1{display:block!important;width:100%!important}
.l1-s0{display:block!important;width:auto!important;height:3px;font-size:0}
}</style><!--<![endif]--><!--[if !mso]><!--><style>@media (max-width:450px){
.l2-c0,.l2-c1,.l2-c2,.l2-c3{display:block!important;width:100%!important}
.l2-s0,.l2-s1,.l2-s2{display:block!important;width:auto!important;height:16px;font-size:0}
}</style><!--<![endif]--><!--[if !mso]><!--><style>@media (max-width:100px){
.l3-c0,.l3-c1{display:block!important;width:100%!important}
.l3-s0{display:block!important;width:auto!important;height:3px;font-size:0}
}</style><!--<![endif]--><!--[if !mso]><!--><style>@media (max-width:100px){
.l4-c0,.l4-c1{display:block!important;width:100%!important}
.l4-s0{display:block!important;width:auto!important;height:3px;font-size:0}
}</style><!--<![endif]--><!--[if !mso]><!--><style>@media (max-width:1px){
.l5-c0,.l5-c1,.l5-c2,.l5-c3{display:block!important;width:100%!important}
.l5-s0,.l5-s1,.l5-s2{display:block!important;width:auto!important;height:0px;font-size:0}
}</style><!--<![endif]--><style>@media(max-width:550px){.ers-fs-200{font-size:18px!important}.ers-fs-213{font-size:18.7px!important}.ers-fs-227{font-size:19.4px!important}.ers-fs-320{font-size:24px!important}.ers-fs-547{font-size:35.4px!important}}</style>${printStyles}</head><body style="width:100%;-webkit-text-size-adjust:100%;text-size-adjust:100%;background-color:#f0f1f5;margin:0;padding:0"><table width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#f0f1f5" style="background-color:#f0f1f5"><tbody><tr><td style="background-color:#f0f1f5"><!--[if mso]><center>
                    <table align="center" border="0" cellpadding="0" cellspacing="0" width="600">
                      <tbody>
                        <tr>
                          <td><![endif]--><table align="center" width="600" border="0" cellpadding="0" cellspacing="0" role="presentation" class="ecw" style="max-width:600px;min-height:600px;margin:0 auto;background-color:#ffffff;width:600px;min-width:600px"><tbody><tr><td style="vertical-align:top"></td></tr><tr><td style="vertical-align:top"><table border="0" cellpadding="0" cellspacing="0" class="layout-0" align="center" style="display:table;border-spacing:0px;border-collapse:separate;width:100%;max-width:100%;table-layout:fixed;margin:0 auto;background-color:#99ff99"><tbody><tr><td style="text-align:center"><table border="0" cellpadding="0" cellspacing="0" style="border-spacing:0px;border-collapse:separate;width:100%;max-width:600px;table-layout:fixed;margin:0 auto"><tbody><tr><td width="100%" class="l0-c0" style="width:100%;box-sizing:border-box;vertical-align:middle;border-top-left-radius:0;border-top-right-radius:0;border-bottom-left-radius:0;border-bottom-right-radius:0"><table border="0" cellpadding="0" cellspacing="0" style="border-spacing:0px;border-collapse:separate;width:100%;table-layout:fixed"><tbody><tr><td style="padding:15px 24px"><table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="color:#000;font-style:normal;font-weight:normal;font-size:16px;line-height:1.4;letter-spacing:0;text-align:left;direction:ltr;border-collapse:collapse;font-family:Arial, Helvetica, sans-serif;white-space:normal;word-wrap:break-word;word-break:break-word"><tbody><tr><td dir="ltr" style="font-size:16px;font-weight:700;font-family:Lato, Arial, Helvetica, sans-serif;text-align:left;padding:0px 0px 16px;line-height:0.88;mso-line-height-alt:16px"><span class="ers-fs-547" style="font-size:54.7px;white-space:pre-wrap"> </span><span class="ers-fs-547" style="font-size:54.7px;white-space:pre-wrap">Atelier                                       </span><br></td></tr><tr><td dir="ltr" class="ers-fs-547" style="font-size:54.7px;font-weight:700;font-family:Lato, Arial, Helvetica, sans-serif;text-align:left;line-height:0.88;mso-line-height-alt:54.7px"><span style="color:#212121;white-space:pre-wrap"> Clim</span><span style="white-space:pre-wrap">Adapt  </span><br></td></tr></tbody></table></td></tr></tbody></table></td></tr></tbody></table></td></tr></tbody></table></td></tr><tr><td style="vertical-align:top;padding:0px
           0px
           0px
           0px"><table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation"><tbody><tr><td style="padding:24px 0 24px 0;vertical-align:top"><table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="color:#000;font-style:normal;font-weight:normal;font-size:16px;line-height:1.4;letter-spacing:0;text-align:left;direction:ltr;border-collapse:collapse;font-family:Arial, Helvetica, sans-serif;white-space:normal;word-wrap:break-word;word-break:break-word"><tbody data-export-content>${contentHtml}</tbody></table></td></tr></tbody></table></td></tr><tr><td height="100%" style="height:100%;font-size:0;line-height:0" aria-hidden="true">&nbsp;</td></tr><tr><td style="vertical-align:top"><table border="0" cellpadding="0" cellspacing="0" class="layout-9" align="center" style="display:table;border-spacing:0px;border-collapse:separate;width:100%;max-width:100%;table-layout:fixed;margin:0 auto;background-color:#e7f5e7"><tbody><tr><td style="text-align:center"><table border="0" cellpadding="0" cellspacing="0" style="border-spacing:0px;border-collapse:separate;width:100%;max-width:600px;table-layout:fixed;margin:0 auto"><tbody><tr><td width="13.83%" class="l9-c0" style="width:13.83%;box-sizing:border-box;vertical-align:middle;border-top-left-radius:0;border-top-right-radius:0;border-bottom-left-radius:0;border-bottom-right-radius:0"><table border="0" cellpadding="0" cellspacing="0" style="border-spacing:0px;border-collapse:separate;width:100%;table-layout:fixed"><tbody><tr><td><table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="color:#000;font-style:normal;font-weight:normal;font-size:16px;line-height:1.4;letter-spacing:0;text-align:left;direction:ltr;border-collapse:collapse;font-family:Arial, Helvetica, sans-serif;white-space:normal;word-wrap:break-word;word-break:break-word"><tbody><tr><td><table cellpadding="0" cellspacing="0" border="0" style="width:100%"><tbody><tr><td align="center"><!--[if mso]><table cellpadding="0" cellspacing="0" border="0" width="39" style="width:39px"><tbody><tr><td><![endif]--><table cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:39px"><tbody><tr><td style="width:100%"><img src="https://vwfzsel6qjgbz0yk4_gbjmhdqi3wnhcg55usw7h8zpw.canva-cdn.email/152b7731fe605e6f981b4b368190ab71.png" width="39" height="49" style="display:block;width:39px;height:auto;max-width:100%"></td></tr></tbody></table><!--[if mso]></td></tr></tbody></table><![endif]--></td></tr></tbody></table></td></tr></tbody></table></td></tr></tbody></table></td><td width="0" class="l9-s0" style="width:0;box-sizing:border-box;font-size:0">&nbsp;</td><td width="13.33%" class="l9-c1" style="width:13.33%;box-sizing:border-box;vertical-align:middle;border-top-left-radius:0;border-top-right-radius:0;border-bottom-left-radius:0;border-bottom-right-radius:0"><table border="0" cellpadding="0" cellspacing="0" style="border-spacing:0px;border-collapse:separate;width:100%;table-layout:fixed"><tbody><tr><td style="padding:5px"><table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="color:#000;font-style:normal;font-weight:normal;font-size:16px;line-height:1.4;letter-spacing:0;text-align:left;direction:ltr;border-collapse:collapse;font-family:Arial, Helvetica, sans-serif;white-space:normal;word-wrap:break-word;word-break:break-word"><tbody><tr><td><table cellpadding="0" cellspacing="0" border="0" style="width:100%"><tbody><tr><td align="center"><!--[if mso]><table cellpadding="0" cellspacing="0" border="0" width="39" style="width:39px"><tbody><tr><td><![endif]--><table cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:39px"><tbody><tr><td style="width:100%"><img src="https://vwfzsel6qjgbz0yk4_gbjmhdqi3wnhcg55usw7h8zpw.canva-cdn.email/bbb6c7da7088c40139226704e546ff6c.png" width="39" height="55" style="display:block;width:39px;height:auto;max-width:100%"></td></tr></tbody></table><!--[if mso]></td></tr></tbody></table><![endif]--></td></tr></tbody></table></td></tr></tbody></table></td></tr></tbody></table></td><td width="0" class="l9-s1" style="width:0;box-sizing:border-box;font-size:0">&nbsp;</td><td width="43.58%" class="l9-c2" style="width:43.58%;box-sizing:border-box;vertical-align:middle;border-top-left-radius:0;border-top-right-radius:0;border-bottom-left-radius:0;border-bottom-right-radius:0"><table border="0" cellpadding="0" cellspacing="0" style="border-spacing:0px;border-collapse:separate;width:100%;table-layout:fixed"><tbody><tr><td style="padding:5px"><table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="color:#000;font-style:normal;font-weight:normal;font-size:16px;line-height:1.4;letter-spacing:0;text-align:left;direction:ltr;border-collapse:collapse;font-family:Arial, Helvetica, sans-serif;white-space:normal;word-wrap:break-word;word-break:break-word"><tbody><tr><td><table cellpadding="0" cellspacing="0" border="0" style="width:100%"><tbody><tr><td align="center"><!--[if mso]><table cellpadding="0" cellspacing="0" border="0" width="148" style="width:148px"><tbody><tr><td><![endif]--><table cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:148px"><tbody><tr><td style="width:100%"><img src="https://vwfzsel6qjgbz0yk4_gbjmhdqi3wnhcg55usw7h8zpw.canva-cdn.email/a1f3f447961c6903f1f87104487678b0.png" width="148" height="58" style="display:block;width:148px;height:auto;max-width:100%"></td></tr></tbody></table><!--[if mso]></td></tr></tbody></table><![endif]--></td></tr></tbody></table></td></tr></tbody></table></td></tr></tbody></table></td><td width="0" class="l9-s2" style="width:0;box-sizing:border-box;font-size:0">&nbsp;</td><td width="29.25%" class="l9-c3" style="width:29.25%;box-sizing:border-box;vertical-align:middle;border-top-left-radius:0;border-top-right-radius:0;border-bottom-left-radius:0;border-bottom-right-radius:0"><table border="0" cellpadding="0" cellspacing="0" style="border-spacing:0px;border-collapse:separate;width:100%;table-layout:fixed"><tbody><tr><td><table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="color:#000;font-style:normal;font-weight:normal;font-size:16px;line-height:1.4;letter-spacing:0;text-align:left;direction:ltr;border-collapse:collapse;font-family:Arial, Helvetica, sans-serif;white-space:normal;word-wrap:break-word;word-break:break-word"><tbody><tr><td dir="ltr" style="font-size:10.7px;letter-spacing:-0.0025em;font-family:Tahoma, Geneva, sans-serif;white-space:pre-wrap;text-align:left;padding:0px 0px 16px;line-height:8px;mso-line-height-alt:10.7px;text-decoration:none">&nbsp;</td></tr><tr><td dir="ltr" style="font-size:10.7px;letter-spacing:-0.0025em;font-family:Lato, Arial, Helvetica, sans-serif;white-space:pre-wrap;text-align:right;padding:0px 0px 16px;line-height:8px;mso-line-height-alt:10.7px">© 2026 Akteo - Tous droits réservés  <br></td></tr><tr><td dir="ltr" style="font-size:10.7px;letter-spacing:-0.0025em;font-family:Lato, Arial, Helvetica, sans-serif;white-space:pre-wrap;text-align:right;padding:0px 0px 16px;line-height:8px;mso-line-height-alt:10.7px"><a href="http://akteo.ovh" target="_blank" rel="noopener noreferrer" style="color:#000000;text-decoration:none">akteo.ovh</a> | <a href="mailto:conseil@akteo.fr" target="_blank" rel="noopener noreferrer" style="color:#000000;text-decoration:none">conseil@akteo.fr</a>  <br></td></tr><tr><td dir="ltr" style="font-size:16px;letter-spacing:-0.0025em;font-family:Tahoma, Geneva, sans-serif;white-space:pre-wrap;text-align:left;line-height:0.5;mso-line-height-alt:16px;text-decoration:none">&nbsp;</td></tr></tbody></table></td></tr></tbody></table></td></tr></tbody></table></td></tr></tbody></table></td></tr></tbody></table>
${printScript}</body></html>`;
  }

  function createClimAdaptExportDocument(html, options) {
    const cleanedHtml = String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(
        "</head>",
        '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Lato:wght@400;700&display=swap" rel="stylesheet"></head>'
      );

    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.left = "-20000px";
    iframe.style.top = "0";
    iframe.style.width = "620px";
    iframe.style.height = "1600px";
    iframe.style.pointerEvents = "none";
    iframe.style.opacity = "0";
    iframe.style.zIndex = "-1";
    iframe.style.border = "0";
    iframe.srcdoc = cleanedHtml;

    const api = {
      container: iframe,
      pagesRoot: null,
      ready: null,
      cleanup: function () {
        iframe.remove();
      },
    };

    api.ready = new Promise(function (resolve, reject) {
      iframe.addEventListener(
        "load",
        async function () {
          try {
            const exportDocument = iframe.contentDocument;
            const sourceTable = exportDocument?.querySelector("table.ecw");
            const sourceBody = sourceTable?.querySelector("tbody");
            const sourceRows = getDirectChildElements(sourceBody, "tr");
            const heroRow = sourceRows[1] || null;
            const contentRow = sourceRows[2] || null;
            const footerRow = sourceRows[sourceRows.length - 1] || null;
            const contentTbody = findPrimaryContentTbody(contentRow);
            const contentRows = getDirectChildElements(contentTbody, "tr");
            const pagesRoot = exportDocument.createElement("div");

            pagesRoot.className = "climadapt-export-pages";
            pagesRoot.style.width = "600px";
            pagesRoot.style.margin = "0 auto";
            pagesRoot.style.backgroundColor = "#f0f1f5";

            function createPageShell(includeHero) {
              const page = exportDocument.createElement("div");
              page.className = "climadapt-export-page";
              page.style.width = "600px";
              page.style.boxSizing = "border-box";
              page.style.padding = "0";
              page.style.margin = "0 auto";
              page.style.backgroundColor = "#f0f1f5";

              const shellTable = sourceTable.cloneNode(false);
              const shellBody = exportDocument.createElement("tbody");
              shellTable.appendChild(shellBody);

              if (includeHero && heroRow) {
                shellBody.appendChild(heroRow.cloneNode(true));
              }

              if (contentRow) {
                const pageContentRow = contentRow.cloneNode(true);
                const pageContentTbody = findPrimaryContentTbody(pageContentRow);
                clearElement(pageContentTbody);
                shellBody.appendChild(pageContentRow);

                if (footerRow) {
                  shellBody.appendChild(footerRow.cloneNode(true));
                }

                page.appendChild(shellTable);

                return {
                  page,
                  contentTbody: pageContentTbody,
                };
              }

              page.appendChild(shellTable);
              return {
                page,
                contentTbody: null,
              };
            }

            const maxPageHeight = Number(options?.pageHeightPx) || 940;
            const pageDescriptors = [];
            let startIndex = 0;

            while (startIndex < contentRows.length) {
              const descriptor = createPageShell(pageDescriptors.length === 0);
              pagesRoot.appendChild(descriptor.page);

              let cursor = startIndex;
              let lastPreferredBreakCount = -1;

              while (cursor < contentRows.length && descriptor.contentTbody) {
                descriptor.contentTbody.appendChild(contentRows[cursor].cloneNode(true));

                const currentRowCount = descriptor.contentTbody.children.length;
                if (isPreferredBreakRow(contentRows[cursor])) {
                  lastPreferredBreakCount = currentRowCount;
                }

                if (descriptor.page.offsetHeight > maxPageHeight && currentRowCount > 1) {
                  const keepCount =
                    lastPreferredBreakCount > 0 && lastPreferredBreakCount < currentRowCount
                      ? lastPreferredBreakCount
                      : currentRowCount - 1;

                  while (descriptor.contentTbody.children.length > keepCount) {
                    descriptor.contentTbody.removeChild(descriptor.contentTbody.lastChild);
                  }

                  cursor = startIndex + keepCount;
                  break;
                }

                cursor += 1;
              }

              pageDescriptors.push(descriptor);
              startIndex = cursor;
            }

            clearElement(exportDocument.body);
            exportDocument.body.style.margin = "0";
            exportDocument.body.style.padding = "0";
            exportDocument.body.style.backgroundColor = "#f0f1f5";
            exportDocument.body.appendChild(pagesRoot);

            prepareExportVisuals(exportDocument.body, options);
            await inlineExternalImages(exportDocument.body);
            await waitForExportAssets(exportDocument.body, exportDocument);

            api.pagesRoot = pagesRoot;
            resolve();
          } catch (error) {
            reject(error);
          }
        },
        { once: true }
      );
    });

    return api;
  }

  function openClimAdaptPrintWindow(html) {
    const printWindow = window.open("", "climadapt-export", "width=1200,height=900");
    if (!printWindow) {
      return null;
    }

    let printRequested = false;
    const nativePrint =
      typeof printWindow.print === "function" ? printWindow.print.bind(printWindow) : null;

    if (nativePrint) {
      printWindow.print = function () {
        printRequested = true;
        return nativePrint();
      };
    }

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();

    const isFirefox = /firefox/i.test(String(window.navigator?.userAgent || ""));
    if (isFirefox && nativePrint) {
      const triggerFirefoxFallback = function () {
        if (printRequested || printWindow.closed) {
          return;
        }

        printRequested = true;

        try {
          printWindow.focus();
          nativePrint();
        } catch (error) {
          // Ignore print fallback errors to preserve the existing export flow.
        }
      };

      printWindow.addEventListener(
        "load",
        function () {
          printWindow.setTimeout(triggerFirefoxFallback, 700);
        },
        { once: true }
      );

      printWindow.setTimeout(triggerFirefoxFallback, 1800);
    }

    return printWindow;
  }

  window.buildClimAdaptExportHtml = buildClimAdaptExportHtml;
  window.createClimAdaptExportDocument = createClimAdaptExportDocument;
  window.openClimAdaptPrintWindow = openClimAdaptPrintWindow;
})();
